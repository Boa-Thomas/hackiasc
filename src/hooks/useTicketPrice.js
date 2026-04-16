import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const EARLY_BIRD_LIMIT = 10
const EARLY_BIRD_PRICE = 15000
const REGULAR_PRICE = 20000
const MAX_CAPACITY = 100

export function useTicketPrice() {
  const [confirmedCount, setConfirmedCount] = useState(null)
  const [totalCount, setTotalCount] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCounts() {
      if (!supabase) {
        setConfirmedCount(0)
        setTotalCount(0)
        setLoading(false)
        return
      }
      const [earlyBird, total] = await Promise.all([
        supabase.rpc('get_early_bird_sold'),
        supabase.rpc('get_total_registration_count'),
      ])
      setConfirmedCount(!earlyBird.error && earlyBird.data !== null ? earlyBird.data : 0)
      setTotalCount(!total.error && total.data !== null ? total.data : 0)
      setLoading(false)
    }
    fetchCounts()
  }, [])

  const earlyBirdAvailable = confirmedCount !== null && confirmedCount < EARLY_BIRD_LIMIT
  const currentPrice = earlyBirdAvailable ? EARLY_BIRD_PRICE : REGULAR_PRICE
  const earlyBirdSpotsLeft = earlyBirdAvailable ? EARLY_BIRD_LIMIT - confirmedCount : 0
  const capacityFull = totalCount !== null && totalCount >= MAX_CAPACITY

  return {
    currentPrice,
    currentPriceFormatted: `R$ ${(currentPrice / 100).toFixed(0)},00`,
    earlyBirdAvailable,
    earlyBirdSpotsLeft,
    confirmedCount,
    totalCount,
    capacityFull,
    loading,
    tier: earlyBirdAvailable ? 'early_bird' : 'regular',
  }
}
