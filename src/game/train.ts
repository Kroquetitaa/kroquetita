import type { Localized } from '../data/career'

/**
 * Minijuego «Entrena tu modelo»: aquí va el modelo, los datos y los niveles.
 * Es lógica pura (ni React ni DOM) y todo es de verdad: no hay curvas
 * dibujadas a mano, se entrena una regresión con descenso de gradiente.
 *
 * - Datos: puntos (x, y) de una función con ruido, x en [-1, 1]. Salen de un
 *   generador con semilla, así que cada nivel es idéntico en cada visita.
 * - Modelo: regresión polinómica. La «capacidad» es el grado. Se usa la base
 *   de Legendre normalizada (cada polinomio tiene media cuadrática 1 en
 *   [-1, 1]): así el problema está bien condicionado y el descenso de
 *   gradiente converge en pocas épocas con tasas de aprendizaje cercanas a 1.
 * - Entrenamiento: descenso de gradiente por lotes completos (una época = un
 *   paso) sobre el error cuadrático medio, con regularización L2 opcional
 *   (no se aplica al término independiente). Los pesos empiezan en cero.
 * - Error: la raíz del error cuadrático medio (RMSE), que va en las mismas
 *   unidades que los datos: «de media, el modelo falla por tanto».
 */

export type Diagnosis = 'ok' | 'underfit' | 'overfit' | 'diverged' | 'undertrained'
export type HyperKey = 'learningRate' | 'epochs' | 'degree' | 'l2'
export type Hyper = Record<HyperKey, number>

export interface Point {
  x: number
  y: number
}

/** Rango y pasos de un control (deslizador) */
export interface Control {
  key: HyperKey
  min: number
  max: number
  /** Lineal: el incremento. Logarítmica: cuántas posiciones hay por década */
  step: number
  scale: 'linear' | 'log'
  /** En escala logarítmica, la primera posición del deslizador vale 0 (apagado) */
  zero?: boolean
}

export interface Level {
  /** 1, 2 o 3 */
  id: number
  title: Localized
  /** Qué hay que conseguir y con qué, en una o dos frases */
  brief: Localized
  /** Error de validación que hay que alcanzar (menor o igual) */
  target: number
  train: Point[]
  valid: Point[]
  /** Controles que se pueden mover en este nivel, en orden */
  controls: Control[]
  /** Valores de partida; los que no tienen control se quedan fijos */
  defaults: Hyper
  /** Rango vertical cómodo para dibujar los datos */
  yRange: [number, number]
}

export interface TrainResult {
  hyper: Hyper
  /** Época de cada muestra de las curvas (la primera es 0: el modelo sin entrenar) */
  epochs: number[]
  /** Error (RMSE) de entrenamiento y de validación en cada muestra */
  trainCurve: number[]
  validCurve: number[]
  /** Pesos del modelo en cada muestra: con `predict` se dibuja cómo va quedando la curva */
  snapshots: number[][]
  /** Pesos finales */
  weights: number[]
  trainError: number
  validError: number
  /** Mejor error de validación visto por el camino y en qué época (parar pronto) */
  bestValid: number
  bestValidEpoch: number
  /** Época en la que el error se disparó y se cortó el entrenamiento, o null */
  divergedAt: number | null
  diagnosis: Diagnosis
  /** Con 'underfit': si falta capacidad o sobra regularización */
  cause: 'capacity' | 'l2' | null
  /** Se ha alcanzado el objetivo del nivel */
  passed: boolean
}

/** Grado máximo que admite el modelo */
export const MAX_DEGREE = 12

// ---------------------------------------------------------------- Aleatorio con semilla

