// Brand registry: visual tokens live in brands.css; this file owns naming,
// terminology and feature flags (per-tenant module gating: no brand ever
// renders every module - that is how the UI stays clean).

export type BrandId = 'coach-chris-chan' | 'antenna-reef' | 'bluezone'

export interface BrandConfig {
  id: BrandId
  appName: string
  shortName: string
  tagline: string
  terms: {
    athlete: string
    athletes: string
    session: string
    coach: string
  }
  flags: {
    leaderboards: boolean
    teams: boolean
    readiness: boolean
    healthTasks: boolean
    analytics: boolean
    percentTraining: boolean // %1RM-based prescriptions surfaced in UI
  }
  placeholder?: boolean
}

export const BRANDS: Record<BrandId, BrandConfig> = {
  'coach-chris-chan': {
    id: 'coach-chris-chan',
    appName: 'Coach Chris Chan',
    shortName: 'CCC',
    tagline: 'Rebuild. Perform. Last.',
    terms: { athlete: 'athlete', athletes: 'athletes', session: 'session', coach: 'coach' },
    flags: { leaderboards: false, teams: true, readiness: true, healthTasks: true, analytics: true, percentTraining: true },
  },
  'antenna-reef': {
    id: 'antenna-reef',
    appName: 'Antenna Reef Athletic Club',
    shortName: 'Antenna Reef',
    tagline: 'Train together.',
    terms: { athlete: 'athlete', athletes: 'athletes', session: 'session', coach: 'coach' },
    flags: { leaderboards: true, teams: true, readiness: true, healthTasks: true, analytics: true, percentTraining: true },
    placeholder: true,
  },
  bluezone: {
    id: 'bluezone',
    appName: 'BlueZone',
    shortName: 'BlueZone',
    tagline: 'Move and improve.',
    terms: { athlete: 'client', athletes: 'clients', session: 'program session', coach: 'clinician' },
    flags: { leaderboards: false, teams: true, readiness: false, healthTasks: true, analytics: true, percentTraining: false },
  },
}

const KEY = 'ta_brand' // dev-only override; the deployed product pins one brand

export function activeBrandId(): BrandId {
  const url = new URLSearchParams(location.search).get('brand')
  if (url && url in BRANDS) {
    localStorage.setItem(KEY, url)
    return url as BrandId
  }
  const saved = localStorage.getItem(KEY)
  if (saved && saved in BRANDS) return saved as BrandId
  return 'coach-chris-chan'
}

export function setBrand(id: BrandId) {
  localStorage.setItem(KEY, id)
  applyBrand(id)
}

export function applyBrand(id: BrandId = activeBrandId()): BrandConfig {
  document.documentElement.dataset.brand = id
  document.title = BRANDS[id].appName
  return BRANDS[id]
}
