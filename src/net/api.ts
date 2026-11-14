/**
 * Cliente de la API propia (`/api/*`): la tabla de récords y los contadores de
 * la analítica. Ninguna función lanza excepciones: sin red, o si el servidor
 * responde mal, devuelven `{ ok: false, error }`.
 */

/** Una marca de la tabla: nombre, tiempo en segundos y cuándo se envió (fecha ISO) */
export interface Score {
  name: string
  time: number
  at: string
}

/** Respuesta al enviar una marca */
export interface Submitted {
  /** Puesto (el primero es el 1) entre todas las marcas guardadas; null si no ha entrado en la tabla */
  rank: number | null
  /** La marca que cuenta para ese nombre: la enviada o, si ya tenía una mejor, la de antes */
  entry: Score | null
  /** Los mejores tiempos, ya con esta marca */
  scores: Score[]
}

export type Counts = Record<string, number>

/** Contadores anónimos: los de cada día (del más antiguo al de hoy, en UTC) y los de siempre */
export interface Stats {
  days: Array<{ date: string; events: Counts }>
  total: Counts
}

/**
 * - `network`: sin conexión o sin respuesta a tiempo
 * - `name` / `time` / `body`: el servidor no acepta lo enviado
 * - `server`: cualquier otro fallo
 */
export type ApiError = 'network' | 'server' | 'name' | 'time' | 'body'
export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError }

const TIMEOUT = 8000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isScore = (value: unknown): value is Score =>
  isRecord(value) && typeof value.name === 'string' && typeof value.time === 'number' && typeof value.at === 'string'

const scoresOf = (value: unknown): Score[] => (Array.isArray(value) ? value.filter(isScore) : [])

function countsOf(value: unknown): Counts {
  const counts: Counts = {}
  if (!isRecord(value)) return counts
  for (const [name, times] of Object.entries(value)) if (typeof times === 'number') counts[name] = times
  return counts
}

/** Pide y lee el JSON de la respuesta; `read` lo convierte en el dato esperado (o null si no encaja). */
async function call<T>(path: string, read: (body: unknown) => T | null, init?: RequestInit): Promise<Result<T>> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT)
  let response: Response
  let body: unknown = null
  try {
    response = await fetch(path, { ...init, signal: abort.signal, cache: 'no-store' })
    body = await response.json().catch(() => null)
  } catch {
    return { ok: false, error: 'network' }
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    const error = isRecord(body) ? body.error : null
    return { ok: false, error: error === 'name' || error === 'time' || error === 'body' ? error : 'server' }
  }
  const data = read(body)
  return data === null ? { ok: false, error: 'server' } : { ok: true, data }
}

/** Los mejores tiempos de la tabla global, del mejor al peor. */
export const fetchScores = (): Promise<Result<Score[]>> =>
  call('/api/scores', (body) => (isRecord(body) && Array.isArray(body.scores) ? scoresOf(body.scores) : null))

/** Envía una marca. El servidor valida el nombre y el tiempo, y responde con el puesto. */
export const submitScore = (name: string, time: number): Promise<Result<Submitted>> =>
  call(
    '/api/scores',
    (body) => {
      if (!isRecord(body) || !Array.isArray(body.scores)) return null
      return {
        rank: typeof body.rank === 'number' ? body.rank : null,
        entry: isScore(body.entry) ? body.entry : null,
        scores: scoresOf(body.scores),
      }
    },
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, time }) },
  )

/** Contadores de la analítica de los últimos `days` días (máximo 90). */
export const fetchStats = (days = 30): Promise<Result<Stats>> =>
  call(`/api/stats?days=${Math.round(days)}`, (body) => {
    if (!isRecord(body) || !Array.isArray(body.days)) return null
    return {
      days: body.days.flatMap((day) =>
        isRecord(day) && typeof day.date === 'string' ? [{ date: day.date, events: countsOf(day.events) }] : [],
      ),
      total: countsOf(body.total),
    }
  })
