import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { generateStealthAddress } from '@/lib/stealth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    if (!id) {
      return NextResponse.json({ error: 'Link ID required' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Public fetch - no auth check required
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: link, error } = await (supabase.from('payment_links') as any)
      .select(`
        *,
        merchants:merchant_id (
          id,
          business_name,
          email,
          wallet_address,
          branding:branding_settings,
          stealth_enabled,
          stealth_viewing_key_node,
          stealth_meta_address
        )
      `)
      .eq('id', id)
      .single()

    if (error || !link) {
      return NextResponse.json({ error: 'Payment link not found' }, { status: 404 })
    }

    // Check status
    if (link.status === 'archived') {
      return NextResponse.json({ error: 'This payment link has been archived' }, { status: 410 })
    }

    if (link.status === 'expired' || (link.expires_at && new Date(link.expires_at) < new Date())) {
      return NextResponse.json({ error: 'This payment link has expired' }, { status: 410 })
    }

    if (link.max_uses && link.current_uses >= link.max_uses) {
      return NextResponse.json({ error: 'This payment link has reached its maximum uses' }, { status: 410 })
    }

    // Stealth address generation 
    const merchant = link.merchants
    if (link.use_stealth && merchant?.stealth_enabled && merchant?.stealth_viewing_key_node && merchant?.stealth_meta_address) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existingStealth } = await (supabase.from('stealth_addresses') as any)
          .select('stealth_safe_address, ephemeral_public_key')
          .eq('merchant_id', merchant.id)
          .eq('payment_link_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (existingStealth) {
          link.recipient_address = existingStealth.stealth_safe_address
          link.stealth_chain_native = true
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: lastStealth } = await (supabase.from('stealth_addresses') as any)
            .select('nonce')
            .eq('merchant_id', merchant.id)
            .order('nonce', { ascending: false })
            .limit(1)
            .single()

          const nextNonce = (lastStealth?.nonce ?? -1) + 1

          const chainId = parseInt(link.receive_chain_id || '1', 10)
          if (!isNaN(chainId) && chainId > 0) {
            console.log('[DEBUG] Calling generateStealthAddress for link:', link.id, 'chainId:', chainId)
            const { stealthSafeAddress, ephemeralPublicKey } = generateStealthAddress({
              viewingKeyNodeSerialized: merchant.stealth_viewing_key_node,
              spendingPublicKey: merchant.stealth_meta_address as `0x${string}`,
              nonce: nextNonce,
              chainId,
            })
            console.log('[DEBUG] Successfully generated stealth address:', stealthSafeAddress)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('stealth_addresses') as any).insert({
              merchant_id: merchant.id,
              payment_link_id: id,
              nonce: nextNonce,
              stealth_safe_address: stealthSafeAddress,
              chain_id: String(chainId),
              ephemeral_public_key: ephemeralPublicKey,
            })

            link.recipient_address = stealthSafeAddress
            link.stealth_chain_native = true
          }
        }
      } catch (stealthErr) {
        console.error('[DEBUG] Stealth address generation failed. Details:', stealthErr)
        console.error('Stealth address generation failed, falling back to direct:', stealthErr)
      }
    }

    // Remove sensitive merchant fields before returning
    if (link.merchants) {
      delete link.merchants.stealth_viewing_key_node
      delete link.merchants.stealth_enabled
      delete link.merchants.stealth_meta_address
    }

    return NextResponse.json(link)

  } catch (error) {
    console.error('Fetch Public Link Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

