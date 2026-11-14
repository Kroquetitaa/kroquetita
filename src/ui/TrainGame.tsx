import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { Lang, Localized } from '../data/career'
import { sfx } from '../game/audio'
import {
  controlPosition,
  controlStops,
  controlValue,
  levels,
  predict,
  shown,
  train,
  type Control,
  type Hyper,
  type HyperKey,
  type Level,
  type TrainResult,
} from '../game/train'
import { useLang } from '../i18n'
import { track } from '../net/track'
import { useGame } from '../store'
import './train.css'

/**
 * Minijuego «Entrena tu modelo»: el panel. A la izquierda, los datos con la
 * curva del modelo (que se va ajustando época a época) y las curvas de error;
 * a la derecha, los hiperparámetros, el botón de entrenar y el veredicto.
 *
 * El entrenamiento es de verdad y se calcula de golpe al pulsar el botón
 * (`game/train.ts`, menos de un milisegundo); lo que se anima después es la
 * reproducción de ese resultado, y se puede saltar.
 */

const STORAGE_KEY = 'kroquetita:train'
/** Lo que dura la reproducción del entrenamiento (ms) */
const PLAYBACK = 2000

const COLOR = {
  train: '#19e6ff',
  valid: '#ffb347',
  model: '#ffffff',
  glow: '#a78bfa',
  goal: '#3df2b0',
  grid: 'rgba(255, 255, 255, 0.07)',
  axis: 'rgba(255, 255, 255, 0.2)',
  text: 'rgba(255, 255, 255, 0.62)',
}

const TEXT = {
  title: { es: 'Entrena tu modelo', en: 'Train your model' },
  lead: {
    es: 'Los puntos azules son los que el modelo estudia. Los naranjas se guardan para el examen: no los ve nunca.',
    en: 'The blue dots are what the model studies. The orange ones are kept for the exam: it never sees them.',
  },
  close: { es: 'Cerrar', en: 'Close' },
  level: { es: 'Nivel', en: 'Level' },
  levels: { es: 'Niveles', en: 'Levels' },
  locked: { es: 'bloqueado', en: 'locked' },
  goal: { es: 'Objetivo: error en datos nuevos de', en: 'Goal: error on new data of' },
  orLess: { es: 'o menos', en: 'or less' },
  dataChart: { es: 'Datos y modelo', en: 'Data and model' },
  errorChart: { es: 'Error por época', en: 'Error per epoch' },
  legendTrain: { es: 'Entrenamiento (lo que estudia)', en: 'Training (what it studies)' },
  legendValid: { es: 'Validación (el examen)', en: 'Validation (the exam)' },
  legendModel: { es: 'Modelo', en: 'Model' },
  legendGoal: { es: 'Objetivo', en: 'Goal' },
  controls: { es: 'Hiperparámetros', en: 'Hyperparameters' },
  train: { es: 'Entrenar', en: 'Train' },
  skip: { es: 'Saltar animación', en: 'Skip animation' },
  training: { es: 'Entrenando…', en: 'Training…' },
  empty: { es: 'Ajusta los controles y pulsa «Entrenar»', en: 'Set the controls and press "Train"' },
  epoch: { es: 'época', en: 'epoch' },
  epochs: { es: 'épocas', en: 'epochs' },
  goalMark: { es: 'objetivo', en: 'goal' },
  off: { es: 'apagada', en: 'off' },
  seen: { es: 'Error en lo estudiado', en: 'Error on what it studied' },
  unseen: { es: 'Error en lo nuevo', en: 'Error on new data' },
  target: { es: 'Objetivo', en: 'Goal' },
  next: { es: 'Siguiente nivel', en: 'Next level' },
  allDone: {
    es: '¡Los tres niveles superados! Ni corto, ni sobreajustado, ni descontrolado: así, a otra escala, es mi día a día.',
    en: 'All three levels beaten! Not underfit, not overfit, not out of control: at another scale, that is my day-to-day.',
  },
} satisfies Record<string, Localized>

