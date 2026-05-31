import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rubicProvider } from '../providers/rubic'
import type { QuoteRequest } from '@/types/provider'

const EVM_REQUEST: QuoteRequest = {
  fromChain: 1,
  toChain: 8453,
  fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  fromAmount: '1000000',
  fromAddress: '0x1111111111111111111111111111111111111111',
  toAddress: '0x2222222222222222222222222222222222222222',
  fromTokenDecimals: 6,
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

function routeBy(url: string, handlers: Record<string, () => Response>): Response {
  for (const key of Object.keys(handlers)) {
    if (url.includes(key)) return handlers[key]()
  }
  throw new Error(`Unhandled fetch URL in test: ${url}`)
}

const QUOTE_BODY = {
  id: 'rubic-quote-1',
  type: 'across',
  estimate: { destinationTokenAmount: '0.99', destinationTokenMinAmount: '0.98', estimatedTime: 120 },
  tokens: { from: { symbol: 'USDC', decimals: 6 }, to: { symbol: 'USDC', decimals: 6 } },
}

describe('RubicProvider.getQuote — null transactionRequest hygiene', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('excludes an EVM quote when the swap call yields no transactionRequest', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input)
      return routeBy(url, {
        '/info/chains': () => jsonResponse({ status: 'fail' }, false, 500),
        '/routes/quoteBest': () => jsonResponse(QUOTE_BODY),
        // swap fails -> transactionRequest stays null
        '/routes/swap': () =>
          jsonResponse({ error: { code: 3003, reason: 'not enough balance' } }, false, 400),
      })
    })

    const quotes = await rubicProvider.getQuote(EVM_REQUEST)
    expect(quotes.every((q) => q.transactionRequest != null)).toBe(true)
    expect(quotes.length).toBe(0)
  })

  it('keeps an EVM quote when the swap call returns a transactionRequest', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input)
      return routeBy(url, {
        '/info/chains': () => jsonResponse({ status: 'fail' }, false, 500),
        '/routes/quoteBest': () => jsonResponse(QUOTE_BODY),
        '/routes/swap': () =>
          jsonResponse({
            transaction: {
              to: '0x3333333333333333333333333333333333333333',
              data: '0xabcdef',
              value: '0',
            },
          }),
      })
    })

    const quotes = await rubicProvider.getQuote(EVM_REQUEST)
    expect(quotes.length).toBe(1)
    expect(quotes[0].transactionRequest).toBeTruthy()
    expect((quotes[0].transactionRequest as { to?: string }).to).toBe(
      '0x3333333333333333333333333333333333333333'
    )
  })
})
