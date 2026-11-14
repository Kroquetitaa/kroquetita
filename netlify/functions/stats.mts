import { getStore } from '@netlify/blobs'
import { handleApi } from '../lib/api'
import { blobsKV } from '../lib/kv'

/** `GET /api/stats?days=30`: contadores anónimos de la analítica, por día y en total. */
export default async (request: Request) =>
  (await handleApi(request, blobsKV(getStore('kroquetita')))) ?? new Response('Not found', { status: 404 })

export const config = {
  path: '/api/stats',
  method: 'GET',
}