const COUNT: Record<'runs' | 'solvedIn' | 'record' | 'early', Localized<(...n: string[]) => string>> = {
  runs: {
    es: (n) => `Entrenamientos en este nivel: ${n}`,
    en: (n) => `Training runs on this level: ${n}`,
  },
  solvedIn: {
    es: (n) => (n === '1' ? 'Lo has conseguido a la primera.' : `Lo has conseguido en ${n} entrenamientos.`),
    en: (n) => (n === '1' ? 'You got it on the first try.' : `You got it in ${n} training runs.`),
  },
  record: {
    es: (n) => (n === '1' ? 'superado a la primera' : `superado en ${n} entrenamientos`),
    en: (n) => (n === '1' ? 'beaten on the first try' : `beaten in ${n} training runs`),
  },
  early: {
    es: (epoch, error) => `En la época ${epoch} iba bien (error ${error}); después empezó a memorizar.`,
    en: (epoch, error) => `At epoch ${epoch} it was doing fine (error ${error}); then it started memorising.`,
  },
}

const CONTROL_TEXT: Record<HyperKey, { name: Localized; hint: Localized }> = {
  learningRate: {
    name: { es: 'Tasa de aprendizaje', en: 'Learning rate' },
    hint: { es: 'Cuánto se corrige el modelo en cada paso.', en: 'How much the model corrects itself at each step.' },
  },
  epochs: {
    name: { es: 'Épocas', en: 'Epochs' },
    hint: { es: 'Cuántas veces repasa los datos.', en: 'How many times it goes over the data.' },
  },
  degree: {
    name: { es: 'Capacidad', en: 'Capacity' },
    hint: {
      es: 'Lo flexible que puede ser la curva (el grado del polinomio).',
      en: 'How flexible the curve can be (the degree of the polynomial).',
    },
  },
  l2: {
    name: { es: 'Regularización L2', en: 'L2 regularisation' },
    hint: { es: 'Un freno: penaliza las curvas rebuscadas.', en: 'A brake: it penalises contorted curves.' },
  },
}

type VerdictId = 'ok' | 'undertrained' | 'diverged' | 'tooSimple' | 'almost' | 'tooStiff' | 'overfit'

const VERDICT: Record<VerdictId, { title: Localized; text: Localized }> = {
  ok: {
    title: { es: '¡Objetivo conseguido!', en: 'Goal reached!' },
    text: {
      es: 'Generaliza: acierta casi igual en los datos que ha estudiado y en los que no había visto nunca.',
      en: 'It generalises: it does about as well on the data it studied as on data it had never seen.',
    },
  },
  undertrained: {
    title: { es: 'Le falta entrenamiento', en: 'Not trained enough' },
    text: {
      es: 'El error seguía bajando cuando se acabó el tiempo: iba por buen camino, pero demasiado despacio. Dale más épocas o sube la tasa de aprendizaje.',
      en: 'The error was still falling when time ran out: it was on the right track, just too slowly. Give it more epochs or raise the learning rate.',
    },
  },
  diverged: {
    title: { es: 'El entrenamiento ha explotado', en: 'Training blew up' },
    text: {
      es: 'La tasa de aprendizaje es tan alta que cada corrección se pasa de largo y el error explota. Bájala.',
      en: 'The learning rate is so high that every correction overshoots and the error explodes. Lower it.',
    },
  },
  tooSimple: {
    title: { es: 'Se queda corto', en: 'It falls short' },
    text: {
      es: 'El modelo es demasiado simple: no llega ni a los datos de entrenamiento. Dale más capacidad.',
      en: 'The model is too simple: it cannot even fit the training data. Give it more capacity.',
    },
  },
  almost: {
    title: { es: 'Se queda a las puertas', en: 'So close' },
    text: {
      es: 'El modelo ya ha dado todo lo que puede y en datos nuevos falla un poco más de la cuenta. Prueba con otra capacidad.',
      en: 'The model has given all it can, and on new data it misses by a little too much. Try a different capacity.',
    },
  },
  tooStiff: {
    title: { es: 'Demasiado freno', en: 'Too much brake' },
    text: {
      es: 'Con tanta regularización la curva queda tan rígida que no sigue ni los datos de entrenamiento. Aflójala.',
      en: 'With that much regularisation the curve is so stiff it cannot even follow the training data. Ease it off.',
    },
  },
  overfit: {
    title: { es: 'Sobreajuste', en: 'Overfitting' },
    text: {
      es: 'Se ha aprendido el ruido de memoria: acierta en lo que ha visto y falla en lo nuevo.',
      en: 'It has learned the noise by heart: it nails what it has seen and fails on anything new.',
    },
  },
}

