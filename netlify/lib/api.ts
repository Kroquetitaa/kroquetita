import { getStats, postEvent } from './analytics'
import { json } from './http'
import { Busy, type KV } from './kv'
import { getScores, postScore } from './scores'

/**
 * Las rutas de `/api`. La misma función atiende en Netlify (cada ruta desde su
 * función, con un almacén de Blobs) y en desarrollo (desde el plugin de Vite,
 * con un almacén en memoria).
 */

type Handler = (request: Request, kv: KV, now: number) => Promise<Response>

const ROUTES = new Map<string, Record<string, Handler>>([
  ['/api/event', { POST: postEvent }],
  ['/api/stats', { GET: getStats }],
  ['/api/scores', { GET: getScores, POST: postScore }],
])

/** Atiende la petición, o devuelve null si la dirección no es de la API. */
export async function handleApi(request: Request, kv: KV, now: () => number = Date.now): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '')
  const route = ROUTES.get(path)
  if (!route) return null
  const handler = Object.hasOwn(route, request.method) ? route[request.method] : undefined
  if (!handler) return json(405, { error: 'method' }, { Allow: Object.keys(route).join(', ') })
  try {
    return await handler(request, kv, now())
  } catch (error) {
    if (error instanceof Busy) return json(503, { error: 'busy' })
    console.error(error)
    return json(500, { error: 'server' })
  }
}
