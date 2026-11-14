/*
 * Service worker de Kroquetita: hace que la web se pueda instalar y que
 * vuelva a abrirse sin conexión una vez visitada.
 *
 * - Páginas (`/`, `/en/`): primero la red, y la copia guardada solo si no hay
 *   conexión. Así un despliegue nuevo se ve siempre a la primera.
 * - `/assets/*`: llevan huella en el nombre y no cambian nunca: primero la copia.
 * - Resto de ficheros propios (logos, iconos): se sirve la copia y se refresca por detrás.
 * - `/api/*` y todo lo que no sea GET o sea de otro origen: ni se toca.
 */
const CACHE = 'kroquetita-v1'
const MAX_ENTRIES = 90

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

/** Guarda la respuesta y, si la caché crece demasiado, tira lo más antiguo (ficheros de despliegues viejos). */
async function store(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return
  const cache = await caches.open(CACHE)
  await cache.put(request, response)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - MAX_ENTRIES; i++) await cache.delete(keys[i])
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    store(request, response.clone())
    return response
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true })
    if (cached) return cached
    throw error
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  store(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request)
  const fresh = fetch(request).then((response) => {
    store(request, response.clone())
    return response
  })
  if (!cached) return fresh
  fresh.catch(() => {})
  return cached
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return
  if (request.mode === 'navigate') event.respondWith(networkFirst(request))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request))
  else event.respondWith(staleWhileRevalidate(request))
})