/** Qué hacer ante un sobreajuste, según los controles que haya en el nivel */
const OVERFIT_TIP = {
  l2: {
    es: 'Frénalo con regularización, quítale capacidad o para antes.',
    en: 'Rein it in with regularisation, reduce its capacity or stop earlier.',
  },
  degree: { es: 'Quítale capacidad o para antes.', en: 'Reduce its capacity or stop earlier.' },
  none: { es: 'Para antes.', en: 'Stop earlier.' },
} satisfies Record<string, Localized>

function verdictOf(result: TrainResult, level: Level): VerdictId {
  switch (result.diagnosis) {
    case 'ok':
    case 'undertrained':
    case 'diverged':
    case 'overfit':
      return result.diagnosis
    case 'underfit':
      if (result.cause === 'l2') return 'tooStiff'
      return result.trainError <= level.target ? 'almost' : 'tooSimple'
  }
}

// ---------------------------------------------------------------- Números

const locale = (lang: Lang) => (lang === 'es' ? 'es-ES' : 'en-GB')

/** Error con tres decimales (o un «> 99» si se ha disparado). */
function formatError(value: number, lang: Lang) {
  if (!Number.isFinite(value) || value > 99) return '> 99'
  return shown(value).toLocaleString(locale(lang), { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

const formatTarget = (value: number, lang: Lang) => value.toLocaleString(locale(lang), { maximumFractionDigits: 3 })

function formatHyper(key: HyperKey, value: number, lang: Lang) {
  if (key === 'l2' && value === 0) return `0 (${TEXT.off[lang]})`
  if (key === 'epochs' || key === 'degree') return String(value)
  return value.toLocaleString(locale(lang), { maximumSignificantDigits: 2 })
}

// ---------------------------------------------------------------- Progreso guardado

interface Progress {
  /** En cuántos entrenamientos se superó cada nivel (el mejor intento), o null */
  solved: Array<number | null>
  /** Entrenamientos gastados en el intento en curso de cada nivel */
  tries: number[]
}

function loadProgress(): Progress {
  const progress: Progress = { solved: levels.map(() => null), tries: levels.map(() => 0) }
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved && typeof saved === 'object') {
      const { solved, tries } = saved as { solved?: unknown; tries?: unknown }
      levels.forEach((_, i) => {
        const won: unknown = Array.isArray(solved) ? solved[i] : null
        const spent: unknown = Array.isArray(tries) ? tries[i] : 0
        if (typeof won === 'number' && Number.isFinite(won) && won >= 1) progress.solved[i] = Math.round(won)
        if (typeof spent === 'number' && Number.isFinite(spent) && spent >= 0) progress.tries[i] = Math.round(spent)
      })
    }
  } catch {
    // Sin almacenamiento o con datos rotos: se empieza de cero.
  }
  return progress
}

function saveProgress(progress: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // No pasa nada si no se puede guardar.
  }
}

/** Primer nivel sin superar (o el último, si ya están todos). */
const firstOpen = (progress: Progress) => {
  const index = progress.solved.findIndex((won) => won === null)
  return index < 0 ? levels.length - 1 : index
}

// ---------------------------------------------------------------- Gráficas

/** Ajusta la resolución del lienzo a su tamaño en pantalla (nítido en HiDPI) y devuelve dónde pintar. */
function prepare(canvas: HTMLCanvasElement) {
  const ratio = Math.min(3, window.devicePixelRatio || 1)
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const w = Math.max(1, Math.round(width * ratio))
  const h = Math.max(1, Math.round(height * ratio))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')
  if (!ctx || width === 0 || height === 0) return null
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  return { ctx, width, height }
}

const FONT = "500 11px Poppins, system-ui, -apple-system, 'Segoe UI', sans-serif"
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** Puntos de la malla en la que se evalúa el modelo para dibujarlo */
const MESH = 160

