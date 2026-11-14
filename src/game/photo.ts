import { create } from 'zustand'
import type { Localized } from '../data/career'
import { track } from '../net/track'
import { useGame } from '../store'

/**
 * Modo foto: lo que comparten la cámara libre (dentro del canvas) y su panel
 * (fuera). Los ajustes viven en un mini-store; las órdenes de un solo uso
 * (disparar, recolocar la cámara) van en un objeto mutable que la cámara
 * consume en su siguiente fotograma. Aquí está también el revelado: copiar el
 * lienzo, hornear el filtro, poner el marco y descargar.
 */

/** Límites de los deslizadores, en grados */
export const FOV_RANGE = { min: 15, max: 75 }
export const ROLL_RANGE = { min: -30, max: 30 }

/** Pie del marco */
export const CAPTION = 'kroquetita.com'

/**
 * Marco: grosor de los lados y de la banda del pie como fracción del lado
 * corto de la foto, tamaño de la letra respecto a la banda y separación entre
 * letras (en em). La vista previa (css) y la foto salen de estos mismos números.
 */
export const FRAME = { side: 0.022, foot: 0.085, text: 0.34, spacing: 0.22, paper: '#f4f1ea', ink: '#17181d' }

export interface PhotoFilter {
  id: string
  name: Localized
  /** Funciones de `filter` CSS: se aplican al lienzo en vivo y se hornean en la foto */
  css: string
  /** Velo de color por encima (cálido, frío): un tinte que `filter` no sabe dar */
  wash?: string
}

export const FILTERS: PhotoFilter[] = [
  { id: 'none', name: { es: 'Normal', en: 'Normal' }, css: '' },
  { id: 'mono', name: { es: 'B/N', en: 'B&W' }, css: 'grayscale(1) contrast(1.2)' },
  {
    id: 'warm',
    name: { es: 'Cálido', en: 'Warm' },
    css: 'sepia(0.22) saturate(1.45) contrast(1.06)',
    wash: 'rgba(255, 128, 32, 0.1)',
  },
  {
    id: 'cool',
    name: { es: 'Frío', en: 'Cool' },
    css: 'saturate(1.1) contrast(1.1)',
    wash: 'rgba(40, 110, 255, 0.13)',
  },
  { id: 'vivid', name: { es: 'Vívido', en: 'Vivid' }, css: 'saturate(1.7) contrast(1.12)' },
  { id: 'retro', name: { es: 'Retro', en: 'Retro' }, css: 'sepia(0.8) contrast(0.92) brightness(1.08)' },
  { id: 'soft', name: { es: 'Suave', en: 'Soft' }, css: 'saturate(0.75) contrast(0.85) brightness(1.12)' },
]

export const filterOf = (id: string): PhotoFilter => FILTERS.find((filter) => filter.id === id) ?? FILTERS[0]

