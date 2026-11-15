import { create } from 'zustand'
import { monthIndex, NOW, stages } from '../data/career'
import { useGame } from '../store'

/**
 * Máquina del tiempo de la portada: un instante `era` entre 0 (el mes en que
 * empieza la primera etapa) y 1 (hoy, la ciudad completa). Cada caja aparece
 * cuando llega su fecha de inicio, en orden cronológico.
 *
 * Hay dos caras: `useEra` (zustand) para la interfaz y `eraLive` / `presenceOf`
 * para la escena, que se leen en cada fotograma sin pasar por React. Un único
 * bucle propio mueve la reproducción y las subidas de las cajas, y solo corre
 * mientras hay algo que animar: con la ciudad completa no cuesta nada.
 *
 * Solo existe en la portada: al entrar a jugar o al recorrido vuelve a 1.
 */

/** Lo que dura la reproducción de 2021 a hoy (s) */
export const ERA_SECONDS = 11
/** Subida de una caja (s), caída al retroceder (s) y separación mínima entre dos subidas (s) */
const RISE = 0.6
const FALL = 0.3
const STAGGER = 0.14
/** Por debajo de esto se considera que se ha vuelto al principio (para el logro) */
const LOW = 0.1

const COUNT = stages.length
const STARTS = stages.map((stage) => monthIndex(stage.start))
/** Primer mes de la trayectoria y meses que abarca, hasta el final del mes en curso */
const FIRST = Math.min(...STARTS, NOW)
const SPAN = Math.max(1, NOW + 1 - FIRST)

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** Mes (en la escala de `monthIndex`, con decimales) → instante 0..1 */
export const eraOfMonth = (month: number) => clamp01((month - FIRST) / SPAN)

/** Instante 0..1 → mes con decimales (1 = final del mes en curso) */
export const monthOfEra = (era: number) => FIRST + clamp01(era) * SPAN

/** Instante 0..1 → mes entero que se enseña en la etiqueta (nunca pasa del actual) */
export const monthAt = (era: number) => Math.min(NOW, Math.floor(monthOfEra(era) + 1e-6))

/** Fecha del instante: año y mes (0 = enero) */
export function dateOfEra(era: number) {
  const month = monthAt(era)
  return { year: Math.floor(month / 12), month: month % 12 }
}

/** Instante en que arranca cada etapa */
export const ERA_STARTS = STARTS.map(eraOfMonth)

/** Etapas en orden de aparición: por fecha de inicio y, si coinciden, en el orden de `stages` */
export const ERA_ORDER = stages.map((_, index) => index).sort((a, b) => STARTS[a] - STARTS[b] || a - b)

/** ¿Está construida la caja `index` en ese instante? En el 0 exacto el solar está vacío. */
export const isBuilt = (index: number, era: number) => era >= 1 || (era > 0 && era >= ERA_STARTS[index])

/** Cuántas etapas hay construidas en ese instante */
export const builtAt = (era: number) => ERA_ORDER.reduce((sum, index) => sum + (isBuilt(index, era) ? 1 : 0), 0)

/** Última etapa construida en ese instante (-1 si aún no hay ninguna) */
export function lastBuiltAt(era: number) {
  let last = -1
  for (const index of ERA_ORDER) if (isBuilt(index, era)) last = index
  return last
}

/** Curva de la reproducción: arranca y frena con suavidad, sin llegar a pararse. */
export const eraCurve = (u: number) => {
  const t = clamp01(u)
  return 0.6 * t + 0.4 * t * t * (3 - 2 * t)
}

/** Inversa de `eraCurve` (es monótona): para seguir reproduciendo desde donde se soltó el control. */
export function eraCurveInverse(era: number) {
  const target = clamp01(era)
  let low = 0
  let high = 1
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2
    if (eraCurve(mid) < target) low = mid
    else high = mid
  }
  return (low + high) / 2
}

/** Subida de una caja, 0..1: con un rebote suave (se pasa un 4 %) o, con movimiento reducido, sin él. */
export function riseCurve(progress: number, bounce = true) {
  if (progress <= 0) return 0
  if (progress >= 1) return 1
  const x = progress - 1
  return bounce ? 1 + 2 * x * x * x + x * x : 1 + x * x * x
}

interface EraState {
  /** Instante actual, 0..1 (1 = hoy) */
  era: number
  playing: boolean
  /** Etapas construidas y la última en aparecer (-1 si no hay ninguna) */
  built: number
  last: number
  /** Mes del instante actual, en la escala de `monthIndex` */
  month: number
}

export const useEra = create<EraState>(() => ({
  era: 1,
  playing: false,
  built: COUNT,
  last: lastBuiltAt(1),
  month: NOW,
}))

/**
 * Lo mismo, para leerlo en cada fotograma desde la escena: es un objeto que se
 * muta, no pasa por React. `presence` es cuánto ha crecido cada caja (0 = no
 * está, 1 = entera; durante el rebote pasa un poco de 1).
 */
export const eraLive = {
  era: 1,
  /** Mes del instante, con decimales */
  month: FIRST + SPAN,
  /** Hay algo animándose (reproducción o cajas subiendo o bajando) */
  busy: false,
  presence: new Float32Array(COUNT).fill(1),
}

/** Cuánto ha crecido la caja `index` ahora mismo. Fuera de la portada, siempre 1. */
export function presenceOf(index: number) {
  const value = eraLive.presence[index]
  return value === undefined ? 1 : value
}