/** Los datos (entrenamiento y validación) y la curva del modelo con esos pesos. */
function drawData(canvas: HTMLCanvasElement, level: Level, weights: ArrayLike<number> | null, label: string) {
  const area = prepare(canvas)
  if (!area) return
  const { ctx, width, height } = area
  const pad = 10
  const [low, high] = level.yRange
  const span = high - low
  const px = (x: number) => pad + ((x + 1) / 2) * (width - 2 * pad)
  const py = (y: number) => height - pad - ((y - low) / span) * (height - 2 * pad)

  // Rejilla tenue y el eje y = 0.
  ctx.lineWidth = 1
  ctx.strokeStyle = COLOR.grid
  ctx.beginPath()
  for (let i = 0; i <= 8; i++) {
    const x = Math.round(px(-1 + i / 4)) + 0.5
    ctx.moveTo(x, pad)
    ctx.lineTo(x, height - pad)
  }
  ctx.stroke()
  if (low < 0 && high > 0) {
    ctx.strokeStyle = COLOR.axis
    ctx.beginPath()
    ctx.moveTo(pad, Math.round(py(0)) + 0.5)
    ctx.lineTo(width - pad, Math.round(py(0)) + 0.5)
    ctx.stroke()
  }

  // Validación: rombos huecos. Entrenamiento: círculos llenos. Se distinguen también sin color.
  ctx.strokeStyle = COLOR.valid
  ctx.lineWidth = 1.5
  for (const point of level.valid) {
    const x = px(point.x)
    const y = py(point.y)
    ctx.beginPath()
    ctx.moveTo(x, y - 4)
    ctx.lineTo(x + 4, y)
    ctx.lineTo(x, y + 4)
    ctx.lineTo(x - 4, y)
    ctx.closePath()
    ctx.stroke()
  }
  ctx.fillStyle = COLOR.train
  for (const point of level.train) {
    ctx.beginPath()
    ctx.arc(px(point.x), py(point.y), 3.6, 0, Math.PI * 2)
    ctx.fill()
  }

  if (weights) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, width, height)
    ctx.clip()
    ctx.beginPath()
    for (let i = 0; i <= MESH; i++) {
      const x = -1 + (2 * i) / MESH
      // Si el modelo se dispara, la curva se sale del cuadro: se acota para que el lienzo no se resienta.
      const value = predict(weights, x)
      const y = Number.isFinite(value) ? clamp(value, low - 4 * span, high + 4 * span) : high + 4 * span
      if (i === 0) ctx.moveTo(px(x), py(y))
      else ctx.lineTo(px(x), py(y))
    }
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.4
    ctx.strokeStyle = COLOR.model
    ctx.shadowColor = COLOR.glow
    ctx.shadowBlur = 10
    ctx.stroke()
    ctx.restore()
  }

  if (label) {
    ctx.font = FONT
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    const box = ctx.measureText(label).width + 12
    ctx.fillStyle = 'rgba(9, 9, 16, 0.78)'
    ctx.fillRect(pad, pad, box, 20)
    ctx.fillStyle = COLOR.text
    ctx.fillText(label, pad + 6, pad + 5)
  }
}

interface ErrorChart {
  result: TrainResult | null
  /** Hasta qué muestra (con decimales) se dibuja */
  cursor: number
  target: number
  /** Tope del eje vertical */
  top: number
  lang: Lang
}

