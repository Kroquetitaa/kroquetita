import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import type { Localized } from '../data/career'
import { sfx } from '../game/audio'
import { playerSay } from '../game/events'
import { HALF } from '../game/physics'
import { body, shake } from '../game/state'
import { tr, useLang } from '../i18n'
import { useGame, type Smashable } from '../store'
import { world, type AABB } from '../world/layout'
import { Detail } from './Detail'
import { introProgress } from './intro'
import { createNeonMaterial, uTime } from './materials/shaders'

/**
 * Sala de romper: a la derecha del todo, un recinto con siete cosas de lo
 * aprendido hechas para romperse, cada una a su manera:
 *
 *  - la torre de tests unitarios se embiste corriendo;
 *  - a la red neuronal se le salta a un nodo y hace «dropout» en cadena;
 *  - la campana de Gauss se aplasta pisándole la cima;
 *  - a los dados se les dan patadas hasta que revientan en sus puntos;
 *  - al grafo se le salta a un vértice y se le caen todos como fruta;
 *  - la pila de pull requests se pisa y acaba en conflicto de merge;
 *  - el monolito de código heredado aguanta tres golpes y se desmorona.
 *
 * Todas se recomponen solas al rato, rebobinando. La física de las piezas es
 * propia y mínima (`Pieces`); la colisión de lo que está roto se anula
 * mutando su caja de `world.colliders`, y se restaura al recomponerlo.
 *
 * En la capa normal (reflejo y sombras) solo van la carpintería, la torre y el
 * monolito; todo lo demás va dentro de <Detail>. No hay ni una luz, y cada
 * clase de pieza es una única malla instanciada.
 */

type Vec3 = [number, number, number]
interface Box {
  center: Vec3
  size: Vec3
}
type Phase = 'whole' | 'broken' | 'rewind'

const ARCADE = world.props.arcade
const [OX, , OZ] = ARCADE.origin
const AREA = ARCADE.area

/** Segundos que tarda en volver cada cosa a su sitio al recomponerse */
const REWIND = 1.3
/** Velocidad horizontal a partir de la cual un choque cuenta como embestida (andar son 3,2; correr, 5,6) */
const RAM_SPEED = 4
/** Lo que puede asomar el jugador por el borde de algo y aun así pisarlo */
const STOMP_REACH = 0.2
/** Impulso hacia arriba que se lleva el jugador al pisar algo */
const BOUNCE = 8

// ---------------------------------------------------------------- Textos

const TEXTS = {
  room: { es: 'SALA DE ROMPER', en: 'BREAK ROOM' },
  score: { es: 'COSAS ROTAS', en: 'THINGS BROKEN' },
  tests: { es: 'TORRE DE TESTS UNITARIOS', en: 'TOWER OF UNIT TESTS' },
  network: { es: 'RED NEURONAL', en: 'NEURAL NETWORK' },
  gauss: { es: 'DISTRIBUCIÓN NORMAL', en: 'NORMAL DISTRIBUTION' },
  outliers: { es: 'YA NO TAN NORMAL', en: 'NOT SO NORMAL NOW' },
  dice: { es: 'PROBABILIDAD', en: 'PROBABILITY' },
  graph: { es: 'MATEMÁTICA DISCRETA', en: 'DISCRETE MATHS' },
  connected: { es: 'CONEXO', en: 'CONNECTED' },
  disconnected: { es: 'NO CONEXO', en: 'DISCONNECTED' },
  prs: { es: 'PULL REQUESTS', en: 'PULL REQUESTS' },
  legacy: { es: 'CÓDIGO HEREDADO · NO TOCAR', en: 'LEGACY CODE · DO NOT TOUCH' },
  todo: { es: 'TODO: arreglar esto', en: 'TODO: fix this' },
  why: { es: '// no sé por qué funciona', en: '// no idea why this works' },
} satisfies Record<string, Localized>

/** Lo que suelta el jugador al romper cada cosa */
const QUIPS: Record<Smashable, Localized> = {
  tests: { es: 'Los tests no fallan si no hay tests.', en: 'Tests cannot fail if there are no tests.' },
  network: { es: 'Regularización, lo llaman.', en: 'They call it regularisation.' },
  gauss: { es: 'Ya no es normal. Es muy poco normal.', en: 'Not normal any more. Very not normal.' },
  dice: { es: 'P(romperlo) = 1.', en: 'P(breaking it) = 1.' },
  graph: { es: 'Antes era un árbol. Ahora es un bosque.', en: 'It was a tree. Now it is a forest.' },
  prs: { es: 'Aprobado sin leer.', en: 'Approved without reading.' },
  legacy: { es: 'Funcionaba. Nadie sabía por qué.', en: 'It worked. Nobody knew why.' },
}

// Los colores de los textos van como THREE.Color: troika ignora los arrays.
const WHITE = new THREE.Color(1, 1, 1)
const INK_SIGN = new THREE.Color(2.9, 0.55, 1.15)
const INK_SCORE = new THREE.Color(3.1, 1.5, 1.9)
const INK_LABEL = new THREE.Color(1.75, 1.8, 2.05)
const INK_OK = new THREE.Color(0.5, 2.6, 1.1)
const INK_BAD = new THREE.Color(3.2, 0.4, 0.35)
const INK_WARN = new THREE.Color(3, 1.7, 0.35)
const INK_ROLL = new THREE.Color(2.8, 2.5, 1.2)

// ---------------------------------------------------------------- Materiales

const STEEL = new THREE.MeshStandardMaterial({ color: '#17161c', roughness: 0.55, metalness: 0.5 })
/** Piezas emisivas con el sombreado en los vértices y el color en la instancia (HDR: las recoge el bloom) */
const LIT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
const NEON = createNeonMaterial('#ff3d7f', 1.3)

/**
 * Arista luminosa para mallas instanciadas (las sinapsis de la red y las
 * aristas del grafo): por cada una corre un impulso, de un extremo al otro.
 */
