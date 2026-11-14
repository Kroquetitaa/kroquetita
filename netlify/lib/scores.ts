import type { Score, Submitted } from '../../src/net/api'
import { isRecord, json, readJson } from './http'
import { update, type Change, type KV } from './kv'

/**
 * Tabla global de récords de la contrarreloj. Es una sola lista, ordenada por
 * tiempo, en la clave `scores`. Los tiempos los manda el navegador, así que se
 * pueden falsear: aquí solo se comprueba que el nombre y el tiempo sean razonables.
 */

const KEY = 'scores'
/** Cuántas marcas se enseñan y cuántas se guardan */
const TOP = 20
const KEEP = 200
/** Tiempos creíbles, en segundos */
const MIN_TIME = 25
const MAX_TIME = 3600

/** Palabras que no valen como nombre si aparecen sueltas… */
const WORDS = new Set(
  'puta putas puto putos polla pollas coño culo joder zorra verga pene tetas chocho mamon ass shit cunt dick cock pussy slut fag sex sexo nazi nazis tits rape kkk'.split(
    ' ',
  ),
)
/** …y las que no valen ni dentro de otra */
const PARTS =
  'mierda cabron gilipolla hijoputa hijodeputa joputa maricon subnormal pendejo follar fuck bitch nigger nigga faggot asshole whore hitler porn'.split(
    ' ',
  )
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' }

/** En minúsculas y sin acentos (la ñ se queda) */
const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-̂̄-ͯ]/g, '')
    .normalize('NFC')

function isRude(name: string) {
  // Palabra a palabra; en las que mezclan letras y números, los números hacen de letra («p0lla»).
  const words = plain(name)
    .split(/[^a-zñ0-9]+/)
    .filter((word) => /[a-zñ]/.test(word))
    .map((word) => word.replace(/[013457]/g, (digit) => LEET[digit]).replace(/[0-9]/g, ''))
  // Todo junto, para que separar las letras («p u t a») no sirva de nada.
  const squashed = words.join('')
  return (
    WORDS.has(squashed) || words.some((word) => WORDS.has(word)) || PARTS.some((part) => squashed.includes(part))
  )
}

/** «www.algo», «http…» o algo con pinta de dominio («sitio.com») */
const looksLikeUrl = (name: string) => /^www\b|https?|[\p{L}\p{N}]\.\p{L}{2,}/iu.test(name)

/** El nombre ya limpio, o null si no vale: 2–16 letras, números, espacio, guion, guion bajo o punto. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 80) return null
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
  const length = [...name].length
  if (length < 2 || length > 16) return null
  if (!/^[\p{L}\p{N} ._-]+$/u.test(name) || !/[\p{L}\p{N}]/u.test(name)) return null
  if (looksLikeUrl(name) || isRude(name)) return null
  return name
}

/** El tiempo redondeado a centésimas, o null si no es un número creíble. */
export function cleanTime(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < MIN_TIME || raw > MAX_TIME) return null
  return Math.round(raw * 100) / 100
}

/** Un mismo nombre, escrito con otras mayúsculas, es la misma persona */
const keyOf = (name: string) => name.toLowerCase()

/** Mejor tiempo primero; a igualdad, quien lo hizo antes */
const order = (a: Score, b: Score) => a.time - b.time || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)

/** Lo guardado, con desconfianza: solo las entradas bien formadas, ya ordenadas. */
function asScores(value: unknown): Score[] {
  if (!Array.isArray(value)) return []
  const scores: Score[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const { name, time, at } = item
    if (typeof name !== 'string' || typeof time !== 'number' || !Number.isFinite(time) || typeof at !== 'string') continue
    scores.push({ name, time, at })
  }
  return scores.sort(order)
}

/**
 * Coloca una marca en la lista. Hay una entrada por nombre: si ya tenía una
 * mejor (o igual), la lista no cambia y se responde con su puesto de siempre.
 */
function place(current: unknown, name: string, time: number, at: string): Change<Submitted> {
  const list = asScores(current)
  const mine = list.findIndex((score) => keyOf(score.name) === keyOf(name))
  if (mine >= 0 && list[mine].time <= time) {
    return [undefined, { rank: mine + 1, entry: list[mine], scores: list.slice(0, TOP) }]
  }
  if (mine >= 0) list.splice(mine, 1)
  const entry: Score = { name, time, at }
  list.push(entry)
  list.sort(order)
  const kept = list.slice(0, KEEP)
  const index = kept.indexOf(entry)
  // La tabla está llena y la marca es peor que todas: no entra.
  if (index < 0) return [undefined, { rank: null, entry: null, scores: kept.slice(0, TOP) }]
  return [kept, { rank: index + 1, entry, scores: kept.slice(0, TOP) }]
}

/** `GET /api/scores`: los mejores tiempos. */
export async function getScores(_request: Request, kv: KV): Promise<Response> {
  return json(200, { scores: asScores(await kv.get(KEY)).slice(0, TOP) })
}

/** `POST /api/scores` con `{ name, time }`: guarda la marca y dice en qué puesto queda. */
export async function postScore(request: Request, kv: KV, now: number): Promise<Response> {
  const body = await readJson(request)
  if (!isRecord(body)) return json(400, { error: 'body' })
  const name = cleanName(body.name)
  if (name === null) return json(400, { error: 'name' })
  const time = cleanTime(body.time)
  if (time === null) return json(400, { error: 'time' })
  const at = new Date(now).toISOString()
  return json(200, await update(kv, KEY, (current) => place(current, name, time, at)))
}
