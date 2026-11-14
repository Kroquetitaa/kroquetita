import type { Counts, Stats } from '../../src/net/api'
import { EVENT_BATCH, isEvent } from '../../src/net/events'
import { empty, isRecord, json, readJson } from './http'
import { update, type Change, type KV } from './kv'

/**
 * Analítica sin cookies: solo contadores. Cada día (UTC) tiene su JSON
 * `{ evento: veces }` en la clave `day:AAAA-MM-DD`, y `total` lleva la suma de
 * siempre. No se guarda IP, navegador ni nada que diga quién envió el evento.
 */

/** Tope de nombres distintos, para que nadie pueda inflar el almacén inventándose eventos */
const MAX_DAY_KEYS = 400
const MAX_TOTAL_KEYS = 1200
const MAX_DAYS = 90
const DAY = 86_400_000

const BOT =
  /bot|crawl|spider|slurp|lighthouse|headless|preview|fetch|monitor|curl|wget|python|java\/|okhttp|axios|undici|node|postman|insomnia|go-http/i

/** Sin user-agent, o con uno de robot o de herramienta, la visita no se cuenta. */
const isBot = (agent: string | null) => !agent || BOT.test(agent)

const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10)

/** Lo guardado, con desconfianza: solo valen los contadores que sean números. */
function asCounts(value: unknown): Counts {
  const counts: Counts = {}
  if (!isRecord(value)) return counts
  for (const [name, times] of Object.entries(value)) {
    if (typeof times === 'number' && Number.isFinite(times) && times > 0) counts[name] = times
  }
  return counts
}

/** Suma los eventos a unos contadores; los nombres nuevos solo entran mientras quepan. */
function add(current: unknown, events: string[], cap: number): Change<null> {
  const counts = asCounts(current)
  let size = Object.keys(counts).length
  let changed = false
  for (const name of events) {
    if (!Object.hasOwn(counts, name)) {
      if (size >= cap) continue
      size++
      counts[name] = 0
    }
    counts[name] += 1
    changed = true
  }
  return [changed ? counts : undefined, null]
}

/** `POST /api/event` con `{"e": ["visit", "lang:es", …]}`. Responde 204 se cuente o no. */
export async function postEvent(request: Request, kv: KV, now: number): Promise<Response> {
  if (isBot(request.headers.get('user-agent'))) return empty()
  const body = await readJson(request)
  if (!isRecord(body) || !Array.isArray(body.e)) return json(400, { error: 'body' })
  const events = body.e.slice(0, EVENT_BATCH).filter(isEvent)
  if (events.length > 0) {
    await Promise.all([
      update(kv, `day:${dayOf(now)}`, (current) => add(current, events, MAX_DAY_KEYS), true),
      update(kv, 'total', (current) => add(current, events, MAX_TOTAL_KEYS), true),
    ])
  }
  return empty()
}

/** `GET /api/stats?days=30`: los contadores de los últimos días (del más antiguo al de hoy) y el total. */
export async function getStats(request: Request, kv: KV, now: number): Promise<Response> {
  const asked = Number(new URL(request.url).searchParams.get('days') ?? 30)
  const count = Number.isFinite(asked) ? Math.min(MAX_DAYS, Math.max(1, Math.floor(asked))) : 30
  const dates = Array.from({ length: count }, (_, i) => dayOf(now - (count - 1 - i) * DAY))
  const [total, ...days] = await Promise.all([kv.get('total'), ...dates.map((date) => kv.get(`day:${date}`))])
  const stats: Stats = {
    days: dates.map((date, i) => ({ date, events: asCounts(days[i]) })),
    total: asCounts(total),
  }
  return json(200, stats)
}