function createWireMaterial(color: string, intensity: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        vUv = uv;
        vPhase = 0.0;
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          // Cada arista lleva su impulso a destiempo: la fase sale de dónde está.
          vPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].y * 0.61;
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        float sweep = fract(vUv.x - uTime * 0.55 + vPhase);
        float pulse = smoothstep(0.0, 0.08, sweep) * smoothstep(0.3, 0.08, sweep);
        gl_FragColor = vec4(uColor * uIntensity + vec3(1.0) * pulse * 1.4, 1.0);
      }
    `,
    toneMapped: false,
  })
}
const SYNAPSE = createWireMaterial('#4cc3ff', 1.05)
const BRANCH = createWireMaterial('#57f29a', 1)

// ---------------------------------------------------------------- Utilidades

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const smooth = (t: number) => t * t * (3 - 2 * t)
const between = (a: number, b: number) => a + Math.random() * (b - a)

/** Aleatorio determinista: lo que se construye sale idéntico en cada carga. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

/** Del mundo a coordenadas de la sala (el grupo raíz está en su origen). */
const local = (p: Vec3): Vec3 => [p[0] - OX, p[1], p[2] - OZ]

/** Cada conjunto crece desde el suelo con su propio retardo. */
function appear(group: THREE.Object3D | null, delay: number, duration = 1) {
  if (group) group.scale.setScalar(Math.max(0.001, introProgress(delay, duration)))
}

/** Caja ya colocada (y girada), lista para fundirse con otras. */
function slab(size: Vec3, at: Vec3, rotation?: Vec3) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2])
  if (rotation) {
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2])))
  }
  return g.translate(at[0], at[1], at[2])
}

/** Gira una pieza alrededor del eje Y y la lleva a su sitio. */
function place<T extends THREE.BufferGeometry>(g: T, at: Vec3, yaw: number) {
  g.rotateY(yaw)
  g.translate(at[0], at[1], at[2])
  return g
}

/** Da a toda la pieza un color por vértice. */
function paint<T extends THREE.BufferGeometry>(g: T, color: Vec3) {
  const count = g.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set(color, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

/** Funde varias piezas en una sola geometría: todo lo estático en un único dibujado. */
function fuse(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return merged
}

/** Tono fijo de cada cara de una caja (+X, −X, +Y, −Y, +Z, −Z): lo que no recibe luz se sombrea así */
const TONES = [0.72, 0.6, 1.15, 0.4, 1, 0.5]

/** Cubo unidad con un tono por cara, para lo que va con material básico. */
function shadedBox() {
  const g = new THREE.BoxGeometry(1, 1, 1)
  const count = g.attributes.position.count
  const colors = new Float32Array(count * 3)
  // BoxGeometry da cuatro vértices por cara, en ese orden.
  for (let i = 0; i < count; i++) colors.fill(TONES[Math.floor(i / 4)], i * 3, i * 3 + 3)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

/** Bola de diámetro 1, más clara por arriba que por abajo (sombreado fijo). */
function shadedBall() {
  const g = new THREE.SphereGeometry(0.5, 12, 8)
  const normal = g.attributes.normal
  const colors = new Float32Array(normal.count * 3)
  for (let i = 0; i < normal.count; i++) colors.fill(0.72 + 0.34 * normal.getY(i), i * 3, i * 3 + 3)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

const BOX = shadedBox()
const BALL = shadedBall()

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

const MONO = 'ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace'
const SANS = 'Poppins, "Segoe UI", system-ui, sans-serif'

/** Lienzo de 1024 de lado partido en celdas iguales; cada una se pinta por separado (y recortada). */
const ATLAS = 1024
function atlasTexture(
  columns: number,
  rows: number,
  draw: (ctx: CanvasRenderingContext2D, column: number, row: number, width: number, height: number) => void,
) {
  const width = ATLAS / columns
  const height = ATLAS / rows
  return canvasTexture(ATLAS, ATLAS, (ctx) => {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        ctx.save()
        ctx.translate(column * width, row * height)
        ctx.beginPath()
        ctx.rect(0, 0, width, height)
        ctx.clip()
        draw(ctx, column, row, width, height)
        ctx.restore()
      }
    }
  })
}

/** Zona de la celda del atlas que enseña una cara (u0, v0, u1, v1), o null si va lisa */
type Region = [number, number, number, number] | null

/**
 * Cubo unidad para piezas con rótulo: cada cara lleva su tono y la zona de la
 * celda que enseña. Qué celda es la decide cada instancia (atributo `aCell`).
 * Caras en el orden de BoxGeometry: +X, −X, +Y, −Y, +Z, −Z.
 */
function labelBox(regions: Region[], count: number) {
  const g = new THREE.BoxGeometry(1, 1, 1)
  const uv = g.attributes.uv
  const tone = new Float32Array(uv.count)
  const label = new Float32Array(uv.count)
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4)
    tone[i] = TONES[face]
    const region = regions[face]
    if (!region) continue
    label[i] = 1
    uv.setXY(
      i,
      region[0] + uv.getX(i) * (region[2] - region[0]),
      region[1] + uv.getY(i) * (region[3] - region[1]),
    )
  }
  g.setAttribute('aTone', new THREE.BufferAttribute(tone, 1))
  g.setAttribute('aLabel', new THREE.BufferAttribute(label, 1))
  const cells = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2)
  cells.setUsage(THREE.DynamicDrawUsage)
  g.setAttribute('aCell', cells)
  return { geometry: g, cells }
}

/**
 * Material sin luz para piezas instanciadas con rótulo: el color de la
 * instancia (por el tono de la cara) y, encima, la tinta de su celda del atlas.
 */
function createAtlasMaterial(map: THREE.Texture, columns: number, rows: number, ink: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uGrid: { value: new THREE.Vector2(columns, rows) },
      uInk: { value: ink },
    },
    vertexShader: /* glsl */ `
      uniform vec2 uGrid;
      attribute vec2 aCell;
      attribute float aTone;
      attribute float aLabel;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vLabel;
      void main() {
        vUv = (uv + aCell) / uGrid;
        vLabel = aLabel;
        vColor = vec3(aTone);
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING_COLOR
          vColor *= instanceColor;
        #endif
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uInk;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vLabel;
      void main() {
        vec4 ink = texture2D(uMap, vUv);
        gl_FragColor = vec4(mix(vColor, ink.rgb * uInk, ink.a * vLabel), 1.0);
      }
    `,
    toneMapped: false,
  })
}

/** Deja escritas las matrices y los colores de una malla instanciada. */
function commit(mesh: THREE.InstancedMesh | null) {
  if (!mesh) return
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

/**
 * Esfera de recorte de una malla instanciada: ajustada a su sitio mientras
 * está entera y, con las piezas por los aires, la sala entera.
 */
function bound(mesh: THREE.InstancedMesh | null, sphere: THREE.Sphere) {
  if (mesh) mesh.boundingSphere = sphere
}
const around = (x: number, y: number, z: number, radius: number) =>
  new THREE.Sphere(new THREE.Vector3(x, y, z), radius)
const ROOM_SPHERE = around((AREA.minX + AREA.maxX) / 2 - OX, 2, (AREA.minZ + AREA.maxZ) / 2 - OZ, 16)

// ---------------------------------------------------------------- Colisiones y jugador

/** Anula una colisión (la manda, vacía, lejos y bajo el suelo) o la devuelve a su caja. */
function setSolid(collider: AABB, box: Box | null) {
  if (!box) {
    collider.min[0] = collider.max[0] = 0
    collider.min[1] = collider.max[1] = -50
    collider.min[2] = collider.max[2] = -400
    return
  }
  for (let axis = 0; axis < 3; axis++) {
    collider.min[axis] = box.center[axis] - box.size[axis] / 2
    collider.max[axis] = box.center[axis] + box.size[axis] / 2
  }
}

/**
 * Lo que se sabe del jugador en este fotograma, en coordenadas de la sala. Se
 * calcula una vez y lo leen todas las cosas. La velocidad horizontal es la
 * punta de los últimos instantes: al chocar, la física la pone a cero, y lo
 * que cuenta es con cuánta se llegó.
 */
const probe = {
  stamp: -1,
  dt: 1 / 60,
  playing: false,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  grounded: true,
  speed: 0,
  dirX: 0,
  dirZ: 1,
  hold: 0,
  /** Cómo estaba en el fotograma anterior */
  wasGrounded: true,
  wasVy: 0,
}
type Probe = typeof probe

function sense(stamp: number, delta: number): Probe {
  const p = probe
  if (p.stamp === stamp) return p
  p.stamp = stamp
  p.dt = Math.min(delta, 1 / 20)
  p.wasGrounded = p.grounded
  p.wasVy = p.vy
  p.playing = useGame.getState().mode === 'play'
  p.x = body.pos[0] - OX
  p.y = body.pos[1]
  p.z = body.pos[2] - OZ
  p.vy = body.vel[1]
  p.grounded = body.grounded
  const speed = Math.hypot(body.vel[0], body.vel[2])
  p.hold -= p.dt
  if (speed >= p.speed * 0.9 || p.hold <= 0) {
    p.speed = speed
    p.hold = 0.14
    if (speed > 0.3) {
      p.dirX = body.vel[0] / speed
      p.dirZ = body.vel[2] / speed
    }
  }
  return p
}

/** ¿Embiste esa caja (centro, semiejes y altura)? Con velocidad, pegado a un lado y yendo hacia ella. */
function rams(p: Probe, cx: number, cz: number, hx: number, hz: number, top: number, speed = RAM_SPEED) {
  if (p.speed < speed || p.y > top - 0.25) return false
  const dx = cx - p.x
  const dz = cz - p.z
  const gapX = Math.abs(dx) - hx
  const gapZ = Math.abs(dz) - hz
  const reach = HALF + 0.14
  if (gapX > reach || gapZ > reach) return false
  // Manda la cara que tiene más cerca: hay que ir hacia ella, no rozarla de lado.
  return gapX > gapZ ? p.dirX * Math.sign(dx) > 0.35 : p.dirZ * Math.sign(dz) > 0.35
}

/** ¿Cae sobre la tapa de esa caja? */
function stomps(p: Probe, cx: number, cz: number, hx: number, hz: number, top: number) {
  if (Math.abs(p.x - cx) > hx + STOMP_REACH || Math.abs(p.z - cz) > hz + STOMP_REACH) return false
  // A punto de posarse (se mira un fotograma por delante: en una caída rápida la cruzaría entera)…
  if (p.vy < -0.5 && p.y >= top - 0.06 && p.y + p.vy * p.dt * 1.6 <= top + 0.02) return true
  // …o recién posado.
  return p.grounded && !p.wasGrounded && p.wasVy < -0.5 && Math.abs(p.y - top) < 0.08
}

/** ¿Toca el cuerpo del jugador esa bola? */
function touches(p: Probe, x: number, y: number, z: number, radius: number) {
  const dx = p.x - x
  const dz = p.z - z
  const dy = y - Math.min(p.y + 0.8, Math.max(p.y + 0.1, y))
  const reach = radius + 0.28
  return dx * dx + dy * dy + dz * dz < reach * reach
}

/** ¿Está el jugador fuera de esa caja? (para no recomponerla con él dentro) */
function away(p: Probe, cx: number, cz: number, hx: number, hz: number) {
  return Math.abs(p.x - cx) > hx + HALF + 0.15 || Math.abs(p.z - cz) > hz + HALF + 0.15
}

/** El jugador rebota hacia arriba, como al pisar un bicho. */
function bounce(power = BOUNCE) {
  body.vel[1] = power
  body.grounded = false
  body.ballistic = 0
}

const told = new Set<Smashable>()

/** Algo se ha roto: se apunta y, la primera vez (y alguna más), el jugador lo comenta. */
function report(id: Smashable) {
  useGame.getState().smash(id)
  if (!told.has(id) || Math.random() < 0.3) playerSay(tr(QUIPS[id]))
  told.add(id)
}

let lastThud = 0

/** Golpe sordo de una pieza contra el suelo; como mucho, uno cada décima de segundo. */
function thud() {
  const now = performance.now()
  if (now - lastThud < 110) return
  lastThud = now
  sfx.land()
}

// ---------------------------------------------------------------- Piezas sueltas

const GRAVITY = 16
/** Por debajo de esta velocidad de caída una pieza ya no rebota: se tumba */
const SETTLE_SPEED = 2.2
/** Estados de una pieza: en su sitio, volando, tumbándose y quieta en el suelo */
const HELD = 0
const FLYING = 1
const SETTLING = 2
const ASLEEP = 3

const UP = new THREE.Vector3(0, 1, 0)
const AXES = [new THREE.Vector3(1, 0, 0), UP, new THREE.Vector3(0, 0, 1)]
const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _v = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _r = new THREE.Quaternion()
const _color = new THREE.Color()
const _box: Box = { center: [0, 0, 0], size: [0, 0, 0] }

interface Walls {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** Las piezas no salen del recinto: rebotan en la valla */
const ROOM: Walls = {
  minX: AREA.minX - OX + 0.4,
  maxX: AREA.maxX - OX - 0.4,
  minZ: AREA.minZ - OZ + 0.4,
  maxZ: AREA.maxZ - OZ - 0.4,
}

interface PieceOptions {
  /** Cómo se queda al pararse: sobre la cara más cercana, solo sobre las de arriba y abajo, o tal cual (bolas) */
  tumble?: 'any' | 'y' | 'none'
  /** Además, encarada: el giro alrededor de la vertical se redondea al cuarto de vuelta */
  square?: boolean
  bounce?: number
  /** Freno del aire y gravedad propia (los papeles caen despacio) */
  drag?: number
  gravity?: number
  walls?: Walls
}

interface PieceHooks {
  /** La pieza se suelta (pasado su retardo) */
  release?: (index: number) => void
  /** Toca el suelo, con qué velocidad de caída */
  land?: (index: number, impact: number) => void
  /** Se queda quieta */
  sleep?: (index: number) => void
}

/**
 * Física mínima para las piezas de algo que se rompe: posición, velocidad y
 * giro de cada una, gravedad, rebote amortiguado contra el suelo y, al perder
 * fuelle, se tumban sobre una cara y se duermen. También saben volver a su
 * sitio (`rewind`). Las cajas se dan por sus semiejes; las bolas, por su radio.
 */
class Pieces {
  readonly count: number
  readonly pos: Float32Array
  readonly vel: Float32Array
  readonly quat: Float32Array
  readonly half: Float32Array
  /** Escala visual de cada pieza (1 = su tamaño) */
  readonly size: Float32Array
  /** Altura del suelo para cada pieza (por si se apilan) */
  readonly ground: Float32Array
  readonly state: Uint8Array
  readonly homePos: Float32Array
  readonly homeQuat: Float32Array
  private readonly options: PieceOptions
  private readonly axis: Float32Array
  private readonly spin: Float32Array
  private readonly wait: Float32Array
  private readonly pending: Uint8Array
  private readonly goal: Float32Array
  private readonly rest: Float32Array
  private readonly calm: Float32Array
  private readonly fromPos: Float32Array
  private readonly fromQuat: Float32Array

  constructor(count: number, options: PieceOptions = {}) {
    this.count = count
    this.options = options
    this.pos = new Float32Array(count * 3)
    this.vel = new Float32Array(count * 3)
    this.quat = new Float32Array(count * 4)
    this.half = new Float32Array(count * 3)
    this.size = new Float32Array(count).fill(1)
    this.ground = new Float32Array(count)
    this.state = new Uint8Array(count)
    this.homePos = new Float32Array(count * 3)
    this.homeQuat = new Float32Array(count * 4)
    this.axis = new Float32Array(count * 3)
    this.spin = new Float32Array(count)
    this.wait = new Float32Array(count)
    this.pending = new Uint8Array(count)
    this.goal = new Float32Array(count * 4)
    this.rest = new Float32Array(count)
    this.calm = new Float32Array(count)
    this.fromPos = new Float32Array(count * 3)
    this.fromQuat = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) this.quat[i * 4 + 3] = this.homeQuat[i * 4 + 3] = 1
  }

  /** Fija dónde va montada una pieza (y la deja ahí). */
  home(i: number, x: number, y: number, z: number, hx: number, hy: number, hz: number, q?: THREE.Quaternion) {
    const a = i * 3
    this.homePos[a] = x
    this.homePos[a + 1] = y
    this.homePos[a + 2] = z
    this.half[a] = hx
    this.half[a + 1] = hy
    this.half[a + 2] = hz
    if (q) q.toArray(this.homeQuat, i * 4)
    this.reset(i)
  }

  /** Devuelve una pieza a su sitio, quieta. */
  reset(i: number) {
    const a = i * 3
    const b = i * 4
    for (let k = 0; k < 3; k++) {
      this.pos[a + k] = this.homePos[a + k]
      this.vel[a + k] = 0
    }
    for (let k = 0; k < 4; k++) this.quat[b + k] = this.homeQuat[b + k]
    this.state[i] = HELD
    this.pending[i] = 0
  }

  /** Suelta una pieza desde donde esté: echa a volar pasados `delay` segundos. */
  launch(i: number, vx: number, vy: number, vz: number, spin = 0, delay = 0, axis?: THREE.Vector3) {
    const a = i * 3
    this.vel[a] = vx
    this.vel[a + 1] = vy
    this.vel[a + 2] = vz
    this.spin[i] = spin
    if (!axis) axis = _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
    axis.toArray(this.axis, a)
    this.wait[i] = delay
    this.pending[i] = 1
    this.state[i] = FLYING
  }

  /** ¿Está esa pieza quieta (en su sitio o dormida en el suelo)? */
  still(i: number) {
    return this.state[i] === HELD || this.state[i] === ASLEEP
  }

  /** Avanza la simulación. Devuelve si queda algo moviéndose (o por soltarse). */
  step(dt: number, hooks?: PieceHooks) {
    const { pos, vel, quat, half, state, ground } = this
    const { tumble = 'any', bounce: restitution = 0.4, drag = 0, gravity = GRAVITY, walls } = this.options
    let busy = false
    for (let i = 0; i < this.count; i++) {
      const mode = state[i]
      if (mode !== FLYING && mode !== SETTLING) continue
      busy = true
      const a = i * 3
      const b = i * 4
      if (this.pending[i]) {
        this.wait[i] -= dt
        if (this.wait[i] > 0) continue
        this.pending[i] = 0
        hooks?.release?.(i)
      }
      if (mode === FLYING) {
        vel[a + 1] -= gravity * dt
        if (drag > 0) {
          const slow = Math.exp(-drag * dt)
          vel[a] *= slow
          vel[a + 1] *= slow
          vel[a + 2] *= slow
        }
        pos[a] += vel[a] * dt
        pos[a + 1] += vel[a + 1] * dt
        pos[a + 2] += vel[a + 2] * dt
        if (this.spin[i] !== 0) {
          _r.setFromAxisAngle(_v.set(this.axis[a], this.axis[a + 1], this.axis[a + 2]), this.spin[i] * dt)
          _q.fromArray(quat, b).premultiply(_r).normalize().toArray(quat, b)
        }
        // Dando vueltas toca el suelo antes que tumbada: se le da un radio intermedio.
        const least = Math.min(half[a], half[a + 1], half[a + 2])
        const most = Math.max(half[a], half[a + 1], half[a + 2])
        const floor = ground[i] + (this.spin[i] === 0 ? half[a + 1] : least + (most - least) * 0.3)
        if (pos[a + 1] < floor && vel[a + 1] < 0) {
          pos[a + 1] = floor
          const impact = -vel[a + 1]
          hooks?.land?.(i, impact)
          if (impact < SETTLE_SPEED) {
            state[i] = SETTLING
            this.settle(i, tumble)
          } else {
            vel[a + 1] = impact * restitution
            vel[a] *= 0.72
            vel[a + 2] *= 0.72
            this.spin[i] *= 0.6
          }
        }
      } else {
        // Se tumba sobre la cara elegida mientras termina de frenar.
        const k = 1 - Math.exp(-14 * dt)
        _q.fromArray(quat, b).slerp(_r.fromArray(this.goal, b), k).toArray(quat, b)
        pos[a + 1] += (this.rest[i] - pos[a + 1]) * k
        const slow = Math.exp(-6 * dt)
        vel[a] *= slow
        vel[a + 2] *= slow
        pos[a] += vel[a] * dt
        pos[a + 2] += vel[a + 2] * dt
        this.calm[i] += dt
        if (this.calm[i] > 0.4) {
          for (let k4 = 0; k4 < 4; k4++) quat[b + k4] = this.goal[b + k4]
          pos[a + 1] = this.rest[i]
          state[i] = ASLEEP
          hooks?.sleep?.(i)
        }
      }
      if (walls) {
        if (pos[a] < walls.minX) {
          pos[a] = walls.minX
          vel[a] = Math.abs(vel[a]) * 0.5
        } else if (pos[a] > walls.maxX) {
          pos[a] = walls.maxX
          vel[a] = -Math.abs(vel[a]) * 0.5
        }
        if (pos[a + 2] < walls.minZ) {
          pos[a + 2] = walls.minZ
          vel[a + 2] = Math.abs(vel[a + 2]) * 0.5
        } else if (pos[a + 2] > walls.maxZ) {
          pos[a + 2] = walls.maxZ
          vel[a + 2] = -Math.abs(vel[a + 2]) * 0.5
        }
      }
    }
    return busy
  }

  /** Decide cómo va a quedarse una pieza que ya no rebota. */
  private settle(i: number, tumble: 'any' | 'y' | 'none') {
    const a = i * 3
    const b = i * 4
    this.calm[i] = 0
    _q.fromArray(this.quat, b)
    if (tumble === 'none') {
      _q.toArray(this.goal, b)
      this.rest[i] = this.ground[i] + this.half[a]
      return
    }
    // El eje propio que más mira hacia arriba (o hacia abajo) acaba vertical, con el giro mínimo.
    let best = 1
    let sign = 1
    let most = -1
    for (let k = 0; k < 3; k++) {
      if (tumble === 'y' && k !== 1) continue
      const y = _v.copy(AXES[k]).applyQuaternion(_q).y
      if (Math.abs(y) > most) {
        most = Math.abs(y)
        best = k
        sign = y < 0 ? -1 : 1
      }
    }
    _v.copy(AXES[best]).applyQuaternion(_q).multiplyScalar(sign)
    _r.setFromUnitVectors(_v, UP).multiply(_q)
    if (this.options.square) {
      _v.copy(AXES[(best + 1) % 3]).applyQuaternion(_r)
      const yaw = Math.atan2(_v.x, _v.z)
      _r.premultiply(_q.setFromAxisAngle(UP, Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2) - yaw))
    }
    _r.normalize().toArray(this.goal, b)
    this.rest[i] = this.ground[i] + this.half[a + best]
  }

  /** Empieza la vuelta: cada pieza recuerda dónde ha quedado. */
  beginRewind() {
    this.fromPos.set(this.pos)
    this.fromQuat.set(this.quat)
    this.state.fill(HELD)
    this.pending.fill(0)
  }

  /** Coloca cada pieza en su vuelo de vuelta (k de 0 a 1): salen escalonadas y en arco. */
  rewind(k: number, lift = 1) {
    const stagger = 0.4
    const last = Math.max(1, this.count - 1)
    for (let i = 0; i < this.count; i++) {
      const a = i * 3
      const b = i * 4
      const e = smooth(clamp01((k - (stagger * i) / last) / (1 - stagger)))
      for (let axis = 0; axis < 3; axis++) {
        this.pos[a + axis] = this.fromPos[a + axis] + (this.homePos[a + axis] - this.fromPos[a + axis]) * e
      }
      this.pos[a + 1] += Math.sin(Math.PI * e) * lift
      _q.fromArray(this.fromQuat, b).slerp(_r.fromArray(this.homeQuat, b), e).toArray(this.quat, b)
    }
  }

  /** Todas en su sitio. */
  endRewind() {
    for (let i = 0; i < this.count; i++) this.reset(i)
  }

  /** Vuelca las piezas en una malla instanciada (cubo o bola unidad). */
  write(mesh: THREE.InstancedMesh | null, first = 0) {
    if (!mesh) return
    const { pos, quat, half } = this
    for (let i = 0; i < this.count; i++) {
      const a = i * 3
      const scale = Math.max(1e-4, this.size[i]) * 2
      _m.compose(
        _p.fromArray(pos, a),
        _q.fromArray(quat, i * 4),
        _s.set(half[a] * scale, half[a + 1] * scale, half[a + 2] * scale),
      )
      mesh.setMatrixAt(first + i, _m)
    }
    mesh.instanceMatrix.needsUpdate = true
  }
}

/** Recorrido en anchura de un grafo desde un nodo: a qué paso se llega a cada uno. */
function spread(count: number, edges: Array<[number, number]>, from: number) {
  const step = new Array<number>(count).fill(-1)
  const queue = [from]
  step[from] = 0
  let reached = 1
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]
    for (const [a, b] of edges) {
      const other = a === node ? b : b === node ? a : -1
      if (other < 0 || step[other] >= 0) continue
      step[other] = reached++
      queue.push(other)
    }
  }
  return step
}

// ---------------------------------------------------------------- Rótulos de pie

/** Cuerpo de letra, altura e inclinación (hacia la cámara) de los rótulos */
const LABEL_SIZE = 0.15
const PLAQUE_Y = 0.74
const PLAQUE_TILT = 0.35
const plaqueWidth = (...texts: Localized[]) =>
  Math.max(...texts.flatMap((text) => [text.es.length, text.en.length])) * LABEL_SIZE * 0.72 + 0.3

const TESTS = ARCADE.tests
const NET = ARCADE.network
const BELL = ARCADE.gauss
const DICE = ARCADE.dice
const GRAPH = ARCADE.graph
const PRS = ARCADE.prs
const LEGACY = ARCADE.legacy

/** Dónde va el rótulo de cada cosa (delante de ella, en coordenadas de la sala) y cuánto mide */
const PLAQUES: Record<Smashable, { at: Vec3; width: number }> = {
  tests: { at: local([TESTS.center[0], 0, TESTS.center[2] + 1.55]), width: plaqueWidth(TEXTS.tests) },
  network: { at: local([NET.center[0], 0, NET.center[2] + 1.1]), width: plaqueWidth(TEXTS.network) },
  gauss: {
    at: local([BELL.center[0], 0, BELL.center[2] + 1.6]),
    width: plaqueWidth(TEXTS.gauss, TEXTS.outliers),
  },
  dice: {
    at: local([(DICE.pen.minX + DICE.pen.maxX) / 2, 0, DICE.pen.maxZ + 0.3]),
    width: plaqueWidth(TEXTS.dice),
  },
  graph: { at: local([GRAPH.center[0], 0, GRAPH.center[2] + 1.7]), width: plaqueWidth(TEXTS.graph) },
  prs: { at: local([PRS.center[0], 0, PRS.center[2] + 1.75]), width: plaqueWidth(TEXTS.prs) },
  legacy: { at: local([LEGACY.center[0], 0, LEGACY.center[2] + 2.05]), width: plaqueWidth(TEXTS.legacy) },
}

/** El texto de un rótulo de pie (el tablero va fundido con la carpintería de la sala). */
function Label({ id, text, color = INK_LABEL }: { id: Smashable; text: string; color?: THREE.Color }) {
  const [x, , z] = PLAQUES[id].at
  return (
    <Text
      font={fontBold}
      fontSize={LABEL_SIZE}
      position={[x, PLAQUE_Y + 0.012, z + 0.034]}
      rotation-x={-PLAQUE_TILT}
      color={color}
      anchorX="center"
      anchorY="middle"
      whiteSpace="nowrap"
      material-toneMapped={false}
    >
      {text}
    </Text>
  )
}

// ---------------------------------------------------------------- 1. Torre de tests unitarios

const [TESTS_X, , TESTS_Z] = local(TESTS.center)
const TEST_TOP = TESTS.size[1]
const TEST_LAYERS = 7
const TEST_COUNT = TEST_LAYERS * 2
/** Largo, alto y fondo de un bloque: dos por piso, y cada piso cruzado con el de abajo */
const BLOCK: Vec3 = [TESTS.size[0], TEST_TOP / TEST_LAYERS, 0.68]
const TEST_NAMES = [
  "it('works')",
  "it('draws')",
  "it('adds')",
  "it('is fast')",
  "it('no NaN')",
  "it('logs in')",
  "it('ships')",
]
const TEST_PASS = new THREE.Color(0.05, 0.4, 0.2)
const TEST_FAIL = new THREE.Color(0.5, 0.06, 0.08)
/** Zonas de la celda: la cara larga (marca y nombre) y la testa (solo la marca) */
const TEST_LONG: Region = [0.02, 0.05, 0.665, 0.95]
const TEST_END: Region = [0.68, 0.05, 0.9925, 0.95]

/** ✓ o ✗ a trazos (no depende de que la fuente tenga el signo). */
function drawMark(ctx: CanvasRenderingContext2D, pass: boolean, x: number, y: number, r: number) {
  ctx.lineWidth = r * 0.36
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = pass ? '#8dffb8' : '#ff9d9d'
  ctx.beginPath()
  if (pass) {
    ctx.moveTo(x - r * 0.8, y + r * 0.05)
    ctx.lineTo(x - r * 0.2, y + r * 0.65)
    ctx.lineTo(x + r * 0.85, y - r * 0.7)
  } else {
    ctx.moveTo(x - r * 0.7, y - r * 0.7)
    ctx.lineTo(x + r * 0.7, y + r * 0.7)
    ctx.moveTo(x + r * 0.7, y - r * 0.7)
    ctx.lineTo(x - r * 0.7, y + r * 0.7)
  }
  ctx.stroke()
}

/** Atlas de los bloques: una fila por test; a la izquierda, pasando (✓) y a la derecha, fallando (✗). */
const testAtlas = () =>
  atlasTexture(2, TEST_NAMES.length, (ctx, column, row, width, height) => {
    const pass = column === 0
    drawMark(ctx, pass, 62, height / 2, 36)
    ctx.font = `600 34px ${MONO}`
    ctx.textBaseline = 'middle'
    ctx.fillStyle = pass ? '#eafff2' : '#ffe6e6'
    ctx.fillText(TEST_NAMES[row], 118, height / 2 + 2, 214)
    drawMark(ctx, pass, width * 0.836, height / 2, 46)
  })

/**
 * Torre de tests unitarios: catorce bloques apilados de dos en dos, como un
 * Jenga, todos en verde. Se embiste corriendo: vuelca hacia donde ibas y los
 * tests pasan a rojo. Al rato se recompone y vuelven a pasar.
 */
function Tests() {
  const lang = useLang()
  const mesh = useRef<THREE.InstancedMesh>(null)
  const state = useRef({ phase: 'whole' as Phase, time: 0, moving: false })

  const { pieces, geometry, cells, material, tight, hooks, axis } = useMemo(() => {
    const pieces = new Pieces(TEST_COUNT, { tumble: 'any', bounce: 0.36, walls: ROOM })
    const rand = rng(404)
    const q = new THREE.Quaternion()
    for (let i = 0; i < TEST_COUNT; i++) {
      const layer = Math.floor(i / 2)
      const turned = layer % 2 === 1
      const offset = ((i % 2 ? 1 : -1) * (BLOCK[2] + 0.04)) / 2
      q.setFromAxisAngle(UP, (turned ? Math.PI / 2 : 0) + (rand() - 0.5) * 0.06)
      pieces.home(
        i,
        TESTS_X + (turned ? offset : 0),
        (layer + 0.5) * BLOCK[1],
        TESTS_Z + (turned ? 0 : offset),
        BLOCK[0] / 2,
        BLOCK[1] / 2,
        BLOCK[2] / 2,
        q,
      )
    }
    const { geometry, cells } = labelBox([TEST_END, TEST_END, null, null, TEST_LONG, TEST_LONG], TEST_COUNT)
    return {
      pieces,
      geometry,
      cells,
      material: createAtlasMaterial(testAtlas(), 2, TEST_NAMES.length, 1.5),
      tight: around(TESTS_X, TEST_TOP / 2, TESTS_Z, 2.4),
      hooks: { land: (_: number, impact: number) => impact > 3 && thud() } satisfies PieceHooks,
      axis: new THREE.Vector3(),
    }
  }, [])

  /** Todos los tests pasan (✓, en verde) o fallan (✗, en rojo). */
  const mark = (pass: boolean) => {
    const rows = TEST_NAMES.length
    for (let i = 0; i < TEST_COUNT; i++) {
      cells.setXY(i, pass ? 0 : 1, rows - 1 - (i % rows))
      mesh.current?.setColorAt(i, pass ? TEST_PASS : TEST_FAIL)
    }
    cells.needsUpdate = true
    commit(mesh.current)
  }

  useLayoutEffect(() => {
    pieces.write(mesh.current)
    mark(true)
    bound(mesh.current, tight)
    // `mark` solo toca refs y lo que ya está en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, tight])

  useFrame(({ clock }, delta) => {
    const p = sense(clock.elapsedTime, delta)
    const s = state.current
    if (s.phase === 'whole') {
      if (!p.playing || !rams(p, TESTS_X, TESTS_Z, TESTS.size[0] / 2, TESTS.size[2] / 2, TEST_TOP)) return
      // Vuelca hacia donde iba el jugador: cuanto más arriba el bloque, más lejos cae.
      axis.set(p.dirZ, 0, -p.dirX)
      for (let i = 0; i < TEST_COUNT; i++) {
        const layer = Math.floor(i / 2)
        const push = (0.9 + layer * 0.5) * between(0.8, 1.2)
        const side = between(-0.8, 0.8)
        pieces.launch(
          i,
          p.dirX * push - p.dirZ * side,
          between(1, 3) + layer * 0.2,
          p.dirZ * push + p.dirX * side,
          between(1.5, 4) + layer * 0.5,
          between(0, 0.05),
          axis,
        )
      }
      mark(false)
      setSolid(TESTS.collider, null)
      bound(mesh.current, ROOM_SPHERE)
      s.phase = 'broken'
      s.time = 0
      shake.value = Math.max(shake.value, 0.3)
      sfx.squash()
      report('tests')
      return
    }
    s.time += p.dt
    if (s.phase === 'broken') {
      const busy = pieces.step(p.dt, hooks)
      if (busy || s.moving) pieces.write(mesh.current)
      s.moving = busy
      if (s.time > 8 && !busy) {
        s.phase = 'rewind'
        s.time = 0
        pieces.beginRewind()
        sfx.rebuild()
      }
      return
    }
    const k = Math.min(1, s.time / REWIND)
    pieces.rewind(k, 1.4)
    pieces.write(mesh.current)
    if (k >= 1 && away(p, TESTS_X, TESTS_Z, TESTS.size[0] / 2, TESTS.size[2] / 2)) {
      pieces.endRewind()
      pieces.write(mesh.current)
      mark(true)
      setSolid(TESTS.collider, TESTS)
      bound(mesh.current, tight)
      s.phase = 'whole'
      sfx.ding()
    }
  })

  return (
    <>
      <instancedMesh ref={mesh} args={[geometry, material, TEST_COUNT]} castShadow />
      <Detail>
        <Label id="tests" text={TEXTS.tests[lang]} />
      </Detail>
    </>
  )
}

// ---------------------------------------------------------------- 2. Red neuronal

const [NET_X, , NET_Z] = local(NET.center)
/** Alturas de las neuronas de cada capa, y separación entre capas */
const NET_LAYERS = [
  [1.05, 2, 2.95],
  [0.75, 1.6, 2.45, 3.3],
  [1.5, 2.5],
]
const NET_SPAN = 1.5
const NEURON = 0.24
const NEURONS = NET_LAYERS.flatMap((heights, layer) =>
  heights.map((y) => ({ x: NET_X + (layer - 1) * NET_SPAN, y, layer })),
)
/** Sinapsis: cada neurona con todas las de la capa siguiente */
const SYNAPSES: Array<[number, number]> = NEURONS.flatMap((from, a) =>
  NEURONS.flatMap((to, b): Array<[number, number]> => (to.layer === from.layer + 1 ? [[a, b]] : [])),
)
const NET_TONES = [new THREE.Color(0.25, 1.7, 2.6), new THREE.Color(1.5, 0.55, 2.8), new THREE.Color(2.8, 1.15, 0.25)]
const NEURON_DEAD = new THREE.Color(0.1, 0.1, 0.14)
const NEURON_POP = new THREE.Color(4, 4, 4)
/** Segundos entre una neurona y la siguiente en la reacción en cadena, y lo que dura el fogonazo de cada una */
const DROPOUT_STEP = 0.12
const POP = 0.2

/**
 * Red neuronal de tres capas, de pie: neuronas que brillan y sinapsis por las
 * que corre un impulso. Salta contra una neurona (o cáele encima) y se van
 * apagando una tras otra, en cadena: «dropout» al cien por cien.
 */
function Network() {
  const lang = useLang()
  const nodes = useRef<THREE.InstancedMesh>(null)
  const edges = useRef<THREE.InstancedMesh>(null)
  const sign = useRef<THREE.Object3D>(null)
  const state = useRef({ phase: 'whole' as Phase, time: 0, moving: false, last: 0 })

  const { pieces, flash, cut, grow, tight, hooks } = useMemo(() => {
    const pieces = new Pieces(NEURONS.length, { tumble: 'none', bounce: 0.5, walls: ROOM })
    NEURONS.forEach((n, i) => pieces.home(i, n.x, n.y, NET_Z, NEURON, NEURON, NEURON))
    const flash = new Float32Array(NEURONS.length)
    return {
      pieces,
      flash,
      /** Cuándo se parte cada sinapsis, y cuánto queda de ella (0..1) */
      cut: new Float32Array(SYNAPSES.length),
      grow: new Float32Array(SYNAPSES.length).fill(1),
      tight: around(NET_X, 2, NET_Z, 3),
      hooks: {
        release: (i: number) => {
          flash[i] = POP
          thud()
        },
      } satisfies PieceHooks,
    }
  }, [])

  /** Coloca una sinapsis entre sus dos neuronas (en su sitio), con lo que quede de ella. */
  const writeEdge = (e: number) => {
    const [a, b] = SYNAPSES[e]
    const from = NEURONS[a]
    const to = NEURONS[b]
    _q.setFromAxisAngle(AXES[2], Math.atan2(to.y - from.y, to.x - from.x))
    _m.compose(
      _p.set((from.x + to.x) / 2, (from.y + to.y) / 2, NET_Z),
      _q,
      _s.set(Math.max(1e-4, Math.hypot(to.x - from.x, to.y - from.y) * grow[e]), 0.04, 0.04),
    )
    edges.current?.setMatrixAt(e, _m)
  }

  useLayoutEffect(() => {
    pieces.write(nodes.current)
    NEURONS.forEach((n, i) => nodes.current?.setColorAt(i, NET_TONES[n.layer]))
    SYNAPSES.forEach((_, e) => writeEdge(e))
    commit(nodes.current)
    commit(edges.current)
    bound(nodes.current, tight)
    bound(edges.current, tight)
    // `writeEdge` solo toca refs y lo que ya está en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, tight])

  useFrame(({ clock }, delta) => {
    const p = sense(clock.elapsedTime, delta)
    const s = state.current
    if (s.phase === 'whole') {
      if (!p.playing || p.grounded) return
      if (Math.abs(p.x - NET_X) > NET_SPAN + 0.8 || Math.abs(p.z - NET_Z) > 0.8) return
      const hit = NEURONS.findIndex((n) => touches(p, n.x, n.y, NET_Z, NEURON))
      if (hit < 0) return
      // Reacción en cadena: se apagan en el orden en que la red las alcanza desde la tocada.
      const order = spread(NEURONS.length, SYNAPSES, hit)
      NEURONS.forEach((_, i) => {
        pieces.launch(i, between(-1.5, 1.5), between(1.5, 4), between(-1.6, 1.9), 0, order[i] * DROPOUT_STEP)
      })
      SYNAPSES.forEach(([a, b], e) => (cut[e] = Math.min(order[a], order[b]) * DROPOUT_STEP))
      if (p.vy < 0) bounce(7.5)
      bound(nodes.current, ROOM_SPHERE)
      s.phase = 'broken'
      s.time = 0
      s.last = (NEURONS.length - 1) * DROPOUT_STEP
      sfx.squash()
      report('network')
      return
    }
    s.time += p.dt
    if (s.phase === 'broken') {
      let busy = pieces.step(p.dt, hooks)
      // Cada neurona da un fogonazo al saltar y se queda apagada.
      for (let i = 0; i < NEURONS.length; i++) {
        if (flash[i] <= 0) continue
        flash[i] = Math.max(0, flash[i] - p.dt)
        const f = flash[i] / POP
        pieces.size[i] = 1 + 0.7 * f
        nodes.current?.setColorAt(i, _color.copy(NEURON_DEAD).lerp(NEURON_POP, f))
        busy = true
      }
      let snapped = false
      for (let e = 0; e < SYNAPSES.length; e++) {
        const left = 1 - clamp01((s.time - cut[e]) / 0.1)
        if (left === grow[e]) continue
        grow[e] = left
        writeEdge(e)
        snapped = true
      }
      if (snapped) commit(edges.current)
      if (busy || s.moving) {
        pieces.write(nodes.current)
        commit(nodes.current)
      }
      s.moving = busy
      if (sign.current) sign.current.visible = s.time > s.last + 0.2
      if (s.time > 8 && !busy) {
        s.phase = 'rewind'
        s.time = 0
        pieces.beginRewind()
        if (sign.current) sign.current.visible = false
        sfx.rebuild()
      }
      return
    }
    // Vuelven a su sitio, se encienden y, al final, les crecen otra vez las sinapsis.
    const k = Math.min(1, s.time / REWIND)
    pieces.rewind(k, 0.8)
    const lit = smooth(k)
    NEURONS.forEach((n, i) => nodes.current?.setColorAt(i, _color.copy(NEURON_DEAD).lerp(NET_TONES[n.layer], lit)))
    const regrown = clamp01((k - 0.6) / 0.4)
    for (let e = 0; e < SYNAPSES.length; e++) {
      grow[e] = regrown
      writeEdge(e)
    }
    if (k >= 1) {
      pieces.endRewind()
      bound(nodes.current, tight)
      s.phase = 'whole'
    }
    pieces.write(nodes.current)
    commit(nodes.current)
    commit(edges.current)
  })

  return (
    <Detail>
      <instancedMesh ref={nodes} args={[BALL, LIT, NEURONS.length]} />
      <instancedMesh ref={edges} args={[undefined, SYNAPSE, SYNAPSES.length]}>
        <boxGeometry />
      </instancedMesh>
      <Text
        ref={sign}
        visible={false}
        font={fontBold}
        fontSize={0.34}
        position={[NET_X, 3.95, NET_Z]}
        color={INK_BAD}
        anchorX="center"
        anchorY="middle"
        material-toneMapped={false}
      >
        DROPOUT 100%
      </Text>
      <Label id="network" text={TEXTS.network[lang]} />
    </Detail>
  )
}

// ---------------------------------------------------------------- 3. Campana de Gauss

const [BELL_X, , BELL_Z] = local(BELL.center)
const BARS = BELL.bars
const BAR_MID = (BARS.length - 1) / 2
const BELL_HALF = (BARS.length * BELL.pitch) / 2
/** Desviación típica de la campana, en barras (la misma con la que se calculan sus alturas) */
const SIGMA = 2.1
/** Altura a la que se queda cada barra al aplastarla */
const FLAT = 0.14
/** Las muestras que salen despedidas */
const SAMPLES = 36
const BAR_TONES = BARS.map((_, i) =>
  new THREE.Color(0.62, 0.25, 1.05).lerp(new THREE.Color(0.22, 0.78, 1.05), 1 - Math.abs(i - BAR_MID) / BAR_MID),
)
const BAR_FLAT = new THREE.Color(0.6, 0.14, 0.24)
const SAMPLE_TONES = [
  new THREE.Color(0.3, 1.6, 2.4),
  new THREE.Color(1.5, 0.5, 2.6),
  new THREE.Color(2.6, 0.5, 1.2),
  new THREE.Color(2.4, 1.9, 0.4),
]
/** Regleta del eje: ancho, alto y los rótulos de sus marcas (de −2σ a +2σ) */
const AXIS: [number, number] = [5.2, 0.43]
const AXIS_MARKS = ['−2σ', '−σ', 'μ', '+σ', '+2σ']

/** El eje del histograma: una regleta con la media y las desviaciones típicas. */
const axisTexture = () =>
  canvasTexture(1024, 84, (ctx) => {
    const unit = 1024 / AXIS[0]
    ctx.strokeStyle = '#8fdcff'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(16, 14)
    ctx.lineTo(1008, 14)
    ctx.stroke()
    ctx.font = 'italic 600 46px Georgia, "Times New Roman", serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    AXIS_MARKS.forEach((mark, i) => {
      const x = 512 + (i - 2) * SIGMA * BELL.pitch * unit
      ctx.beginPath()
      ctx.moveTo(x, 4)
      ctx.lineTo(x, 26)
      ctx.stroke()
      ctx.fillStyle = i === 2 ? '#ffffff' : '#bfeaff'
      ctx.fillText(mark, x, 56)
    })
  })

/**
 * Campana de Gauss: un histograma de trece barras que hacen de escalones.
 * Písale la cima (las tres barras del centro) y se aplasta entera: las
 * muestras salen despedidas y la distribución se queda plana. Luego vuelve a
 * crecer barra a barra.
 */
function Gauss() {
  const lang = useLang()
  const bars = useRef<THREE.InstancedMesh>(null)
  const balls = useRef<THREE.InstancedMesh>(null)
  const [flat, setFlat] = useState(false)
  const state = useRef({ phase: 'whole' as Phase, time: 0, moving: false })

  const { pieces, strip, tight } = useMemo(() => {
    const pieces = new Pieces(SAMPLES, { tumble: 'none', bounce: 0.55, walls: ROOM })
    const rand = rng(1809)
    for (let i = 0; i < SAMPLES; i++) {
      // Cada muestra sale de dentro de la campana: más cerca de la media, más probable.
      const bar = Math.round(BAR_MID + (rand() + rand() + rand() - 1.5) * 2 * SIGMA)
      const column = BARS[Math.min(BARS.length - 1, Math.max(0, bar))]
      const radius = 0.1 + rand() * 0.05
      pieces.home(
        i,
        column.center[0] - OX,
        radius + rand() * Math.max(0, column.size[1] - radius * 2),
        BELL_Z + (rand() - 0.5) * 0.5,
        radius,
        radius,
        radius,
      )
    }
    const strip = new THREE.MeshBasicMaterial({
      map: axisTexture(),
      color: new THREE.Color(1.5, 1.5, 1.5),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    return { pieces, strip, tight: around(BELL_X, 1.2, BELL_Z, 3) }
  }, [])

  /** Deja cada barra a la altura que toca: `level(i)` va de 0 (aplastada) a 1 (entera). */
  const writeBars = (level: (i: number) => number) => {
    BARS.forEach((bar, i) => {
      const k = level(i)
      const height = FLAT + (bar.size[1] - FLAT) * k
      _m.makeScale(BELL.pitch - 0.04, height, BELL.depth).setPosition(bar.center[0] - OX, height / 2, BELL_Z)
      bars.current?.setMatrixAt(i, _m)
      bars.current?.setColorAt(i, _color.copy(BAR_FLAT).lerp(BAR_TONES[i], k))
    })
    commit(bars.current)
  }

  useLayoutEffect(() => {
    writeBars(() => 1)
    pieces.write(balls.current)
    for (let i = 0; i < SAMPLES; i++) balls.current?.setColorAt(i, SAMPLE_TONES[i % SAMPLE_TONES.length])
    commit(balls.current)
    bound(bars.current, tight)
    bound(balls.current, ROOM_SPHERE)
    // `writeBars` solo toca refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, tight])

  useFrame(({ clock }, delta) => {
    const p = sense(clock.elapsedTime, delta)
    const s = state.current
    if (s.phase === 'whole') {
      if (!p.playing) return
      // Solo cuenta la cima: las tres barras del centro.
      let hit = false
      for (let i = BAR_MID - 1; i <= BAR_MID + 1 && !hit; i++) {
        const bar = BARS[i]
        hit = stomps(p, bar.center[0] - OX, BELL_Z, BELL.pitch / 2, BELL.depth / 2, bar.size[1])
      }
      if (!hit) return
      bounce(8.5)
      for (let i = 0; i < SAMPLES; i++) {
        pieces.size[i] = 1
        pieces.launch(i, between(-3.5, 3.5), between(3.5, 8.5), between(-2.5, 4), 0, between(0, 0.12))
      }
      BARS.forEach((bar) => setSolid(bar.collider, null))
      if (balls.current) balls.current.visible = true
      s.phase = 'broken'
      s.time = 0
      shake.value = Math.max(shake.value, 0.3)
      sfx.squash()
      setFlat(true)
      report('gauss')
      return
    }
    s.time += p.dt
    if (s.phase === 'broken') {
      // Las barras se chafan de golpe, con un pequeño rebote.
      if (s.time < 0.5) {
        const k = clamp01(s.time / 0.18)
        const wobble = Math.sin(s.time * 26) * 0.06 * Math.max(0, 1 - s.time / 0.45)
        writeBars(() => Math.max(0, 1 - k * (2 - k) + wobble))
      } else if (s.time - p.dt < 0.5) writeBars(() => 0)
      const busy = pieces.step(p.dt)
      if (busy || s.moving) pieces.write(balls.current)
      s.moving = busy
      if (s.time > 7.5 && !busy) {
        s.phase = 'rewind'
        s.time = 0
        pieces.beginRewind()
        sfx.rebuild()
      }
      return
    }
    // Las muestras vuelven adentro mientras la campana crece de izquierda a derecha.
    const k = Math.min(1, s.time / (REWIND + 0.3))
    pieces.rewind(k, 1.2)
    const shrink = 1 - smooth(clamp01((k - 0.75) / 0.25))
    pieces.size.fill(shrink)
    pieces.write(balls.current)
    writeBars((i) => smooth(clamp01(k * 1.7 - (0.7 * i) / (BARS.length - 1))))
    if (k >= 1 && away(p, BELL_X, BELL_Z, BELL_HALF, BELL.depth / 2)) {
      pieces.endRewind()
      BARS.forEach((bar) => setSolid(bar.collider, bar))
      if (balls.current) balls.current.visible = false
      s.phase = 'whole'
      setFlat(false)
    }
  })

  return (
    <Detail>
      <instancedMesh ref={bars} args={[BOX, LIT, BARS.length]} />
      <instancedMesh ref={balls} args={[BALL, LIT, SAMPLES]} visible={false} />
      <mesh position={[BELL_X, 0.2, BELL_Z + BELL.depth / 2 + 0.3]} rotation-x={-0.6} material={strip}>
        <planeGeometry args={AXIS} />
      </mesh>
      <Label id="gauss" text={(flat ? TEXTS.outliers : TEXTS.gauss)[lang]} color={flat ? INK_BAD : INK_LABEL} />
    </Detail>
  )
}

// ---------------------------------------------------------------- 4. Dados

const DIE = DICE.size
const DIE_HALF = DIE / 2
/** El tapete: los dados rebotan en su borde y no salen de él */
const PEN: Walls = {
  minX: DICE.pen.minX - OX + DIE_HALF,
  maxX: DICE.pen.maxX - OX - DIE_HALF,
  minZ: DICE.pen.minZ - OZ + DIE_HALF,
  maxZ: DICE.pen.maxZ - OZ - DIE_HALF,
}
/** Velocidad mínima para que un toque sea una patada (andando ya vale) */
const KICK_SPEED = 1.2
/** Patadas que aguanta la pareja antes de reventar */
const KICKS = 3
/** Caras de un dado: lo que marca cada una, hacia dónde mira y los dos ejes de su plano */
const FACES: Array<{ value: number; normal: Vec3; u: Vec3; v: Vec3 }> = [
  { value: 1, normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { value: 6, normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { value: 2, normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { value: 5, normal: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
  { value: 3, normal: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { value: 4, normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
]
/** Dónde van los puntos de cada valor, en el plano de su cara (−1, 0 o 1 en cada eje) */
const SPOTS: Array<Array<[number, number]>> = [
  [],
  [[0, 0]],
  [[-1, -1], [1, 1]],
  [[-1, -1], [0, 0], [1, 1]],
  [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
]
/** Los 21 puntos de un dado, respecto a su centro */
const PIPS: Vec3[] = FACES.flatMap((face) =>
  SPOTS[face.value].map(([a, b]): Vec3 => [
    (face.normal[0] * 0.5 + (face.u[0] * a + face.v[0] * b) * 0.27) * DIE,
    (face.normal[1] * 0.5 + (face.u[1] * a + face.v[1] * b) * 0.27) * DIE,
    (face.normal[2] * 0.5 + (face.u[2] * a + face.v[2] * b) * 0.27) * DIE,
  ]),
)
const PIP = 0.1
const DIE_TONES = [new THREE.Color(0.92, 0.9, 0.86), new THREE.Color(0.82, 0.1, 0.28)]
const PIP_TONES = [new THREE.Color(1.9, 0.2, 0.75), new THREE.Color(2, 2, 2.2)]
const DIE_BODY = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 })

/** Qué marca un dado: la cara que mira hacia arriba. */
function faceUp(quat: Float32Array, at: number) {
  _v.copy(UP).applyQuaternion(_q.fromArray(quat, at).invert())
  let value = 1
  let most = -Infinity
  for (const face of FACES) {
    const dot = _v.x * face.normal[0] + _v.y * face.normal[1] + _v.z * face.normal[2]
    if (dot > most) {
      most = dot
      value = face.value
    }
  }
  return value
}

/**
 * Dos dados gigantes sobre un tapete. Choca con uno (andando basta) y sale
 * dando tumbos; al pararse enseña lo que ha salido. A la tercera patada, el
 * dado se parte al caer y la pareja revienta en sus puntos.
 */
function Dice() {
  const lang = useLang()
  const bodies = useRef<THREE.InstancedMesh>(null)
  const dots = useRef<THREE.InstancedMesh>(null)
  const number = useRef<THREE.Object3D>(null)
  const [roll, setRoll] = useState(1)
  const state = useRef({
    phase: 'whole' as Phase,
    time: 0,
    moving: false,
    kicks: 0,
    /** Dado que se partirá en cuanto toque el suelo, y si acaba de tocarlo */
    fuse: -1,
    crack: false,
    /** Dados que han dejado de ser sólidos (por una patada) y aún no han vuelto a serlo */
    soft: [false, false],
    /** Dado sobre el que flota el número, y desde cuándo (reloj de la escena); -1 = oculto */
    shown: 0,
    shownAt: -1,
  })

  const { dice, pips, tight, hooks, axis } = useMemo(() => {
    const dice = new Pieces(2, { tumble: 'any', square: true, bounce: 0.45, walls: PEN })
    DICE.dice.forEach((die, i) => {
      const [x, y, z] = local(die.center)
      dice.home(i, x, y, z, DIE_HALF, DIE_HALF, DIE_HALF)
    })
    const pips = new Pieces(PIPS.length * 2, { tumble: 'none', bounce: 0.5, walls: ROOM })
    for (let i = 0; i < pips.count; i++) {
      const a = Math.floor(i / PIPS.length) * 3
      const [x, y, z] = PIPS[i % PIPS.length]
      pips.home(i, dice.homePos[a] + x, dice.homePos[a + 1] + y, dice.homePos[a + 2] + z, PIP, PIP, PIP)
    }
    const s = state.current
    const hooks = {
      land: (i: number) => {
        thud()
        if (s.fuse === i) s.crack = true
      },
      sleep: (i: number) => {
        // Ya quieto, enseña lo que ha salido.
        s.shown = i
        s.shownAt = probe.stamp
        setRoll(faceUp(dice.quat, i * 4))
      },
    } satisfies PieceHooks
    const [cx, , cz] = local([(DICE.pen.minX + DICE.pen.maxX) / 2, 0, (DICE.pen.minZ + DICE.pen.maxZ) / 2])
    return { dice, pips, tight: around(cx, 1, cz, 4.2), hooks, axis: new THREE.Vector3() }
  }, [])

  /** Los puntos van pegados a su dado: se recolocan con él. */
  const writePips = () => {
    const mesh = dots.current
    if (!mesh) return
    for (let i = 0; i < pips.count; i++) {
      const die = Math.floor(i / PIPS.length)
      const [x, y, z] = PIPS[i % PIPS.length]
      _q.fromArray(dice.quat, die * 4)
      _p.set(x, y, z).applyQuaternion(_q)
      _p.x += dice.pos[die * 3]
      _p.y += dice.pos[die * 3 + 1]
      _p.z += dice.pos[die * 3 + 2]
      mesh.setMatrixAt(i, _m.makeScale(PIP * 2, PIP * 2, PIP * 2).setPosition(_p))
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  useLayoutEffect(() => {
    dice.write(bodies.current)
    writePips()
    DIE_TONES.forEach((tone, i) => bodies.current?.setColorAt(i, tone))
    for (let i = 0; i < pips.count; i++) dots.current?.setColorAt(i, PIP_TONES[Math.floor(i / PIPS.length)])
    commit(bodies.current)
    commit(dots.current)
    bound(bodies.current, tight)
    bound(dots.current, tight)
    // `writePips` solo toca refs y lo que ya está en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dice, pips, tight])

  useFrame(({ clock }, delta) => {
    const p = sense(clock.elapsedTime, delta)
    const s = state.current
    const label = number.current

    if (s.phase === 'whole') {
      if (p.playing) {
        for (let i = 0; i < 2; i++) {
          const a = i * 3
          if (!dice.still(i) || !rams(p, dice.pos[a], dice.pos[a + 2], DIE_HALF, DIE_HALF, DIE, KICK_SPEED)) continue
          // Patada: sale rodando hacia donde iba el jugador, y mientras vuela no estorba.
          const push = 2.2 + p.speed * 0.55
          axis.set(p.dirZ + between(-0.3, 0.3), between(-0.3, 0.3), -p.dirX + between(-0.3, 0.3)).normalize()
          dice.launch(i, p.dirX * push, 5 + p.speed * 0.25, p.dirZ * push, between(7, 11), 0, axis)
          setSolid(DICE.dice[i].collider, null)
          s.soft[i] = true
          if (s.shown === i) s.shownAt = -1
          s.kicks++
          if (s.kicks >= KICKS) s.fuse = i
          sfx.button()
        }
      }
      const busy = dice.step(p.dt, hooks)
      if (busy) {
        // Un dado no se queda dentro del otro: el que se mueve se aparta.
        const dx = dice.pos[3] - dice.pos[0]
        const dz = dice.pos[5] - dice.pos[2]
        if (Math.abs(dx) < DIE && Math.abs(dz) < DIE && Math.abs(dice.pos[4] - dice.pos[1]) < DIE * 0.9) {
          const axisX = Math.abs(dx) > Math.abs(dz)
          const way = (axisX ? dx : dz) < 0 ? -1 : 1
          const gap = DIE + 0.02 - Math.abs(axisX ? dx : dz)
          const k = axisX ? 0 : 2
          const free = [!dice.still(0), !dice.still(1)]
          const share = free[0] && free[1] ? 0.5 : 1
          if (free[1]) {
            dice.pos[3 + k] += way * gap * share
            dice.vel[3 + k] = way * Math.abs(dice.vel[3 + k]) * 0.5
          }
          if (free[0]) {
            dice.pos[k] -= way * gap * share
            dice.vel[k] = -way * Math.abs(dice.vel[k]) * 0.5
          }
        }
      }
      if (busy || s.moving) {
        dice.write(bodies.current)
        writePips()
      }
      s.moving = busy
      // Ya parado, el dado vuelve a ser sólido donde haya quedado (si no ha caído sobre el jugador).
      for (let i = 0; i < 2; i++) {
        const a = i * 3
        if (!s.soft[i] || !dice.still(i)) continue
        if (p.y < DIE - 0.05 && !away(p, dice.pos[a], dice.pos[a + 2], DIE_HALF, DIE_HALF)) continue
        _box.center[0] = dice.pos[a] + OX
        _box.center[1] = DIE_HALF
        _box.center[2] = dice.pos[a + 2] + OZ
        _box.size[0] = _box.size[1] = _box.size[2] = DIE
        setSolid(DICE.dice[i].collider, _box)
        s.soft[i] = false
      }

      if (s.crack) {
        // A la tercera, la pareja revienta: de cada dado solo quedan sus puntos, rodando.
        s.crack = false
        s.fuse = -1
        for (let i = 0; i < pips.count; i++) {
          const die = Math.floor(i / PIPS.length)
          const [x, y, z] = PIPS[i % PIPS.length]
          _v.set(x, y, z).applyQuaternion(_q.fromArray(dice.quat, die * 4))
          pips.pos[i * 3] = dice.pos[die * 3] + _v.x
          pips.pos[i * 3 + 1] = dice.pos[die * 3 + 1] + _v.y
          pips.pos[i * 3 + 2] = dice.pos[die * 3 + 2] + _v.z
          _v.normalize()
          const push = between(1.5, 4.5)
          pips.launch(i, _v.x * push, between(2.5, 6.5) + _v.y * 2, _v.z * push)
        }
        for (let i = 0; i < 2; i++) {
          dice.size[i] = 0
          dice.state[i] = HELD
          setSolid(DICE.dice[i].collider, null)
          s.soft[i] = false
        }
        dice.write(bodies.current)
        bound(dots.current, ROOM_SPHERE)
        s.phase = 'broken'
        s.time = 0
        s.moving = true
        s.shownAt = -1
        shake.value = Math.max(shake.value, 0.25)
        sfx.squash()
        report('dice')
      }
    } else {
      s.time += p.dt
      if (s.phase === 'broken') {
        const busy = pips.step(p.dt)
        if (busy || s.moving) pips.write(dots.current)
        s.moving = busy
        if (s.time > 8 && !busy) {
          s.phase = 'rewind'
          s.time = 0
          pips.beginRewind()
          dice.endRewind()
          sfx.rebuild()
        }
      } else {
        // Los puntos vuelven a donde estaban los dados, que crecen otra vez bajo ellos.
        const k = Math.min(1, s.time / REWIND)
        pips.rewind(k, 0.9)
        pips.write(dots.current)
        dice.size.fill(smooth(clamp01((k - 0.45) / 0.55)))
        dice.write(bodies.current)
        const clear = DICE.dice.every((_, i) =>
          away(p, dice.homePos[i * 3], dice.homePos[i * 3 + 2], DIE_HALF, DIE_HALF),
        )
        if (k >= 1 && clear) {
          pips.endRewind()
          writePips()
          DICE.dice.forEach((die) => setSolid(die.collider, die))
          bound(dots.current, tight)
          s.kicks = 0
          s.phase = 'whole'
        }
      }
    }

    // El número que ha salido flota un rato sobre su dado.
    if (label) {
      const age = s.shownAt < 0 ? -1 : clock.elapsedTime - s.shownAt
      label.visible = age >= 0 && age < 2.8
      if (label.visible) {
        const size = smooth(clamp01(age / 0.2)) * (1 - smooth(clamp01((age - 2.4) / 0.4)))
        label.scale.setScalar(Math.max(0.001, size))
        label.position.set(dice.pos[s.shown * 3], DIE + 0.55 + Math.min(age, 1) * 0.25, dice.pos[s.shown * 3 + 2])
      }
    }
  })

  return (
    <Detail>
      <instancedMesh ref={bodies} args={[undefined, DIE_BODY, 2]}>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={dots} args={[BALL, LIT, PIPS.length * 2]} />
      <Text
        ref={number}
        visible={false}
        font={fontBold}
        fontSize={0.62}
        color={INK_ROLL}
        anchorX="center"
        anchorY="middle"
        material-toneMapped={false}
      >
        {roll}
      </Text>
      <Label id="dice" text={TEXTS.dice[lang]} />
    </Detail>
  )
}

// ---------------------------------------------------------------- 5. Grafo

const [GRAPH_X, , GRAPH_BACK] = local(GRAPH.center)
const GRAPH_TOP = GRAPH.size[1]
/** El móvil cuelga algo por delante del poste, de un brazo a esta altura */
const GRAPH_Z = GRAPH_BACK + 0.6
const GRAPH_HANG = GRAPH_TOP - 0.17
/** Árbol de nueve vértices: dónde cuelga cada uno (x respecto al poste, y) y de cuál pende */
const TREE: Array<{ at: [number, number]; parent: number; depth: number }> = [
  { at: [0, 3.55], parent: -1, depth: 0 },
  { at: [-0.95, 2.8], parent: 0, depth: 1 },
  { at: [0.95, 2.8], parent: 0, depth: 1 },
  { at: [-1.5, 2], parent: 1, depth: 2 },
  { at: [-0.5, 2], parent: 1, depth: 2 },
  { at: [0.5, 2], parent: 2, depth: 2 },
  { at: [1.5, 2], parent: 2, depth: 2 },
  { at: [-1.15, 1.25], parent: 3, depth: 3 },
  { at: [0.85, 1.3], parent: 5, depth: 3 },
]
/** Aristas: la que une cada vértice (menos la raíz) con su padre */
const TWIGS: Array<[number, number]> = TREE.slice(1).map((node, i) => [node.parent, i + 1])
const VERTEX = 0.2
const TREE_TONES = [
  new THREE.Color(2.6, 2, 0.4),
  new THREE.Color(0.5, 2.4, 0.9),
  new THREE.Color(0.3, 1.8, 2.3),
  new THREE.Color(2.6, 0.6, 1.4),
]
const SNAP_STEP = 0.14

/**
 * Grafo de matemática discreta: un árbol de nueve vértices colgado de un poste,
 * como un móvil. Salta contra un vértice y las aristas se van partiendo una
 * tras otra: los vértices caen como fruta y rebotan. Lo que era conexo, deja de serlo.
 */
function Graph() {
  const lang = useLang()
  const nodes = useRef<THREE.InstancedMesh>(null)
  const edges = useRef<THREE.InstancedMesh>(null)
  const [linked, setLinked] = useState(true)
  const state = useRef({ phase: 'whole' as Phase, time: 0, moving: false })

  const { pieces, cut, grow, tight, hooks } = useMemo(() => {
    const pieces = new Pieces(TREE.length, { tumble: 'none', bounce: 0.6, walls: ROOM })
    TREE.forEach((node, i) => pieces.home(i, GRAPH_X + node.at[0], node.at[1], GRAPH_Z, VERTEX, VERTEX, VERTEX))
    return {
      pieces,
      cut: new Float32Array(TWIGS.length),
      grow: new Float32Array(TWIGS.length).fill(1),
      tight: around(GRAPH_X, 2.4, GRAPH_Z, 2.6),
      hooks: {
        release: () => thud(),
        land: (_: number, impact: number) => impact > 3 && thud(),
      } satisfies PieceHooks,
    }
  }, [])

  /** Coloca una arista entre sus dos vértices (en su sitio), con lo que quede de ella. */
  const writeEdge = (e: number) => {
    const [a, b] = TWIGS[e]
    const [x0, y0] = TREE[a].at
    const [x1, y1] = TREE[b].at
    _q.setFromAxisAngle(AXES[2], Math.atan2(y1 - y0, x1 - x0))
    _m.compose(
      _p.set(GRAPH_X + (x0 + x1) / 2, (y0 + y1) / 2, GRAPH_Z),
      _q,
      _s.set(Math.max(1e-4, Math.hypot(x1 - x0, y1 - y0) * grow[e]), 0.045, 0.045),
    )
    edges.current?.setMatrixAt(e, _m)
  }

  useLayoutEffect(() => {
    pieces.write(nodes.current)
    TREE.forEach((node, i) => nodes.current?.setColorAt(i, TREE_TONES[node.depth]))
    TWIGS.forEach((_, e) => writeEdge(e))
    commit(nodes.current)
    commit(edges.current)
    bound(nodes.current, tight)
    bound(edges.current, tight)
    // `writeEdge` solo toca refs y lo que ya está en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, tight])

  useFrame(({ clock }, delta) => {
    const p = sense(clock.elapsedTime, delta)
    const s = state.current
    if (s.phase === 'whole') {
      if (!p.playing || p.grounded) return
      if (Math.abs(p.x - GRAPH_X) > 2.3 || Math.abs(p.z - GRAPH_Z) > 0.8) return
      const hit = TREE.findIndex((node) => touches(p, GRAPH_X + node.at[0], node.at[1], GRAPH_Z, VERTEX))
      if (hit < 0) return
      // Desde el vértice tocado, las aristas se parten en el orden en que el árbol las alcanza.
      const order = spread(TREE.length, TWIGS, hit)
      TREE.forEach((_, i) => {
        pieces.launch(i, between(-0.9, 0.9), between(0, 1.5), between(-0.6, 1.2), 0, order[i] * SNAP_STEP)
      })
      TWIGS.forEach(([a, b], e) => (cut[e] = Math.max(order[a], order[b]) * SNAP_STEP))
      if (p.vy < 0) bounce(7.5)
      bound(nodes.current, ROOM_SPHERE)
      s.phase = 'broken'
      s.time = 0
      sfx.squash()
      setLinked(false)
      report('graph')
      return
    }
    s.time += p.dt
    if (s.phase === 'broken') {
      const busy = pieces.step(p.dt, hooks)
      let snapped = false
      for (let e = 0; e < TWIGS.length; e++) {
        const left = 1 - clamp01((s.time - cut[e]) / 0.1)
        if (left === grow[e]) continue
        grow[e] = left
        writeEdge(e)
        snapped = true
      }
      if (snapped) commit(edges.current)
      if (busy || s.moving) pieces.write(nodes.current)
      s.moving = busy
      if (s.time > 8 && !busy) {
        s.phase = 'rewind'
        s.time = 0
        pieces.beginRewind()
        sfx.rebuild()
      }
      return
    }
    // Los vértices vuelven a colgarse y, al final, les crecen otra vez las aristas.
    const k = Math.min(1, s.time / REWIND)
    pieces.rewind(k, 0.6)
    const regrown = clamp01((k - 0.6) / 0.4)
    for (let e = 0; e < TWIGS.length; e++) {
      grow[e] = regrown
      writeEdge(e)
    }
    if (k >= 1) {
      pieces.endRewind()
      bound(nodes.current, tight)
      s.phase = 'whole'
      setLinked(true)
    }
    pieces.write(nodes.current)
    commit(edges.current)
  })

  return (
    <Detail>
      <instancedMesh ref={nodes} args={[BALL, LIT, TREE.length]} />
      <instancedMesh ref={edges} args={[undefined, BRANCH, TWIGS.length]}>
        <boxGeometry />
      </instancedMesh>
      <Text
        font={fontBold}
        fontSize={0.24}
        position={[GRAPH_X, GRAPH_TOP + 0.3, GRAPH_BACK + 0.05]}
        color={linked ? INK_OK : INK_BAD}
        anchorX="center"
        anchorY="middle"
        whiteSpace="nowrap"
        material-toneMapped={false}
      >
        {(linked ? TEXTS.connected : TEXTS.disconnected)[lang]}
      </Text>
      <Label id="graph" text={TEXTS.graph[lang]} />
    </Detail>
  )
}

// ---------------------------------------------------------------- 6. Pila de pull requests

const [PRS_X, , PRS_Z] = local(PRS.center)
const PR_TOP = PRS.size[1]
/** Hojas apiladas, más una apoyada por delante (la que se lee) */
const SHEETS = 10
const CARDS = SHEETS + 1
const CARD: Vec3 = [PRS.size[0], PR_TOP / SHEETS, PRS.size[2]]
/** Inclinación de la hoja apoyada (casi de pie, mirando a la cámara) */
const LEAN = 1.22
/** Lo que pone en cada hoja: número, líneas añadidas y quitadas, y el veredicto */
const PULLS = [
  { id: 'PR #128', plus: '+2,841', minus: '−3', verdict: 'LGTM', fine: true },
  { id: 'PR #404', plus: '+1', minus: '−1', verdict: 'typo', fine: true },
  { id: 'PR #1337', plus: '+12', minus: '−9,410', verdict: 'LGTM', fine: true },
  { id: 'PR #7', plus: '+99', minus: '−0', verdict: 'WIP', fine: false },
  { id: 'PR #256', plus: '+640', minus: '−64', verdict: 'no tests', fine: false },
  { id: 'PR #42', plus: '+0', minus: '−0', verdict: 'LGTM', fine: true },
]
/** Zonas de la celda: la cara (el PR entero) y una franja para los cantos (el resumen de cambios, a cuadritos) */
const CARD_FACE: Region = [0.02, 0.14, 0.98, 0.98]
const CARD_EDGE: Region = [0.02, 0.02, 0.98, 0.1]
const PAPER = [new THREE.Color(0.7, 0.72, 0.78), new THREE.Color(0.62, 0.66, 0.74), new THREE.Color(0.74, 0.72, 0.68)]
/** Marcas del conflicto, de abajo arriba (caen en ese orden y se apilan) */
const MARKERS = ['>>>>>>> main', '=======', '<<<<<<< HEAD']
const MARKER: Vec3 = [1.9, 0.34, 0.42]
const MARKER_TONE = new THREE.Color(0.5, 0.05, 0.08)

/** Atlas de las hojas: seis pull requests distintos, en dos columnas. */
const pullAtlas = () =>
  atlasTexture(2, 3, (ctx, column, row, width, height) => {
    const pull = PULLS[row * 2 + column]
    // Franja de los cantos: cuadritos verdes y rojos, como el resumen de un diff.
    const added = pull.fine ? 9 : 5
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = i < added ? '#1f9d55' : i < 12 ? '#d93f4c' : '#8a93a6'
      ctx.fillRect(16 + i * 35, height * 0.9, 25, height * 0.08)
    }
    // La cara se pinta sin deformar (491 de ancho por lo que le toque de alto) y se encoge a su zona.
    const w = width * 0.96
    const h = (w * CARD[2]) / CARD[0]
    ctx.translate(width * 0.02, height * 0.02)
    ctx.scale(1, (height * 0.84) / h)
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#161d2c'
    ctx.font = `600 84px ${SANS}`
    ctx.fillText(pull.id, 22, 96, w - 44)
    ctx.font = `600 56px ${MONO}`
    ctx.fillStyle = '#12833f'
    ctx.fillText(pull.plus, 22, 178)
    ctx.fillStyle = '#c62f3c'
    ctx.fillText(pull.minus, 46 + ctx.measureText(pull.plus).width, 178)
    ctx.fillStyle = '#9099ad'
    ctx.fillRect(22, 212, w * 0.62, 14)
    ctx.fillRect(22, 242, w * 0.44, 14)
    ctx.fillStyle = pull.fine ? '#1f9d55' : '#b7791f'
    ctx.fillRect(w - 232, h - 82, 210, 62)
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 40px ${SANS}`
    ctx.textAlign = 'center'
    ctx.fillText(pull.verdict, w - 127, h - 37, 190)
  })

