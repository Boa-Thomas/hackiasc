import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// --- Mocks ----------------------------------------------------------------
// Mock the supabase client. We replace it for each test below via vi.doMock /
// dynamic imports of the hook so that we can vary the rpc responses.
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

// Lock the discount percent so calculations stay deterministic even if the
// real EVENT_CONFIG ever changes. We still use the value via the constant
// here (no hardcoded 16000 in the assertions).
vi.mock('../lib/config', () => ({
  EVENT_CONFIG: {
    datiDiscountPercent: 20,
  },
}))

import { supabase } from '../lib/supabase'
import { EVENT_CONFIG } from '../lib/config'
import { useTicketPrice } from './useTicketPrice'

const REGULAR_PRICE = 20000
const EARLY_BIRD_PRICE = 15000
const EARLY_BIRD_LIMIT = 10
const MAX_CAPACITY = 100
const DATI_PRICE = Math.round(
  REGULAR_PRICE * (1 - EVENT_CONFIG.datiDiscountPercent / 100),
)

/**
 * Configure the mocked supabase.rpc to return given values for each RPC name.
 */
function mockRpc({ earlyBirdSold = 0, totalCount = 0, error = false } = {}) {
  supabase.rpc.mockImplementation((fnName) => {
    if (fnName === 'get_early_bird_sold') {
      return Promise.resolve({
        data: error ? null : earlyBirdSold,
        error: error ? { message: 'boom' } : null,
      })
    }
    if (fnName === 'get_total_registration_count') {
      return Promise.resolve({
        data: error ? null : totalCount,
        error: error ? { message: 'boom' } : null,
      })
    }
    return Promise.resolve({ data: null, error: null })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// --- Tests ----------------------------------------------------------------
describe('useTicketPrice', () => {
  it('sets loading=true before Supabase resolves', () => {
    // Never-resolving promise so we can observe the loading state synchronously
    supabase.rpc.mockImplementation(
      () => new Promise(() => {}),
    )
    const { result } = renderHook(() => useTicketPrice())
    expect(result.current.loading).toBe(true)
    expect(result.current.confirmedCount).toBeNull()
    expect(result.current.totalCount).toBeNull()
  })

  it('returns early bird tier when no DATI and no confirmations', async () => {
    mockRpc({ earlyBirdSold: 0, totalCount: 0 })
    const { result } = renderHook(() => useTicketPrice())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tier).toBe('early_bird')
    expect(result.current.currentPrice).toBe(EARLY_BIRD_PRICE)
    expect(result.current.currentPrice).toBe(15000)
    expect(result.current.earlyBirdAvailable).toBe(true)
    expect(result.current.earlyBirdSpotsLeft).toBe(EARLY_BIRD_LIMIT)
    expect(result.current.capacityFull).toBe(false)
    expect(result.current.hasDatiDiscount).toBe(false)
  })

  it('switches to regular tier when early bird is sold out (>=10)', async () => {
    mockRpc({ earlyBirdSold: 10, totalCount: 10 })
    const { result } = renderHook(() => useTicketPrice())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tier).toBe('regular')
    expect(result.current.currentPrice).toBe(REGULAR_PRICE)
    expect(result.current.currentPrice).toBe(20000)
    expect(result.current.earlyBirdAvailable).toBe(false)
    expect(result.current.earlyBirdSpotsLeft).toBe(0)
  })

  it('stays regular when more than 10 confirmations', async () => {
    mockRpc({ earlyBirdSold: 25, totalCount: 25 })
    const { result } = renderHook(() => useTicketPrice())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tier).toBe('regular')
    expect(result.current.currentPrice).toBe(REGULAR_PRICE)
    expect(result.current.earlyBirdSpotsLeft).toBe(0)
  })

  it('returns DATI tier when hasDatiDiscount=true and zero confirmations', async () => {
    mockRpc({ earlyBirdSold: 0, totalCount: 0 })
    const { result } = renderHook(() =>
      useTicketPrice({ hasDatiDiscount: true }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tier).toBe('dati')
    expect(result.current.currentPrice).toBe(DATI_PRICE)
    expect(result.current.currentPrice).toBe(
      Math.round(20000 * (1 - EVENT_CONFIG.datiDiscountPercent / 100)),
    )
    expect(result.current.hasDatiDiscount).toBe(true)
  })

  it('DATI tier has priority over early bird even with spots available', async () => {
    mockRpc({ earlyBirdSold: 3, totalCount: 3 })
    const { result } = renderHook(() =>
      useTicketPrice({ hasDatiDiscount: true }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tier).toBe('dati')
    expect(result.current.currentPrice).toBe(DATI_PRICE)
    // earlyBirdAvailable must be false when DATI is applied
    expect(result.current.earlyBirdAvailable).toBe(false)
    expect(result.current.earlyBirdSpotsLeft).toBe(0)
  })

  it('DATI tier remains the same regardless of confirmations (sold-out early bird)', async () => {
    mockRpc({ earlyBirdSold: 50, totalCount: 50 })
    const { result } = renderHook(() =>
      useTicketPrice({ hasDatiDiscount: true }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tier).toBe('dati')
    expect(result.current.currentPrice).toBe(DATI_PRICE)
  })

  it('computes earlyBirdSpotsLeft correctly with partial sales', async () => {
    mockRpc({ earlyBirdSold: 3, totalCount: 3 })
    const { result } = renderHook(() => useTicketPrice())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.earlyBirdSpotsLeft).toBe(EARLY_BIRD_LIMIT - 3)
    expect(result.current.earlyBirdAvailable).toBe(true)
    expect(result.current.tier).toBe('early_bird')
  })

  it('sets capacityFull=true when total >= MAX_CAPACITY', async () => {
    mockRpc({ earlyBirdSold: 10, totalCount: MAX_CAPACITY })
    const { result } = renderHook(() => useTicketPrice())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.capacityFull).toBe(true)
    expect(result.current.totalCount).toBe(100)
  })

  it('capacityFull=true when total exceeds MAX_CAPACITY', async () => {
    mockRpc({ earlyBirdSold: 10, totalCount: 150 })
    const { result } = renderHook(() => useTicketPrice())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.capacityFull).toBe(true)
  })

  it('capacityFull=false when total just under MAX_CAPACITY', async () => {
    mockRpc({ earlyBirdSold: 10, totalCount: 99 })
    const { result } = renderHook(() => useTicketPrice())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.capacityFull).toBe(false)
  })

  it('formats price string in BRL', async () => {
    mockRpc({ earlyBirdSold: 0, totalCount: 0 })
    const { result } = renderHook(() => useTicketPrice())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.currentPriceFormatted).toBe('R$ 150,00')
  })

  it('falls back to 0 counts on Supabase rpc error', async () => {
    mockRpc({ error: true })
    const { result } = renderHook(() => useTicketPrice())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.confirmedCount).toBe(0)
    expect(result.current.totalCount).toBe(0)
    expect(result.current.tier).toBe('early_bird')
    expect(result.current.earlyBirdSpotsLeft).toBe(EARLY_BIRD_LIMIT)
  })
})
