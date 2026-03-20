<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import debounce from 'lodash.debounce'
import { $fetch } from 'ofetch'
import { useUserProfile } from '../composables/useUserProfile'

type BeerItem = {
  id: string | number
  name: string
  brewery?: string
  style?: string
  abv?: number | null
  ibu?: number | null
}

type DegustationItem = {
  id: string
  beer_name: string | null
  bar_name: string | null
  note_plaisir: number | null
  note_amertume?: number | null
  beer_api_id?: string | null
  latitude?: number | null
  longitude?: number | null
  created_at?: string
}

const BEER_API_URL = '/api/beers'

const STYLE_SCANNERS: { key: string; test: (s: string) => boolean }[] = [
  { key: 'IPA', test: s => /\bipa\b/i.test(s) || /india pale ale/i.test(s) },
  { key: 'Stout', test: s => /\bstout\b/i.test(s) },
  { key: 'Lager', test: s => /\blager\b/i.test(s) },
  { key: 'Pilsner', test: s => /\bpils(?:ner)?\b/i.test(s) },
  { key: 'Porter', test: s => /\bporter\b/i.test(s) },
  { key: 'Blonde', test: s => /\bblonde\b/i.test(s) },
  { key: 'Wheat', test: s => /\bwheat\b|\bweizen\b|\bweisse\b|\bblanche\b/i.test(s) },
  { key: 'Saison', test: s => /\bsaison\b/i.test(s) },
  { key: 'Ale', test: s => /\bale\b/i.test(s) && !/pale ale/i.test(s) },
  { key: 'Tripel', test: s => /\btripel\b/i.test(s) },
  { key: 'Lambic', test: s => /\blambic\b/i.test(s) }
]

useHead({
  link: [
    {
      rel: 'stylesheet',
      href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      crossorigin: ''
    }
  ],
  script: [
    {
      src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      defer: false
    }
  ]
})

const { profile } = useUserProfile()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()

const activeTab = ref<'cellar' | 'discover'>('cellar')

const cellar = ref<DegustationItem[]>([])
const cellarLoading = ref(false)
const cellarError = ref<string | null>(null)

const searchQuery = ref('')
const beers = ref<BeerItem[]>([])
const searchLoading = ref(false)
const searchError = ref<string | null>(null)
const isSearchOpen = ref(true)
const isSuggestionsOpen = ref(false)
const hasSearched = ref(false)
const highlightedIndex = ref<number>(-1)

const forYouBeers = ref<BeerItem[]>([])
const forYouLoading = ref(false)
const forYouError = ref<string | null>(null)

// Dans ta région
const regionalBeers = ref<BeerItem[]>([])
const regionalLoading = ref(false)
const regionalLoaded = ref(false)
const regionalIsFallback = ref(false)
/** Incrémenté à chaque nouveau chargement : ignore les réponses obsolètes (évite flash puis disparition). */
let regionalLoadSeq = 0

const isDrawerOpen = ref(false)
const selectedBeer = ref<BeerItem | null>(null)
const notePlaisir = ref<number>(0)
const noteAmertume = ref<number>(0)
const prix = ref<string>('')
const barName = ref<string>('')
const barLat = ref<number | null>(null)
const barLng = ref<number | null>(null)
const showDrawerMap = ref(false)
const saveLoading = ref(false)
const saveError = ref<string | null>(null)

const selectedDegustation = ref<DegustationItem | null>(null)
const isDetailOpen = ref(false)

const mapInstance = ref<any>(null)
const drawerMapInstance = ref<any>(null)
const detailMapInstance = ref<any>(null)

const discoverMapEl = ref<HTMLElement | null>(null)
const drawerMapEl = ref<HTMLElement | null>(null)
const detailMapEl = ref<HTMLElement | null>(null)

const nearbyRaw = ref<any[]>([])

function extractTopKeywords(rows: { beer_name: string | null; beer_style?: string | null }[]): string[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const text = `${row.beer_name ?? ''} ${row.beer_style ?? ''}`.trim()
    if (!text) continue
    for (const { key, test: testFn } of STYLE_SCANNERS) {
      if (testFn(text)) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, 3)
}

function itemsFromCatalogResponse(res: any): any[] {
  if (!res) return []
  if (Array.isArray(res.data)) return res.data
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.items)) return res.items
  if (Array.isArray(res?.beers)) return res.beers
  if (Array.isArray(res?.results)) return res.results
  return []
}

function mapRawToBeerItem(raw: any, index: number): BeerItem {
  return {
    id: raw?.id ?? index,
    name: raw?.name ?? raw?.beer_name ?? 'Bière sans nom',
    brewery: raw?.brewer?.name ?? raw?.brewery?.name ?? raw?.brewery ?? '—',
    style: raw?.style ?? undefined,
    abv: raw?.abv ?? null,
    ibu: raw?.ibu ?? null
  }
}

async function waitLeaflet(maxMs = 12000): Promise<any> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const L = typeof window !== 'undefined' ? (window as any).L : null
      if (L) {
        resolve(L)
        return
      }
      if (Date.now() - start > maxMs) {
        reject(new Error('Leaflet introuvable (CDN)'))
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
  })
}

function getGeoFallback() {
  return { lat: 48.8566, lng: 2.3522 }
}

function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(getGeoFallback())
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(getGeoFallback()),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  })
}

const cellarWithGeoSorted = computed(() => {
  return cellar.value
    .filter(
      d =>
        d.latitude != null
        && d.longitude != null
        && !Number.isNaN(Number(d.latitude))
        && !Number.isNaN(Number(d.longitude))
    )
    .slice()
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return ta - tb
    })
    .map((d, idx) => ({ ...d, orderNum: idx + 1 }))
})