/**
 * Pila de pull requests: diez hojas y, apoyada delante, la que se lee. Písala
 * y las hojas salen volando como papeles; en su lugar aparece un «MERGE
 * CONFLICT» y caen del cielo sus tres marcas, que se apilan donde estaba.
 */
function PullRequests() {
  const lang = useLang()
  const cards = useRef<THREE.InstancedMesh>(null)
  const blocks = useRef<THREE.InstancedMesh>(null)
  const title = useRef<THREE.Object3D>(null)
  const lines = useRef<Array<THREE.Object3D | null>>([])
  const state = useRef({ phase: 'whole' as Phase, time: 0, moving: false })

  const { pieces, markers, geometry, cells, material, tight, hooks } = useMemo(() => {
    const pieces = new Pieces(CARDS, { tumble: 'y', bounce: 0.25, drag: 2.5, gravity: 9, walls: ROOM })
    const rand = rng(128)
    const q = new THREE.Quaternion()
    for (let i = 0; i < SHEETS; i++) {
      // Apiladas con descuido: cada una algo girada y desplazada.
      q.setFromAxisAngle(UP, (rand() - 0.5) * 0.22)
      pieces.home(
        i,
        PRS_X + (rand() - 0.5) * 0.08,
        (i + 0.5) * CARD[1],
        PRS_Z + (rand() - 0.5) * 0.08,
        CARD[0] / 2,
        CARD[1] / 2,
        CARD[2] / 2,
        q,
      )
    }
    // La de delante, casi de pie: apoya un canto en el suelo y el otro en la pila.
    q.setFromAxisAngle(AXES[0], LEAN)
    pieces.home(
      SHEETS,
      PRS_X,
      (CARD[2] / 2) * Math.sin(LEAN) + (CARD[1] / 2) * Math.cos(LEAN),
      PRS_Z + CARD[2] / 2 + (CARD[2] / 2) * Math.cos(LEAN) + CARD[1] * Math.sin(LEAN) + 0.03,
      CARD[0] / 2,
      CARD[1] / 2,
      CARD[2] / 2,
      q,
    )

    const markers = new Pieces(MARKERS.length, { tumble: 'y', bounce: 0.12 })
    MARKERS.forEach((_, i) => {
      markers.home(i, PRS_X + (i - 1) * 0.07, 5 + i * 0.8, PRS_Z, MARKER[0] / 2, MARKER[1] / 2, MARKER[2] / 2)
      markers.ground[i] = i * (MARKER[1] + 0.02)
      markers.size[i] = 0
    })

    const { geometry, cells } = labelBox([CARD_EDGE, CARD_EDGE, CARD_FACE, CARD_FACE, CARD_EDGE, CARD_EDGE], CARDS)
    // La hoja apoyada es el PR #128; las de la pila van rotando por los seis.
    for (let i = 0; i < CARDS; i++) {
      const pull = i === SHEETS ? 0 : (i * 5 + 1) % PULLS.length
      cells.setXY(i, pull % 2, 2 - Math.floor(pull / 2))
    }
    return {
      pieces,
      markers,
      geometry,
      cells,
      material: createAtlasMaterial(pullAtlas(), 2, 3, 1),
      tight: around(PRS_X, 0.8, PRS_Z, 1.8),
      hooks: {
        // Cada marca aparece al soltarse (hasta entonces espera arriba, sin verse).
        release: (i: number) => {
          markers.size[i] = 1
        },
        land: () => {
          thud()
          shake.value = Math.max(shake.value, 0.12)
        },
      } satisfies PieceHooks,
    }
  }, [])

  useLayoutEffect(() => {
    pieces.write(cards.current)
    markers.write(blocks.current)
    for (let i = 0; i < CARDS; i++) cards.current?.setColorAt(i, PAPER[i % PAPER.length])
    MARKERS.forEach((_, i) => blocks.current?.setColorAt(i, MARKER_TONE))
    cells.needsUpdate = true
    commit(cards.current)
    commit(blocks.current)
    bound(cards.current, tight)
    bound(blocks.current, around(PRS_X, 3, PRS_Z, 4.5))
  }, [pieces, markers, cells, tight])

  useFrame(({ clock }, delta) => {
    const p = sense(clock.elapsedTime, delta)
    const s = state.current
    if (s.phase === 'whole') {
      if (!p.playing || !stomps(p, PRS_X, PRS_Z, PRS.size[0] / 2, PRS.size[2] / 2, PR_TOP)) return
      bounce(8.5)
      for (let i = 0; i < CARDS; i++) {
        // Primero las de arriba.
        pieces.launch(i, between(-5, 5), between(5, 9), between(-4, 5), between(3, 8), (CARDS - 1 - i) * 0.012)
      }
      MARKERS.forEach((_, i) => {
        markers.reset(i)
        markers.size[i] = 0
        markers.launch(i, 0, 0, 0, 0, 0.45 + i * 0.25)
      })
      setSolid(PRS.collider, null)
      bound(cards.current, ROOM_SPHERE)
      if (blocks.current) blocks.current.visible = true
      s.phase = 'broken'
      s.time = 0
      sfx.squash()
      report('prs')
      return
    }
    s.time += p.dt
    const sign = title.current
    if (s.phase === 'broken') {
      const flying = pieces.step(p.dt)
      const falling = markers.step(p.dt, hooks)
      if (flying || falling || s.moving) {
        pieces.write(cards.current)
        markers.write(blocks.current)
      }
      s.moving = flying || falling
      // Cada marca lleva su texto por delante; el rótulo flota encima.
      MARKERS.forEach((_, i) => {
        const line = lines.current[i]
        if (!line) return
        line.visible = s.time > 0.45 + i * 0.25
        line.position.set(markers.pos[i * 3], markers.pos[i * 3 + 1], markers.pos[i * 3 + 2] + MARKER[2] / 2 + 0.012)
      })
      if (sign) {
        sign.visible = s.time > 0.35
        sign.scale.setScalar(Math.max(0.001, smooth(clamp01((s.time - 0.35) / 0.25))))
        sign.position.y = 1.72 + Math.sin(clock.elapsedTime * 2.2) * 0.07
      }
      if (s.time > 8.5 && !s.moving) {
        s.phase = 'rewind'
        s.time = 0
        pieces.beginRewind()
        sfx.rebuild()
      }
      return
    }
    // El conflicto se resuelve (se encoge hasta desaparecer) y las hojas vuelven a la pila.
    const k = Math.min(1, s.time / REWIND)
    pieces.rewind(k, 1.1)
    pieces.write(cards.current)
    const gone = smooth(clamp01(k / 0.3))
    markers.size.fill(1 - gone)
    markers.write(blocks.current)
    lines.current.forEach((line) => line && (line.visible = false))
    if (sign) {
      sign.visible = gone < 1
      sign.scale.setScalar(Math.max(0.001, 1 - gone))
    }
    if (k >= 1 && away(p, PRS_X, PRS_Z, PRS.size[0] / 2, PRS.size[2] / 2)) {
      pieces.endRewind()
      pieces.write(cards.current)
      setSolid(PRS.collider, PRS)
      bound(cards.current, tight)
      if (blocks.current) blocks.current.visible = false
      s.phase = 'whole'
    }
  })

  return (
    <Detail>
      <instancedMesh ref={cards} args={[geometry, material, CARDS]} />
      <instancedMesh ref={blocks} args={[BOX, LIT, MARKERS.length]} visible={false} />
      <Text
        ref={title}
        visible={false}
        font={fontBold}
        fontSize={0.3}
        position={[PRS_X, 1.72, PRS_Z]}
        color={INK_BAD}
        anchorX="center"
        anchorY="middle"
        whiteSpace="nowrap"
        material-toneMapped={false}
      >
        MERGE CONFLICT
      </Text>
      {MARKERS.map((marker, i) => (
        <Text
          key={marker}
          ref={(text: THREE.Object3D | null) => {
            lines.current[i] = text
          }}
          visible={false}
          font={fontBold}
          fontSize={0.2}
          color={WHITE}
          anchorX="center"
          anchorY="middle"
          whiteSpace="nowrap"
          material-toneMapped={false}
        >
          {marker}
        </Text>
      ))}
      <Label id="prs" text={TEXTS.prs[lang]} />
    </Detail>
  )
}

