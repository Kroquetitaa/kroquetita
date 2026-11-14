import type { Plugin } from 'vite'
import { handleApi } from '../netlify/lib/api'
import { memoryKV, type KV } from '../netlify/lib/kv'

/**
 * La API en desarrollo: atiende `/api/*` con la misma lógica que las funciones
 * de Netlify, pero guardando en memoria (se vacía al reiniciar el servidor).
 * Así la analítica y la tabla de récords funcionan con `npm run dev`.
 */

/** Lo justo de la petición y la respuesta de Node (el proyecto no lleva sus tipos) */
interface NodeRequest {
  url?: string
  method?: string
  headers: Record<string, string | string[] | undefined>
  on(event: string, cb: (chunk?: unknown) => void): void
}
interface NodeResponse {
  statusCode: number
  setHeader(name: string, value: string): void
  end(body?: string): void
}

/** En desarrollo nadie manda cuerpos grandes; por si acaso, se corta */
const MAX_BODY = 64 * 1024

function readBody(req: NodeRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder()
    let text = ''
    let size = 0
    req.on('data', (chunk) => {
      const bytes = chunk as Uint8Array
      size += bytes.length
      if (size <= MAX_BODY) text += decoder.decode(bytes, { stream: true })
    })
    req.on('end', () => resolve(text + decoder.decode()))
    req.on('error', () => reject(new Error('No se ha podido leer la petición')))
  })
}

async function respond(req: NodeRequest, res: NodeResponse, kv: KV) {
  const method = (req.method ?? 'GET').toUpperCase()
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    try {
      headers.set(name, Array.isArray(value) ? value.join(', ') : value)
    } catch {
      // Cabeceras que `Headers` no admite (las de HTTP/2 que empiezan por «:»): no hacen falta.
    }
  }
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req)
  const request = new Request(`http://localhost${req.url ?? '/'}`, { method, headers, body })
  const response = (await handleApi(request, kv)) ?? new Response('Not found', { status: 404 })
  res.statusCode = response.status
  response.headers.forEach((value, name) => res.setHeader(name, value))
  res.end(response.status === 204 ? undefined : await response.text())
}

export function devApi(): Plugin {
  const kv = memoryKV()
  const middleware = (rawReq: unknown, rawRes: unknown, next: () => void) => {
    const req = rawReq as NodeRequest
    const res = rawRes as NodeResponse
    if (!(req.url ?? '').startsWith('/api/')) return next()
    respond(req, res, kv).catch((error) => {
      console.error(error)
      res.statusCode = 500
      res.end()
    })
  }
  return {
    name: 'kroquetita-dev-api',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    // `npm run preview` tampoco tiene funciones: se atiende igual.
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
