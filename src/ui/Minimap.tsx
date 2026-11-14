import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Lang, Localized } from '../data/career'
import { talkers, type Talker } from '../data/folk'
import { sfx } from '../game/audio'
import { isTyping } from '../game/input'
import { body, warp } from '../game/state'
import { useLang, useUI } from '../i18n'
import { track } from '../net/track'
import { SMASHABLES, TEAMMATES, useGame, type Smashable } from '../store'
import { lab } from '../world/lab'
import { world } from '../world/layout'
import { trainStation, zoneAt, zones, type Zone, type ZoneId } from '../world/zones'
import './minimap.css'

/**
 * Mapa del mundo visto desde arriba. Mientras se juega hay uno pequeño en una
 * esquina (solo en escritorio) y, al pulsarlo, se abre el grande, desde el que
 * se viaja a cualquier zona. Los dos se pintan en un lienzo 2D con el mismo
 * dibujo: X hacia la derecha y Z hacia abajo, como se ve desde la cámara.
 */

const B = world.bounds
const SPAN_X = B.maxX - B.minX
const SPAN_Z = B.maxZ - B.minZ
const TAU = Math.PI * 2
const INK = '#05070b'
const GOLD = '#ffc933'
const FONT = 'Poppins, system-ui, sans-serif'
/** Por debajo de esta escala (píxeles por unidad de mundo) los nombres no caben: se pinta solo el número */
const NAMES_FROM = 3.6
/** El mapa pequeño solo sale donde hay sitio: ratón y pantalla ancha */
const ROOMY = '(pointer: fine) and (min-width: 900px) and (min-height: 420px)'

const TEXT = {
  es: {
    title: 'Mapa',
    subtitle: 'Viaje rápido',
    open: 'Abrir el mapa',
    chart: 'Mapa del mundo. Pulsa una zona para viajar a ella.',
    zones: 'Zonas a las que se puede viajar',
    here: 'Estás aquí',
    travel: (name: string) => `Viajar a ${name}`,
    shortcut: (key: number) => `Atajo: tecla ${key}`,
    keysTravel: 'viajar',
    keysClose: 'cerrar',
    note: 'El viaje rápido invalida la marca de la contrarreloj en curso',
    you: 'Tú',
    folk: 'Personajes',
    coins: 'Monedas',
  },
  en: {
    title: 'Map',
    subtitle: 'Fast travel',
    open: 'Open the map',
    chart: 'World map. Pick a zone to travel to it.',
    zones: 'Zones you can travel to',
    here: 'You are here',
    travel: (name: string) => `Travel to ${name}`,
    shortcut: (key: number) => `Shortcut: key ${key}`,
    keysTravel: 'travel',
    keysClose: 'close',
    note: 'Fast travel voids the time trial in progress',
    you: 'You',
    folk: 'Characters',
    coins: 'Coins',
  },
} satisfies Record<Lang, unknown>

/* ---------- Del mundo al lienzo ---------- */

/** Encaje del mundo en un lienzo de `width` × `height` píxeles CSS: escala y márgenes que lo centran. */
interface View {
  width: number
  height: number
  scale: number
  ox: number
  oy: number
}

function fit(width: number, height: number, pad: number): View {
  const scale = Math.max(0.01, Math.min((width - 2 * pad) / SPAN_X, (height - 2 * pad) / SPAN_Z))
  return { width, height, scale, ox: (width - SPAN_X * scale) / 2, oy: (height - SPAN_Z * scale) / 2 }
}

const px = (v: View, x: number) => v.ox + (x - B.minX) * v.scale
/** Z crece hacia la cámara: en el mapa, hacia abajo */
const py = (v: View, z: number) => v.oy + (z - B.minZ) * v.scale
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Rectángulo del suelo (mínimos y máximos en X y Z) en píxeles: x, y, ancho y alto. */
const rect = (v: View, minX: number, minZ: number, maxX: number, maxZ: number) =>
  [px(v, minX), py(v, minZ), (maxX - minX) * v.scale, (maxZ - minZ) * v.scale] as const