// ---------------------------------------------------------------- 7. Monolito de código heredado

const [LEGACY_X, LEGACY_Y, LEGACY_Z] = local(LEGACY.center)
const LEGACY_TOP = LEGACY.size[1]
const LEGACY_HALF = LEGACY.size[0] / 2
/** Golpes que aguanta, y lo mínimo que tiene que pasar entre uno y otro */
const LEGACY_HITS = 3
const HIT_GAP = 0.6
/** Al desmoronarse queda en cascotes: los de la superficie de una rejilla de 4 × 3 × 4 */
const RUBBLE_GRID: Vec3 = [4, 3, 4]
const RUBBLE: Vec3[] = []
for (let x = 0; x < RUBBLE_GRID[0]; x++) {
  for (let y = 0; y < RUBBLE_GRID[1]; y++) {
    for (let z = 0; z < RUBBLE_GRID[2]; z++) {
      const edge = (cell: number, cells: number) => cell === 0 || cell === cells - 1
      if (edge(x, RUBBLE_GRID[0]) || edge(y, RUBBLE_GRID[1]) || edge(z, RUBBLE_GRID[2])) RUBBLE.push([x, y, z])
    }
  }
}
const RUBBLE_TONES = [
  new THREE.Color(0.07, 0.08, 0.11),
  new THREE.Color(0.05, 0.06, 0.08),
  new THREE.Color(0.1, 0.11, 0.15),
  new THREE.Color(0.07, 0.08, 0.11),
  new THREE.Color(0.12, 1.3, 0.55),
  new THREE.Color(0.05, 0.06, 0.08),
  new THREE.Color(1.5, 0.8, 0.15),
]
/** Lo que se lee, diminuto y sin parar, en las caras del monolito */
const LEGACY_CODE = [
  'function doStuff2_FINAL(x) {',
  '  // TODO: fix (2014)',
  '  if (x == null) return x',
  '  var tmp = tmp2 || tmp3',
  '  try { legacy(x) } catch (e) {}',
  '  // DO NOT REMOVE',
  '  sleep(3000) // race condition',
  '  return data1.data.data',
  '}',
  'var flag_new_old = !0',
  '// jQuery 1.4 lives here',
  'eval(legacyString)',
  'while (true) { if (ok) break }',
  '// nobody knows',
  'function helper_copy_copy() {',
  '  goto retry',
  '#define TRUE FALSE',
  'x = x',
  '  if (isFriday) deploy()',
  '  // magic number, do not ask',
  '  return 42 - 0.0001',
  'import * as everything from "."',
]
const CRACK_TONE = new THREE.Color(3.2, 1.3, 0.2)
const CRACKS = new THREE.MeshBasicMaterial({ toneMapped: false })
/**
 * Grietas de la cara de delante (x, y respecto a su centro, pensadas para una
 * cara de 2,6 de alto): las del primer golpe y las del segundo.
 */
