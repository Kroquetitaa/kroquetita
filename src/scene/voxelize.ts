/**
 * Convierte la imagen de un logo en vóxeles: separa el fondo, recorta al
 * contenido y muestrea una rejilla. Cada celda con suficiente "tinta" es un cubo.
 */

export interface VoxelLogoData {
  count: number
  /** x, y por vóxel, centrados, en unidades de celda */
  cells: Float32Array
  /** r, g, b lineales por vóxel */
  colors: Float32Array
  /** Columnas y filas ocupadas */
  cols: number
  rows: number
  /** Color de la placa de fondo si el logo tenía fondo de color; si no, null */
  plate: [number, number, number] | null
  /** Color más vivo del logo (sRGB hex), o null si es monocromo */
  accent: string | null
}

type RGB = [number, number, number]

const luminance = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
const saturation = (c: RGB) => {
  const max = Math.max(c[0], c[1], c[2])
  const min = Math.min(c[0], c[1], c[2])
  return max === 0 ? 0 : (max - min) / max
}
const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
const toHex = (c: RGB) =>
  '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')

/** Los tonos casi negros no se verían sobre la escena oscura: pasan a claro. */
const LIGHT: RGB = [0.92, 0.93, 0.96]

/**
 * Adapta un color de marca al fondo oscuro: los grises muy oscuros pasan a
 * claro y los oscuros con color (azul marino, verde botella…) se aclaran
 * conservando el tono.
 */
function legible(color: RGB): RGB {
  const lum = luminance(color)
  if (lum >= 0.3) return color
  if (saturation(color) < 0.3) return lum < 0.2 ? LIGHT : color
  const boost = Math.min(2.4, 0.3 / Math.max(lum, 0.01))
  return [Math.min(1, color[0] * boost), Math.min(1, color[1] * boost), Math.min(1, color[2] * boost)]
}

/** Lleva un color a brillo pleno (para neones) conservando el tono. */
function vividHex(color: RGB) {
  const max = Math.max(color[0], color[1], color[2], 0.001)
  const k = max < 0.9 ? 0.95 / max : 1
  return toHex([color[0] * k, color[1] * k, color[2] * k])
}

/** Recorte opcional [x0, y0, x1, y1] en fracciones de la imagen (0..1). */
export type Crop = [number, number, number, number]

export function voxelize(
  image: HTMLImageElement,
  crop: Crop = [0, 0, 1, 1],
  resolution = 44,
): VoxelLogoData | null {
  const SIZE = 220
  const fullW = image.naturalWidth || image.width || SIZE
  const fullH = image.naturalHeight || image.height || SIZE
  const sx = crop[0] * fullW
  const sy = crop[1] * fullH
  const iw = Math.max(1, (crop[2] - crop[0]) * fullW)
  const ih = Math.max(1, (crop[3] - crop[1]) * fullH)
  const scale = SIZE / Math.max(iw, ih)
  const w = Math.max(1, Math.round(iw * scale))
  const h = Math.max(1, Math.round(ih * scale))

  // Se dibuja la imagen completa y se lee solo el recorte: usar el rectángulo
  // de origen de drawImage falla con los SVG que no declaran tamaño propio.
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(w, Math.round(fullW * scale))
  canvas.height = Math.max(h, Math.round(fullH * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(Math.round(sx * scale), Math.round(sy * scale), w, h).data
  } catch {
    return null
  }

  const pixel = (x: number, y: number): [RGB, number] => {
    const i = (y * w + x) * 4
    return [[data[i] / 255, data[i + 1] / 255, data[i + 2] / 255], data[i + 3] / 255]
  }

  // Fondo: lo que haya en las esquinas.
  const corners: Array<[number, number]> = [
    [1, 1],
    [w - 2, 1],
    [1, h - 2],
    [w - 2, h - 2],
  ]
  let alpha = 0
  const bg: RGB = [0, 0, 0]
  for (const [x, y] of corners) {
    const [c, a] = pixel(Math.max(0, x), Math.max(0, y))
    alpha += a / 4
    bg[0] += c[0] / 4
    bg[1] += c[1] / 4
    bg[2] += c[2] / 4
  }
  const transparent = alpha < 0.5

  const ink = new Uint8Array(w * h)
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [c, a] = pixel(x, y)
      const solid = a > 0.5 && (transparent || dist(c, bg) > 0.2)
      if (!solid) continue
      ink[y * w + x] = 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null

  // Rejilla ajustada al contenido: el lado mayor ocupa `resolution` celdas.
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const cell = Math.max(bw, bh) / resolution
  const cols = Math.max(1, Math.round(bw / cell))
  const rows = Math.max(1, Math.round(bh / cell))

  const cells: number[] = []
  const colors: number[] = []
  const vivid: RGB = [0, 0, 0]
  let vividWeight = 0

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor(minX + gx * cell)
      const x1 = Math.min(w, Math.max(x0 + 1, Math.floor(minX + (gx + 1) * cell)))
      const y0 = Math.floor(minY + gy * cell)
      const y1 = Math.min(h, Math.max(y0 + 1, Math.floor(minY + (gy + 1) * cell)))
      let total = 0
      let inked = 0
      const sum: RGB = [0, 0, 0]
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          total++
          if (!ink[y * w + x]) continue
          inked++
          const [c] = pixel(x, y)
          sum[0] += c[0]
          sum[1] += c[1]
          sum[2] += c[2]
        }
      }
      if (total === 0 || inked / total < 0.45) continue
      let color: RGB = [sum[0] / inked, sum[1] / inked, sum[2] / inked]

      const sat = saturation(color)
      if (sat > 0.35 && luminance(color) > 0.08) {
        const weight = sat * sat
        vivid[0] += color[0] * weight
        vivid[1] += color[1] * weight
        vivid[2] += color[2] * weight
        vividWeight += weight
      }
      color = legible(color)

      cells.push(gx - (cols - 1) / 2, (rows - 1) / 2 - gy)
      colors.push(toLinear(color[0]), toLinear(color[1]), toLinear(color[2]))
    }
  }
  if (cells.length === 0) return null

  // Fondo de color (ni blanco, ni negro, ni transparente): se conserva como placa.
  const bgLum = luminance(bg)
  const hasPlate = !transparent && bgLum > 0.06 && (bgLum < 0.82 || saturation(bg) > 0.25)
  let accent: string | null = null
  if (hasPlate && saturation(bg) > 0.35) accent = vividHex(bg)
  else if (vividWeight > 0) {
    accent = vividHex([vivid[0] / vividWeight, vivid[1] / vividWeight, vivid[2] / vividWeight])
  }

  return {
    count: cells.length / 2,
    cells: new Float32Array(cells),
    colors: new Float32Array(colors),
    cols,
    rows,
    plate: hasPlate ? [toLinear(bg[0]), toLinear(bg[1]), toLinear(bg[2])] : null,
    accent,
  }
}

type Loaded = HTMLImageElement | 'error'
const cache = new Map<string, Promise<Loaded>>()

/** Carga una imagen sin lanzar: si falla devuelve 'error' (para usar un respaldo). */
export function loadImage(url: string): Promise<Loaded> {
  let pending = cache.get(url)
  if (!pending) {
    pending = new Promise<Loaded>((resolve) => {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => resolve(img)
      img.onerror = () => resolve('error')
      img.src = url
    })
    cache.set(url, pending)
  }
  return pending
}
