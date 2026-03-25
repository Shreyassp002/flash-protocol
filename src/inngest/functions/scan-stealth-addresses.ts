import { inngest } from '@/inngest/client'
import { createServerClient } from '@/lib/supabase'
import { createPublicClient, http } from 'viem'
import * as chains from 'viem/chains'

// Map chain IDs to viem chain configs for RPC access
const chainMap: Record<number, any> = {}
for (const [, chain] of Object.entries(chains)) {
  if (typeof chain === 'object' && chain !== null && 'id' in chain) {
    chainMap[(chain as any).id] = chain
  }
}

export const scanStealthAddresses = inngest.createFunction(
  {
    id: 'scan-stealth-addresses',
    concurrency: [{ limit: 1 }],
  },
  { cron: '*/5 * * * *' }, // Every 5 minutes
  async ({ step }) => {
    const supabase = createServerClient()

    // 1. Fetch all unclaimed stealth addresses
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stealthAddresses, error } = await (supabase.from('stealth_addresses') as any)
      .select('id, stealth_safe_address, chain_id, amount_received')
      .eq('claimed', false)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error || !stealthAddresses || stealthAddresses.length === 0) {
      return { scanned: 0, updated: 0 }
    }

    let updated = 0

    // 2. Check balance for each stealth address
    for (const sa of stealthAddresses) {
      await step.run(`check-balance-${sa.id}`, async () => {
        const chainId = parseInt(sa.chain_id, 10)
        const chain = chainMap[chainId]
        if (!chain) {
          console.warn(`[StealthScan] Unknown chain ID: ${chainId}`)
          return
        }

        try {
          const client = createPublicClient({
            chain,
            transport: http(),
          })

          const balance = await client.getBalance({
            address: sa.stealth_safe_address as `0x${string}`,
          })

          // Only update if balance changed
          const balanceEth = Number(balance) / 1e18
          const currentAmount = sa.amount_received || 0

          if (balanceEth > 0 && balanceEth !== currentAmount) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('stealth_addresses') as any)
              .update({ amount_received: balanceEth })
              .eq('id', sa.id)

            updated++
          }
        } catch (err) {
          console.error(`[StealthScan] Failed to check ${sa.stealth_safe_address}:`, err)
        }
      })
    }

    return { scanned: stealthAddresses.length, updated }
  },
)