const CRACK_LINES: Array<Array<Array<[number, number]>>> = [
  [
    [[-0.5, 1.3], [-0.3, 0.8], [-0.6, 0.45], [-0.2, 0], [-0.35, -0.4]],
    [[-0.3, 0.8], [0.15, 0.6], [0.3, 0.25]],
  ],
  [
    [[0.9, 1.3], [0.7, 0.75], [0.95, 0.3], [0.55, -0.2], [0.7, -0.8], [0.4, -1.3]],
    [[0.55, -0.2], [0.1, -0.45], [-0.1, -0.9]],
    [[-0.35, -0.4], [-0.7, -0.8], [-0.6, -1.3]],
  ],
]

/** Código diminuto para las caras del monolito: la textura se repite y se desplaza sin parar. */
const codeTexture = () => {
  const texture = canvasTexture(512, 512, (ctx) => {
    const rand = rng(1970)
    ctx.font = `600 13px ${MONO}`
    ctx.textBaseline = 'top'
    for (let line = 0; line < 32; line++) {
      const tone = rand()
      ctx.fillStyle = tone < 0.68 ? '#35f08a' : tone < 0.86 ? '#ffb347' : '#6f8fbd'
      const text = LEGACY_CODE[Math.floor(rand() * LEGACY_CODE.length)]
      const more = LEGACY_CODE[Math.floor(rand() * LEGACY_CODE.length)]
      ctx.fillText(`${text}   ${more}`, 6 + Math.floor(rand() * 3) * 14, line * 16 + 2)
    }
  })
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}