/** Lo mismo para una caja dada por su centro y su tamaño ([x, y, z]). */
const boxRect = (v: View, center: readonly number[], size: readonly number[]) =>
  rect(v, center[0] - size[0] / 2, center[2] - size[2] / 2, center[0] + size[0] / 2, center[2] + size[2] / 2)

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
}

const zoneById = (id: ZoneId | null) => (id ? (zones.find((zone) => zone.id === id) ?? null) : null)
const tint = (id: ZoneId) => zoneById(id)?.color ?? '#ffffff'

/* ---------- Qué hay en cada sitio ---------- */

const arcade = world.props.arcade
const spot = (center: readonly number[]): [number, number] => [center[0], center[2]]

/** Dónde está cada cosa de la sala de romper (x, z) */
const SMASH_SPOTS: Partial<Record<Smashable, [number, number]>> = {
  tests: spot(arcade.tests.center),
  network: spot(arcade.network.center),
  gauss: spot(arcade.gauss.center),
  dice: [(arcade.dice.pen.minX + arcade.dice.pen.maxX) / 2, (arcade.dice.pen.minZ + arcade.dice.pen.maxZ) / 2],
  graph: spot(arcade.graph.center),
  prs: spot(arcade.prs.center),
  legacy: spot(arcade.legacy.center),
  pinata: spot(arcade.pinata.center),
  stack: spot(arcade.stack.center),
  table: spot(arcade.table.center),
  overfit: spot(arcade.overfit.center),
}

const isMate = (id: string) => (TEAMMATES as readonly string[]).includes(id)

/** Zona en la que cuenta cada personaje: los que andan sueltos por el parque son de la plaza. */
function homeOf(talker: Talker): ZoneId {
  if (isMate(talker.id)) return 'team'
  const zone = zoneAt(talker.position[0], talker.position[1])?.id
  return !zone || zone === 'career' ? 'plaza' : zone
}

/** Dónde va la etiqueta de cada zona respecto a su recinto (por defecto, dentro y abajo) */
type Place = 'inside-top' | 'inside-bottom' | 'above' | 'below' | 'left' | 'right'
const PLACES: Partial<Record<ZoneId, Place>> = {
  career: 'above',
  arcade: 'above',
  lab: 'inside-top',
  team: 'right',
  gym: 'left',
}

/* ---------- Dibujo ---------- */

