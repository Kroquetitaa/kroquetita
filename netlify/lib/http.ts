/** Utilidades de respuesta y de lectura del cuerpo, comunes a todas las rutas. */

/** Tamaño máximo del cuerpo de una petición, en bytes */
export const MAX_BODY = 4096

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })

export const empty = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

/**
 * Lee el cuerpo como JSON, venga con el Content-Type que venga (`sendBeacon`
 * lo manda como text/plain). Devuelve `undefined` si es demasiado grande o no es JSON.
 */
export async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return undefined
  try {
    const text = await request.text()
    if (text.length > MAX_BODY || new TextEncoder().encode(text).length > MAX_BODY) return undefined
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