/** Una grieta: tramos finos pegados a la cara de delante. */
function crack(points: Array<[number, number]>) {
  const parts: THREE.BufferGeometry[] = []
  // Algo encogidas, para que no asomen por las aristas.
  const tall = (LEGACY_TOP - 0.1) / 2.6
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = [points[i - 1][0], points[i - 1][1] * tall]
    const [x1, y1] = [points[i][0], points[i][1] * tall]
    parts.push(
      slab(
        [Math.hypot(x1 - x0, y1 - y0) + 0.04, 0.05, 0.02],
        [(x0 + x1) / 2, (y0 + y1) / 2, LEGACY_HALF + 0.012],
        [0, 0, Math.atan2(y1 - y0, x1 - x0)],
      ),
    )
  }
  return parts
}

/** Espaguetis: unas cuantas hebras retorcidas en un montón, fundidas en una sola malla. */
function spaghetti() {
  const rand = rng(77)
  const strands: THREE.BufferGeometry[] = []
  for (let strand = 0; strand < 7; strand++) {
    const points: THREE.Vector3[] = []
    for (let i = 0; i < 8; i++) {
      const angle = rand() * Math.PI * 2
      const reach = 0.25 + rand() * 1.15
      const height = 0.07 + rand() * 0.75 * (1 - reach / 1.6)
      points.push(new THREE.Vector3(Math.cos(angle) * reach, height, Math.sin(angle) * reach))
    }
    const shade = 0.75 + rand() * 0.35
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 44, 0.05, 5)
    strands.push(paint(tube, [1.25 * shade, 0.92 * shade, 0.3 * shade]))
  }
  return fuse(strands)
}