async function resolveUserId(): Promise<string | null> {
  if (user.value?.id) return user.value.id
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

async function loadCellar() {
  cellarLoading.value = true
  cellarError.value = null

  try {
    const userId = await resolveUserId()
    if (!userId) {
      cellar.value = []
      return
    }

    const { data, error } = await supabase
      .from('degustations')
      .select(
        'id, beer_name, bar_name, note_plaisir, note_amertume, beer_api_id, latitude, longitude, created_at'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      cellarError.value = error.message
      cellar.value = []
    } else {
      cellar.value = (data as unknown as DegustationItem[]) ?? []
    }
  } catch (e: unknown) {
    const err = e as { message?: string }
    cellarError.value = err?.message ?? 'Impossible de charger ta cave.'
    cellar.value = []
  } finally {
    cellarLoading.value = false
  }
}

async function loadForYouSuggestions() {
  forYouLoading.value = true
  forYouError.value = null
  forYouBeers.value = []

  try {
    const userId = await resolveUserId()
    let rows: { beer_name: string | null; beer_api_id?: string | null; beer_style?: string | null }[] = []

    if (userId) {
      const { data, error } = await supabase
        .from('degustations')
        .select('beer_name, beer_api_id')
        .eq('user_id', userId)

      if (error) {
        forYouError.value = error.message
        return
      }
      rows = (data as any[]) ?? []
    }

    let seeds = extractTopKeywords(rows)
    if (!rows.length) {
      seeds = ['IPA', 'lager']
    } else if (!seeds.length) {
      seeds = ['IPA', 'lager']
    }

    const caveIds = new Set(rows.map(r => r.beer_api_id).filter(Boolean).map(String))
    const merged = new Map<string, BeerItem>()

    for (const kw of seeds.slice(0, 3)) {
      try {
        const res = await $fetch<any>(BEER_API_URL, {
          params: { action: 'suggestions', q: kw }
        })
        const rawItems = itemsFromCatalogResponse(res)
        rawItems.forEach((raw, i) => {
          const item = mapRawToBeerItem(raw, i)
          const sid = String(item.id)
          if (caveIds.has(sid)) return
          if (!merged.has(sid)) merged.set(sid, item)
        })
      } catch {
        /* ignore une requête suggestions */
      }
      if (merged.size >= 12) break
    }

    forYouBeers.value = Array.from(merged.values()).slice(0, 8)
  } catch (e: unknown) {
    const err = e as { message?: string }
    forYouError.value = err?.message ?? 'Suggestions indisponibles.'
  } finally {
    forYouLoading.value = false
  }
}

async function loadRegionalBeers(options?: { force?: boolean }) {
  const force = options?.force ?? false
  if (!force && regionalLoaded.value) return

  const seq = ++regionalLoadSeq
  regionalLoading.value = true

  try {
    const geoItems = cellar.value.filter(
      d =>
        d.latitude != null &&
        d.longitude != null &&
        !Number.isNaN(Number(d.latitude)) &&
        !Number.isNaN(Number(d.longitude))
    )

    let centerLat: number
    let centerLng: number

    if (geoItems.length > 0) {
      centerLat = geoItems.reduce((sum, d) => sum + Number(d.latitude), 0) / geoItems.length
      centerLng = geoItems.reduce((sum, d) => sum + Number(d.longitude), 0) / geoItems.length
    } else {
      const pos = await getCurrentPosition()
      if (seq !== regionalLoadSeq) return
      centerLat = pos.lat
      centerLng = pos.lng
    }

    const nearbyRes = await $fetch<any>(BEER_API_URL, {
      params: { action: 'nearby', latitude: String(centerLat), longitude: String(centerLng) }
    })

    if (seq !== regionalLoadSeq) return

    const nearbyArr = itemsFromCatalogResponse(nearbyRes)
    const caveIds = new Set(
      cellar.value.map(d => d.beer_api_id).filter(Boolean).map(String)
    )

    const breweries = nearbyArr
      .slice(0, 3)
      .map(r => ({
        id: r?.brewer?.id ?? r?.brewer_id ?? r?.brewer?.brewer_id ?? '',
        name: r?.brewer?.name ?? r?.brewer?.brewery?.name ?? 'Brasserie'
      }))
      .filter(b => !!b.id)

    // Fallback si aucune brasserie dans un rayon de 100km
    if (breweries.length === 0) {
      const fallbackRes = await $fetch<any>(BEER_API_URL, {
        params: { action: 'suggestions', q: 'craft beer' }
      })
      if (seq !== regionalLoadSeq) return
      const rawFallback = itemsFromCatalogResponse(fallbackRes)
      regionalBeers.value = rawFallback
        .slice(0, 6)
        .map((r: any, i: number) => mapRawToBeerItem(r, i))
        .filter((b: BeerItem) => !caveIds.has(String(b.id)))
      regionalIsFallback.value = true
      return
    }

    regionalIsFallback.value = false
    const dedup = new Set<string>()
    const found: BeerItem[] = []

    for (const brewer of breweries) {
      if (found.length >= 6) break

      try {
        const brewerRes = await $fetch<any>(BEER_API_URL, {
          params: { action: 'brewerBeers', brewerId: String(brewer.id) }
        })

        if (seq !== regionalLoadSeq) return

        const rawBeers = itemsFromCatalogResponse(brewerRes)
        const first2 = rawBeers.slice(0, 2)

        for (const raw of first2) {
          if (found.length >= 6) break
          const id = raw?.id ?? raw?.beer_api_id
          if (id == null) continue
          const sid = String(id)
          if (caveIds.has(sid)) continue
          if (dedup.has(sid)) continue
          dedup.add(sid)

          found.push({
            id: sid,
            name: raw?.name ?? raw?.beer_name ?? 'Bière',
            brewery: brewer.name,
            style: raw?.style ?? undefined,
            abv: raw?.abv ?? null,
            ibu: raw?.ibu ?? null
          })
        }
      } catch {
        /* ignore une brasserie */
      }
    }

    if (seq !== regionalLoadSeq) return
    regionalBeers.value = found.slice(0, 6)
  } catch {
    if (seq !== regionalLoadSeq) return
    // Ne pas effacer une liste déjà affichée (évite disparition après erreur réseau / course)
    if (regionalBeers.value.length === 0) {
      regionalBeers.value = []
    }
  } finally {
    if (seq === regionalLoadSeq) {
      regionalLoading.value = false
      regionalLoaded.value = true
    }
  }
}

async function performSearch() {
  const q = searchQuery.value.trim()

  if (!q) {
    beers.value = []
    searchError.value = null
    hasSearched.value = false
    highlightedIndex.value = -1
    return
  }

  searchLoading.value = true
  searchError.value = null

  try {
    const result = await $fetch<any>(BEER_API_URL, {
      params: { action: 'search', q }
    })

    const rawItems = itemsFromCatalogResponse(result)
    beers.value = rawItems.map((raw, i) => mapRawToBeerItem(raw, i))
    highlightedIndex.value = beers.value.length ? 0 : -1
  } catch (e: any) {
    const msg = String(e?.message ?? e?.data?.message ?? '')
    searchError.value =
      msg.includes('502') || msg.includes('fetch failed') || msg.includes('Failed to fetch')
        ? 'Catalogue de bières indisponible pour le moment. Réessaie plus tard.'
        : (msg || 'Erreur lors de la recherche.')
    beers.value = []
    highlightedIndex.value = -1
  } finally {
    searchLoading.value = false
    hasSearched.value = true
  }
}

const debouncedSearch = debounce(performSearch, 300)

watch(searchQuery, () => {
  isSuggestionsOpen.value = true
  debouncedSearch()
})

watch(user, (u) => {
  if (u) {
    loadCellar()
  } else {
    cellar.value = []
    cellarError.value = null
    regionalBeers.value = []
    regionalLoaded.value = false
    regionalIsFallback.value = false
    regionalLoadSeq++
    // Obligatoire si une requête "région" était en cours : sinon finally d’une requête annulée
    // ne remet pas loading à false et l’UI peut rester bloquée ou incohérente.
    regionalLoading.value = false
  }
}, { immediate: true })

// ⚠️ Ne PAS watch cellar pour reset regionalLoaded —
// cela causait la disparition des bières régionales :
// loadCellar() (dans watch activeTab) se terminait après loadRegionalBeers()
// et déclenchait ce watcher qui effaçait regionalLoaded = true → re-fetch → tableau vide affiché

function destroyDiscoverMap() {
  try {
    mapInstance.value?.remove()
  } catch {
    /* ignore */
  }
  mapInstance.value = null
}

function destroyDrawerMap() {
  try {
    drawerMapInstance.value?.remove()
  } catch {
    /* ignore */
  }
  drawerMapInstance.value = null
}

function destroyDetailMap() {
  try {
    detailMapInstance.value?.remove()
  } catch {
    /* ignore */
  }
  detailMapInstance.value = null
}

async function initDiscoverMap() {
  if (typeof window === 'undefined' || !discoverMapEl.value) return
  if (mapInstance.value) return

  let L: any
  try {
    L = await waitLeaflet()
  } catch {
    return
  }

  const pos = await getCurrentPosition()

  try {
    const res = await $fetch<any>(BEER_API_URL, {
      params: {
        action: 'nearby',
        latitude: String(pos.lat),
        longitude: String(pos.lng)
      }
    })
    const arr = itemsFromCatalogResponse(res)
    nearbyRaw.value = Array.isArray(arr) ? arr : []
  } catch {
    nearbyRaw.value = []
  }

  const map = L.map(discoverMapEl.value, { zoomControl: true }).setView([pos.lat, pos.lng], 12)

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map)

  const pulseIcon = L.divIcon({
    className: 'bm-pulse-wrap',
    html: '<div class="bm-pulse-dot"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  })
  L.marker([pos.lat, pos.lng], { icon: pulseIcon, zIndexOffset: 1000 }).addTo(map)

  for (const row of nearbyRaw.value) {
    const lat = row?.location?.latitude
    const lng = row?.location?.longitude
    if (lat == null || lng == null) continue
    const name = row?.location?.name ?? row?.brewer?.name ?? 'Brasserie'
    const brewer = row?.brewer?.name ?? ''
    const beerIcon = L.divIcon({
      className: 'bm-brewery-marker',
      html: '<span>🍺</span>',
      iconSize: [28, 28],
      iconAnchor: [14, 28]
    })
    L.marker([Number(lat), Number(lng)], { icon: beerIcon })
      .addTo(map)
      .bindPopup(`<strong>${name}</strong><br>${brewer}`)
  }

  for (const row of cellarWithGeoSorted.value) {
    const lat = Number(row.latitude)
    const lng = Number(row.longitude)
    const icon = L.divIcon({
      className: 'bm-bar-num-marker',
      html: `<span>${row.orderNum}</span>`,
      iconSize: [26, 26],
      iconAnchor: [13, 26]
    })
    L.marker([lat, lng], { icon })
      .addTo(map)
      .bindPopup(
        `<strong>${row.bar_name ?? 'Bar'}</strong><br>${row.beer_name ?? ''}`
      )
  }

  mapInstance.value = map
  nextTick(() => map.invalidateSize())
}

async function initDrawerMap() {
  if (typeof window === 'undefined' || !drawerMapEl.value) return
  destroyDrawerMap()

  let L: any
  try {
    L = await waitLeaflet()
  } catch {
    return
  }

  const pos = await getCurrentPosition()
  barLat.value = pos.lat
  barLng.value = pos.lng

  const map = L.map(drawerMapEl.value, { zoomControl: true }).setView([pos.lat, pos.lng], 14)

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map)

  let marker = L.marker([pos.lat, pos.lng], { draggable: true }).addTo(map)
  marker.on('dragend', () => {
    const ll = marker.getLatLng()
    barLat.value = ll.lat
    barLng.value = ll.lng
  })

  map.on('click', (e: any) => {
    const { lat, lng } = e.latlng
    barLat.value = lat
    barLng.value = lng
    marker.setLatLng([lat, lng])
  })

  drawerMapInstance.value = map
  nextTick(() => map.invalidateSize())
}

async function initDetailMap(lat: number, lng: number) {
  if (typeof window === 'undefined' || !detailMapEl.value) return
  destroyDetailMap()

  let L: any
  try {
    L = await waitLeaflet()
  } catch {
    return
  }

  const map = L.map(detailMapEl.value, {
    dragging: false,
    zoomControl: false,
    scrollWheelZoom: false,
    touchZoom: false,
    doubleClickZoom: false
  }).setView([lat, lng], 15)

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map)

  const icon = L.divIcon({
    className: 'bm-detail-bar-marker',
    html: '<span></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 18]
  })
  L.marker([lat, lng], { icon }).addTo(map)

  detailMapInstance.value = map
  nextTick(() => map.invalidateSize())
}

