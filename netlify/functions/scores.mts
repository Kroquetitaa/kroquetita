import { getStore } from '@netlify/blobs'
import { handleApi } from '../lib/api'
import { blobsKV } from '../lib/kv'

/** `GET /api/scores` y `POST /api/scores`: la tabla global de récords de la contrarreloj. */
export default async (request: Request) =>
  (await handleApi(request, blobsKV(getStore('kroquetita')))) ?? new Response('Not found', { status: 404 })

export const config = {
  path: '/api/scores',
  method: ['GET', 'POST'],
  // Freno de Netlify por IP (lo aplica su red; aquí no se guarda ninguna IP).
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