/**
 * Monolito de código heredado: un bloque oscuro cubierto de código que no
 * para de pasar. Aguanta tres golpes (pisándolo o embistiéndolo corriendo):
 * con cada uno se agrieta más y, al tercero, se desmorona en cascotes sobre un
 * enredo de espaguetis.
 */
function Legacy() {
  const lang = useLang()
  const block = useRef<THREE.Group>(null)
  const rubble = useRef<THREE.InstancedMesh>(null)
  const pasta = useRef<THREE.Mesh>(null)
  const [hits, setHits] = useState(0)
  const state = useRef({ phase: 'whole' as Phase, time: 0, moving: false, hits: 0, sinceHit: 10 })

  const { pieces, code, skin, cracks, tangle, hooks } = useMemo(() => {
    const pieces = new Pieces(RUBBLE.length, { tumble: 'any', bounce: 0.35, walls: ROOM })
    const half: Vec3 = [
      LEGACY.size[0] / RUBBLE_GRID[0] / 2,
      LEGACY.size[1] / RUBBLE_GRID[1] / 2,
      LEGACY.size[2] / RUBBLE_GRID[2] / 2,
    ]
    RUBBLE.forEach(([x, y, z], i) =>
      pieces.home(
        i,
        LEGACY_X - LEGACY_HALF + (x * 2 + 1) * half[0],
        (y * 2 + 1) * half[1],
        LEGACY_Z - LEGACY_HALF + (z * 2 + 1) * half[2],
        half[0],
        half[1],
        half[2],
      ),
    )
    const code = codeTexture()
    return {
      pieces,
      code,
      skin: new THREE.MeshStandardMaterial({
        color: '#0b0d12',
        roughness: 0.5,
        metalness: 0.3,
        emissive: '#ffffff',
        emissiveMap: code,
        emissiveIntensity: 1.1,
      }),
      cracks: CRACK_LINES.map((lines) => fuse(lines.flatMap(crack))),
      tangle: spaghetti(),
      hooks: { land: (_: number, impact: number) => impact > 3 && thud() } satisfies PieceHooks,
    }
  }, [])

  useLayoutEffect(() => {
    pieces.write(rubble.current)
    RUBBLE.forEach((_, i) => rubble.current?.setColorAt(i, RUBBLE_TONES[(i * 5) % RUBBLE_TONES.length]))
    commit(rubble.current)
    bound(rubble.current, ROOM_SPHERE)
  }, [pieces])

  useFrame(({ clock }, delta) => {
    const p = sense(clock.elapsedTime, delta)
    const s = state.current
    const t = clock.elapsedTime
    // El código pasa sin parar, y más deprisa (y a tirones) cuanto más tocado está.
    code.offset.y = (code.offset.y + p.dt * (0.035 + s.hits * 0.09)) % 1
    code.offset.x = s.hits > 1 ? Math.round(Math.sin(t * 9)) * 0.004 : 0
    CRACKS.color.copy(CRACK_TONE).multiplyScalar((0.55 + 0.45 * s.hits) * (0.82 + 0.18 * Math.sin(t * 13)))
    s.sinceHit += p.dt

    if (s.phase === 'whole') {
      if (block.current) {
        // Cada golpe lo sacude un instante.
        const jolt = Math.max(0, 1 - s.sinceHit / 0.35)
        block.current.scale.set(1 + 0.05 * jolt, 1 - 0.07 * jolt, 1 + 0.05 * jolt)
        block.current.position.x = LEGACY_X + Math.sin(t * 70) * 0.04 * jolt
      }
      if (!p.playing || s.sinceHit < HIT_GAP) return
      const stomped = stomps(p, LEGACY_X, LEGACY_Z, LEGACY_HALF, LEGACY_HALF, LEGACY_TOP)
      if (!stomped && !rams(p, LEGACY_X, LEGACY_Z, LEGACY_HALF, LEGACY_HALF, LEGACY_TOP)) return
      if (stomped) bounce(8.5)
      else {
        // De la embestida sale rebotado hacia atrás.
        body.vel[0] = -p.dirX * 4.5
        body.vel[1] = 4.5
        body.vel[2] = -p.dirZ * 4.5
        body.grounded = false
        body.ballistic = 0.25
      }
      s.hits++
      s.sinceHit = 0
      if (s.hits < LEGACY_HITS) {
        shake.value = Math.max(shake.value, 0.25)
        sfx.squash()
        setHits(s.hits)
        return
      }
      // Tercer golpe: se viene abajo.
      RUBBLE.forEach((_, i) => {
        const a = i * 3
        _v.set(pieces.homePos[a] - LEGACY_X, 0, pieces.homePos[a + 2] - LEGACY_Z).normalize()
        const push = between(1.5, 4.5)
        pieces.launch(i, _v.x * push, between(1, 6), _v.z * push, between(2, 9), between(0, 0.1))
      })
      setSolid(LEGACY.collider, null)
      if (block.current) block.current.visible = false
      if (rubble.current) rubble.current.visible = true
      if (pasta.current) pasta.current.visible = true
      s.phase = 'broken'
      s.time = 0
      shake.value = Math.max(shake.value, 0.55)
      sfx.explosion()
      setHits(LEGACY_HITS)
      report('legacy')
      return
    }
    s.time += p.dt
    if (s.phase === 'broken') {
      const busy = pieces.step(p.dt, hooks)
      if (busy || s.moving) pieces.write(rubble.current)
      s.moving = busy
      // Los espaguetis se desparraman al caer el bloque.
      if (pasta.current) {
        const spill = Math.max(0.001, smooth(clamp01(s.time / 0.45)))
        pasta.current.scale.set(spill, spill * (1.25 - 0.25 * spill), spill)
      }
      if (s.time > 9 && !busy) {
        s.phase = 'rewind'
        s.time = 0
        pieces.beginRewind()
        sfx.rebuild()
      }
      return
    }
    // Los cascotes vuelven a encajar y los espaguetis se recogen dentro.
    const k = Math.min(1, s.time / (REWIND + 0.2))
    pieces.rewind(k, 1.3)
    pieces.write(rubble.current)
    if (pasta.current) pasta.current.scale.setScalar(Math.max(0.001, 1 - smooth(clamp01(k / 0.6))))
    if (k >= 1 && away(p, LEGACY_X, LEGACY_Z, LEGACY_HALF, LEGACY_HALF)) {
      pieces.endRewind()
      setSolid(LEGACY.collider, LEGACY)
      if (block.current) block.current.visible = true
      if (rubble.current) rubble.current.visible = false
      if (pasta.current) pasta.current.visible = false
      s.hits = 0
      s.sinceHit = 10
      s.phase = 'whole'
      setHits(0)
    }
  })

  const note = hits === 1 ? TEXTS.todo : TEXTS.why
  return (
    <>
      <group ref={block} position={[LEGACY_X, LEGACY_Y, LEGACY_Z]}>
        <mesh material={skin} castShadow>
          <boxGeometry args={LEGACY.size} />
        </mesh>
        <Detail>
          {cracks.map((geometry, i) => (
            <mesh key={i} geometry={geometry} material={CRACKS} visible={hits > i} />
          ))}
          <Text
            visible={hits > 0 && hits < LEGACY_HITS}
            font={fontBold}
            fontSize={0.17}
            maxWidth={LEGACY.size[0] - 0.3}
            textAlign="center"
            position={[0.1, hits === 1 ? 0.62 : -0.62, LEGACY_HALF + 0.03]}
            rotation-z={hits === 1 ? 0.06 : -0.05}
            color={INK_WARN}
            anchorX="center"
            anchorY="middle"
            material-toneMapped={false}
          >
            {note[lang]}
          </Text>
        </Detail>
      </group>
      <Detail>
        <instancedMesh ref={rubble} args={[BOX, LIT, RUBBLE.length]} visible={false} />
        <mesh
          ref={pasta}
          geometry={tangle}
          material={LIT}
          position={[LEGACY_X, 0, LEGACY_Z]}
          scale={0.001}
          visible={false}
        />
        <Label id="legacy" text={TEXTS.legacy[lang]} color={INK_WARN} />
      </Detail>
    </>
  )
}