watch(activeTab, async (tab) => {
  if (tab === 'cellar') {
    loadCellar()
    destroyDiscoverMap()
  } else {
    // NE PAS appeler loadCellar() ici — elle est déjà chargée par watch(user, immediate:true)
    // NE PAS await loadRegionalBeers() : le await suspend le watcher, laisse le temps
    // à watch(user) de re-déclencher loadCellar() qui invalide le seq → bières disparaissent
    loadForYouSuggestions()
    loadRegionalBeers()
    await nextTick()
    destroyDiscoverMap()
    await nextTick()
    initDiscoverMap()
  }
})

watch(
  () => cellar.value.map(d => `${d.id}:${d.latitude}:${d.longitude}`).join('|'),
  async () => {
    if (activeTab.value !== 'discover') return
    await nextTick()
    destroyDiscoverMap()
    await nextTick()
    initDiscoverMap()
  }
)

onMounted(() => {
  loadCellar()
  if (activeTab.value === 'discover') {
    nextTick(() => {
      loadForYouSuggestions()
      loadRegionalBeers()
      nextTick(() => initDiscoverMap())
    })
  }
})

onUnmounted(() => {
  destroyDiscoverMap()
  destroyDrawerMap()
  destroyDetailMap()
})

function signOut() {
  void supabase.auth.signOut().then(() => router.push('/login'))
}

function getRatingColorClass(score: number) {
  if (score <= 1) return 'bg-red-500'
  if (score === 2) return 'bg-orange-500'
  if (score === 3) return 'bg-yellow-400'
  if (score === 4) return 'bg-lime-400'
  return 'bg-emerald-500'
}

function openAddBeerSearch() {
  // Ouvre le drawer en mode "recherche" : l'utilisateur cherche d'abord sa bière
  selectedBeer.value = null
  notePlaisir.value = 0
  noteAmertume.value = 0
  prix.value = ''
  barName.value = ''
  barLat.value = null
  barLng.value = null
  showDrawerMap.value = false
  saveError.value = null
  searchQuery.value = ''
  beers.value = []
  hasSearched.value = false
  isSuggestionsOpen.value = false
  destroyDrawerMap()
  isDrawerOpen.value = true
}

