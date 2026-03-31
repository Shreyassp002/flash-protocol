import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { helloWorld } from '@/inngest/functions'
import { pollTransactionStatus } from '@/inngest/functions/poll-transaction'
import { refreshChainsTokens } from '@/inngest/functions/refresh-chains-tokens'
import { scanStealthAddresses } from '@/inngest/functions/scan-stealth-addresses'
import { deliverWebhook, deliverWebhookToEndpoint } from '@/inngest/functions/deliver-webhook'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    helloWorld,
    pollTransactionStatus,
    refreshChainsTokens,
    scanStealthAddresses,
    deliverWebhook,
    deliverWebhookToEndpoint,
  ],
})