// ---------------------------------------------------------------- El recinto

/** Dónde va el arco (en coordenadas de la sala) y cuánto está girado */
const ARCH = local(ARCADE.arch.position)
const ARCH_YAW = ARCADE.arch.yaw
/** Medio ancho del arco, altura de sus pilares y altura del centro del dintel */
const ARCH_HALF = 1.75
const ARCH_PILLAR = 3.5
const ARCH_LINTEL = 3.87
/** Marcador: dónde va, medio ancho del panel y altura de su centro */
const BOARD = local(ARCADE.board)
const BOARD_HALF = 2.8
const BOARD_Y = 5.35

/**
 * Lo que hace de todo esto una sala: la valla con su filo de neón, el arco de
 * entrada con su rótulo, el marcador de cosas rotas contra el muro del fondo,
 * el camino de baldosas de luz y los pies y peanas de cada cosa (los tableros
 * de los rótulos, la placa de la red, el poste del grafo, el tapete de los dados).
 */
function Shell() {
  const lang = useLang()
  const count = useGame((s) => s.smashCount)

  const { frame, neon } = useMemo(() => {
    const frame: THREE.BufferGeometry[] = []
    const neon: THREE.BufferGeometry[] = []

    // Arco: dos pilares con basa y capitel, el dintel del rótulo y una cornisa.
    for (const side of [-1, 1]) {
      const px = side * ARCH_HALF
      frame.push(
        place(slab([0.42, ARCH_PILLAR, 0.42], [px, ARCH_PILLAR / 2, 0]), ARCH, ARCH_YAW),
        place(slab([0.62, 0.16, 0.62], [px, 0.08, 0]), ARCH, ARCH_YAW),
        place(slab([0.56, 0.12, 0.56], [px, ARCH_PILLAR - 0.06, 0]), ARCH, ARCH_YAW),
      )
      neon.push(place(slab([0.03, ARCH_PILLAR - 0.5, 0.03], [px, ARCH_PILLAR / 2, 0.226]), ARCH, ARCH_YAW))
    }
    frame.push(
      place(slab([ARCH_HALF * 2 + 0.8, 0.74, 0.36], [0, ARCH_LINTEL, 0]), ARCH, ARCH_YAW),
      place(slab([ARCH_HALF * 2 + 1.1, 0.1, 0.5], [0, ARCH_LINTEL + 0.42, 0]), ARCH, ARCH_YAW),
    )
    for (const side of [-1, 1]) {
      neon.push(place(slab([ARCH_HALF * 2 + 0.5, 0.03, 0.03], [0, ARCH_LINTEL + side * 0.3, 0.196]), ARCH, ARCH_YAW))
    }

    // Valla y muro del fondo, con un filo de luz por arriba y un poste en cada extremo.
    const posts = new Map<string, Vec3>()
    for (const fence of ARCADE.fences) {
      const [x, y, z] = local(fence.center)
      const [w, h, d] = fence.size
      frame.push(slab(fence.size, [x, y, z]))
      const along = w > d
      neon.push(slab(along ? [w - 0.4, 0.035, 0.035] : [0.035, 0.035, d - 0.4], [x, h + 0.018, z]))
      for (const end of [-1, 1]) {
        const post: Vec3 = along ? [x + (end * w) / 2, h, z] : [x, h, z + (end * d) / 2]
        const key = `${post[0].toFixed(2)}:${post[2].toFixed(2)}`
        // Donde se juntan dos tramos manda el más alto.
        posts.set(key, [post[0], Math.max(h, posts.get(key)?.[1] ?? 0), post[2]])
      }
    }
    for (const [x, h, z] of posts.values()) {
      frame.push(slab([0.3, h + 0.35, 0.3], [x, (h + 0.35) / 2, z]))
      neon.push(slab([0.32, 0.05, 0.32], [x, h + 0.375, z]))
    }

    // Marcador: dos postes, el panel y su marco de luz.
    const [bx, , bz] = BOARD
    for (const side of [-1, 1]) {
      frame.push(slab([0.2, BOARD_Y + 1, 0.2], [bx + side * (BOARD_HALF - 0.3), (BOARD_Y + 1) / 2, bz - 0.1]))
      neon.push(slab([0.035, 1.84, 0.035], [bx + side * (BOARD_HALF - 0.08), BOARD_Y, bz + 0.09]))
      neon.push(slab([BOARD_HALF * 2 - 0.16, 0.035, 0.035], [bx, BOARD_Y + side * 0.92, bz + 0.09]))
    }
    frame.push(slab([BOARD_HALF * 2, 2, 0.14], [bx, BOARD_Y, bz]))

    // Rótulos de pie: un poste y un tablero inclinado hacia la cámara, con un filo de luz debajo.
    for (const { at, width } of Object.values(PLAQUES)) {
      frame.push(
        slab([0.07, PLAQUE_Y - 0.1, 0.07], [at[0], (PLAQUE_Y - 0.1) / 2, at[2] - 0.02]),
        slab([width, 0.34, 0.05], [at[0], PLAQUE_Y, at[2]], [-PLAQUE_TILT, 0, 0]),
      )
      neon.push(slab([width, 0.025, 0.025], [at[0], PLAQUE_Y - 0.185, at[2] + 0.068]))
    }

    // Red neuronal: la placa sobre la que se alza.
    frame.push(slab(NET.size, [NET_X, NET.center[1], NET_Z]))
    neon.push(slab([NET.size[0] - 0.2, 0.025, 0.025], [NET_X, NET.size[1] + 0.012, NET_Z + NET.size[2] / 2 - 0.05]))

    // Grafo: el poste, el brazo del que cuelga el móvil y el tablero de su letrero.
    frame.push(
      slab([0.7, 0.1, 0.7], [GRAPH_X, 0.05, GRAPH_BACK]),
      slab([0.16, GRAPH_TOP, 0.16], [GRAPH_X, GRAPH_TOP / 2, GRAPH_BACK]),
      slab([0.1, 0.1, GRAPH_Z - GRAPH_BACK + 0.1], [GRAPH_X, GRAPH_HANG + 0.05, (GRAPH_Z + GRAPH_BACK) / 2]),
      slab([0.03, GRAPH_HANG - TREE[0].at[1], 0.03], [GRAPH_X, (GRAPH_HANG + TREE[0].at[1]) / 2, GRAPH_Z]),
      slab([1.9, 0.42, 0.06], [GRAPH_X, GRAPH_TOP + 0.3, GRAPH_BACK]),
    )

    // Campana de Gauss: la base del histograma.
    frame.push(slab([BELL_HALF * 2 + 0.3, 0.04, BELL.depth + 0.3], [BELL_X, 0.02, BELL_Z]))

    // Dados: el tapete, con su borde de luz.
    const pen = DICE.pen
    const [px, , pz] = local([(pen.minX + pen.maxX) / 2, 0, (pen.minZ + pen.maxZ) / 2])
    const pw = pen.maxX - pen.minX
    const pd = pen.maxZ - pen.minZ
    frame.push(slab([pw, 0.03, pd], [px, 0.015, pz]))
    for (const side of [-1, 1]) {
      neon.push(
        slab([pw, 0.03, 0.035], [px, 0.04, pz + (side * pd) / 2]),
        slab([0.035, 0.03, pd], [px + (side * pw) / 2, 0.04, pz]),
      )
    }

    // Camino de baldosas de luz, del mapa de siempre hasta el arco.
    for (const tile of ARCADE.path) {
      const [x, , z] = local(tile)
      neon.push(slab([0.62, 0.03, 0.62], [x, 0.02, z]))
    }
    return { frame: fuse(frame), neon: fuse(neon) }
  }, [])

  return (
    <>
      <mesh geometry={frame} material={STEEL} castShadow />
      <Detail>
        <mesh geometry={neon} material={NEON} />
        <group position={ARCH} rotation-y={ARCH_YAW}>
          <Text
            font={fontBold}
            fontSize={0.36}
            position={[0, ARCH_LINTEL, 0.2]}
            color={INK_SIGN}
            anchorX="center"
            anchorY="middle"
            whiteSpace="nowrap"
            material-toneMapped={false}
          >
            {TEXTS.room[lang]}
          </Text>
        </group>
        <Text
          font={fontBold}
          fontSize={0.3}
          position={[BOARD[0], BOARD_Y + 0.6, BOARD[2] + 0.09]}
          color={INK_LABEL}
          anchorX="center"
          anchorY="middle"
          whiteSpace="nowrap"
          material-toneMapped={false}
        >
          {TEXTS.score[lang]}
        </Text>
        <Text
          font={fontBold}
          fontSize={1}
          position={[BOARD[0], BOARD_Y - 0.26, BOARD[2] + 0.09]}
          color={INK_SCORE}
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          {count}
        </Text>
      </Detail>
    </>
  )
}

// ---------------------------------------------------------------- Poste indicador

/** Altura del centro del cartel del poste */
const SIGN_Y = 2.25

/** Poste con un cartel y una flecha de neón hacia la derecha: por ahí queda la sala. */
function Signpost() {
  const lang = useLang()
  const geometry = useMemo(
    () => ({
      post: fuse([
        slab([0.4, 0.08, 0.4], [0, 0.04, 0]),
        slab([0.1, SIGN_Y - 0.31, 0.1], [0, (SIGN_Y - 0.31) / 2, 0]),
        slab([2.9, 0.62, 0.08], [0, SIGN_Y, 0]),
      ]),
      // La flecha (asta y punta) y un filo bajo el cartel.
      arrow: fuse([
        slab([0.44, 0.05, 0.02], [1.02, SIGN_Y, 0.05]),
        slab([0.24, 0.05, 0.02], [1.155, SIGN_Y + 0.072, 0.05], [0, 0, -0.7]),
        slab([0.24, 0.05, 0.02], [1.155, SIGN_Y - 0.072, 0.05], [0, 0, 0.7]),
        slab([2.9, 0.03, 0.03], [0, SIGN_Y - 0.325, 0.05]),
      ]),
    }),
    [],
  )

  return (
    <Detail>
      <mesh geometry={geometry.post} material={STEEL} />
      <mesh geometry={geometry.arrow} material={NEON} />
      <Text
        font={fontBold}
        fontSize={0.2}
        position={[-0.3, SIGN_Y, 0.05]}
        color={INK_SIGN}
        anchorX="center"
        anchorY="middle"
        whiteSpace="nowrap"
        material-toneMapped={false}
      >
        {TEXTS.room[lang]}
      </Text>
    </Detail>
  )
}

export function Arcade() {
  const root = useRef<THREE.Group>(null)
  const post = useRef<THREE.Group>(null)

  useFrame(() => {
    appear(root.current, 3.8, 1.1)
    appear(post.current, 4.1, 0.9)
  })

  return (
    <>
      <group ref={root} position={ARCADE.origin}>
        <Shell />
        <Tests />
        <Network />
        <Gauss />
        <Dice />
        <Graph />
        <PullRequests />
        <Legacy />
      </group>
      <group ref={post} position={ARCADE.signpost}>
        <Signpost />
      </group>
    </>
  )
}