function openDrawer(beer: BeerItem) {
  isSearchOpen.value = true
  activeTab.value = 'discover'
  selectedBeer.value = beer
  notePlaisir.value = 0
  noteAmertume.value = 0
  prix.value = ''
  barName.value = ''
  barLat.value = null
  barLng.value = null
  showDrawerMap.value = false
  saveError.value = null
  destroyDrawerMap()
  isDrawerOpen.value = true
}

function selectBeerInDrawer(beer: BeerItem) {
  selectedBeer.value = beer
  searchQuery.value = beer.name
  isSuggestionsOpen.value = false
}

function selectBeer(beer: BeerItem) {
  searchQuery.value = beer.name
  isSuggestionsOpen.value = false
  openDrawer(beer)
}

function openForYouBeer(beer: BeerItem) {
  openDrawer(beer)
}

function onSearchKeydown(e: KeyboardEvent) {
  if (!isSuggestionsOpen.value) return

  if (e.key === 'Escape') {
    isSuggestionsOpen.value = false
    highlightedIndex.value = -1
    return
  }

  if (!beers.value.length) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightedIndex.value = Math.min(highlightedIndex.value + 1, beers.value.length - 1)
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0)
    return
  }

  if (e.key === 'Enter') {
    const idx = highlightedIndex.value
    if (idx >= 0 && beers.value[idx]) {
      e.preventDefault()
      selectBeer(beers.value[idx]!)
    }
  }
}

function onSearchBlur() {
  globalThis.setTimeout(() => {
    isSuggestionsOpen.value = false
  }, 120)
}

const shouldShowSuggestions = computed(() => {
  if (!isSearchOpen.value) return false
  if (!isSuggestionsOpen.value) return false
  if (!searchQuery.value.trim()) return false
  if (searchError.value) return false
  return true
})

function closeDrawer() {
  isDrawerOpen.value = false
  showDrawerMap.value = false
  destroyDrawerMap()
}

async function toggleDrawerGeo() {
  showDrawerMap.value = true
  await nextTick()
  await initDrawerMap()
}

async function openCellarDetail(item: DegustationItem) {
  selectedDegustation.value = item
  isDetailOpen.value = true
  destroyDetailMap()
  await nextTick()
  await nextTick()
  const lat = item.latitude != null ? Number(item.latitude) : NaN
  const lng = item.longitude != null ? Number(item.longitude) : NaN
  if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
    await initDetailMap(lat, lng)
  }
}

function closeCellarDetail() {
  isDetailOpen.value = false
  selectedDegustation.value = null
  destroyDetailMap()
}

