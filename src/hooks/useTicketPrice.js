import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { EVENT_CONFIG } from '../lib/config'

const EARLY_BIRD_LIMIT = 10
const EARLY_BIRD_PRICE = 15000
const REGULAR_PRICE = 20000
const MAX_CAPACITY = 100

export function useTicketPrice({ hasDatiDiscount = false } = {}) {
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

  const earlyBirdAvailable = !hasDatiDiscount && confirmedCount !== null && confirmedCount < EARLY_BIRD_LIMIT
  const datiPrice = Math.round(REGULAR_PRICE * (1 - EVENT_CONFIG.datiDiscountPercent / 100))

  let currentPrice
  let tier
  if (hasDatiDiscount) {
    currentPrice = datiPrice
    tier = 'dati'
  } else if (earlyBirdAvailable) {
    currentPrice = EARLY_BIRD_PRICE
    tier = 'early_bird'
  } else {
    currentPrice = REGULAR_PRICE
    tier = 'regular'
  }

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
    tier,
    hasDatiDiscount,
  }
}