export type EraEvent = { type: 'appear'; index: number } | { type: 'complete' }
type Listener = (event: EraEvent) => void
const listeners = new Set<Listener>()

/** Avisos de la máquina del tiempo: aparece una caja, o se ha llegado a hoy tras verla construirse. */
export function onEra(listener: Listener) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

const emit = (event: EraEvent) => listeners.forEach((listener) => listener(event))

/** Avance lineal de cada caja (0..1), si debe estar, y a partir de cuándo puede empezar a subir */
const progress = new Float32Array(COUNT).fill(1)
const wanted = new Uint8Array(COUNT).fill(1)
const startAt = new Float64Array(COUNT)
/** Posición de la reproducción (0..1, antes de la curva) */
let head = 1
/** Siguiente hueco libre para empezar una subida: así las simultáneas salen en cascada */
let slot = 0
/** Se ha pasado por el principio desde la última vez que se llegó a hoy */
let rewound = false
let frame = 0
let scheduled = false
let lastTick = 0

const clock = () => performance.now()
const inIntro = () => useGame.getState().mode === 'intro'
const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const hasRaf = typeof requestAnimationFrame === 'function'

function schedule() {
  if (scheduled) return
  scheduled = true
  // Sin `requestAnimationFrame` (pruebas fuera del navegador) vale un temporizador.
  frame = hasRaf ? requestAnimationFrame(tick) : (setTimeout(tick, 16) as unknown as number)
}

function cancel() {
  if (!scheduled) return
  scheduled = false
  if (hasRaf) cancelAnimationFrame(frame)
  else clearTimeout(frame)
}

/** Arranca el bucle si estaba parado. */
function wake() {
  if (scheduled) return
  lastTick = clock()
  eraLive.busy = true
  schedule()
}

/** Fija el instante: decide qué cajas deben estar y actualiza lo que ve la interfaz. */
function apply(value: number, fromPlayback = false) {
  const era = clamp01(value)
  const now = clock()
  eraLive.era = era
  eraLive.month = monthOfEra(era)
  let built = 0
  let last = -1
  for (const index of ERA_ORDER) {
    const on = isBuilt(index, era)
    if (on) {
      built++
      last = index
    }
    if (on === (wanted[index] === 1)) continue
    wanted[index] = on ? 1 : 0
    if (on) {
      startAt[index] = Math.max(now, slot)
      slot = startAt[index] + STAGGER * 1000
    }
  }
  if (era < LOW) rewound = true
  const month = monthAt(era)
  const state = useEra.getState()
  if (state.era !== era || state.built !== built || state.last !== last || state.month !== month)
    useEra.setState({ era, built, last, month })
  if (era >= 1 && (rewound || fromPlayback)) {
    rewound = false
    emit({ type: 'complete' })
  }
  wake()
}

function tick() {
  scheduled = false
  const now = clock()
  const dt = Math.min(0.1, Math.max(0, (now - lastTick) / 1000))
  lastTick = now

  if (useEra.getState().playing) {
    head = Math.min(1, head + dt / ERA_SECONDS)
    if (head >= 1) useEra.setState({ playing: false })
    apply(eraCurve(head), true)
  }

  const bounce = !reducedMotion()
  let moving = false
  for (let index = 0; index < COUNT; index++) {
    let p = progress[index]
    if (wanted[index] === 1) {
      if (p < 1) {
        moving = true
        if (now >= startAt[index]) {
          if (p === 0) emit({ type: 'appear', index })
          // Un mínimo por encima de 0: así el aviso de aparición sale una sola vez.
          p = Math.min(1, Math.max(p, 1e-4) + dt / RISE)
        }
      }
    } else if (p > 0) {
      moving = true
      p = Math.max(0, p - dt / FALL)
    }
    progress[index] = p
    eraLive.presence[index] = riseCurve(p, bounce)
  }

  if (moving || useEra.getState().playing) schedule()
  else eraLive.busy = false
}

/** Ciudad completa, sin animación: es el estado de fuera de la portada. */
function reset() {
  cancel()
  head = 1
  slot = 0
  rewound = false
  progress.fill(1)
  wanted.fill(1)
  eraLive.presence.fill(1)
  eraLive.era = 1
  eraLive.month = FIRST + SPAN
  eraLive.busy = false
  useEra.setState({ era: 1, playing: false, built: COUNT, last: lastBuiltAt(1), month: NOW })
}

/** Mueve el control a un instante (0..1). Detiene la reproducción. Solo en la portada. */
export function setEra(value: number) {
  if (!inIntro()) return
  if (useEra.getState().playing) useEra.setState({ playing: false })
  head = eraCurveInverse(value)
  apply(value)
}

/** Reproduce desde el instante actual hasta hoy; si ya está en hoy, vuelve a empezar desde el principio. */
export function playEra() {
  if (!inIntro() || useEra.getState().playing) return
  if (eraLive.era >= 1 - 1e-6) {
    head = 0
    apply(0)
  } else head = eraCurveInverse(eraLive.era)
  useEra.setState({ playing: true })
  wake()
}

export function pauseEra() {
  if (useEra.getState().playing) useEra.setState({ playing: false })
}

// Al entrar a jugar o al recorrido la ciudad está completa (la física cuenta con todas las cajas).
const unsubscribe = useGame.subscribe((state, previous) => {
  if (state.mode !== previous.mode && state.mode !== 'intro') reset()
})

// Recarga en caliente: el módulo viejo suelta su bucle y su suscripción; el nuevo nace con la ciudad completa.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancel()
    unsubscribe()
    listeners.clear()
  })
}
