import { Buffer } from 'node:buffer'
import { createError, defineEventHandler, getQuery } from 'h3'
import { $fetch } from 'ofetch'

const CATALOG_BASE = 'https://api.catalog.beer'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const apiKey = process.env.CATALOG_BEER_API_KEY ?? ''

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'CATALOG_BEER_API_KEY manquante dans les variables d’environnement'
    })
  }

  const credentials = Buffer.from(`${apiKey}:`).toString('base64')
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Basic ${credentials}`
  }

  const action = (query.action as string | undefined) ?? ''

  const runCatalog = async (path: string, params: Record<string, string | number>) => {
    try {
      return await $fetch(`${CATALOG_BASE}${path}`, { headers, params })
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string }
      throw createError({
        statusCode: err?.statusCode ?? 502,
        statusMessage: err?.message ?? 'catalog.beer indisponible'
      })
    }
  }

  // Recherche (défaut si pas d’action)
  if (action === 'search' || action === '') {
    const q = typeof query.q === 'string' ? query.q.trim() : ''
    if (!q) {
      throw createError({ statusCode: 400, statusMessage: 'q requis' })
    }
    return await runCatalog('/beer/search', { q, count: 10 })
  }

  if (action === 'suggestions') {
    const q = typeof query.q === 'string' ? query.q.trim() : ''
    if (!q) {
      throw createError({ statusCode: 400, statusMessage: 'q requis' })
    }
    return await runCatalog('/beer/search', { q, count: 6 })
  }

  if (action === 'nearby') {
    const lat = query.latitude
    const lng = query.longitude
    if (!lat || !lng || typeof lat !== 'string' || typeof lng !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'latitude et longitude requis' })
    }
    return await runCatalog('/location/nearby', {
      latitude: lat,
      longitude: lng,
      search_radius: 100,
      count: 20
    })
  }

  if (action === 'brewerBeers') {
    const brewerId = typeof query.brewerId === 'string' ? query.brewerId : ''
    if (!brewerId) {
      throw createError({ statusCode: 400, statusMessage: 'brewerId requis' })
    }

    try {
      return await $fetch(`${CATALOG_BASE}/brewer/${encodeURIComponent(brewerId)}/beer`, {
        headers
      })
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string }
      throw createError({
        statusCode: err?.statusCode ?? 502,
        statusMessage: err?.message ?? 'Impossible de récupérer les bières du brasseur'
      })
    }
  }

  throw createError({ statusCode: 400, statusMessage: 'action invalide' })
})