interface PhotoState {
  /** Campo de visión vertical y el que tenía la cámara al entrar (a él vuelve «restablecer») */
  fov: number
  baseFov: number
  /** Inclinación del horizonte */
  roll: number
  /** `id` del filtro elegido */
  filter: string
  /** Marco con pie */
  frame: boolean
  /** Fotos hechas desde que se entró: cada una dispara el destello */
  shots: number
  /** Hay una foto revelándose (no se dispara otra hasta que acabe) */
  saving: boolean
  /** La última foto, por si se quiere compartir */
  last: File | null
  /** Al entrar en el modo foto: se parte del campo de visión de la cámara del juego */
  enter: (fov: number) => void
  setFov: (fov: number) => void
  setRoll: (roll: number) => void
  setFilter: (id: string) => void
  toggleFrame: () => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const usePhoto = create<PhotoState>((set) => ({
  fov: 32,
  baseFov: 32,
  roll: 0,
  filter: 'none',
  frame: false,
  shots: 0,
  saving: false,
  last: null,
  enter: (value) => {
    const fov = clamp(Math.round(value), FOV_RANGE.min, FOV_RANGE.max)
    // El filtro y el marco se recuerdan de una vez para otra; el encuadre empieza de cero.
    set({ fov, baseFov: fov, roll: 0, shots: 0, last: null })
  },
  setFov: (fov) => set({ fov: clamp(fov, FOV_RANGE.min, FOV_RANGE.max) }),
  setRoll: (roll) => set({ roll: clamp(roll, ROLL_RANGE.min, ROLL_RANGE.max) }),
  setFilter: (filter) => set({ filter }),
  toggleFrame: () => set((s) => ({ frame: !s.frame })),
}))

/** Órdenes pendientes: las consume la cámara del modo foto en su siguiente fotograma. */
export const photoRig = { shoot: false, recenter: false }

/** Pide una foto: se hace en el mismo fotograma en que se pinta, que es cuando el lienzo tiene imagen. */
export function requestShot() {
  if (!usePhoto.getState().saving) photoRig.shoot = true
}

/** Restablecer: ajustes de fábrica y la cámara de vuelta al jugador. */
export function resetPhoto() {
  usePhoto.setState((s) => ({ fov: s.baseFov, roll: 0, filter: 'none', frame: false }))
  photoRig.recenter = true
}

/** ¿Sabe este navegador compartir ficheros (el menú de compartir del móvil)? */
export function canShareFiles(): boolean {
  try {
    return (
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([], 'foto.png', { type: 'image/png' })] })
    )
  } catch {
    return false
  }
}

// ---------- Revelado ----------

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const GRAY = [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722]
const SEPIA = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131]

/** Matriz 3×3 (por filas) y desplazamiento (0..255) de una función de `filter` CSS. */
function matrixOf(name: string, value: number): { m: number[]; offset: number } | null {
  const mix = (to: number[], amount: number) => IDENTITY.map((from, i) => from + (to[i] - from) * amount)
  if (name === 'grayscale') return { m: mix(GRAY, Math.min(1, value)), offset: 0 }
  if (name === 'sepia') return { m: mix(SEPIA, Math.min(1, value)), offset: 0 }
  if (name === 'saturate') return { m: mix(GRAY, 1 - value), offset: 0 }
  if (name === 'contrast') return { m: IDENTITY.map((v) => v * value), offset: 127.5 * (1 - value) }
  if (name === 'brightness') return { m: IDENTITY.map((v) => v * value), offset: 0 }
  return null
}

/**
 * Hornea a mano una cadena de `filter` CSS, píxel a píxel, para los navegadores
 * cuyo canvas 2D no tiene `filter` (Safari). Solo entiende las funciones de
 * color que usan los filtros de arriba; lo demás lo deja pasar.
 */
function bake(ctx: CanvasRenderingContext2D, width: number, height: number, css: string) {
  let m = IDENTITY.slice()
  let offset = [0, 0, 0]
  for (const [, name, amount, percent] of css.matchAll(/(grayscale|sepia|saturate|contrast|brightness)\(([\d.]+)(%?)\)/g)) {
    const step = matrixOf(name, Number(amount) / (percent ? 100 : 1))
    if (!step) continue
    // Cada función se aplica sobre el resultado de las anteriores.
    const a = step.m
    const next: number[] = []
    const nextOffset: number[] = []
    for (let row = 0; row < 3; row++) {
      const [x, y, z] = [a[row * 3], a[row * 3 + 1], a[row * 3 + 2]]
      for (let col = 0; col < 3; col++) next[row * 3 + col] = x * m[col] + y * m[3 + col] + z * m[6 + col]
      nextOffset[row] = x * offset[0] + y * offset[1] + z * offset[2] + step.offset
    }
    m = next
    offset = nextOffset
  }
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  // El array recorta solo a 0..255.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    data[i] = m[0] * r + m[1] * g + m[2] * b + offset[0]
    data[i + 1] = m[3] * r + m[4] * g + m[5] * b + offset[1]
    data[i + 2] = m[6] * r + m[7] * g + m[8] * b + offset[2]
  }
  ctx.putImageData(image, 0, 0)
}