/** mulberry32: generador pequeño y determinista, uniforme en [0, 1). */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Normal estándar (Box-Muller) a partir de un generador uniforme. */
function gaussian(random: () => number) {
  const u = Math.max(1e-12, random())
  const v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ---------------------------------------------------------------- Modelo

/**
 * Base de Legendre normalizada en x: escribe en `out` los valores de
 * sqrt(2k + 1) · P_k(x) para k = 0..degree.
 */
function basis(x: number, degree: number, out: Float64Array | number[], offset = 0) {
  let previous = 1
  let current = x
  out[offset] = 1
  if (degree >= 1) out[offset + 1] = Math.sqrt(3) * x
  for (let k = 1; k < degree; k++) {
    const next = ((2 * k + 1) * x * current - k * previous) / (k + 1)
    previous = current
    current = next
    out[offset + k + 1] = Math.sqrt(2 * k + 3) * next
  }
}

const scratch = new Float64Array(MAX_DEGREE + 1)

/** Valor del modelo con esos pesos en x (x entre -1 y 1). */
export function predict(weights: ArrayLike<number>, x: number) {
  const degree = weights.length - 1
  basis(x, degree, scratch)
  let y = 0
  for (let k = 0; k <= degree; k++) y += weights[k] * scratch[k]
  return y
}

/** Matriz de diseño (fila por punto) y objetivos de un conjunto de datos. */
function design(points: Point[], degree: number) {
  const width = degree + 1
  const phi = new Float64Array(points.length * width)
  const y = new Float64Array(points.length)
  points.forEach((point, i) => {
    basis(point.x, degree, phi, i * width)
    y[i] = point.y
  })
  return { phi, y, width, count: points.length }
}
type Design = ReturnType<typeof design>

/** RMSE de unos pesos sobre un conjunto. */
function rmse(set: Design, weights: Float64Array) {
  let sum = 0
  for (let i = 0; i < set.count; i++) {
    let out = 0
    const row = i * set.width
    for (let k = 0; k < set.width; k++) out += set.phi[row + k] * weights[k]
    const diff = out - set.y[i]
    sum += diff * diff
  }
  return Math.sqrt(sum / set.count)
}

/**
 * Lo mejor que puede hacer ese modelo sobre los datos de entrenamiento: resuelve
 * las ecuaciones normales (con su L2) y devuelve el RMSE de entrenamiento del
 * óptimo. Sirve para saber si al descenso de gradiente aún le quedaba camino.
 */
function bestTrainError(set: Design, l2: number) {
  const n = set.width
  const a = new Float64Array(n * n)
  const b = new Float64Array(n)
  for (let i = 0; i < set.count; i++) {
    const row = i * n
    for (let j = 0; j < n; j++) {
      const pj = set.phi[row + j] / set.count
      b[j] += pj * set.y[i]
      for (let k = 0; k < n; k++) a[j * n + k] += pj * set.phi[row + k]
    }
  }
  // La pizca en la diagonal evita la matriz singular cuando hay más pesos que puntos.
  for (let j = 0; j < n; j++) a[j * n + j] += (j === 0 ? 0 : l2) + 1e-9
  // Eliminación de Gauss con pivote parcial.
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row * n + col]) > Math.abs(a[pivot * n + col])) pivot = row
    if (pivot !== col) {
      for (let k = 0; k < n; k++) [a[col * n + k], a[pivot * n + k]] = [a[pivot * n + k], a[col * n + k]]
      ;[b[col], b[pivot]] = [b[pivot], b[col]]
    }
    const head = a[col * n + col]
    for (let row = col + 1; row < n; row++) {
      const factor = a[row * n + col] / head
      if (factor === 0) continue
      for (let k = col; k < n; k++) a[row * n + k] -= factor * a[col * n + k]
      b[row] -= factor * b[col]
    }
  }
  const w = new Float64Array(n)
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row]
    for (let k = row + 1; k < n; k++) sum -= a[row * n + k] * w[k]
    w[row] = sum / a[row * n + row]
  }
  return rmse(set, w)
}

// ---------------------------------------------------------------- Entrenamiento y diagnóstico

/** Muestras que se guardan de las curvas, como mucho */
const MAX_SAMPLES = 110
/** Error a partir del cual se da el entrenamiento por reventado y se corta */
const BLOWN = 1e6

