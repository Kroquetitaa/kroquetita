import { getStore } from '@netlify/blobs'
import { handleApi } from '../lib/api'
import { blobsKV } from '../lib/kv'

/** `POST /api/event`: suma los eventos de la analítica (solo contadores, sin datos de quién los envía). */
export default async (request: Request) =>
  (await handleApi(request, blobsKV(getStore('kroquetita')))) ?? new Response('Not found', { status: 404 })

export const config = {
  path: '/api/event',
  method: 'POST',
  // Freno de Netlify por IP (lo aplica su red; aquí no se guarda ninguna IP).
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
