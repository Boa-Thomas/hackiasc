import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const EARLY_BIRD_LIMIT = 10
const EARLY_BIRD_PRICE = 15000
const REGULAR_PRICE = 20000

export function useTicketPrice() {
  const [confirmedCount, setConfirmedCount] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCount() {
      if (!supabase) {
        setConfirmedCount(0)
        setLoading(false)
        return
      }
      const { data, error } = await supabase.rpc('get_confirmed_count')
      if (!error && data !== null) {
        setConfirmedCount(data)
      } else {
        setConfirmedCount(0)
      }
      setLoading(false)
    }
    fetchCount()
  }, [])

  const earlyBirdAvailable = confirmedCount !== null && confirmedCount < EARLY_BIRD_LIMIT
  const currentPrice = earlyBirdAvailable ? EARLY_BIRD_PRICE : REGULAR_PRICE
  const earlyBirdSpotsLeft = earlyBirdAvailable ? EARLY_BIRD_LIMIT - confirmedCount : 0

  return {
    currentPrice,
    currentPriceFormatted: `R$ ${(currentPrice / 100).toFixed(0)},00`,
    earlyBirdAvailable,
    earlyBirdSpotsLeft,
    confirmedCount,
    loading,
    tier: earlyBirdAvailable ? 'early_bird' : 'regular',
  }
}