/**
 * Reglas del diagnóstico, en orden (E = error de entrenamiento final,
 * V = error de validación final, objetivo = el del nivel):
 *
 *  1. 'diverged'      el error no es un número, o E acaba peor que sin entrenar,
 *                     o E acaba más de un 50 % por encima de su mejor momento.
 *  2. 'ok'            V ≤ objetivo (redondeando a tres decimales, que es lo que se enseña).
 *  3. 'underfit'      (causa 'capacity') ni el mejor ajuste posible de ese grado llega
 *                     al objetivo en los propios datos de entrenamiento: falta modelo.
 *  4. 'overfit'       V > 1,25 · E (falla bastante más en lo nuevo que en lo visto)
 *                     y además o bien V ya ha subido más de un 5 % desde su mínimo,
 *                     o bien E ≤ objetivo (lo visto ya se lo sabe) y V ha dejado de
 *                     bajar (menos de un 2 % en la última quinta parte de las épocas).
 *  5. 'undertrained'  E > 1,1 · (lo mejor que puede hacer ese modelo, con su L2, en
 *                     entrenamiento): con más épocas o una tasa mayor aún bajaría.
 *  6. 'underfit'      el resto: el modelo ya ha dado todo lo que puede y no llega.
 *                     Causa 'l2' si hay regularización (sin ella sí llegaría, por la
 *                     regla 3); si no, 'capacity'.
 */
export const RULES = { gap: 1.25, rebound: 1.05, stalled: 0.98, slack: 1.1, bounce: 1.5 }

/** Error tal y como se enseña: con tres decimales. */
export const shown = (error: number) => Math.round(error * 1000) / 1000

/** Entrena el modelo del nivel con esos hiperparámetros. Determinista y rápido (pocos ms). */
export function train(level: Level, hyper: Hyper): TrainResult {
  const degree = Math.max(0, Math.min(MAX_DEGREE, Math.round(hyper.degree)))
  const total = Math.max(1, Math.round(hyper.epochs))
  const rate = hyper.learningRate
  const l2 = Math.max(0, hyper.l2)
  const fit = design(level.train, degree)
  const check = design(level.valid, degree)
  const { phi, y, width, count } = fit

  // Qué épocas se guardan: todas si son pocas; si no, más juntas al principio, que es donde más cambia.
  const wanted = new Set<number>([0, total])
  const samples = Math.min(total, MAX_SAMPLES)
  for (let i = 1; i < samples; i++) wanted.add(Math.round(total * Math.pow(i / samples, 1.5)))

  const weights = new Float64Array(width)
  const gradient = new Float64Array(width)
  const epochs: number[] = []
  const trainCurve: number[] = []
  const validCurve: number[] = []
  const snapshots: number[][] = []
  let divergedAt: number | null = null

  const record = (epoch: number) => {
    epochs.push(epoch)
    trainCurve.push(rmse(fit, weights))
    validCurve.push(rmse(check, weights))
    snapshots.push(Array.from(weights))
  }
  record(0)

  for (let epoch = 1; epoch <= total; epoch++) {
    gradient.fill(0)
    for (let i = 0; i < count; i++) {
      const row = i * width
      let out = 0
      for (let k = 0; k < width; k++) out += phi[row + k] * weights[k]
      const diff = (out - y[i]) / count
      for (let k = 0; k < width; k++) gradient[k] += diff * phi[row + k]
    }
    let size = 0
    for (let k = 0; k < width; k++) {
      weights[k] -= rate * (gradient[k] + (k === 0 ? 0 : l2 * weights[k]))
      size = Math.max(size, Math.abs(weights[k]))
    }
    // Si los pesos se disparan, no tiene sentido seguir: se guarda el momento y se corta.
    if (!(size < BLOWN)) {
      divergedAt = epoch
      record(epoch)
      break
    }
    if (wanted.has(epoch)) record(epoch)
  }

  const last = epochs.length - 1
  const trainError = trainCurve[last]
  const validError = validCurve[last]
  let bestValid = Infinity
  let bestValidEpoch = 0
  let bestTrain = Infinity
  for (let i = 0; i <= last; i++) {
    if (validCurve[i] < bestValid) {
      bestValid = validCurve[i]
      bestValidEpoch = epochs[i]
    }
    if (trainCurve[i] < bestTrain) bestTrain = trainCurve[i]
  }

  // Error de validación cuando quedaba una quinta parte del entrenamiento: ¿seguía bajando?
  let late = last
  while (late > 0 && epochs[late] > 0.8 * total) late--
  const stalled = validError >= RULES.stalled * validCurve[late]

  let diagnosis: Diagnosis
  let cause: TrainResult['cause'] = null
  const finite = Number.isFinite(trainError) && Number.isFinite(validError)
  if (divergedAt !== null || !finite || trainError > trainCurve[0] || trainError > RULES.bounce * bestTrain) {
    diagnosis = 'diverged'
  } else if (shown(validError) <= level.target) {
    diagnosis = 'ok'
  } else if (bestTrainError(fit, 0) > level.target) {
    diagnosis = 'underfit'
    cause = 'capacity'
  } else if (
    validError > RULES.gap * trainError &&
    (validError > RULES.rebound * bestValid || (trainError <= level.target && stalled))
  ) {
    diagnosis = 'overfit'
  } else if (trainError > RULES.slack * bestTrainError(fit, l2)) {
    diagnosis = 'undertrained'
  } else {
    diagnosis = 'underfit'
    cause = l2 > 0 ? 'l2' : 'capacity'
  }

  return {
    hyper: { learningRate: rate, epochs: total, degree, l2 },
    epochs,
    trainCurve,
    validCurve,
    snapshots,
    weights: snapshots[last],
    trainError,
    validError,
    bestValid,
    bestValidEpoch,
    divergedAt,
    diagnosis,
    cause,
    passed: diagnosis === 'ok',
  }
}