/** Curvas de error de entrenamiento y validación frente a las épocas, con la línea del objetivo. */
function drawErrors(canvas: HTMLCanvasElement, chart: ErrorChart) {
  const area = prepare(canvas)
  if (!area) return
  const { ctx, width, height } = area
  const { result, cursor, target, top, lang } = chart
  const left = 34
  const right = 10
  const head = 8
  const foot = 18
  // Si el entrenamiento revienta se corta antes: el eje llega hasta donde llegó.
  const total = result ? result.epochs[result.epochs.length - 1] : 1
  const px = (epoch: number) => left + (epoch / total) * (width - left - right)
  const py = (error: number) => height - foot - (error / top) * (height - head - foot)

  ctx.font = FONT
  ctx.lineWidth = 1

  // Eje vertical: unas pocas marcas redondas con su valor.
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const step = top > 0.9 ? 0.5 : top > 0.45 ? 0.2 : 0.1
  for (let i = 0; i * step <= top; i++) {
    const value = i * step
    const y = Math.round(py(value)) + 0.5
    ctx.strokeStyle = i === 0 ? COLOR.axis : COLOR.grid
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(width - right, y)
    ctx.stroke()
    ctx.fillStyle = COLOR.text
    ctx.fillText(value.toLocaleString(locale(lang), { maximumFractionDigits: 1, minimumFractionDigits: 1 }), left - 6, y)
  }

  // Eje horizontal: de la época 0 a la última.
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLOR.text
  ctx.textAlign = 'left'
  ctx.fillText('0', left, height - 4)
  if (result) {
    ctx.textAlign = 'right'
    ctx.fillText(`${total} ${TEXT.epochs[lang]}`, width - right, height - 4)
  }

  // Objetivo: la línea que tiene que cruzar hacia abajo la curva de validación.
  const goalY = Math.round(py(target)) + 0.5
  ctx.strokeStyle = COLOR.goal
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.moveTo(left, goalY)
  ctx.lineTo(width - right, goalY)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = COLOR.goal
  ctx.textAlign = 'right'
  ctx.fillText(`${TEXT.goalMark[lang]} ${formatTarget(target, lang)}`, width - right, goalY - 5)

  if (!result) {
    ctx.fillStyle = COLOR.text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(TEXT.empty[lang], (left + width - right) / 2, (head + goalY) / 2)
    return
  }

  // Las curvas, hasta donde va la reproducción. Lo que se dispara sale por arriba del cuadro.
  const last = result.epochs.length - 1
  const at = clamp(cursor, 0, last)
  const whole = Math.floor(at)
  const part = at - whole
  const safe = (error: number) => (Number.isFinite(error) ? Math.min(error, top * 3) : top * 3)
  ctx.save()
  ctx.beginPath()
  ctx.rect(left, 0, width - left - right, height - foot + 1)
  ctx.clip()
  const curves: Array<[number[], string]> = [
    [result.trainCurve, COLOR.train],
    [result.validCurve, COLOR.valid],
  ]
  for (const [curve, color] of curves) {
    ctx.beginPath()
    ctx.moveTo(px(result.epochs[0]), py(safe(curve[0])))
    for (let i = 1; i <= whole; i++) ctx.lineTo(px(result.epochs[i]), py(safe(curve[i])))
    let tipX = px(result.epochs[whole])
    let tipY = py(safe(curve[whole]))
    if (whole < last && part > 0) {
      tipX = px(mix(result.epochs[whole], result.epochs[whole + 1], part))
      tipY = py(mix(safe(curve[whole]), safe(curve[whole + 1]), part))
      ctx.lineTo(tipX, tipY)
    }
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(tipX, tipY, 3.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Error del modelo sin entrenar (predice siempre 0): de ahí sale la escala del eje vertical. */
function untrainedError(level: Level) {
  const rms = (points: Level['train']) => Math.sqrt(points.reduce((sum, p) => sum + p.y * p.y, 0) / points.length)
  return Math.max(rms(level.train), rms(level.valid))
}

// ---------------------------------------------------------------- Panel

interface Run {
  /** Índice del nivel en `levels` */
  level: number
  result: TrainResult
}

export function TrainGame() {
  const open = useGame((s) => s.panel === 'train')
  return open ? <TrainPanel /> : null
}

function TrainPanel() {
  const lang = useLang()
  const titleId = useId()
  const fieldId = useId()
  const panel = useRef<HTMLElement>(null)
  const dataCanvas = useRef<HTMLCanvasElement>(null)
  const errorCanvas = useRef<HTMLCanvasElement>(null)

  const [progress, setProgress] = useState(loadProgress)
  const [index, setIndex] = useState(() => firstOpen(progress))
  const [hypers, setHypers] = useState<Hyper[]>(() => levels.map((level) => ({ ...level.defaults })))
  const [run, setRun] = useState<Run | null>(null)
  const [playing, setPlaying] = useState(false)
  /** En cuántos entrenamientos se acaba de superar el nivel (para el veredicto) */
  const [wonIn, setWonIn] = useState<number | null>(null)

  const level = levels[index]
  const hyper = hypers[index]

  // Lo que necesita el bucle de animación, a mano y siempre al día.
  const live = useRef({ progress, run, lang, index })
  live.current = { progress, run, lang, index }
  /** Muestra (con decimales) por la que va la reproducción */
  const cursor = useRef(0)
  /** Entrenamiento reproducido a medias: su veredicto aún no se ha dado */
  const pending = useRef<Run | null>(null)

  const close = () => useGame.getState().setPanel(null)

  const paint = useCallback(() => {
    const { run: current, lang: language, index: at } = live.current
    const shownLevel = levels[at]
    const result = current && current.level === at ? current.result : null
    let weights: number[] | null = null
    let label = ''
    if (result) {
      const last = result.snapshots.length - 1
      const position = clamp(cursor.current, 0, last)
      const whole = Math.floor(position)
      const part = position - whole
      const from = result.snapshots[whole]
      const to = result.snapshots[Math.min(last, whole + 1)]
      weights = from.map((weight, k) => mix(weight, to[k], part))
      const epoch = Math.round(mix(result.epochs[whole], result.epochs[Math.min(last, whole + 1)], part))
      label = `${TEXT.epoch[language]} ${epoch} / ${result.hyper.epochs}`
    }
    if (dataCanvas.current) drawData(dataCanvas.current, shownLevel, weights, label)
    if (errorCanvas.current) {
      // El eje vertical cubre el error de partida; si la validación sube más (sobreajuste), se
      // estira hasta verla entera, con un tope: lo que revienta se sale por arriba.
      const base = untrainedError(shownLevel) * 1.12
      let peak = 0
      if (result) for (const error of result.validCurve) if (Number.isFinite(error)) peak = Math.max(peak, error)
      drawErrors(errorCanvas.current, {
        result,
        cursor: cursor.current,
        target: shownLevel.target,
        top: clamp(peak * 1.08, base, base * 2.5),
        lang: language,
      })
    }
  }, [])

  /** Fin de la reproducción (o salto): se enseña el resultado final y se da el veredicto. */
  const finish = useCallback(
    (quiet = false) => {
      const done = pending.current
      if (!done) return
      pending.current = null
      cursor.current = done.result.epochs.length - 1
      setPlaying(false)
      paint()
      const { result } = done
      if (!result.passed) {
        if (!quiet) (result.diagnosis === 'diverged' ? sfx.alarm : sfx.button)()
        return
      }
      const before = live.current.progress
      const spent = Math.max(1, before.tries[done.level])
      const solved = before.solved.map((won, i) => (i === done.level ? Math.min(won ?? Infinity, spent) : won))
      // El contador vuelve a cero: si se repite el nivel, es un intento nuevo.
      const next: Progress = { solved, tries: before.tries.map((n, i) => (i === done.level ? 0 : n)) }
      live.current.progress = next
      setProgress(next)
      saveProgress(next)
      setWonIn(spent)
      track(`train:${levels[done.level].id}`)
      if (!quiet) sfx.win()
      if (solved.every((won) => won !== null)) useGame.getState().unlock('trainer')
    },
    [paint],
  )

  // Si se cierra el panel a media reproducción, el resultado cuenta igual (sin sonido).
  useEffect(() => () => finish(true), [finish])

  // Al abrir, el foco entra en el panel; al cerrar, vuelve a donde estaba.
  useEffect(() => {
    const before = document.activeElement
    panel.current?.focus({ preventScroll: true })
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true })
    }
  }, [])

  // Quien ya lo había superado todo (en otra visita) conserva su logro.
  useEffect(() => {
    if (live.current.progress.solved.every((won) => won !== null)) useGame.getState().unlock('trainer')
  }, [])

  // Las gráficas se repintan al cambiar lo que enseñan y al cambiar de tamaño.
  useEffect(() => {
    paint()
  }, [paint, run, index, lang])
  useEffect(() => {
    const observer = new ResizeObserver(() => paint())
    if (dataCanvas.current) observer.observe(dataCanvas.current)
    if (errorCanvas.current) observer.observe(errorCanvas.current)
    return () => observer.disconnect()
  }, [paint])

  // Reproducción: recorre las muestras ya calculadas en un par de segundos.
  useEffect(() => {
    if (!playing || !run) return
    const last = run.result.epochs.length - 1
    // Un entrenamiento que revienta dura poco: no hay mucho que ver.
    const duration = run.result.divergedAt === null ? PLAYBACK : PLAYBACK * 0.6
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      cursor.current = t * last
      if (t < 1) {
        paint()
        frame = requestAnimationFrame(tick)
      } else finish()
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, run, paint, finish])

  const startTraining = () => {
    if (playing) {
      finish()
      return
    }
    const result = train(level, hyper)
    const next: Run = { level: index, result }
    const tries = progress.tries.map((n, i) => (i === index ? n + 1 : n))
    const counted = { ...progress, tries }
    live.current.progress = counted
    setProgress(counted)
    saveProgress(counted)
    setWonIn(null)
    pending.current = next
    cursor.current = 0
    setRun(next)
    sfx.beep()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Sin animación: el resultado, directamente.
      live.current.run = next
      finish()
    } else setPlaying(true)
  }

  const goTo = (target: number) => {
    if (target === index) return
    finish()
    cursor.current = 0
    setRun(null)
    setWonIn(null)
    setIndex(target)
  }

  const setHyper = (control: Control, position: number) => {
    const value = controlValue(control, position)
    setHypers((all) => all.map((item, i) => (i === index ? { ...item, [control.key]: value } : item)))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Con el foco en un deslizador el juego no atiende al teclado: aquí Esc cierra el panel.
      if (e.target instanceof HTMLInputElement) {
        e.stopPropagation()
        close()
      }
      return
    }
    // El resto de teclas son del panel: que el juego no salte ni se mueva por debajo.
    e.stopPropagation()
    if (e.key !== 'Tab' || !panel.current) return
    // El tabulador no sale del panel mientras está abierto.
    const items = panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const result = run && run.level === index && !playing ? run.result : null
  const verdict = result ? verdictOf(result, level) : null
  const allSolved = progress.solved.every((won) => won !== null)
  const unlocked = (i: number) => i === 0 || progress.solved[i - 1] !== null
  const hasControl = (key: HyperKey) => level.controls.some((control) => control.key === key)
  const overfitTip = OVERFIT_TIP[hasControl('l2') ? 'l2' : hasControl('degree') ? 'degree' : 'none'][lang]
  const stoppedLate =
    result !== null &&
    result.diagnosis === 'overfit' &&
    shown(result.bestValid) <= level.target &&
    result.bestValidEpoch < result.hyper.epochs

  return (
    <div
      className="train"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <section
        ref={panel}
        className="train__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="train__head">
          <h2 id={titleId}>{TEXT.title[lang]}</h2>
          <ol className="train__levels" aria-label={TEXT.levels[lang]}>
            {levels.map((item, i) => {
              const won = progress.solved[i]
              const state = won !== null ? COUNT.record[lang](String(won)) : unlocked(i) ? '' : TEXT.locked[lang]
              const name = `${TEXT.level[lang]} ${item.id}: ${item.title[lang]}`
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${i === index ? 'is-active' : ''} ${won !== null ? 'is-done' : ''}`}
                    disabled={!unlocked(i)}
                    aria-current={i === index ? 'step' : undefined}
                    aria-label={state ? `${name} (${state})` : name}
                    title={state ? `${name} (${state})` : name}
                    onClick={() => goTo(i)}
                  >
                    {item.id}
                  </button>
                </li>
              )
            })}
          </ol>
          <button type="button" className="train__close" onClick={close} aria-label={TEXT.close[lang]} title={TEXT.close[lang]}>
            ×
          </button>
        </header>

        <div className="train__brief">
          <p>
            <strong>
              {TEXT.level[lang]} {level.id} · {level.title[lang]}.
            </strong>{' '}
            {level.brief[lang]}
          </p>
          <p className="train__goal">
            {TEXT.goal[lang]} <b>{formatTarget(level.target, lang)}</b> {TEXT.orLess[lang]}.
          </p>
        </div>

        <div className="train__body">
          <div className="train__charts">
            <figure className="train__chart">
              <figcaption>{TEXT.dataChart[lang]}</figcaption>
              <canvas ref={dataCanvas} role="img" aria-label={`${TEXT.dataChart[lang]}. ${TEXT.lead[lang]}`} />
              <ul className="train__legend">
                <li>
                  <i className="is-train" aria-hidden="true" />
                  {TEXT.legendTrain[lang]}
                </li>
                <li>
                  <i className="is-valid" aria-hidden="true" />
                  {TEXT.legendValid[lang]}
                </li>
                <li>
                  <i className="is-model" aria-hidden="true" />
                  {TEXT.legendModel[lang]}
                </li>
              </ul>
            </figure>
            <figure className="train__chart train__chart--error">
              <figcaption>{TEXT.errorChart[lang]}</figcaption>
              <canvas ref={errorCanvas} role="img" aria-label={TEXT.errorChart[lang]} />
              <ul className="train__legend">
                <li>
                  <i className="is-train is-line" aria-hidden="true" />
                  {TEXT.legendTrain[lang]}
                </li>
                <li>
                  <i className="is-valid is-line" aria-hidden="true" />
                  {TEXT.legendValid[lang]}
                </li>
                <li>
                  <i className="is-goal" aria-hidden="true" />
                  {TEXT.legendGoal[lang]}
                </li>
              </ul>
            </figure>
          </div>

          <div className="train__side">
            <p className="train__lead">{TEXT.lead[lang]}</p>
            <fieldset className="train__controls">
              <legend>{TEXT.controls[lang]}</legend>
              {level.controls.map((control) => {
                const id = `${fieldId}-${control.key}`
                const value = hyper[control.key]
                const text = formatHyper(control.key, value, lang)
                return (
                  <div className="train__control" key={control.key}>
                    <label htmlFor={id}>
                      <span>{CONTROL_TEXT[control.key].name[lang]}</span>
                      <output htmlFor={id}>{text}</output>
                    </label>
                    <input
                      id={id}
                      type="range"
                      min={0}
                      max={controlStops(control)}
                      step={1}
                      value={controlPosition(control, value)}
                      aria-valuetext={text}
                      aria-describedby={`${id}-hint`}
                      onChange={(e) => setHyper(control, Number(e.target.value))}
                    />
                    <small id={`${id}-hint`}>{CONTROL_TEXT[control.key].hint[lang]}</small>
                  </div>
                )
              })}
            </fieldset>

            <div className="train__actions">
              <button type="button" className={`train__go ${playing ? 'is-playing' : ''}`} onClick={startTraining}>
                {playing ? TEXT.skip[lang] : TEXT.train[lang]}
              </button>
              <span className="train__runs">{COUNT.runs[lang](String(wonIn ?? progress.tries[index]))}</span>
            </div>

            <div className="train__result" role="status" aria-live="polite">
              {playing && <p className="train__wait">{TEXT.training[lang]}</p>}
              {result && verdict && (
                <div className={`train__verdict ${result.passed ? 'is-ok' : 'is-bad'}`}>
                  <h3>{VERDICT[verdict].title[lang]}</h3>
                  <p>
                    {VERDICT[verdict].text[lang]}
                    {verdict === 'overfit' && ` ${overfitTip}`}
                    {stoppedLate &&
                      ` ${COUNT.early[lang](String(result.bestValidEpoch), formatError(result.bestValid, lang))}`}
                  </p>
                  <ul className="train__stats">
                    <li>
                      {TEXT.seen[lang]} <b className="is-train">{formatError(result.trainError, lang)}</b>
                    </li>
                    <li>
                      {TEXT.unseen[lang]} <b className="is-valid">{formatError(result.validError, lang)}</b>
                    </li>
                    <li>
                      {TEXT.target[lang]} <b className="is-goal">≤ {formatTarget(level.target, lang)}</b>
                    </li>
                  </ul>
                  {result.passed && wonIn !== null && <p className="train__won">{COUNT.solvedIn[lang](String(wonIn))}</p>}
                  {result.passed && allSolved && index === levels.length - 1 && (
                    <p className="train__final">{TEXT.allDone[lang]}</p>
                  )}
                  {result.passed &&
                    (index < levels.length - 1 ? (
                      <button type="button" className="train__next" onClick={() => goTo(index + 1)}>
                        {TEXT.next[lang]} →
                      </button>
                    ) : (
                      <button type="button" className="train__next" onClick={close}>
                        {TEXT.close[lang]}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
