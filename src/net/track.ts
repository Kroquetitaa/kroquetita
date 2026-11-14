import { EVENT_BATCH, isEvent } from './events'

/**
 * Analítica sin cookies: se apunta qué pasa (se juega, se llega a una sala,
 * se consigue un logro), nunca quién lo hace. No se guarda nada en el
 * navegador y se respeta «No rastrear» y Global Privacy Control.
 *
 * Los eventos se juntan y se envían cada pocos segundos, y al ocultar la
 * pestaña, para no hacer una petición por cada uno.
 */

const ENDPOINT = '/api/event'
const sent = new Set<string>()
let queue: string[] = []
let timer = 0

const isBot = () => /bot|crawl|spider|slurp|lighthouse|headless|preview|fetch/i.test(navigator.userAgent)

const optedOut = () =>
  navigator.doNotTrack === '1' || (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true

function flush() {
  window.clearTimeout(timer)
  timer = 0
  if (queue.length === 0) return
  const data = JSON.stringify({ e: queue.slice(0, EVENT_BATCH) })
  queue = []
  try {
    if (navigator.sendBeacon?.(ENDPOINT, data)) return
    void fetch(ENDPOINT, { method: 'POST', body: data, keepalive: true }).catch(() => {})
  } catch {
    // Sin red o bloqueado: no pasa nada, la analítica es prescindible.
  }
}

/** Apunta un evento. Cada nombre se cuenta una sola vez por visita, salvo que se pida repetir. */
export function track(event: string, repeat = false) {
  if (typeof window === 'undefined' || !isEvent(event)) return
  if (!repeat && sent.has(event)) return
  sent.add(event)
  if (isBot() || optedOut()) return
  queue.push(event)
  if (queue.length >= EVENT_BATCH) flush()
  else if (!timer) timer = window.setTimeout(flush, 4000)
}

/** Arranque de la visita: qué idioma y qué tipo de dispositivo, y cuánto rato se queda. */
export function startTracking(lang: string) {
  if (typeof window === 'undefined') return
  track('visit')
  track(`lang:${lang}`)
  track(`device:${window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop'}`)

  // Tiempo con la pestaña a la vista (si está oculta, no cuenta).
  const marks: Array<[number, string]> = [
    [30, '30s'],
    [120, '2m'],
    [300, '5m'],
    [600, '10m'],
  ]
  let seen = 0
  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return
    seen += 5
    while (marks.length > 0 && seen >= marks[0][0]) track(`time:${marks.shift()![1]}`)
  }, 5000)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
}