async function addBeerToCollection() {
  saveLoading.value = true
  saveError.value = null

  try {
    const userId = await resolveUserId()

    if (!userId) {
      saveError.value = 'Utilisateur non connecté.'
      return
    }

    // Si aucune bière API sélectionnée, on utilise le texte saisi manuellement
    const beerName = selectedBeer.value?.name ?? searchQuery.value.trim()
    const beerApiId = selectedBeer.value ? String(selectedBeer.value.id) : null

    if (!beerName) {
      saveError.value = 'Saisis ou sélectionne une bière.'
      return
    }

    const normalizedNotePlaisir =
      Number.isFinite(notePlaisir.value) && notePlaisir.value >= 1 && notePlaisir.value <= 5
        ? notePlaisir.value
        : null

    const normalizedNoteAmertume =
      Number.isFinite(noteAmertume.value) && noteAmertume.value >= 1 && noteAmertume.value <= 5
        ? noteAmertume.value
        : null

    if (!normalizedNotePlaisir) {
      saveError.value = 'Merci de renseigner une note de kiff (1 à 5).'
      return
    }

    const normalizedPrix =
      prix.value === '' || prix.value === null || prix.value === undefined
        ? null
        : Number(String(prix.value).replace(',', '.'))

    const payload = {
      user_id: userId,
      beer_api_id: beerApiId,
      beer_name: beerName,
      note_plaisir: normalizedNotePlaisir,
      note_amertume: normalizedNoteAmertume,
      prix: normalizedPrix,
      bar_name: barName.value || null,
      ...(barLat.value != null && barLng.value != null
        ? { latitude: barLat.value, longitude: barLng.value }
        : {})
    }

    const { error } = await supabase.from('degustations').insert(payload as never)

    if (error) {
      saveError.value = error.message
      return
    }

    await loadCellar()
    // Invalider le cache régional : la cave / caveIds ont changé, sinon le prochain onglet
    // Découvrir skippe le fetch (regionalLoaded) et la liste peut sembler "vider" ou être obsolète.
    regionalLoaded.value = false
    regionalLoadSeq++
    activeTab.value = 'cellar'
    closeDrawer()
    loadForYouSuggestions()
  } catch (e: unknown) {
    const err = e as { message?: string }
    saveError.value = err?.message ?? 'Erreur lors de l’enregistrement.'
  } finally {
    saveLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col text-[#b45309]" style="background-color: #faf8f5;">
    <div class="w-full max-w-4xl mx-auto flex-1 flex flex-col px-4 pb-28 pt-8">
      <header class="mb-6 flex items-start justify-between gap-4">
        <div>
          <p
            class="uppercase"
            style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; color: #d97706;"
          >
            BeerMe
          </p>
          <h1 class="text-2xl md:text-3xl font-semibold mt-1 font-serif">
            Salut{{ profile?.username ? `, ${profile.username}` : '' }} 👋
          </h1>
          <p class="mt-2 text-sm max-w-xl" style="color: #92400e;">
            Gère ta cave personnelle et note les bières que tu découvres.
          </p>
        </div>

        <div class="flex flex-row items-center gap-2">
          <!-- Avatar profil -->
          <button
            type="button"
            class="flex items-center justify-center rounded-full transition"
            style="width: 36px; height: 36px; background: #fdf3e7; color: #b45309; font-size: 13px; font-weight: 700; border: 1.5px solid #ede9df; cursor: pointer; flex-shrink: 0;"
            @mouseenter="(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#b45309' }"
            @mouseleave="(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#ede9df' }"
            @click="router.push('/profile')"
          >
            <span v-if="profile?.username">
              {{ profile.username.charAt(0).toUpperCase() }}
            </span>
            <svg
              v-else
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </button>

          <button
            type="button"
            class="hidden sm:inline-flex min-h-[40px] px-3 py-2 rounded-full border text-xs font-medium transition"
            style="border-color: #ede9df; color: #b45309;"
            @click="signOut"
          >
            Déconnexion
          </button>
          <button
            type="button"
            class="hidden sm:inline-flex min-h-[40px] px-4 py-2 rounded-full text-xs font-semibold items-center gap-2 shadow-sm transition"
            style="background: #b45309; color: #fffbf0;"
          @click="openAddBeerSearch()"
          >
            <span
              class="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs"
              style="background: #fffbf0; color: #b45309;"
            >
              +
            </span>
            Ajouter une bière
          </button>
        </div>
      </header>

      <nav
        class="flex mb-4 rounded-full p-1 shadow-sm"
        style="background: #fff; border: 1px solid #ede9df;"
      >
        <button
          type="button"
          class="flex-1 min-h-[40px] text-sm font-medium rounded-full transition px-2"
          :style="activeTab === 'cellar'
            ? { background: '#b45309', color: '#fffbf0' }
            : { color: '#92400e' }"
          @click="activeTab = 'cellar'"
        >
          Ma Cave
        </button>
        <button
          type="button"
          class="flex-1 min-h-[40px] text-sm font-medium rounded-full transition px-2"
          :style="activeTab === 'discover'
            ? { background: '#b45309', color: '#fffbf0' }
            : { color: '#92400e' }"
          @click="activeTab = 'discover'"
        >
          Découvrir
        </button>
      </nav>

      <div class="flex-1 flex flex-col gap-6">
        <section v-if="activeTab === 'cellar'" class="flex-1 flex flex-col gap-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-base font-semibold">
              Tes dégustations
            </h2>
            <span class="text-xs" style="color: #c0b89a;">
              {{ cellar.length }} bière{{ cellar.length > 1 ? 's' : '' }}
            </span>
          </div>

          <p v-if="cellarError" class="text-sm text-red-600">
            {{ cellarError }}
          </p>

          <p
            v-else-if="cellarLoading"
            class="text-sm rounded-xl p-4"
            style="color: #92400e; background: #fff; border: 1px solid #ede9df;"
          >
            Chargement de ta cave…
          </p>

          <p
            v-else-if="!cellar.length"
            class="text-sm rounded-xl p-4 border border-dashed"
            style="color: #92400e; background: #fff; border-color: #ede9df;"
          >
            Tu n'as pas encore enregistré de dégustation.
            <button
              type="button"
              class="ml-1 font-semibold underline underline-offset-2"
              style="color: #b45309;"
              @click="openAddBeerSearch()"
            >
              Ajoute ta première bière.
            </button>
          </p>

          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <article
              v-for="item in cellar"
              :key="item.id"
              role="button"
              tabindex="0"
              class="rounded-2xl px-4 pt-4 pb-3 flex flex-col gap-3 transition cursor-pointer hover:shadow-md active:scale-[0.99]"
              style="background: #fff; border: 1px solid #ede9df;"
              @click="openCellarDetail(item)"
              @keydown.enter="openCellarDetail(item)"
            >
              <!-- Nom + icône bière -->
              <div class="flex items-start justify-between gap-2">
                <h3
                  class="text-sm font-semibold leading-snug font-serif"
                  style="color: #b45309; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                >
                  {{ item.beer_name || 'Bière inconnue' }}
                </h3>
                <span style="font-size: 20px; flex-shrink: 0; line-height: 1;">🍺</span>
              </div>

              <!-- Note kiff : échelle de chopes + badge coloré -->
              <div class="flex items-center gap-1">
                <span
                  v-for="score in 5"
                  :key="`kiff-${item.id}-${score}`"
                  style="font-size: 13px; line-height: 1; display: inline-block;"
                  :style="item.note_plaisir && score <= item.note_plaisir
                    ? { opacity: '1' }
                    : { opacity: '0.15', filter: 'grayscale(1)' }"
                >🍺</span>
                <span
                  class="ml-2 flex items-center justify-center rounded-full font-bold text-white"
                  style="width: 20px; height: 20px; font-size: 10px; flex-shrink: 0;"
                  :class="getRatingColorClass(item.note_plaisir ?? 0)"
                >{{ item.note_plaisir ?? '?' }}</span>
                <span class="ml-1 text-xs" style="color: #c0b89a;">kiff</span>
              </div>

              <!-- Bar -->
              <div class="flex items-center gap-1.5">
                <span style="font-size: 11px; opacity: 0.5; flex-shrink: 0;">📍</span>
                <p class="text-xs truncate" style="color: #c0b89a;">
                  {{ item.bar_name || 'Bar non renseigné' }}
                </p>
              </div>
            </article>
          </div>
        </section>

        <section v-else class="flex-1 flex flex-col gap-5">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-base font-semibold">
              Découvrir des bières
            </h2>
            <button
              type="button"
              class="inline-flex sm:hidden min-h-[40px] px-4 py-2 rounded-full text-xs font-semibold items-center gap-2 shadow-sm transition"
              style="background: #b45309; color: #fffbf0;"
              @click="isSearchOpen = !isSearchOpen"
            >
              <span class="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs bg-[#fffbf0] text-[#b45309]">
                +
              </span>
              Ajouter une bière
            </button>
          </div>

          <!-- Pour toi -->
          <div class="space-y-2">
            <p
              class="uppercase"
              style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; color: #d97706;"
            >
              Pour toi
            </p>
            <p class="text-xs" style="color: #c0b89a;">
              Basé sur ta cave
            </p>

            <p v-if="forYouError" class="text-sm text-red-600">
              {{ forYouError }}
            </p>

            <div v-if="forYouLoading" class="space-y-2">
              <div
                v-for="n in 3"
                :key="n"
                class="h-16 rounded-xl animate-pulse"
                style="background: #ede9df;"
              />
            </div>

            <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                v-for="beer in forYouBeers"
                :key="beer.id"
                class="rounded-xl p-3 flex flex-col gap-2"
                style="background: #fff; border: 1px solid #ede9df;"
              >
                <div class="min-w-0">
                  <p class="text-sm font-semibold truncate" style="color: #b45309;">
                    {{ beer.name }}
                  </p>
                  <p class="text-xs truncate mt-0.5" style="color: #c0b89a;">
                    {{ beer.brewery }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-1.5 items-center">
                  <span
                    v-if="beer.style"
                    class="text-[10px] px-2 py-0.5 rounded-full"
                    style="background: #faf8f5; color: #92400e; border: 1px solid #ede9df;"
                  >
                    {{ beer.style }}
                  </span>
                  <span
                    v-if="beer.abv != null"
                    class="text-[10px] px-2 py-0.5 rounded-full"
                    style="background: #faf8f5; color: #92400e; border: 1px solid #ede9df;"
                  >
                    {{ beer.abv }}% ABV
                  </span>
                  <span
                    v-if="beer.ibu != null"
                    class="text-[10px] px-2 py-0.5 rounded-full"
                    style="background: #faf8f5; color: #92400e; border: 1px solid #ede9df;"
                  >
                    IBU {{ beer.ibu }}
                  </span>
                </div>
                <button
                  type="button"
                  class="text-xs font-semibold self-end mt-1"
                  style="color: #d97706;"
                  @click="openForYouBeer(beer)"
                >
                  Noter →
                </button>
              </div>
            </div>
          </div>

          <!-- Dans ta région -->
          <div
            v-if="regionalLoading || regionalBeers.length"
            class="space-y-2"
          >
            <p
              class="uppercase"
              style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; color: #d97706;"
            >
              {{ regionalIsFallback ? 'À découvrir' : 'Dans ta région' }}
            </p>
            <p class="text-xs" style="color: #c0b89a;">
              {{ regionalIsFallback ? 'Sélection du catalogue' : 'Brasseries à moins de 100 km' }}
            </p>

            <div v-if="regionalLoading" class="space-y-2">
              <div
                v-for="n in 3"
                :key="`regional-skel-${n}`"
                class="h-16 rounded-xl animate-pulse"
                style="background: #ede9df;"
              />
            </div>

            <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                v-for="beer in regionalBeers"
                :key="beer.id"
                class="rounded-xl p-3 flex flex-col gap-2"
                style="background: #fff; border: 1px solid #ede9df;"
              >
                <div class="min-w-0">
                  <p class="text-sm font-semibold truncate" style="color: #b45309;">
                    {{ beer.name }}
                  </p>
                  <p class="text-xs truncate mt-0.5" style="color: #c0b89a;">
                    {{ beer.brewery }}
                  </p>
                </div>

                <div class="flex flex-wrap gap-1.5 items-center">
                  <span
                    v-if="beer.style"
                    class="text-[10px] px-2 py-0.5 rounded-full"
                    style="background: #faf8f5; color: #92400e; border: 1px solid #ede9df;"
                  >
                    {{ beer.style }}
                  </span>
                  <span
                    v-if="beer.abv != null"
                    class="text-[10px] px-2 py-0.5 rounded-full"
                    style="background: #faf8f5; color: #92400e; border: 1px solid #ede9df;"
                  >
                    {{ beer.abv }}% ABV
                  </span>
                  <span
                    v-if="beer.ibu != null"
                    class="text-[10px] px-2 py-0.5 rounded-full"
                    style="background: #faf8f5; color: #92400e; border: 1px solid #ede9df;"
                  >
                    IBU {{ beer.ibu }}
                  </span>
                </div>

                <button
                  type="button"
                  class="text-xs font-semibold self-end mt-1"
                  style="color: #d97706;"
                  @click="openForYouBeer(beer)"
                >
                  Noter →
                </button>
              </div>
            </div>
          </div>

          <!-- Recherche -->
          <div
            v-if="isSearchOpen"
            class="rounded-xl p-4 shadow-sm space-y-3"
            style="background: #fff; border: 1px solid #ede9df;"
          >
            <div>
              <label for="search" class="block text-sm font-medium mb-1.5" style="color: #92400e;">
                Rechercher dans le catalogue
              </label>
              <div class="relative">
                <input
                  id="search"
                  v-model="searchQuery"
                  type="text"
                  autocomplete="off"
                  class="w-full px-4 py-3 pr-10 rounded-lg text-sm placeholder-[#c0b89a] focus:outline-none focus:ring-2 transition"
                  style="background: #faf8f5; border: 1px solid #ede9df; color: #b45309; --tw-ring-color: #d97706;"
                  placeholder="Nom de bière, brasserie…"
                  @focus="isSuggestionsOpen = true"
                  @keydown="onSearchKeydown"
                  @blur="onSearchBlur"
                >

                <div v-if="searchLoading" class="absolute inset-y-0 right-3 flex items-center">
                  <svg
                    class="h-5 w-5 animate-spin"
                    style="color: #d97706;"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                </div>

                <div
                  v-if="shouldShowSuggestions"
                  class="absolute z-20 mt-2 w-full overflow-hidden rounded-xl shadow-lg"
                  style="border: 1px solid #ede9df; background: #fff;"
                >
                  <div v-if="searchLoading" class="px-4 py-3 text-sm" style="color: #c0b89a;">
                    Recherche…
                  </div>

                  <template v-else>
                    <button
                      v-for="(beer, idx) in beers"
                      :key="beer.id"
                      type="button"
                      class="w-full text-left px-4 py-2.5 text-sm hover:bg-[#faf8f5] transition flex items-center justify-between"
                      :class="idx === highlightedIndex ? 'bg-[#faf8f5]' : ''"
                      @mousedown.prevent="selectBeer(beer)"
                      @mousemove="highlightedIndex = idx"
                    >
                      <span class="truncate font-medium" style="color: #b45309;">{{ beer.name }}</span>
                      <span class="ml-3 shrink-0 text-xs truncate max-w-[45%]" style="color: #c0b89a;">
                        {{ beer.brewery }}
                      </span>
                    </button>

                    <div
                      v-if="hasSearched && !beers.length"
                      class="px-4 py-3 text-sm"
                      style="color: #c0b89a;"
                    >
                      Aucune bière trouvée pour « {{ searchQuery }} ».
                    </div>
                  </template>
                </div>
              </div>
              <p class="mt-1 text-xs" style="color: #c0b89a;">
                Recherche en direct après 300 ms de pause.
              </p>
            </div>

            <p v-if="searchError" class="text-sm text-red-600">
              {{ searchError }}
            </p>

            <p v-if="!searchQuery.trim()" class="mt-2 text-sm" style="color: #c0b89a;">
              Commence à taper pour chercher dans le catalogue.
            </p>
          </div>

          <!-- Carte -->
          <div>
            <p
              class="uppercase mb-2"
              style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; color: #d97706;"
            >
              Autour de toi
            </p>
            <div
              ref="discoverMapEl"
              class="w-full z-0"
              style="height: 260px; border-radius: 16px; overflow: hidden; border: 1px solid #ede9df; background: #ede9df;"
            />
          </div>
        </section>
      </div>
    </div>

    <button
      type="button"
      class="sm:hidden fixed bottom-6 right-6 z-30 min-h-[52px] min-w-[52px] rounded-full shadow-lg flex items-center justify-center active:scale-95 transition"
      style="background: #b45309; color: #fffbf0;"
      @click="openAddBeerSearch()"
    >
      <span class="text-2xl leading-none">+</span>
    </button>

    <transition name="slide-up">
      <div
        v-if="isDrawerOpen"
        class="fixed inset-0 z-40 flex items-end md:items-center justify-center"
      >
        <div class="absolute inset-0 bg-black/40" @click="closeDrawer" />
        <div
          class="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl px-4 pt-4 pb-6 mx-auto shadow-xl"
          style="background: #fff; border: 1px solid #ede9df;"
        >
          <div class="flex items-center justify-between mb-3">
            <div>
              <p
                class="uppercase"
                style="font-size: 11px; font-weight: 700; letter-spacing: 0.12em; color: #d97706;"
              >
                {{ selectedBeer ? 'Dégustation' : 'Ajouter une bière' }}
              </p>
              <h3 v-if="selectedBeer" class="text-base font-semibold font-serif" style="color: #b45309;">
                {{ selectedBeer.name }}
              </h3>
              <p v-else class="text-sm" style="color: #92400e;">
                Recherche ou saisis le nom de ta bière
              </p>
            </div>
            <button
              type="button"
              class="w-8 h-8 rounded-full flex items-center justify-center transition"
              style="background: #faf8f5; color: #92400e;"
              @click="closeDrawer"
            >
              ✕
            </button>
          </div>

          <!-- Barre de recherche intégrée -->
          <div class="mb-4 relative">
            <div
              class="flex items-center gap-2 px-3 py-2 rounded-xl"
              style="background: #faf8f5; border: 1px solid #ede9df;"
            >
              <span style="color: #d97706;">🔍</span>
              <input
                v-model="searchQuery"
                type="text"
                class="flex-1 bg-transparent text-sm outline-none"
                style="color: #92400e;"
                :placeholder="selectedBeer ? selectedBeer.name : 'Nom de la bière…'"
                autocomplete="off"
                @input="() => { selectedBeer = null; debouncedSearch() }"
                @keydown="onSearchKeydown"
              >
              <button
                v-if="selectedBeer"
                type="button"
                class="text-xs px-2 py-0.5 rounded-full shrink-0"
                style="background: #fef3c7; color: #92400e;"
                @click="() => { selectedBeer = null; searchQuery = ''; beers = []; hasSearched = false }"
              >
                Changer
              </button>
              <span v-else-if="searchLoading" class="shrink-0 text-xs" style="color: #d97706;">…</span>
            </div>
            <!-- Suggestions -->
            <ul
              v-if="isSuggestionsOpen && beers.length > 0"
              class="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-lg z-10"
              style="background: #fff; border: 1px solid #ede9df; max-height: 200px; overflow-y: auto;"
            >
              <li
                v-for="(beer, idx) in beers"
                :key="beer.id"
                class="px-3 py-2 cursor-pointer text-sm flex items-baseline gap-1"
                :style="highlightedIndex === idx ? 'background: #fef3c7;' : ''"
                style="color: #92400e; border-bottom: 1px solid #f5f0e8;"
                @click="selectBeerInDrawer(beer)"
                @mouseenter="highlightedIndex = idx"
              >
                <span class="font-medium">{{ beer.name }}</span>
                <span v-if="beer.brewery" class="text-xs" style="color: #c0b89a;">· {{ beer.brewery }}</span>
              </li>
            </ul>
            <p
              v-if="hasSearched && !searchLoading && beers.length === 0 && searchQuery.trim()"
              class="mt-1 text-xs text-center"
              style="color: #c0b89a;"
            >
              Aucun résultat — tu peux quand même noter ci-dessous.
            </p>
          </div>

          <p class="text-xs mb-3" style="color: #c0b89a;">
            Note le kiff, l’amertume, et où tu l’as bue.
          </p>

          <div class="space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <p class="text-xs font-medium mb-1" style="color: #92400e;">
                Kiff
              </p>
              <div class="flex items-center space-x-2">
                <button
                  v-for="score in 5"
                  :key="`plaisir-${score}`"
                  type="button"
                  class="w-9 h-9 min-h-[44px] flex-1 rounded-full flex items-center justify-center text-lg active:scale-95 transition"
                  :class="score <= notePlaisir
                    ? getRatingColorClass(score)
                    : 'bg-[#faf8f5] text-[#c0b89a]'"
                  @click="notePlaisir = score"
                >
                  🍺
                </button>
              </div>
            </div>

            <div>
              <p class="text-xs font-medium mb-1" style="color: #92400e;">
                Amertume
              </p>
              <div class="flex items-center space-x-2">
                <button
                  v-for="score in 5"
                  :key="`amertume-${score}`"
                  type="button"
                  class="w-9 h-9 min-h-[44px] flex-1 rounded-full flex items-center justify-center text-lg active:scale-95 transition"
                  :class="score <= noteAmertume
                    ? getRatingColorClass(score)
                    : 'bg-[#faf8f5] text-[#c0b89a]'"
                  @click="noteAmertume = score"
                >
                  🌿
                </button>
              </div>
            </div>

            <div class="flex space-x-3">
              <div class="flex-1">
                <label for="prix" class="block text-xs font-medium mb-1" style="color: #92400e;">
                  Prix (€)
                </label>
                <input
                  id="prix"
                  v-model="prix"
                  type="number"
                  step="0.1"
                  min="0"
                  inputmode="decimal"
                  class="w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 transition"
                  style="background: #faf8f5; border: 1px solid #ede9df; color: #b45309; --tw-ring-color: #d97706;"
                  placeholder="5.5"
                >
              </div>

              <div class="flex-1">
                <label for="bar" class="block text-xs font-medium mb-1" style="color: #92400e;">
                  Nom du bar
                </label>
                <div class="flex gap-1">
                  <input
                    id="bar"
                    v-model="barName"
                    type="text"
                    class="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 transition"
                    style="background: #faf8f5; border: 1px solid #ede9df; color: #b45309; --tw-ring-color: #d97706;"
                    placeholder="Ex: Le Houblon"
                  >
                  <button
                    type="button"
                    class="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                    style="color: #d97706; border: 1px solid #ede9df; background: #fff;"
                    aria-label="Placer le bar sur la carte"
                    @click="toggleDrawerGeo"
                  >
                    📍
                  </button>
                </div>
              </div>
            </div>

            <div v-if="showDrawerMap" class="space-y-1">
              <div
                ref="drawerMapEl"
                class="w-full"
                style="height: 180px; border-radius: 12px; overflow: hidden; border: 1px solid #ede9df;"
              />
              <p class="text-[11px]" style="color: #c0b89a;">
                <template v-if="barLat != null && barLng != null">
                  lat: {{ barLat.toFixed(4) }}, lng: {{ barLng.toFixed(4) }}
                </template>
                <template v-else>
                  Clique sur la carte pour placer le bar.
                </template>
              </p>
            </div>

            <p v-if="saveError" class="text-xs text-red-600">
              {{ saveError }}
            </p>

            <button
              type="button"
              class="w-full min-h-[44px] mt-1 rounded-2xl font-semibold text-sm flex items-center justify-center active:scale-95 transition disabled:opacity-60 disabled:cursor-not-allowed"
              style="background: #b45309; color: #fffbf0;"
              :disabled="saveLoading"
              @click="addBeerToCollection"
            >
              {{ saveLoading ? 'Enregistrement…' : 'Ajouter à ma cave' }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="slide-up">
      <div
        v-if="isDetailOpen && selectedDegustation"
        class="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      >
        <div class="absolute inset-0 bg-black/40" @click="closeCellarDetail" />
        <div
          class="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl px-5 pt-5 pb-7 mx-auto shadow-xl max-h-[88vh] overflow-y-auto"
          style="background: #fff; border: 1px solid #ede9df;"
        >
          <!-- Handle mobile -->
          <div
            class="mx-auto mb-4 rounded-full"
            style="width: 36px; height: 4px; background: #e8e0d0;"
          />

          <!-- Header : icône bière + nom + bouton fermer -->
          <div class="flex items-start justify-between gap-3 mb-5">
            <div class="flex items-center gap-3 min-w-0">
              <!-- Icône bière -->
              <div
                class="flex-shrink-0 flex items-center justify-center rounded-2xl"
                style="width: 48px; height: 48px; background: #fdf3e7; font-size: 24px;"
              >
                🍺
              </div>
              <div class="min-w-0">
                <p
                  class="uppercase mb-0.5"
                  style="font-size: 10px; font-weight: 700; letter-spacing: 0.16em; color: #d97706;"
                >
                  Dégustation
                </p>
                <h3
                  class="font-serif font-semibold leading-tight"
                  style="color: #b45309; font-size: 19px;"
                >
                  {{ selectedDegustation.beer_name || 'Bière' }}
                </h3>
              </div>
            </div>
            <!-- Bouton fermer -->
            <button
              type="button"
              class="flex-shrink-0 flex items-center justify-center rounded-full transition"
              style="width: 32px; height: 32px; background: #faf8f5; border: 1px solid #ede9df; color: #92400e;"
              @click="closeCellarDetail"
            >
              ✕
            </button>
          </div>

          <!-- Scores côte à côte -->
          <div class="grid grid-cols-2 gap-3 mb-4">
            <!-- Kiff -->
            <div
              class="rounded-2xl px-4 py-3"
              style="background: #faf8f5; border: 1px solid #ede9df;"
            >
              <p
                class="mb-2 uppercase"
                style="font-size: 10px; font-weight: 700; letter-spacing: 0.14em; color: #d97706;"
              >
                Kiff
              </p>
              <div class="flex items-center gap-1">
                <span
                  v-for="score in 5"
                  :key="`d-plaisir-${score}`"
                  class="flex items-center justify-center rounded-full text-xs transition-all"
                  :style="selectedDegustation.note_plaisir && score <= selectedDegustation.note_plaisir
                    ? { width: '26px', height: '26px', opacity: '1' }
                    : { width: '22px', height: '22px', opacity: '0.25' }"
                  :class="selectedDegustation.note_plaisir && score <= selectedDegustation.note_plaisir
                    ? getRatingColorClass(score)
                    : 'bg-[#ede9df]'"
                >
                  🍺
                </span>
              </div>
              <p class="mt-2 font-bold leading-none" style="font-size: 24px; color: #b45309;">
                {{ selectedDegustation.note_plaisir ?? '&#8212;' }}
                <span style="font-size: 12px; font-weight: 400; color: #c0b89a;">/5</span>
              </p>
            </div>

            <!-- Amertume -->
            <div
              class="rounded-2xl px-4 py-3"
              style="background: #faf8f5; border: 1px solid #ede9df;"
            >
              <p
                class="mb-2 uppercase"
                style="font-size: 10px; font-weight: 700; letter-spacing: 0.14em; color: #d97706;"
              >
                Amertume
              </p>
              <div class="flex items-center gap-1">
                <span
                  v-for="score in 5"
                  :key="`d-amertume-${score}`"
                  class="flex items-center justify-center rounded-full text-xs transition-all"
                  :style="selectedDegustation.note_amertume && score <= selectedDegustation.note_amertume
                    ? { width: '26px', height: '26px', opacity: '1' }
                    : { width: '22px', height: '22px', opacity: '0.25' }"
                  :class="selectedDegustation.note_amertume && score <= selectedDegustation.note_amertume
                    ? getRatingColorClass(score)
                    : 'bg-[#ede9df]'"
                >
                  🌿
                </span>
              </div>
              <p class="mt-2 font-bold leading-none" style="font-size: 24px; color: #b45309;">
                {{ selectedDegustation.note_amertume ?? '&#8212;' }}
                <span style="font-size: 12px; font-weight: 400; color: #c0b89a;">/5</span>
              </p>
            </div>
          </div>

          <!-- Section bar -->
          <div
            class="rounded-2xl px-4 py-3 mb-4 flex items-center gap-3"
            style="background: #faf8f5; border: 1px solid #ede9df;"
          >
            <span style="font-size: 20px; flex-shrink: 0;">📍</span>
            <div class="min-w-0">
              <p
                class="uppercase"
                style="font-size: 10px; font-weight: 700; letter-spacing: 0.14em; color: #d97706; margin-bottom: 2px;"
              >
                Dégusté au bar
              </p>
              <p
                class="font-medium truncate"
                style="font-size: 14px; color: #b45309;"
              >
                {{ selectedDegustation.bar_name || 'Bar non renseigné' }}
              </p>
            </div>
          </div>

          <!-- Mini carte -->
          <div
            v-if="selectedDegustation.latitude != null && selectedDegustation.longitude != null"
            ref="detailMapEl"
            class="w-full mb-5"
            style="height: 160px; border-radius: 14px; overflow: hidden; border: 1px solid #ede9df;"
          />

          <!-- Bouton Fermer -->
          <button
            type="button"
            class="w-full min-h-[46px] rounded-2xl font-semibold text-sm transition active:scale-[0.98]"
            style="background: #b45309; color: #fffbf0;"
            @click="closeCellarDetail"
          >
            Fermer
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
}
.slide-up-enter-from .relative,
.slide-up-leave-to .relative {
  transform: translateY(100%);
}
@media (min-width: 768px) {
  .slide-up-enter-from .relative,
  .slide-up-leave-to .relative {
    transform: translateY(12px) scale(0.98);
  }
}

:deep(.bm-pulse-wrap) {
  background: transparent;
  border: none;
}
:deep(.bm-pulse-dot) {
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  background: #3b82f6;
  border: 2px solid #fff;
  box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.55);
  animation: bm-pulse 1.5s ease-out infinite;
}
@keyframes bm-pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.45);
  }
  70% {
    transform: scale(1.08);
    box-shadow: 0 0 0 14px rgba(59, 130, 246, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
}

:deep(.bm-brewery-marker) {
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

:deep(.bm-bar-num-marker) {
  background: transparent;
  border: none;
}
:deep(.bm-bar-num-marker span) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9999px;
  background: #b45309;
  color: #fffbf0;
  font-size: 11px;
  font-weight: 700;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

:deep(.bm-detail-bar-marker) {
  background: transparent;
  border: none;
}
:deep(.bm-detail-bar-marker span) {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  background: #b45309;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
</style>