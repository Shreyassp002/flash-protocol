import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyApiKey } from '@/lib/api/verify-api-key'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { merchant, error } = await verifyApiKey(req)
  
  if (error) {
    return NextResponse.json({ error }, { status: 401 })
  }
  
  const { id } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any
  
  // Fetch transaction with link verification
  const { data: transaction, error: dbError } = await supabase
    .from('transactions')
    .select(`
        *,
        payment_links!inner(merchant_id)
    `)
    .eq('id', id)
    .single()
    
  if (dbError || !transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }
  
  // Verify ownership via payment link
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txData = transaction as any
  if (txData.payment_links?.merchant_id !== merchant.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Clean response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { payment_links, ...cleanedTx } = txData
  
  return NextResponse.json(cleanedTx)
}