/**
 * Copia el lienzo WebGL a uno 2D, con el filtro, el velo y el marco. Tiene que
 * llamarse en el mismo fotograma en que se ha pintado: el búfer de WebGL no se
 * conserva y, pasado ese momento, la copia saldría en negro.
 */
function develop(source: HTMLCanvasElement, filter: PhotoFilter, framed: boolean): HTMLCanvasElement | null {
  if (source.width === 0 || source.height === 0) return null
  // La foto sale a la resolución real del lienzo. En 8 bits ese lienzo es diminuto y el
  // navegador lo amplía sin suavizar: aquí se hace lo mismo para que no salga un sello.
  const tiny = source.clientWidth > 0 && source.width < source.clientWidth * 0.6
  const scale = tiny ? Math.max(1, Math.round(source.clientWidth / source.width)) : 1
  const width = source.width * scale
  const height = source.height * scale

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Fondo opaco: lo que el lienzo deje transparente se ve negro, como en la página.
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = false

  // El filtro es justo el que se ve: el del modo foto y, delante, el que ya traiga el lienzo.
  const css = getComputedStyle(source).filter
  const filtered = Boolean(css) && css !== 'none'
  const native = 'filter' in ctx
  if (filtered && native) ctx.filter = css
  ctx.drawImage(source, 0, 0, width, height)
  if (filtered && native) ctx.filter = 'none'
  else if (filtered) bake(ctx, width, height, css)

  if (filter.wash) {
    ctx.fillStyle = filter.wash
    ctx.fillRect(0, 0, width, height)
  }

  if (framed) {
    const unit = Math.min(width, height)
    const side = Math.round(unit * FRAME.side)
    const foot = Math.round(unit * FRAME.foot)
    ctx.fillStyle = FRAME.paper
    ctx.fillRect(0, 0, width, side)
    ctx.fillRect(0, 0, side, height)
    ctx.fillRect(width - side, 0, side, height)
    ctx.fillRect(0, height - foot, width, foot)

    // Pie centrado. Las letras se separan a mano: `letterSpacing` del canvas no está en todos los navegadores.
    const size = foot * FRAME.text
    ctx.font = `600 ${size}px Poppins, system-ui, -apple-system, 'Segoe UI', sans-serif`
    ctx.fillStyle = FRAME.ink
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const letters = [...CAPTION]
    const widths = letters.map((letter) => ctx.measureText(letter).width)
    const gap = size * FRAME.spacing
    let x = (width - widths.reduce((sum, w) => sum + w, 0) - gap * (letters.length - 1)) / 2
    letters.forEach((letter, i) => {
      ctx.fillText(letter, x, height - foot / 2)
      x += widths[i] + gap
    })
  }
  return canvas
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Nombre del fichero: kroquetita-AAAAMMDD-HHMMSS.png, en hora local. */
function fileName(date: Date) {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `kroquetita-${day}-${time}.png`
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Con margen: en el móvil la descarga espera a que se confirme.
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/**
 * Hace la foto: copia el lienzo ahora mismo (de forma síncrona) y, ya sin
 * prisa, la comprime y la descarga. Devuelve si ha habido foto.
 */
export function takePhoto(source: HTMLCanvasElement): boolean {
  const { filter, frame, saving } = usePhoto.getState()
  if (saving) return false
  let picture: HTMLCanvasElement | null = null
  try {
    picture = develop(source, filterOf(filter), frame)
  } catch {
    // Sin memoria para un lienzo tan grande, o el navegador no deja leerlo.
    picture = null
  }
  if (!picture) return false

  const name = fileName(new Date())
  usePhoto.setState((s) => ({ shots: s.shots + 1, saving: true }))
  picture.toBlob((blob) => {
    if (!blob) {
      usePhoto.setState({ saving: false })
      return
    }
    download(blob, name)
    usePhoto.setState({ saving: false, last: new File([blob], name, { type: 'image/png' }) })
    useGame.getState().unlock('photographer')
    track('photo')
  }, 'image/png')
  return true
}