// ---------------------------------------------------------------- Controles

/** Redondea a dos cifras significativas: lo que se enseña es exactamente lo que se usa. */
const tidy = (value: number) => Number(value.toPrecision(2))

/** Última posición del deslizador de ese control (la primera es 0). */
export function controlStops(control: Control) {
  if (control.scale === 'linear') return Math.round((control.max - control.min) / control.step)
  return Math.round(Math.log10(control.max / control.min) * control.step) + (control.zero ? 1 : 0)
}

/** Valor del hiperparámetro en esa posición del deslizador. */
export function controlValue(control: Control, position: number) {
  const at = Math.max(0, Math.min(controlStops(control), Math.round(position)))
  if (control.scale === 'linear') return control.min + at * control.step
  if (control.zero && at === 0) return 0
  return tidy(control.min * Math.pow(10, (at - (control.zero ? 1 : 0)) / control.step))
}

/** Posición del deslizador más cercana a ese valor. */
export function controlPosition(control: Control, value: number) {
  const stops = controlStops(control)
  if (control.scale === 'linear') {
    return Math.max(0, Math.min(stops, Math.round((value - control.min) / control.step)))
  }
  if (value <= 0) return 0
  const offset = control.zero ? 1 : 0
  const at = Math.round(Math.log10(value / control.min) * control.step) + offset
  return Math.max(offset, Math.min(stops, at))
}

const RATE: Control = { key: 'learningRate', min: 0.001, max: 3.2, step: 6, scale: 'log' }
const L2: Control = { key: 'l2', min: 0.001, max: 1, step: 3, scale: 'log', zero: true }

// ---------------------------------------------------------------- Niveles

interface LevelSpec {
  id: number
  title: Localized
  brief: Localized
  seed: number
  /** La función que hay detrás de los datos (el jugador no la ve) */
  truth: (x: number) => number
  noise: number
  trainCount: number
  validCount: number
  /** Las x de entrenamiento caen al azar (con huecos) en vez de repartidas por tramos */
  scatter?: boolean
  target: number
  controls: Control[]
  defaults: Hyper
}

/**
 * Genera los datos de un nivel. Las x se reparten por tramos con algo de
 * desorden (ni una rejilla perfecta ni huecos enormes) o, con `scatter`, las de
 * entrenamiento caen del todo al azar; a cada y se le suma ruido normal.
 * Entrenamiento y validación salen de la misma función y del mismo ruido, pero
 * son puntos distintos.
 */
export function buildLevel(spec: LevelSpec): Level {
  const random = mulberry32(spec.seed)
  const sample = (count: number, scatter = false) =>
    Array.from({ length: count }, (_, i) => {
      const x = scatter ? -1 + 2 * random() : -1 + ((i + 0.08 + 0.84 * random()) / count) * 2
      return { x, y: spec.truth(x) + spec.noise * gaussian(random) }
    }).sort((a, b) => a.x - b.x)
  const train = sample(spec.trainCount, spec.scatter)
  const valid = sample(spec.validCount)
  let min = Infinity
  let max = -Infinity
  for (const point of [...train, ...valid]) {
    min = Math.min(min, point.y)
    max = Math.max(max, point.y)
  }
  const margin = (max - min) * 0.18
  return {
    id: spec.id,
    title: spec.title,
    brief: spec.brief,
    target: spec.target,
    train,
    valid,
    controls: spec.controls,
    defaults: spec.defaults,
    yRange: [min - margin, max + margin],
  }
}

