import { inngest } from '@/inngest/client'
import { createServerClient } from '@/lib/supabase'
import {
  buildWebhookPayload,
  deliverToEndpoint,
  WebhookEventType,
} from '@/lib/webhooks'

export const deliverWebhook = inngest.createFunction(
  {
    id: 'deliver-webhook',
    retries: 0,
  },
  { event: 'webhook/deliver' },
  async ({ event, step }) => {
    const { merchantId, eventType, transactionId } = event.data as {
      merchantId: string
      eventType: WebhookEventType
      transactionId: string
    }

    // 1. Fetch active endpoints subscribed to this event
    const endpoints = await step.run('fetch-endpoints', async () => {
      const supabase = createServerClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('webhook_endpoints') as any)
        .select('id, events')
        .eq('merchant_id', merchantId)
        .eq('active', true)

      if (error || !data) return []

      // Filter endpoints subscribed to this event type
      return data.filter(
        (ep: { events: string[] }) => ep.events && ep.events.includes(eventType),
      )
    })

    if (!endpoints || endpoints.length === 0) {
      return { success: true, reason: 'no_endpoints' }
    }

    // 2. Fetch transaction data
    const transaction = await step.run('fetch-transaction', async () => {
      const supabase = createServerClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('transactions') as any)
        .select('*')
        .eq('id', transactionId)
        .single()

      if (error || !data) return null
      return data
    })

    if (!transaction) {
      return { success: false, reason: 'transaction_not_found' }
    }

    // 3. Build payload once so all endpoints receive identical event ID + timestamp
    const payload = await step.run('build-payload', () => {
      return buildWebhookPayload(eventType, transaction)
    })

    // 4. Fan out: emit a separate delivery event per endpoint
    await step.run('fan-out-deliveries', async () => {
      const events = endpoints.map((ep: { id: string }) => ({
        name: 'webhook/deliver.endpoint' as const,
        data: {
          endpointId: ep.id,
          eventType,
          payload,
        },
      }))
      await inngest.send(events)
    })

    return { success: true, endpointCount: endpoints.length }
  },
)

export const deliverWebhookToEndpoint = inngest.createFunction(
  {
    id: 'deliver-webhook-to-endpoint',
    retries: 8,
  },
  { event: 'webhook/deliver.endpoint' },
  async ({ event, step }) => {
    const { endpointId, eventType, payload } = event.data as {
      endpointId: string
      eventType: string
      payload: Record<string, unknown>
    }

    // Fetch endpoint details (url + secret) from DB to avoid storing secrets in Inngest events
    const endpoint = await step.run('fetch-endpoint', async () => {
      const supabase = createServerClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('webhook_endpoints') as any)
        .select('url, secret, active')
        .eq('id', endpointId)
        .single()

      if (error || !data) return null
      return data as { url: string; secret: string; active: boolean }
    })

    if (!endpoint || !endpoint.active) {
      return { endpoint_id: endpointId, delivered: false, reason: 'endpoint_not_found_or_inactive' }
    }

    const result = await step.run('deliver', async () => {
      return deliverToEndpoint(endpoint.url, endpoint.secret, eventType, payload)
    })

    // Log delivery attempt
    await step.run('log-delivery', async () => {
      const supabase = createServerClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('webhook_deliveries') as any).insert({
        webhook_endpoint_id: endpointId,
        event_type: eventType,
        payload,
        response_status: result.responseStatus,
        response_body: result.responseBody,
        error_message: result.errorMessage,
        delivered: result.delivered,
        duration_ms: result.durationMs,
      })
    })

    // Throw on failure so Inngest retries this single endpoint
    if (!result.delivered) {
      throw new Error(
        `Webhook delivery failed: ${result.responseStatus || result.errorMessage}`,
      )
    }

    return { endpoint_id: endpointId, delivered: true, responseStatus: result.responseStatus }
  },
)