/** Etiqueta de una zona: su número (el del atajo) y, si cabe, su nombre. */
function tag(ctx: CanvasRenderingContext2D, v: View, zone: Zone, index: number, name: string | null) {
  const { area } = zone
  let place = PLACES[zone.id] ?? 'inside-bottom'
  // Con poca escala, una etiqueta dentro y arriba taparía lo primero que hay en la sala: sale fuera.
  if (place === 'inside-top' && v.scale < 5) place = 'left'
  const height = 18
  ctx.font = `600 11px ${FONT}`
  const width = name ? Math.ceil(ctx.measureText(name).width) + 31 : height
  const left = px(v, area.minX)
  const right = px(v, area.maxX)
  const top = py(v, area.minZ)
  const bottom = py(v, area.maxZ)
  let x = left + 5
  let y = bottom - 5 - height
  if (place === 'inside-top') y = top + 5
  else if (place === 'above') {
    x = left
    y = top - 5 - height
  } else if (place === 'below') {
    x = left
    y = bottom + 5
  } else if (place === 'right') {
    x = right + 6
    y = (top + bottom - height) / 2
  } else if (place === 'left') {
    x = left - 6 - width
    y = (top + bottom - height) / 2
  }
  // Nunca fuera del lienzo.
  x = clamp(x, 2, Math.max(2, v.width - width - 2))
  y = clamp(y, 2, Math.max(2, v.height - height - 2))

  rounded(ctx, x, y, width, height, height / 2)
  ctx.fillStyle = 'rgba(5, 7, 11, 0.82)'
  ctx.fill()
  ctx.globalAlpha = 0.6
  ctx.strokeStyle = zone.color
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.globalAlpha = 1

  dot(ctx, x + height / 2, y + height / 2, height / 2 - 2.5)
  ctx.fillStyle = zone.color
  ctx.fill()
  ctx.fillStyle = INK
  ctx.font = `600 9.5px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(index + 1), x + height / 2, y + height / 2 + 0.5)
  if (!name) return
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)'
  ctx.font = `600 11px ${FONT}`
  ctx.textAlign = 'left'
  ctx.fillText(name, x + height + 3, y + height / 2 + 0.5)
}

/**
 * Lo que no cambia de un fotograma a otro: zonas, cajas y, en el mapa grande,
 * todo el detalle. Se pinta una vez en un lienzo aparte y luego solo se copia.
 */
function paintStatic(ctx: CanvasRenderingContext2D, v: View, ratio: number, detail: boolean) {
  const game = useGame.getState()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.lineJoin = 'round'
  ctx.lineWidth = 1

  if (detail) {
    // Cuadrícula tenue cada diez unidades, para dar escala.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)'
    ctx.beginPath()
    for (let x = Math.ceil(B.minX / 10) * 10; x <= B.maxX; x += 10) {
      ctx.moveTo(px(v, x), py(v, B.minZ))
      ctx.lineTo(px(v, x), py(v, B.maxZ))
    }
    for (let z = Math.ceil(B.minZ / 10) * 10; z <= B.maxZ; z += 10) {
      ctx.moveTo(px(v, B.minX), py(v, z))
      ctx.lineTo(px(v, B.maxX), py(v, z))
    }
    ctx.stroke()
  }

  // Zonas: un rectángulo suave con su color.
  for (const zone of zones) {
    const { area } = zone
    rounded(ctx, ...rect(v, area.minX, area.minZ, area.maxX, area.maxZ), detail ? 7 : 3)
    ctx.globalAlpha = detail ? 0.13 : 0.2
    ctx.fillStyle = zone.color
    ctx.fill()
    ctx.globalAlpha = detail ? 0.5 : 0.6
    ctx.strokeStyle = zone.color
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  if (detail) {
    // Todo lo que tiene colisión (mobiliario, vallas, máquinas), como sombra.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.13)'
    for (const collider of world.colliders) {
      const [x, y, w, h] = rect(v, collider.min[0], collider.min[2], collider.max[0], collider.max[2])
      ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h))
    }

    // Baldosas de luz que llevan a cada sala.
    const tiles = Math.max(1.5, 0.5 * v.scale)
    const trail = (path: ReadonlyArray<readonly number[]>, color: string) => {
      ctx.fillStyle = color
      for (const tile of path) ctx.fillRect(px(v, tile[0]) - tiles / 2, py(v, tile[2]) - tiles / 2, tiles, tiles)
    }
    ctx.globalAlpha = 0.5
    trail(world.props.campus.path, tint('library'))
    trail(arcade.path, tint('arcade'))
    trail(lab.path, tint('lab'))
    ctx.globalAlpha = 1

    // El recorrido de la trayectoria: de caja en caja, en orden.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)'
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    world.blocks.forEach((block, i) => {
      if (i === 0) ctx.moveTo(px(v, block.x), py(v, block.z))
      else ctx.lineTo(px(v, block.x), py(v, block.z))
    })
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Cajas de la trayectoria, cada una con el color de su etapa.
  world.blocks.forEach((block, i) => {
    rounded(
      ctx,
      ...rect(v, block.x - block.width / 2, block.z - block.depth / 2, block.x + block.width / 2, block.z + block.depth / 2),
      detail ? 2.5 : 1.2,
    )
    ctx.globalAlpha = 0.92
    ctx.fillStyle = game.accents[i] ?? block.stage.color
    ctx.fill()
    if (detail) {
      ctx.globalAlpha = block.current ? 0.9 : 0.3
      ctx.strokeStyle = '#fff'
      ctx.stroke()
    }
  })
  ctx.globalAlpha = 1
  if (!detail) return

  // Biblioteca: la escalera de libros.
  ctx.fillStyle = ctx.strokeStyle = tint('library')
  for (const book of world.props.campus.books) {
    rounded(ctx, ...boxRect(v, book.center, book.size), 1.5)
    ctx.globalAlpha = 0.4
    ctx.fill()
    ctx.globalAlpha = 0.85
    ctx.stroke()
  }

  // Sala de conceptos: pedestal y plataforma de cada instalación; las ya vistas, encendidas.
  ctx.fillStyle = ctx.strokeStyle = tint('lab')
  lab.exhibits.forEach((exhibit, i) => {
    const seen = game.seenConcepts.includes(i)
    const x = exhibit.position[0]
    const half = exhibit.base[0] / 2
    rounded(ctx, ...boxRect(v, exhibit.pad.center, exhibit.pad.size), 2)
    ctx.globalAlpha = seen ? 0.55 : 0.3
    ctx.stroke()
    rounded(ctx, ...rect(v, x - half, exhibit.front - exhibit.base[1], x + half, exhibit.front), 2)
    ctx.globalAlpha = seen ? 0.95 : 0.3
    ctx.fill()
  })

  // Sala de romper: un punto por cosa; relleno si ya se ha roto.
  ctx.strokeStyle = tint('arcade')
  ctx.lineWidth = 1.4
  for (const id of SMASHABLES) {
    const at = SMASH_SPOTS[id]
    if (!at) continue
    const done = game.smashed.includes(id)
    dot(ctx, px(v, at[0]), py(v, at[1]), 3)
    ctx.globalAlpha = 1
    ctx.fillStyle = done ? tint('arcade') : INK
    ctx.fill()
    ctx.globalAlpha = done ? 1 : 0.75
    ctx.stroke()
  }
  ctx.lineWidth = 1

  // Máquina de «entrena tu modelo» y el sitio desde el que se usa.
  ctx.fillStyle = ctx.strokeStyle = tint('gym')
  ctx.globalAlpha = 0.4
  dot(ctx, px(v, trainStation.pad[0]), py(v, trainStation.pad[1]), trainStation.reach * v.scale)
  ctx.stroke()
  ctx.globalAlpha = 1
  rounded(ctx, ...boxRect(v, trainStation.position, trainStation.size), 1.5)
  ctx.fill()

  // Monedas que quedan por coger.
  ctx.fillStyle = GOLD
  for (const coin of world.coins) {
    if (game.collected.includes(coin.id)) continue
    dot(ctx, px(v, coin.position[0]), py(v, coin.position[2]), 1.8)
    ctx.fill()
  }

  // Personajes: un punto con aro blanco; relleno si ya se ha hablado con él.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.lineWidth = 1.2
  for (const talker of talkers) {
    dot(ctx, px(v, talker.position[0]), py(v, talker.position[1]), 3)
    ctx.fillStyle = game.talked.includes(talker.id) ? talker.color : INK
    ctx.fill()
    ctx.stroke()
  }
  ctx.lineWidth = 1

  // Nombre (o solo número) de cada zona.
  const names = v.scale >= NAMES_FROM
  zones.forEach((zone, i) => tag(ctx, v, zone, i, names ? zone.name[game.lang] : null))
}

/** Lo que sí cambia: la zona en la que se está, la que se señala y el jugador. */
function paintLive(
  ctx: CanvasRenderingContext2D,
  v: View,
  detail: boolean,
  now: number,
  still: boolean,
  x: number,
  z: number,
  here: Zone | null,
  target: Zone | null,
) {
  const cx = px(v, clamp(x, B.minX, B.maxX))
  const cy = py(v, clamp(z, B.minZ, B.maxZ))
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return

  const glow = (zone: Zone, fill: number, width: number) => {
    const { area } = zone
    rounded(ctx, ...rect(v, area.minX, area.minZ, area.maxX, area.maxZ), detail ? 7 : 3)
    ctx.globalAlpha = fill
    ctx.fillStyle = zone.color
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = zone.color
    ctx.lineWidth = width
    ctx.stroke()
  }
  if (here && here !== target) glow(here, detail ? 0.08 : 0.14, detail ? 1.5 : 1.2)
  if (target) {
    glow(target, 0.2, 2)
    // Adónde se va a aparecer: una línea de puntos desde el jugador y una diana.
    const ax = px(v, target.arrive[0])
    const ay = py(v, target.arrive[1])
    ctx.lineWidth = 1.4
    ctx.setLineDash([4, 4])
    ctx.lineDashOffset = still ? 0 : -((now / 50) % 8)
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(ax, ay)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
    ctx.globalAlpha = 1
    dot(ctx, ax, ay, 6)
    ctx.fillStyle = 'rgba(5, 7, 11, 0.7)'
    ctx.fill()
    ctx.stroke()
    dot(ctx, ax, ay, 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
  }

  // El jugador: un punto con brillo y, si no molesta el movimiento, un latido.
  const core = detail ? 4.5 : 3
  const reach = detail ? 20 : 11
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach)
  halo.addColorStop(0, 'rgba(255, 255, 255, 0.62)')
  halo.addColorStop(0.4, 'rgba(120, 235, 255, 0.24)')
  halo.addColorStop(1, 'rgba(120, 235, 255, 0)')
  dot(ctx, cx, cy, reach)
  ctx.fillStyle = halo
  ctx.fill()
  if (!still) {
    const beat = (now % 1800) / 1800
    dot(ctx, cx, cy, core + beat * (reach - core))
    ctx.globalAlpha = (1 - beat) * 0.75
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  dot(ctx, cx, cy, core)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = 1
  ctx.stroke()
}

/* ---------- Lienzo ---------- */

/**
 * Pinta el mapa en un lienzo y lo mantiene al día leyendo `body.pos` en cada
 * fotograma, sin pasar por React. El bucle vive mientras el lienzo esté
 * montado: al ocultarse el mapa, se para. `onHere` avisa solo cuando el
 * jugador cambia de zona, y `focus` es la zona que se está señalando.
 */
function useMapCanvas(
  detail: boolean,
  onHere: (id: ZoneId | null) => void,
  focus?: React.RefObject<ZoneId | null>,
) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const view = useRef<View>(fit(1, 1, 0))

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    // Capa fija: se pinta una vez por tamaño (o cuando cambia lo que enseña) y luego se copia.
    const layer = document.createElement('canvas')
    const ink = layer.getContext('2d')
    if (!el || !ctx || !ink) return

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let ratio = 1
    let sized = false
    let dirty = true
    let drawn = ''
    let frame = 0
    let here: ZoneId | null | undefined

    // Tamaño real del lienzo: el de la pantalla por la densidad de píxeles, para que salga nítido.
    const measure = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      if (width < 2 || height < 2) return
      ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
      const w = Math.round(width * ratio)
      const h = Math.round(height * ratio)
      if (el.width !== w) el.width = w
      if (el.height !== h) el.height = h
      if (layer.width !== w) layer.width = w
      if (layer.height !== h) layer.height = h
      view.current = fit(width, height, detail ? (width < 480 ? 8 : 14) : 5)
      sized = true
      dirty = true
    }

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (!sized) return
      const x = body.pos[0]
      const z = body.pos[2]
      const zone = zoneAt(x, z)
      const id = zone?.id ?? null
      if (id !== here) {
        here = id
        onHere(id)
      }
      const target = focus?.current ?? null
      // Sin animaciones solo se repinta cuando cambia algo.
      const key = still ? `${x.toFixed(2)} ${z.toFixed(2)} ${id} ${target}` : ''
      if (still && !dirty && key === drawn) return
      drawn = key
      if (dirty) {
        paintStatic(ink, view.current, ratio, detail)
        dirty = false
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, el.width, el.height)
      ctx.drawImage(layer, 0, 0)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      paintLive(ctx, view.current, detail, now, still, x, z, zone, zoneById(target))
    }

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    // Cambiar el zoom del navegador cambia la densidad de píxeles sin cambiar el tamaño CSS.
    window.addEventListener('resize', measure)
    measure()
    // La capa fija enseña cosas del juego (idioma, monedas, lo visto, lo roto…): si cambian, se repinta.
    const unsubscribe = useGame.subscribe((s, p) => {
      if (
        s.lang !== p.lang ||
        s.accents !== p.accents ||
        s.collected !== p.collected ||
        s.seenConcepts !== p.seenConcepts ||
        s.smashed !== p.smashed ||
        s.talked !== p.talked
      )
        dirty = true
    })
    // Si la tipografía llega después del primer pintado, las etiquetas se rehacen con ella.
    void document.fonts?.ready.then(() => {
      dirty = true
    })
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measure)
      unsubscribe()
    }
  }, [detail, onHere, focus])

  return { canvas, view }
}

function useMedia(query: string) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', notify)
      return () => media.removeEventListener('change', notify)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/* ---------- Viaje rápido ---------- */

function travel(zone: Zone) {
  warp(zone.arrive[0], 0, zone.arrive[1])
  useGame.getState().setPanel(null)
  sfx.portal()
  track('warp:' + zone.id)
}

interface Progress {
  done: number
  total: number
  label: Localized
}

/** Lo que se lleva hecho en cada zona, cuando hay algo que contar. */
function useProgress() {
  const talked = useGame((s) => s.talked)
  const visited = useGame((s) => s.visited.length)
  const topBook = useGame((s) => s.topBook)
  const smashed = useGame((s) => s.smashed.length)
  const seen = useGame((s) => s.seenConcepts.length)
  const trained = useGame((s) => s.medals.includes('trainer'))

  return (id: ZoneId): Progress | null => {
    switch (id) {
      case 'plaza': {
        const folk = talkers.filter((talker) => homeOf(talker) === 'plaza')
        return {
          done: folk.filter((talker) => talked.includes(talker.id)).length,
          total: folk.length,
          label: { es: 'personajes', en: 'characters' },
        }
      }
      case 'career':
        return { done: visited, total: world.blocks.length, label: { es: 'cajas', en: 'boxes' } }
      case 'library':
        return { done: topBook ? 1 : 0, total: 1, label: { es: 'último libro', en: 'top book' } }
      case 'arcade':
        return { done: smashed, total: SMASHABLES.length, label: { es: 'rotas', en: 'broken' } }
      case 'lab':
        return { done: seen, total: lab.exhibits.length, label: { es: 'conceptos', en: 'concepts' } }
      case 'team':
        return {
          done: TEAMMATES.filter((mate) => talked.includes(mate)).length,
          total: TEAMMATES.length,
          label: { es: 'compañeros', en: 'teammates' },
        }
      case 'gym':
        return { done: trained ? 1 : 0, total: 1, label: { es: 'medalla', en: 'medal' } }
      default:
        return null
    }
  }
}

/* ---------- Mapa pequeño ---------- */

function MiniMap() {
  const lang = useLang()
  const t = TEXT[lang]
  const [here, setHere] = useState<ZoneId | null>(null)
  const { canvas } = useMapCanvas(false, setHere)
  const zone = zoneById(here)
  return (
    <button
      type="button"
      className="minimap"
      style={zone ? ({ '--accent': zone.color } as React.CSSProperties) : undefined}
      onClick={() => useGame.getState().setPanel('map')}
      title={`${t.open} (M)`}
      aria-label={zone ? `${t.open}. ${zone.name[lang]}` : t.open}
    >
      <canvas ref={canvas} aria-hidden="true" />
      <span className="minimap__caption" aria-hidden="true">
        <i />
        <span>{zone ? zone.name[lang] : t.title}</span>
        <kbd>M</kbd>
      </span>
    </button>
  )
}

/* ---------- Mapa grande ---------- */

function WorldMap() {
  const lang = useLang()
  const ui = useUI()
  const t = TEXT[lang]
  const racing = useGame((s) => s.runStart !== null && s.runTime === null)
  const progressOf = useProgress()
  const [here, setHere] = useState<ZoneId | null>(() => zoneAt(body.pos[0], body.pos[2])?.id ?? null)
  const [active, setActive] = useState<ZoneId | null>(null)
  /** Zona señalada (con el ratón o con el foco): la lee el lienzo en cada fotograma */
  const focus = useRef<ZoneId | null>(null)
  /** En táctil, el primer toque sobre el dibujo elige la zona y el segundo viaja */
  const armed = useRef<ZoneId | null>(null)
  const panel = useRef<HTMLElement>(null)
  const buttons = useRef<Partial<Record<ZoneId, HTMLButtonElement | null>>>({})
  const { canvas, view } = useMapCanvas(true, setHere, focus)

  const close = () => useGame.getState().setPanel(null)
  const highlight = (id: ZoneId | null) => {
    focus.current = id
    setActive(id)
  }

  // Al abrirse, el foco entra en el panel: el tabulador recorre desde ahí las zonas.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
  }, [])

  // Atajos: del 1 al 7, una zona cada uno.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      if (!/^[1-9]$/.test(e.key)) return
      const zone = zones[Number(e.key) - 1]
      if (!zone) return
      e.preventDefault()
      travel(zone)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // El tabulador no sale del panel, y las flechas arriba y abajo recorren las zonas.
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const current = document.activeElement
    if (e.key === ' ') {
      // El espacio es la tecla de salto y el juego anula su efecto: aquí pulsa el botón que tiene el foco
      // (y no llega al juego, que si no saltaría nada más aparecer).
      if (!(current instanceof HTMLButtonElement) || !e.currentTarget.contains(current)) return
      e.preventDefault()
      e.stopPropagation()
      if (!e.repeat) current.click()
    } else if (e.key === 'Tab') {
      const all = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
      if (all.length === 0) return
      const index = all.findIndex((button) => button === current)
      const edge = e.shiftKey ? 0 : all.length - 1
      if (index !== -1 && index !== edge) return
      e.preventDefault()
      all[e.shiftKey ? all.length - 1 : 0].focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = zones.map((zone) => buttons.current[zone.id]).filter((button) => !!button)
      if (list.length === 0) return
      const index = list.findIndex((button) => button === current)
      const step = e.key === 'ArrowDown' ? 1 : -1
      const next = index === -1 ? (step === 1 ? 0 : list.length - 1) : (index + step + list.length) % list.length
      e.preventDefault()
      list[next]?.focus()
    }
  }

  const zoneUnder = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const v = view.current
    return zoneAt(B.minX + (e.clientX - box.left - v.ox) / v.scale, B.minZ + (e.clientY - box.top - v.oy) / v.scale)
  }
  const onChartMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'mouse') return
    const zone = zoneUnder(e)
    e.currentTarget.style.cursor = zone ? 'pointer' : ''
    if ((zone?.id ?? null) !== focus.current) highlight(zone?.id ?? null)
  }
  const onChartLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse') highlight(null)
  }
  const onChartClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const zone = zoneUnder(e)
    if (!zone) {
      armed.current = null
      return
    }
    // Con el dedo las zonas pequeñas son difíciles de acertar: primero se elige y después se viaja.
    const pointer = (e.nativeEvent as PointerEvent).pointerType
    if ((pointer === 'touch' || pointer === 'pen') && armed.current !== zone.id) {
      armed.current = zone.id
      buttons.current[zone.id]?.focus()
      return
    }
    travel(zone)
  }

  return (
    <div
      className="worldmap"
      role="dialog"
      aria-modal="true"
      aria-label={`${t.title}: ${t.subtitle}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <section className="worldmap__panel" ref={panel} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="worldmap__head">
          <h2>
            {t.title} <span>{t.subtitle}</span>
          </h2>
          <p className="worldmap__keys" aria-hidden="true">
            <kbd>1</kbd>–<kbd>{Math.min(9, zones.length)}</kbd>
            <span>{t.keysTravel}</span>
            <kbd>Esc</kbd>
            <span>{t.keysClose}</span>
          </p>
          <button type="button" className="worldmap__close" onClick={close} aria-label={ui.close} title={ui.close}>
            ×
          </button>
        </header>

        <div className="worldmap__body">
          <div className="worldmap__chart">
            <canvas
              ref={canvas}
              role="img"
              aria-label={t.chart}
              onPointerMove={onChartMove}
              onPointerLeave={onChartLeave}
              onClick={onChartClick}
            />
            <ul className="worldmap__legend" aria-hidden="true">
              <li className="is-you">
                <i />
                {t.you}
              </li>
              <li className="is-folk">
                <i />
                {t.folk}
              </li>
              <li className="is-coins">
                <i />
                {t.coins}
              </li>
            </ul>
          </div>

          <ol className="worldmap__zones" aria-label={t.zones}>
            {zones.map((zone, i) => {
              const name = zone.name[lang]
              const progress = progressOf(zone.id)
              const isHere = zone.id === here
              const done = progress !== null && progress.total > 0 && progress.done >= progress.total
              const count = progress ? `${progress.done}/${progress.total}` : ''
              const label = [
                t.travel(name),
                zone.hint[lang],
                progress ? `${count} ${progress.label[lang]}` : '',
                isHere ? t.here : '',
                i < 9 ? t.shortcut(i + 1) : '',
              ]
                .filter(Boolean)
                .join('. ')
              return (
                <li key={zone.id}>
                  <button
                    type="button"
                    ref={(el) => {
                      buttons.current[zone.id] = el
                    }}
                    className={`worldmap__zone${isHere ? ' is-here' : ''}${zone.id === active ? ' is-active' : ''}`}
                    style={
                      {
                        '--accent': zone.color,
                        '--done': progress && progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0,
                      } as React.CSSProperties
                    }
                    onClick={() => travel(zone)}
                    onFocus={() => highlight(zone.id)}
                    onBlur={() => highlight(null)}
                    onPointerEnter={() => highlight(zone.id)}
                    onPointerLeave={() => highlight(null)}
                    aria-label={label}
                    aria-current={isHere ? 'location' : undefined}
                  >
                    <kbd>{i + 1}</kbd>
                    <strong>
                      {name}
                      {isHere && <em>{t.here}</em>}
                    </strong>
                    {progress && (
                      <span className={`worldmap__progress${done ? ' is-done' : ''}`}>
                        <b>{count}</b>
                        <i>{progress.label[lang]}</i>
                      </span>
                    )}
                    <small>{zone.hint[lang]}</small>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>

        {racing && <p className="worldmap__note">{t.note}</p>}
      </section>
    </div>
  )
}

/**
 * Mapa con viaje rápido. Mientras se juega y no hay ningún panel abierto, el
 * mapa pequeño (solo con ratón y pantalla ancha); con `panel === 'map'`, el grande.
 */
export function Minimap() {
  const playing = useGame((s) => s.mode === 'play')
  const panel = useGame((s) => s.panel)
  const roomy = useMedia(ROOMY)
  if (panel === 'map') return <WorldMap />
  return playing && panel === null && roomy ? <MiniMap /> : null
}