/**
 * Los niveles están calibrados a mano recorriendo todas las combinaciones de sus
 * deslizadores (semilla, ruido, objetivo y valores de partida incluidos): si se
 * toca algo aquí, hay que volver a comprobarlo.
 *
 *  1. Solo tasa y épocas (grado 5 fijo). De partida se queda a medias; converge con
 *     tasas de 0,07 a 1,5 y diverge a partir de 2,2. Pasa el 50 % de las combinaciones.
 *  2. Se añade la capacidad. Con la tasa y las épocas de partida: grados 1-4 se quedan
 *     cortos, 5-8 pasan (error 0,138-0,146) y 9-12 sobreajustan. Pasa el 31 %.
 *  3. Dieciséis puntos mal repartidos y con el doble de ruido. Sin regularización y con
 *     el entrenamiento de partida no pasa ningún grado: los bajos (1-4) no llegan y los
 *     demás sobreajustan. Pasa con grado 7 o más y L2 de 0,22 a 0,46 (error 0,27-0,31),
 *     o parando pronto (pocas épocas o una tasa muy baja). Con L2 = 1 se pasa de frenada.
 *     Pasa el 20 %.
 */
export const LEVEL_SPECS: LevelSpec[] = [
  {
    id: 1,
    title: { es: 'El ritmo', en: 'The pace' },
    brief: {
      es: 'El modelo ya tiene el tamaño adecuado. Elige a qué ritmo aprende y cuánto tiempo: ni tan despacio que no llegue, ni tan rápido que se descontrole.',
      en: 'The model is already the right size. Choose how fast it learns and for how long: not so slow that it never gets there, not so fast that it spins out of control.',
    },
    seed: 11,
    truth: (x) => 0.7 * Math.sin(2.6 * x) + 0.35 * x * x - 0.1,
    noise: 0.1,
    trainCount: 36,
    validCount: 36,
    target: 0.14,
    controls: [RATE, { key: 'epochs', min: 10, max: 200, step: 10, scale: 'linear' }],
    defaults: { learningRate: 0.0032, epochs: 40, degree: 5, l2: 0 },
  },
  {
    id: 2,
    title: { es: 'El tamaño', en: 'The size' },
    brief: {
      es: 'Ahora también eliges el tamaño del modelo. Con poco no puede seguir la forma de los datos; con mucho, y tan pocos datos, se los aprende de memoria.',
      en: 'Now you also choose the size of the model. Too small and it cannot follow the shape of the data; too big, with so little data, and it learns them by heart.',
    },
    seed: 28,
    truth: (x) => 0.75 * Math.sin(4 * x) + 0.3 * x,
    noise: 0.15,
    trainCount: 16,
    validCount: 40,
    target: 0.165,
    controls: [
      RATE,
      { key: 'epochs', min: 50, max: 1000, step: 50, scale: 'linear' },
      { key: 'degree', min: 1, max: MAX_DEGREE, step: 1, scale: 'linear' },
    ],
    defaults: { learningRate: 0.22, epochs: 300, degree: 1, l2: 0 },
  },
  {
    id: 3,
    title: { es: 'Pocos datos y con ruido', en: 'Scarce, noisy data' },
    brief: {
      es: 'Pocos datos y muy ruidosos. Hace falta un modelo grande para seguir la forma, pero hay que frenarlo (regularización) o pararlo a tiempo para que no memorice el ruido.',
      en: 'Few data points, and very noisy. You need a big model to follow the shape, but you have to rein it in (regularisation) or stop it in time so it does not memorise the noise.',
    },
    seed: 21,
    truth: (x) => 0.8 * Math.sin(6 * x) + 0.2 * x,
    noise: 0.3,
    trainCount: 16,
    validCount: 48,
    scatter: true,
    target: 0.34,
    controls: [
      RATE,
      { key: 'epochs', min: 50, max: 1000, step: 50, scale: 'linear' },
      { key: 'degree', min: 1, max: MAX_DEGREE, step: 1, scale: 'linear' },
      L2,
    ],
    defaults: { learningRate: 0.1, epochs: 600, degree: 9, l2: 0 },
  },
]

/** Los tres niveles, con sus datos ya generados. */
export const levels: Level[] = LEVEL_SPECS.map(buildLevel)
