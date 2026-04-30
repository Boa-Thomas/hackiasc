import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { EVENT_CONFIG } from '../lib/config'

const MAX_CAPACITY = EVENT_CONFIG.maxCapacity ?? 100

function findCouponByCode(code) {
  if (!code) return null
  const lower = String(code).toLowerCase()
  return EVENT_CONFIG.coupons.find(c => c.code && c.code.toLowerCase() === lower) || null
}

function isTierAvailable(tier, soldCount) {
  if (tier.deadline && new Date() >= new Date(tier.deadline)) return false
  if (tier.limit != null && soldCount >= tier.limit) return false
  return true
}

function pickActiveTier(tiers, soldByTier) {
  for (const tier of tiers) {
    if (isTierAvailable(tier, soldByTier[tier.id] ?? 0)) return tier
  }
  return tiers[tiers.length - 1]
}

export function useTicketPrice({ couponCode = '', hasDatiDiscount } = {}) {
  const [soldByTier, setSoldByTier] = useState({})
  const [totalCount, setTotalCount] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCounts() {
      if (!supabase) {
        setSoldByTier({})
        setTotalCount(0)
        setLoading(false)
        return
      }
      const tiersWithLimit = EVENT_CONFIG.tiers.filter(t => t.limit != null)
      const [totalRes, ...tierResults] = await Promise.all([
        supabase.rpc('get_total_registration_count'),
        ...tiersWithLimit.map(t => supabase.rpc('get_tier_sold', { p_tier: t.id })),
      ])
      const sold = {}
      tiersWithLimit.forEach((t, i) => {
        const r = tierResults[i]
        sold[t.id] = !r.error && r.data != null ? r.data : 0
      })
      setSoldByTier(sold)
      setTotalCount(!totalRes.error && totalRes.data != null ? totalRes.data : 0)
      setLoading(false)
    }
    fetchCounts()
  }, [])

  const appliedCoupon = hasDatiDiscount === true
    ? EVENT_CONFIG.coupons.find(c => c.id === 'dati') ?? null
    : findCouponByCode(couponCode)

  const currentTier = pickActiveTier(EVENT_CONFIG.tiers, soldByTier)
  const basePrice = currentTier.priceCents
  const discount = appliedCoupon
    ? Math.round(basePrice * appliedCoupon.discountPercent / 100)
    : 0
  const currentPrice = basePrice - discount

  const spotsLeftInTier = currentTier.limit != null
    ? Math.max(0, currentTier.limit - (soldByTier[currentTier.id] ?? 0))
    : null

  const capacityFull = totalCount !== null && totalCount >= MAX_CAPACITY

  // When a coupon is applied, the saved tier preserves the legacy shape (e.g. 'dati').
  const tier = appliedCoupon ? appliedCoupon.id : currentTier.id

  // Legacy: confirmedCount specifically tracked the early_bird sold count.
  const earlyBirdTier = EVENT_CONFIG.tiers.find(t => t.id === 'early_bird')
  const confirmedCount = earlyBirdTier ? (soldByTier[earlyBirdTier.id] ?? 0) : 0

  return {
    currentTier,
    appliedCoupon,
    basePrice,
    spotsLeftInTier,

    currentPrice,
    currentPriceFormatted: `R$ ${(currentPrice / 100).toFixed(0)},00`,
    earlyBirdAvailable: currentTier.id === 'early_bird' && !appliedCoupon,
    earlyBirdSpotsLeft: currentTier.id === 'early_bird' ? (spotsLeftInTier ?? 0) : 0,
    confirmedCount,
    totalCount,
    capacityFull,
    loading,
    tier,
    hasDatiDiscount: appliedCoupon?.id === 'dati',
  }
}
