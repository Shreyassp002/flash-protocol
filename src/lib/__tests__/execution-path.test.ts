import { describe, it, expect } from 'vitest'
import { resolveExecutionPath } from '../execution-path'
import type { QuoteResponse } from '@/types/provider'

function makeQuote(overrides: Partial<QuoteResponse>): QuoteResponse {
  return {
    provider: 'lifi',
    id: 'q1',
    fromAmount: '1000000',
    toAmount: '990000',
    toAmountMin: '980000',
    estimatedGas: '0',
    estimatedDuration: 60,
    toolsUsed: [],
    routes: [],
    ...overrides,
  } as QuoteResponse
}

describe('resolveExecutionPath', () => {
  it('routes near-intents quotes to the near path', () => {
    const quote = makeQuote({ provider: 'near-intents' })
    expect(resolveExecutionPath(quote)).toBe('near')
  })

  it('routes a LiFi Solana-source quote to the solana path (via metadata.chainType)', () => {
    const quote = makeQuote({
      provider: 'lifi',
      metadata: { chainType: 'solana' },
      routes: [
        {
          type: 'swap',
          tool: 'jupiter',
          action: {
            fromToken: { address: 'So111', chainId: 1151111081099710, symbol: 'SOL', decimals: 9 },
            toToken: { address: '0xabc', chainId: 8453, symbol: 'USDC', decimals: 6 },
            fromAmount: '1000000000',
            toAmount: '990000',
          },
          estimate: {},
        },
      ],
    })
    expect(resolveExecutionPath(quote)).toBe('solana')
  })

  it('routes a non-NEAR Solana-source quote to the solana path (via string chain id)', () => {
    const quote = makeQuote({
      provider: 'rubic',
      routes: [
        {
          type: 'bridge',
          tool: 'rubic',
          action: {
            fromToken: { address: 'So111', chainId: 'solana', symbol: 'SOL', decimals: 9 },
            toToken: { address: '0xabc', chainId: 8453, symbol: 'USDC', decimals: 6 },
            fromAmount: '1000000000',
            toAmount: '990000',
          },
          estimate: {},
        },
      ],
    })
    expect(resolveExecutionPath(quote)).toBe('solana')
  })

  it('does NOT send a LiFi Solana-source quote to the evm path', () => {
    const quote = makeQuote({
      provider: 'lifi',
      metadata: { chainType: 'solana' },
      routes: [
        {
          type: 'swap',
          tool: 'jupiter',
          action: {
            fromToken: { address: 'So111', chainId: 1151111081099710, symbol: 'SOL', decimals: 9 },
            toToken: { address: '0xabc', chainId: 8453, symbol: 'USDC', decimals: 6 },
            fromAmount: '1000000000',
            toAmount: '990000',
          },
          estimate: {},
        },
      ],
    })
    expect(resolveExecutionPath(quote)).not.toBe('evm')
  })

  it('routes an EVM LiFi quote to the evm path', () => {
    const quote = makeQuote({
      provider: 'lifi',
      metadata: { chainType: 'evm' },
      routes: [
        {
          type: 'swap',
          tool: 'uniswap',
          action: {
            fromToken: { address: '0xdef', chainId: 1, symbol: 'WETH', decimals: 18 },
            toToken: { address: '0xabc', chainId: 8453, symbol: 'USDC', decimals: 6 },
            fromAmount: '1000000000000000000',
            toAmount: '990000',
          },
          estimate: {},
        },
      ],
    })
    expect(resolveExecutionPath(quote)).toBe('evm')
  })

  it('blocks a deposit-trade quote from an unsupported (other) source chain', () => {
    const quote = makeQuote({
      provider: 'rubic',
      metadata: { chainType: 'other', isDepositTrade: true },
    })
    expect(resolveExecutionPath(quote)).toBe('blocked')
  })

  it('routes a bitcoin deposit-trade quote to the bitcoin path', () => {
    const quote = makeQuote({
      provider: 'symbiosis',
      metadata: { chainType: 'bitcoin', isDepositTrade: true },
    })
    expect(resolveExecutionPath(quote)).toBe('bitcoin')
  })

  it('routes a solana deposit-trade quote to the solana path', () => {
    const quote = makeQuote({
      provider: 'rubic',
      metadata: { chainType: 'solana', isDepositTrade: true },
    })
    expect(resolveExecutionPath(quote)).toBe('solana')
  })
})
