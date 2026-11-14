import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import type { Localized } from '../data/career'
import { sfx } from '../game/audio'
import { playerSay } from '../game/events'
import { body } from '../game/state'
import { tr, useLang } from '../i18n'
import { useGame } from '../store'
import { world } from '../world/layout'
import { Detail } from './Detail'
import { introProgress } from './intro'
import { createScreenMaterial } from './materials/blocks'
import {
  createBeamMaterial,
  createNeonMaterial,
  createRackMaterial,
  uAlarm,
  uParty,
  uTime,
} from './materials/shaders'

/**
 * Parque tecnológico: lo que puebla los laterales del escenario. A la derecha,
 * un centro de datos con su nube, un globo holográfico y una grúa de
 * contenedores; a la izquierda, una cinta de CI/CD, una torre de antenas, una
 * tarjeta gráfica gigante y tres teclas que se pueden pisar.
 *
 * Solo las siluetas grandes van en la capa normal (reflejo y sombras); todo lo
 * demás va dentro de <Detail>. Lo estático de cada objeto se funde en una sola
 * geometría y lo repetido que se mueve va instanciado.
 */

type Vec3 = [number, number, number]

const PARK = world.props.park
const FLAT = -Math.PI / 2
const UP = new THREE.Vector3(0, 1, 0)

const DARK = new THREE.MeshStandardMaterial({ color: '#16181e', roughness: 0.45, metalness: 0.75 })
const CASE = new THREE.MeshStandardMaterial({ color: '#232733', roughness: 0.5, metalness: 0.65 })
const STEEL = new THREE.MeshStandardMaterial({ color: '#8d95a3', roughness: 0.3, metalness: 0.9 })
const WHITE = new THREE.MeshStandardMaterial({ color: '#e9edf3', roughness: 0.5 })
const BLADES = new THREE.MeshStandardMaterial({
  color: '#c3ccdb',
  roughness: 0.4,
  metalness: 0.4,
  emissive: '#22344f',
  emissiveIntensity: 0.8,
})
const CLOUD = new THREE.MeshStandardMaterial({
  color: '#e6eeff',
  roughness: 0.9,
  emissive: '#6f9dff',
  emissiveIntensity: 0.35,
})
const CRANE = new THREE.MeshStandardMaterial({ color: '#f2b705', roughness: 0.55, metalness: 0.3 })
const INK = new THREE.MeshBasicMaterial({ color: '#05070b' })

/** Rótulos y frases, en los dos idiomas (las palabras técnicas no se traducen). */
const TEXTS = {
  cloud: { es: 'LA NUBE', en: 'THE CLOUD' },
  cloudNote: { es: 'el ordenador de otro', en: "someone else's computer" },
  paste: {
    es: 'Ctrl+C, Ctrl+V. Lo llaman «reutilizar código».',
    en: 'Ctrl+C, Ctrl+V. They call it "code reuse".',
  },
} satisfies Record<string, Localized>

const hdr = (color: string, gain = 2.2) => new THREE.Color(color).multiplyScalar(gain)
const smooth = (t: number) => t * t * (3 - 2 * t)

/** Pseudoaleatorio estable 0..1 a partir de un entero. */
const rand = (n: number) => {
  const s = Math.sin(n * 12.9898 + 4.1) * 43758.5453
  return s - Math.floor(s)
}

/** Cada objeto crece desde el suelo con su propio retardo. */
function appear(group: THREE.Group | null, delay: number, duration = 1) {
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

/** Barra recta de sección cuadrada entre dos puntos. */
function strut(from: Vec3, to: Vec3, thickness: number) {
  const a = new THREE.Vector3(from[0], from[1], from[2])
  const b = new THREE.Vector3(to[0], to[1], to[2])
  const direction = b.clone().sub(a)
  const g = new THREE.BoxGeometry(thickness, direction.length(), thickness)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()))
  const middle = a.add(b).multiplyScalar(0.5)
  return g.translate(middle.x, middle.y, middle.z)
}

/** Funde varias piezas en una sola geometría: todo lo estático en un único dibujado. */
function fuse(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return merged
}

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

/** Aspas de un ventilador de radio 1 en el plano XY; cada uno las escala a su tamaño. */
const FAN = (() => {
  const blades = 7
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < blades; i++) {
    const blade = new THREE.BoxGeometry(0.74, 0.34, 0.03)
    blade.rotateX(0.55)
    blade.translate(0.58, 0, 0)
    blade.rotateZ((i / blades) * Math.PI * 2)
    parts.push(blade)
  }
  parts.push(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 20).rotateX(Math.PI / 2))
  return fuse(parts)
})()

/** Tira RGB: un arcoíris que corre a lo largo de uv.x (más deprisa en modo fiesta). */
function createRgbMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uParty, uAlarm },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uParty;
      uniform float uAlarm;
      varying vec2 vUv;
      void main() {
        float h = vUv.x - uTime * (0.25 + uParty * 0.9);
        vec3 col = (0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)))) * (1.6 + uParty * 0.8);
        vec3 alarm = vec3(1.0, 0.07, 0.04) * (0.6 + step(0.5, fract(uTime * 3.0))) * 1.5;
        gl_FragColor = vec4(mix(col, alarm, uAlarm), 1.0);
      }
    `,
    toneMapped: false,
  })
}

// ---------------------------------------------------------------- Centro de datos

const RACKS = 5
const RACK_PITCH = 1
const FAN_HEIGHTS = [0.74, 1.8]
const BITS_PER_COLUMN = 5
const BITS = RACKS * BITS_PER_COLUMN
const BIT_UP = hdr('#19e6ff', 2.4)
const BIT_DOWN = hdr('#3df2b0', 2.4)
const BIT_ALARM = hdr('#ff3b30', 2.8)

/**
 * Centro de datos: una fila de armarios con sus luces, un climatizador con dos
 * ventiladores y un cartel con las métricas. Encima flota LA NUBE, y los datos
 * suben y bajan entre los armarios y ella.
 */
function DataCenter() {
  const { racks, cloud, sign } = PARK
  const [w, h, d] = racks.size
  const lang = useLang()
  const leds = useMemo(() => createRackMaterial(7.7), [])
  const strip = useMemo(() => createNeonMaterial('#19e6ff', 1.5), [])
  const charts = useMemo(() => createScreenMaterial(1, '#3df2b0', 5), [])
  const root = useRef<THREE.Group>(null)
  const puff = useRef<THREE.Group>(null)
  const fans = useRef<Array<THREE.Mesh | null>>([])
  const bits = useRef<THREE.InstancedMesh>(null)
  const state = useRef({ spin: 0, alarm: -1 })
  const scratch = useMemo(() => new THREE.Matrix4(), [])

  const rackX = (k: number) => -w / 2 + RACK_PITCH * (k + 0.5)
  /** El hueco que dejan los armarios, al final de la fila, es el climatizador */
  const coolerX = (RACKS * RACK_PITCH) / 2
  const cloudX = cloud[0] - racks.center[0]
  const cloudZ = cloud[2] - racks.center[2]

  const geometry = useMemo(() => {
    const x = (k: number) => -w / 2 + RACK_PITCH * (k + 0.5)
    const cooler = (RACKS * RACK_PITCH) / 2
    return {
      // Los frontales en una sola malla; cada armario desplaza su UV y así parpadea distinto.
      fronts: fuse(
        Array.from({ length: RACKS }, (_, k) => {
          const g = new THREE.PlaneGeometry(RACK_PITCH - 0.16, h - 0.75)
          const uv = g.attributes.uv
          for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + k)
          return g.translate(x(k), 0.2 + (h - 0.75) / 2, d / 2 + 0.006)
        }),
      ),
      // Tira de luz bajo la cornisa y otra a ras de suelo.
      strips: fuse([
        slab([w - 0.12, 0.06, 0.04], [0, h - 0.2, d / 2 + 0.02]),
        slab([w, 0.04, 0.04], [0, 0.05, d / 2 + 0.02]),
      ]),
      // Bandeja de cables sobre los armarios.
      tray: fuse([
        slab([w - 0.2, 0.07, 0.5], [0, h + 0.26, -0.1]),
        ...[-1, 0, 1].map((i) => slab([0.06, 0.26, 0.4], [i * (w / 2 - 0.5), h + 0.13, -0.1])),
      ]),
      wells: fuse(FAN_HEIGHTS.map((y) => new THREE.CircleGeometry(0.46, 32).translate(cooler, y, d / 2 + 0.008))),
      rings: fuse(
        FAN_HEIGHTS.map((y) => new THREE.TorusGeometry(0.47, 0.035, 8, 40).translate(cooler, y, d / 2 + 0.03)),
      ),
      // Cartel: dos postes, el panel y su base.
      board: fuse([
        slab([1.9, 1.15, 0.07], [0, 1.72, 0]),
        slab([0.08, 1.15, 0.08], [-0.75, 0.575, 0]),
        slab([0.08, 1.15, 0.08], [0.75, 0.575, 0]),
        slab([2.1, 0.06, 0.4], [0, 0.03, 0]),
      ]),
      // La nube, a bloques: ninguna cara coincide con otra para que no parpadeen.
      cloud: fuse([
        slab([4.3, 0.75, 1.5], [0, 0, 0]),
        slab([1.5, 1, 1.3], [-1.05, 0.6, 0.02]),
        slab([1.9, 1.55, 1.45], [0.35, 0.8, 0]),
        slab([1.2, 0.8, 1.2], [1.45, 0.5, -0.03]),
        slab([0.9, 0.55, 1.1], [-1.95, 0.35, 0.05]),
      ]),
    }
  }, [w, h, d])

  useLayoutEffect(() => {
    // Los bits recorren toda la altura: se les da a mano la esfera de recorte.
    if (bits.current) bits.current.boundingSphere = new THREE.Sphere(new THREE.Vector3(cloudX, (h + cloud[1]) / 2, 0), 4.5)
  }, [cloudX, h, cloud])

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    const s = state.current
    appear(root.current, 2.9)

    // Con producción caída, los ventiladores se desbocan.
    s.spin += delta * (5 + uAlarm.value * 16)
    fans.current.forEach((fan, i) => {
      if (fan) fan.rotation.z = s.spin * (i ? -1 : 1)
    })

    const lift = Math.sin(t * 0.7) * 0.2
    if (puff.current) puff.current.position.set(cloudX + Math.sin(t * 0.31) * 0.25, cloud[1] + lift, cloudZ)

    const mesh = bits.current
    if (!mesh) return
    const alarm = uAlarm.value > 0.5 ? 1 : 0
    if (alarm !== s.alarm) {
      s.alarm = alarm
      for (let i = 0; i < BITS; i++) {
        mesh.setColorAt(i, alarm ? BIT_ALARM : Math.floor(i / BITS_PER_COLUMN) % 2 ? BIT_DOWN : BIT_UP)
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    // Columnas de datos entre cada armario y la nube: unas suben y otras bajan.
    const low = h + 0.45
    const high = cloud[1] + lift - 0.45
    for (let c = 0; c < RACKS; c++) {
      const from = rackX(c)
      const to = cloudX + (from - cloudX) * 0.6
      for (let j = 0; j < BITS_PER_COLUMN; j++) {
        const p = (t * 0.3 + j / BITS_PER_COLUMN + c * 0.37) % 1
        const u = c % 2 ? 1 - p : p
        const size = Math.min(1, p * 7, (1 - p) * 7)
        scratch.makeScale(size, size, size).setPosition(from + (to - from) * u, low + (high - low) * u, 0.1 * (1 - u))
        mesh.setMatrixAt(c * BITS_PER_COLUMN + j, scratch)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={root} position={[racks.center[0], 0, racks.center[2]]}>
      <mesh position-y={h / 2} material={CASE} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      <group ref={puff} position={[cloudX, cloud[1], cloudZ]}>
        <mesh geometry={geometry.cloud} material={CLOUD} />
        <Detail>
          <Text
            font={fontBold}
            fontSize={0.3}
            position={[0, 0.1, 0.76]}
            color="#18202f"
            anchorX="center"
            anchorY="middle"
            material-toneMapped={false}
          >
            {TEXTS.cloud[lang]}
          </Text>
          <Text
            font={fontBold}
            fontSize={0.15}
            position={[0, -0.19, 0.76]}
            color="#2b3850"
            anchorX="center"
            anchorY="middle"
            material-toneMapped={false}
          >
            {TEXTS.cloudNote[lang]}
          </Text>
        </Detail>
      </group>

      <Detail>
        <mesh geometry={geometry.fronts} material={leds} />
        <mesh geometry={geometry.strips} material={strip} />
        <mesh geometry={geometry.tray} material={STEEL} />

        {/* Climatizador: dos ventiladores al final de la fila */}
        <mesh geometry={geometry.wells} material={INK} />
        <mesh geometry={geometry.rings} material={strip} />
        {FAN_HEIGHTS.map((y, i) => (
          <mesh
            key={y}
            ref={(mesh) => {
              fans.current[i] = mesh
            }}
            geometry={FAN}
            material={BLADES}
            position={[coolerX, y, d / 2 + 0.07]}
            scale={0.42}
          />
        ))}

        {/* Cartel con las métricas, algo girado hacia el centro */}
        <group position={[sign[0] - racks.center[0], 0, sign[2] - racks.center[2]]} rotation-y={-0.3}>
          <mesh geometry={geometry.board} material={DARK} />
          <mesh position={[0, 1.57, 0.04]} material={charts}>
            <planeGeometry args={[1.7, 0.68]} />
          </mesh>
          <Text
            font={fontBold}
            fontSize={0.2}
            position={[0, 2.09, 0.04]}
            color={[0.5, 2.3, 3]}
            anchorX="center"
            anchorY="middle"
            material-toneMapped={false}
          >
            DATA CENTER
          </Text>
        </group>

        <instancedMesh ref={bits} args={[undefined, undefined, BITS]}>
          <boxGeometry args={[0.13, 0.13, 0.13]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      </Detail>
    </group>
  )
}

// ---------------------------------------------------------------- Cinta de CI/CD

const GATE_LABELS = ['BUILD', 'TEST', 'DEPLOY']
/** Altura libre bajo el dintel de cada puerta */
const GATE_CLEAR = 2.05
const PACKAGES = 8
const PACKAGE = 0.5
const BELT_SPEED = 1.15
/** Más o menos uno de cada ocho paquetes no pasa los tests */
const FAIL_RATE = 0.13
/** Distancia tras la puerta durante la que sigue encendida su luz */
const FLASH = 0.9
const KICK_UP = 3.2
const KICK_GRAVITY = 12
const TILE = 0.8

const GATE_IDLE = new THREE.Color(0.1, 0.14, 0.2)
const GATE_OK = new THREE.Color(0.25, 3.2, 1)
const GATE_BAD = new THREE.Color(3.8, 0.25, 0.15)
const GATE_ALARM = new THREE.Color(1.4, 0.08, 0.05)
/** Color del paquete según las puertas que lleva pasadas */
const PACKAGE_STAGES = [
  new THREE.Color(0.34, 0.38, 0.48),
  new THREE.Color(1.5, 0.95, 0.35),
  new THREE.Color(0.5, 1.4, 1.9),
  new THREE.Color(0.35, 1.9, 0.8),
]
const PACKAGE_FAILED = new THREE.Color(2.4, 0.25, 0.2)

/**
 * Cinta de CI/CD: los paquetes salen del repositorio y pasan por BUILD, TEST y
 * DEPLOY. Cada puerta se enciende en verde a su paso; de vez en cuando uno no
 * pasa los tests: la puerta se pone en rojo y el paquete sale despedido.
 */
function Pipeline() {
  const { belt, gates } = PARK
  const [length, top, width] = belt.size
  const gateX = useMemo(() => gates.map((x) => x - belt.center[0]), [gates, belt])
  const rails = useMemo(() => createNeonMaterial('#3df2b0', 1.1), [])
  const root = useRef<THREE.Group>(null)
  const lights = useRef<THREE.InstancedMesh>(null)
  const packages = useRef<THREE.InstancedMesh>(null)
  const state = useRef({ travel: 0, flash: [0, 0, 0], red: [false, false, false] })
  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(),
      s: new THREE.Vector3(),
      color: new THREE.Color(),
    }),
    [],
  )

  const geometry = useMemo(() => {
    const legs = [-length / 2 + 0.3, ...gateX, length / 2 - 0.3]
    return {
      // Patas, puertas (cuatro postes y un dintel) y las bocas de entrada y salida.
      frame: fuse([
        ...legs.flatMap((x) =>
          [-1, 1].map((side) => slab([0.12, top - 0.3, 0.12], [x, (top - 0.3) / 2, side * (width / 2 - 0.1)])),
        ),
        ...gateX.flatMap((x) => [
          ...[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) =>
              slab([0.12, GATE_CLEAR, 0.12], [x + sx * 0.62, GATE_CLEAR / 2, sz * (width / 2 + 0.22)]),
            ),
          ),
          slab([1.4, 0.46, width + 0.6], [x, GATE_CLEAR + 0.23, 0]),
        ]),
        ...[-1, 1].map((side) => slab([0.9, 0.95, width + 0.3], [side * (length / 2 - 0.45), top + 0.475, 0])),
      ]),
      rails: fuse(
        [-1, 1].map((side) => slab([length, 0.05, 0.03], [0, top - 0.06, side * (width / 2 + 0.016)])),
      ),
    }
  }, [length, top, width, gateX])

  const textures = useMemo(() => {
    // Goma de la cinta con flechas: la textura se desplaza al ritmo de los paquetes.
    const rubber = canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = '#0b0d12'
      ctx.fillRect(0, 0, 64, 64)
      ctx.strokeStyle = '#2b3447'
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.moveTo(18, 10)
      ctx.lineTo(40, 32)
      ctx.lineTo(18, 54)
      ctx.stroke()
    })
    rubber.wrapS = rubber.wrapT = THREE.RepeatWrapping
    rubber.repeat.set(length / TILE, 1)
    // Caja de cartón: borde marcado y la cinta de embalar.
    const crate = canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 64, 64)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.fillRect(26, 0, 12, 64)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.lineWidth = 6
      ctx.strokeRect(3, 3, 58, 58)
    })
    return { rubber, crate }
  }, [length])

  useLayoutEffect(() => {
    const mesh = lights.current
    if (mesh) {
      const m = new THREE.Matrix4()
      gateX.forEach((x, g) => {
        // La banda de luz abraza el dintel y asoma un poco por debajo.
        mesh.setMatrixAt(g, m.makeTranslation(x, GATE_CLEAR + 0.03, 0))
        mesh.setColorAt(g, GATE_IDLE)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
    const boxes = packages.current
    if (boxes) {
      for (let i = 0; i < PACKAGES; i++) boxes.setColorAt(i, PACKAGE_STAGES[0])
      // Los paquetes recorren toda la cinta: se les da a mano la esfera de recorte.
      boxes.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, top, 0.8), length / 2 + 1.5)
    }
  }, [gateX, length, top])

  useFrame(({ clock }, delta) => {
    const s = state.current
    const { m, p, q, e, s: scale, color } = scratch
    appear(root.current, 3.2)
    s.travel += Math.min(delta, 0.1) * BELT_SPEED
    textures.rubber.offset.x = -((s.travel / TILE) % 1)

    const boxes = packages.current
    const rest = top + PACKAGE / 2
    /** Tiempo que tarda en llegar al suelo un paquete despedido */
    const landing = (KICK_UP + Math.sqrt(KICK_UP * KICK_UP + 2 * KICK_GRAVITY * top)) / KICK_GRAVITY
    s.flash.fill(0)
    for (let i = 0; i < PACKAGES; i++) {
      const lap = s.travel / length + i / PACKAGES
      const cycle = Math.floor(lap)
      const x = (lap - cycle - 0.5) * length
      const failed = rand(cycle * PACKAGES + i) < FAIL_RATE

      // Qué puertas ha pasado ya y cuál acaba de cruzar.
      let stage = 0
      for (let g = 0; g < gateX.length; g++) {
        const past = x - gateX[g]
        if (past < 0 || (failed && g > 1)) break
        stage = g + 1
        const glow = 1 - past / FLASH
        if (glow > s.flash[g]) {
          s.flash[g] = glow
          s.red[g] = failed && g === 1
        }
      }
      if (!boxes) continue

      const fallen = failed ? (x - gateX[1]) / BELT_SPEED : -1
      if (fallen > 0) {
        // No pasa los tests: sale despedido hacia delante, rueda por el suelo y desaparece.
        const air = Math.min(fallen, landing)
        const slide = fallen > landing ? (1 - Math.exp(-(fallen - landing) * 4)) * 0.4 : 0
        p.set(
          gateX[1] + air * 0.6,
          Math.max(PACKAGE / 2, rest + KICK_UP * air - 0.5 * KICK_GRAVITY * air * air),
          air * 2.4 + slide,
        )
        // Media vuelta en el aire: aterriza plano, algo girado.
        q.setFromEuler(e.set((air / landing) * Math.PI, (air / landing) * 0.6, 0))
        const size = 1 - smooth(Math.min(1, Math.max(0, (fallen - 1.8) / 0.5)))
        m.compose(p, q, scale.setScalar(Math.max(0.001, size)))
        boxes.setColorAt(i, PACKAGE_FAILED)
      } else {
        m.makeTranslation(x, rest, 0)
        boxes.setColorAt(i, PACKAGE_STAGES[stage])
      }
      boxes.setMatrixAt(i, m)
    }
    if (boxes) {
      boxes.instanceMatrix.needsUpdate = true
      if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true
    }

    // Luces de las puertas: verde al pasar un paquete, rojo si no pasa los tests.
    const mesh = lights.current
    if (mesh) {
      const alarm = uAlarm.value > 0.5 && Math.sin(clock.elapsedTime * 9) > 0
      for (let g = 0; g < gateX.length; g++) {
        color.copy(alarm ? GATE_ALARM : GATE_IDLE).lerp(s.red[g] ? GATE_BAD : GATE_OK, Math.min(1, s.flash[g] * 1.6))
        mesh.setColorAt(g, color)
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })

  const fascia = (width + 0.6) / 2 + 0.012
  return (
    <group ref={root} position={[belt.center[0], 0, belt.center[2]]}>
      <mesh position-y={top - 0.15} material={DARK} castShadow receiveShadow>
        <boxGeometry args={[length, 0.3, width]} />
      </mesh>
      <mesh geometry={geometry.frame} material={CASE} />

      <Detail>
        <mesh rotation-x={FLAT} position-y={top + 0.004}>
          <planeGeometry args={[length, width - 0.1]} />
          <meshStandardMaterial map={textures.rubber} roughness={0.85} metalness={0.1} />
        </mesh>
        <mesh geometry={geometry.rails} material={rails} />

        <instancedMesh ref={lights} args={[undefined, undefined, GATE_LABELS.length]}>
          <boxGeometry args={[1.46, 0.09, width + 0.66]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
        {GATE_LABELS.map((label, g) => (
          <Text
            key={label}
            font={fontBold}
            fontSize={0.24}
            position={[gateX[g], GATE_CLEAR + 0.27, fascia]}
            color={[2.2, 2.4, 2.8]}
            anchorX="center"
            anchorY="middle"
            material-toneMapped={false}
          >
            {label}
          </Text>
        ))}
        <Text
          font={fontBold}
          fontSize={0.15}
          position={[-length / 2 + 0.45, top + 0.5, (width + 0.3) / 2 + 0.012]}
          color={[1.6, 1.7, 2]}
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          git push
        </Text>
        <Text
          font={fontBold}
          fontSize={0.24}
          position={[length / 2 - 0.45, top + 0.5, (width + 0.3) / 2 + 0.012]}
          color={[0.5, 2.4, 1]}
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          PROD
        </Text>

        <instancedMesh ref={packages} args={[undefined, undefined, PACKAGES]}>
          <boxGeometry args={[PACKAGE, PACKAGE, PACKAGE]} />
          <meshBasicMaterial map={textures.crate} toneMapped={false} />
        </instancedMesh>
      </Detail>
    </group>
  )
}

// ---------------------------------------------------------------- Torre de antenas

const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]
const RINGS = 4
const RING_COLOR = new THREE.Color(0.3, 1.6, 2.4)
const RING_ALARM = new THREE.Color(2.6, 0.3, 0.2)

/**
 * Torre de antenas: celosía que se estrecha hacia arriba, con una baliza roja
 * intermitente y ondas de señal que se abren desde la punta.
 */
function Tower() {
  const { tower, towerHeight } = PARK
  const half = tower.size[0] / 2
  const deck = tower.size[1]
  const root = useRef<THREE.Group>(null)
  const rings = useRef<THREE.InstancedMesh>(null)
  const beacon = useRef<THREE.MeshBasicMaterial>(null)
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), color: new THREE.Color() }), [])

  const geometry = useMemo(() => {
    /** Altura a la que acaba la celosía; por encima solo queda el mástil */
    const crown = towerHeight - 0.8
    const reach = (y: number) => half + (0.16 - half) * (y / crown)
    const corner = (y: number, i: number): Vec3 => {
      const [x, z] = CORNERS[i % 4]
      return [x * reach(y), y, z * reach(y)]
    }
    const levels = [0, deck / 2, deck, 4, 5.4, 6.8, crown]
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 4; i++) parts.push(strut(corner(0, i), corner(crown, i), 0.1))
    for (let l = 1; l < levels.length; l++) {
      for (let i = 0; i < 4; i++) {
        parts.push(strut(corner(levels[l], i), corner(levels[l], i + 1), 0.06))
        // Las diagonales cambian de sentido en cada tramo.
        const [a, b] = l % 2 ? [i, i + 1] : [i + 1, i]
        parts.push(strut(corner(levels[l - 1], a), corner(levels[l], b), 0.045))
      }
    }
    // Plataforma (hasta donde llega la colisión) y mástil.
    parts.push(slab([half * 2, 0.06, half * 2], [0, deck - 0.03, 0]))
    parts.push(slab([0.07, towerHeight - crown, 0.07], [0, (towerHeight + crown) / 2, 0]))

    const drum = (y: number, angle: number) => {
      const g = new THREE.CylinderGeometry(0.34, 0.34, 0.14, 20).rotateX(Math.PI / 2)
      return g.translate(0, y, reach(y) + 0.12).rotateY(angle)
    }
    const panel = (y: number, angle: number) =>
      new THREE.BoxGeometry(0.16, 0.8, 0.07).translate(0, y, reach(y) + 0.1).rotateY(angle)
    return {
      lattice: fuse(parts),
      // Parabólicas de tambor y antenas de panel.
      dishes: fuse([
        drum(6.1, 0.3),
        drum(4.9, -1.9),
        panel(7.5, 0),
        panel(7.5, (Math.PI * 2) / 3),
        panel(7.5, (Math.PI * 4) / 3),
      ]),
      // Baliza de la punta y dos luces a media altura.
      lamps: fuse([
        new THREE.SphereGeometry(0.13, 12, 10).translate(0, towerHeight + 0.1, 0),
        new THREE.SphereGeometry(0.07, 10, 8).translate(reach(5.4) + 0.06, 5.4, reach(5.4) + 0.06),
        new THREE.SphereGeometry(0.07, 10, 8).translate(-reach(5.4) - 0.06, 5.4, reach(5.4) + 0.06),
      ]),
    }
  }, [half, deck, towerHeight])

  useLayoutEffect(() => {
    const mesh = rings.current
    if (!mesh) return
    for (let i = 0; i < RINGS; i++) mesh.setColorAt(i, RING_COLOR)
    // Las ondas crecen mucho más que su geometría: esfera de recorte a mano.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, towerHeight, 0), 3.8)
  }, [towerHeight])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    appear(root.current, 3.4, 1.2)
    const alarm = uAlarm.value > 0.5
    // Baliza: un destello corto cada segundo y medio (mucho más nerviosa con la alarma).
    const period = alarm ? 0.3 : 1.5
    const on = t % period < period * 0.3
    if (beacon.current) beacon.current.color.setRGB(on ? 5 : 0.5, on ? 0.35 : 0.04, on ? 0.25 : 0.03)

    const mesh = rings.current
    if (!mesh) return
    for (let i = 0; i < RINGS; i++) {
      const p = (t * 0.4 + i / RINGS) % 1
      const radius = 0.25 + p * 3.2
      mesh.setMatrixAt(i, scratch.m.makeScale(radius, radius, 1).setPosition(0, towerHeight + 0.1, 0))
      mesh.setColorAt(i, scratch.color.copy(alarm ? RING_ALARM : RING_COLOR).multiplyScalar((1 - p) * (1 - p)))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <group ref={root} position={[tower.center[0], 0, tower.center[2]]}>
      <mesh geometry={geometry.lattice} material={STEEL} castShadow />
      <Detail>
        <mesh geometry={geometry.dishes} material={WHITE} />
        <mesh geometry={geometry.lamps}>
          <meshBasicMaterial ref={beacon} color={[5, 0.35, 0.25]} toneMapped={false} />
        </mesh>
        {/* Ondas de señal, de cara a la cámara */}
        <instancedMesh ref={rings} args={[undefined, undefined, RINGS]}>
          <torusGeometry args={[1, 0.012, 6, 64]} />
          <meshBasicMaterial
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
      </Detail>
    </group>
  )
}

// ---------------------------------------------------------------- Globo holográfico

const GLOBE_RADIUS = 1.2
const GLOBE_Y = 2.55
/** Latitud y longitud: Madrid, Nueva York, San Francisco, São Paulo, Singapur, Tokio y Sídney */
const CITIES: Array<[number, number]> = [
  [40, -4],
  [41, -74],
  [37, -122],
  [-23, -46],
  [1, 104],
  [35, 139],
  [-34, 151],
]
const ROUTES: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [0, 3],
  [0, 4],
  [4, 5],
  [4, 6],
  [2, 5],
]
const ARC_STEPS = 24
const PINGS = CITIES.length + ROUTES.length + 1
const CITY_COLOR = new THREE.Color(1.6, 2.6, 3)
const PING_COLOR = new THREE.Color(3.2, 1.8, 0.5)
const SATELLITE_COLOR = new THREE.Color(2.6, 2.6, 2.6)

function onSphere(lat: number, lon: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(lat)
  const theta = THREE.MathUtils.degToRad(lon)
  return new THREE.Vector3(
    Math.cos(phi) * Math.cos(theta) * radius,
    Math.sin(phi) * radius,
    -Math.cos(phi) * Math.sin(theta) * radius,
  )
}

/**
 * Globo holográfico: una esfera de meridianos y paralelos que gira sobre un
 * proyector, con rutas entre ciudades por las que viajan pulsos de datos.
 */
function Globe() {
  const { center, size } = PARK.globe
  const base = size[1]
  const ring = useMemo(() => createNeonMaterial('#19e6ff', 1.5), [])
  const beam = useMemo(() => createBeamMaterial('#19e6ff'), [])
  const root = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const pings = useRef<THREE.InstancedMesh>(null)
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3() }), [])

  const { lines, arcs, cities } = useMemo(() => {
    const cities = CITIES.map(([lat, lon]) => onSphere(lat, lon, 1))
    // Cada ruta es un arco de círculo máximo que se despega un poco de la esfera.
    const arcs = ROUTES.map(([from, to]) => {
      const a = cities[from]
      const b = cities[to]
      const angle = a.angleTo(b)
      return Array.from({ length: ARC_STEPS + 1 }, (_, k) => {
        const u = k / ARC_STEPS
        const point = a
          .clone()
          .multiplyScalar(Math.sin((1 - u) * angle))
          .addScaledVector(b, Math.sin(u * angle))
        return point.normalize().multiplyScalar(GLOBE_RADIUS * (1 + (0.1 + angle * 0.07) * Math.sin(u * Math.PI)))
      })
    })

    // Rejilla y rutas en una sola malla de líneas, cada una con su color.
    const positions: number[] = []
    const colors: number[] = []
    const segment = (a: THREE.Vector3, b: THREE.Vector3, r: number, g: number, bl: number) => {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
      colors.push(r, g, bl, r, g, bl)
    }
    for (let lon = 0; lon < 360; lon += 30) {
      for (let k = 0; k < 24; k++) {
        segment(
          onSphere(-90 + k * 7.5, lon, GLOBE_RADIUS),
          onSphere(-90 + (k + 1) * 7.5, lon, GLOBE_RADIUS),
          0.1,
          0.8,
          1.2,
        )
      }
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let k = 0; k < 48; k++) {
        segment(onSphere(lat, k * 7.5, GLOBE_RADIUS), onSphere(lat, (k + 1) * 7.5, GLOBE_RADIUS), 0.1, 0.8, 1.2)
      }
    }
    arcs.forEach((arc) => {
      for (let k = 0; k < ARC_STEPS; k++) segment(arc[k], arc[k + 1], 2.4, 1.2, 0.3)
    })
    const lines = new THREE.BufferGeometry()
    lines.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    lines.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    return { lines, arcs, cities }
  }, [])

  useLayoutEffect(() => {
    const mesh = pings.current
    if (!mesh) return
    for (let i = 0; i < PINGS; i++) {
      mesh.setColorAt(i, i < CITIES.length ? CITY_COLOR : i < PINGS - 1 ? PING_COLOR : SATELLITE_COLOR)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // Los pulsos se mueven por toda la esfera: esfera de recorte a mano.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GLOBE_RADIUS * 1.7)
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    appear(root.current, 2.6)
    if (spin.current) spin.current.rotation.y = t * 0.22
    const mesh = pings.current
    if (!mesh) return
    const { m, p } = scratch
    // Ciudades: puntos que laten.
    cities.forEach((city, i) => {
      const size = 1 + 0.45 * Math.sin(t * 3 + i * 1.7)
      mesh.setMatrixAt(i, m.makeScale(size, size, size).setPosition(p.copy(city).multiplyScalar(GLOBE_RADIUS)))
    })
    // Un pulso por ruta, de ciudad a ciudad.
    arcs.forEach((arc, i) => {
      const u = (t * 0.32 + i * 0.29) % 1
      const f = u * ARC_STEPS
      const k = Math.min(ARC_STEPS - 1, Math.floor(f))
      p.lerpVectors(arc[k], arc[k + 1], f - k)
      const size = Math.sin(u * Math.PI) * 1.5
      mesh.setMatrixAt(CITIES.length + i, m.makeScale(size, size, size).setPosition(p))
    })
    // Y un satélite en órbita inclinada.
    const a = t * 0.9
    p.set(Math.cos(a), Math.sin(a) * 0.4, Math.sin(a)).multiplyScalar(GLOBE_RADIUS * 1.45)
    mesh.setMatrixAt(PINGS - 1, m.makeScale(1.3, 1.3, 1.3).setPosition(p))
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={root} position={[center[0], 0, center[2]]}>
      {/* Proyector */}
      <mesh position-y={base / 2} rotation-y={Math.PI / 8} material={DARK} receiveShadow>
        <cylinderGeometry args={[0.72, 0.8, base, 8]} />
      </mesh>
      <Detail>
        <mesh position-y={base + 0.01} rotation-x={FLAT} material={ring}>
          <torusGeometry args={[0.56, 0.035, 8, 40]} />
        </mesh>
        <mesh position-y={base + 0.5} material={beam}>
          <cylinderGeometry args={[0.72, 0.28, 1, 32, 1, true]} />
        </mesh>
        {/* El eje va inclinado, como el de la Tierra */}
        <group position-y={GLOBE_Y} rotation-z={0.41}>
          <group ref={spin}>
            <lineSegments geometry={lines}>
              <lineBasicMaterial vertexColors toneMapped={false} />
            </lineSegments>
            {/* Núcleo translúcido: apaga las líneas de la cara de atrás */}
            <mesh>
              <sphereGeometry args={[GLOBE_RADIUS * 0.97, 28, 18]} />
              <meshBasicMaterial color="#04121f" transparent opacity={0.6} depthWrite={false} />
            </mesh>
            <instancedMesh ref={pings} args={[undefined, undefined, PINGS]}>
              <sphereGeometry args={[0.045, 10, 8]} />
              <meshBasicMaterial toneMapped={false} />
            </instancedMesh>
          </group>
        </group>
      </Detail>
    </group>
  )
}

// ---------------------------------------------------------------- Contenedores y grúa

/** De abajo arriba: primero la pila alta, luego la baja y, al final, el que cuelga de la grúa. */
const CARGO = [
  { label: 'DB', color: '#2f6df6' },
  { label: 'API', color: '#ff7a1a' },
  { label: 'AUTH', color: '#9b5cff' },
  { label: 'CACHE', color: '#ff4f6d' },
  { label: 'WEB', color: '#19c8e6' },
  { label: 'QUEUE', color: '#ffd60a' },
]
/** Ciclo de la grúa: espera abajo, sube, espera arriba y baja (segundos). */
const HOIST_REST = 2.5
const HOIST_MOVE = 3.5
const HOIST_HOLD = 2
const HOIST_CYCLE = HOIST_REST + HOIST_MOVE + HOIST_HOLD + HOIST_MOVE
const GANTRY_SPAN = 2.22
const GANTRY_BEAM = 6.45

/** Cuánto ha subido el contenedor de la grúa (0..1) en el instante t. */
function hoistLevel(t: number) {
  const p = t % HOIST_CYCLE
  if (p < HOIST_REST) return 0
  if (p < HOIST_REST + HOIST_MOVE) return smooth((p - HOIST_REST) / HOIST_MOVE)
  if (p < HOIST_REST + HOIST_MOVE + HOIST_HOLD) return 1
  return 1 - smooth((p - HOIST_REST - HOIST_MOVE - HOIST_HOLD) / HOIST_MOVE)
}

function CargoLabel({ label, position }: { label: string; position: Vec3 }) {
  return (
    <Text
      font={fontBold}
      fontSize={0.42}
      position={position}
      color={[1.25, 1.27, 1.32]}
      anchorX="center"
      anchorY="middle"
      material-toneMapped={false}
    >
      {label}
    </Text>
  )
}

/**
 * Contenedores (cada servicio en el suyo) apilados en dos columnas, y una grúa
 * pórtico que sube y baja el último. Su colisión viaja con él: te puedes subir.
 */
function Containers() {
  const { center, size, piles, hoisted } = PARK.containers
  const neon = useMemo(() => createNeonMaterial('#ffb020', 1.2), [])
  const root = useRef<THREE.Group>(null)
  const stacked = useRef<THREE.InstancedMesh>(null)
  const hook = useRef<THREE.Group>(null)
  const cables = useRef<THREE.Mesh>(null)

  const slots = useMemo(
    () =>
      piles.flatMap((pile) =>
        Array.from(
          { length: Math.round(pile.size[1] / size[1]) },
          (_, level): Vec3 => [pile.center[0] - center[0], (level + 0.5) * size[1], pile.center[2] - center[2]],
        ),
      ),
    [piles, size, center],
  )
  const hookX = hoisted.center[0] - center[0]
  const hookZ = hoisted.center[2] - center[2]
  const front = size[2] / 2 + 0.012

  const materials = useMemo(() => {
    // Chapa ondulada: una onda de claro a oscuro que se repite a lo largo de cada cara.
    const ribs = canvasTexture(32, 8, (ctx) => {
      for (let x = 0; x < 32; x++) {
        const v = Math.round(205 + 50 * Math.cos((x / 32) * Math.PI * 2))
        ctx.fillStyle = `rgb(${v},${v},${v})`
        ctx.fillRect(x, 0, 1, 8)
      }
    })
    ribs.wrapS = THREE.RepeatWrapping
    ribs.repeat.set(14, 1)
    return {
      stacked: new THREE.MeshStandardMaterial({ map: ribs, roughness: 0.65, metalness: 0.25 }),
      hoisted: new THREE.MeshStandardMaterial({
        map: ribs,
        color: CARGO[CARGO.length - 1].color,
        roughness: 0.65,
        metalness: 0.25,
      }),
    }
  }, [])

  const geometry = useMemo(() => {
    const foot = 1.05
    return {
      // Pórtico: dos patas en A, la viga y el carro del que cuelga el contenedor.
      gantry: fuse([
        ...[-1, 1].flatMap((sx) => [
          ...[-1, 1].map((sz) =>
            strut([sx * GANTRY_SPAN, 0, sz * foot], [sx * GANTRY_SPAN, GANTRY_BEAM - 0.08, 0], 0.16),
          ),
          slab([0.12, 0.12, 1.2], [sx * GANTRY_SPAN, 2.9, 0]),
          slab([0.3, 0.1, foot * 2 + 0.4], [sx * GANTRY_SPAN, 0.05, 0]),
        ]),
        slab([GANTRY_SPAN * 2 + 0.5, 0.32, 0.36], [0, GANTRY_BEAM + 0.06, 0]),
        slab([0.7, 0.22, 0.56], [hookX, GANTRY_BEAM - 0.21, 0]),
      ]),
      cables: fuse([slab([0.035, 1, 0.035], [-0.5, 0, 0]), slab([0.035, 1, 0.035], [0.5, 0, 0])]),
      // Bastidor que agarra el contenedor por arriba.
      spreader: fuse([
        slab([1.5, 0.1, 0.6], [0, size[1] / 2 + 0.13, 0]),
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => slab([0.08, 0.1, 0.08], [sx * 0.68, size[1] / 2 + 0.04, sz * 0.24])),
        ),
      ]),
    }
  }, [hookX, size])

  useLayoutEffect(() => {
    const mesh = stacked.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const color = new THREE.Color()
    slots.forEach((slot, i) => {
      mesh.setMatrixAt(i, m.makeTranslation(slot[0], slot[1], slot[2]))
      mesh.setColorAt(i, color.set(CARGO[i].color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [slots])

  useFrame(({ clock }) => {
    appear(root.current, 3.3)
    const y = hoisted.center[1] + hoisted.lift * hoistLevel(clock.elapsedTime + 4)
    // La colisión viaja con el contenedor: la física la lee cada frame.
    hoisted.collider.min[1] = y - size[1] / 2
    hoisted.collider.max[1] = y + size[1] / 2
    if (hook.current) hook.current.position.y = y
    if (cables.current) {
      const from = GANTRY_BEAM - 0.32
      const to = y + size[1] / 2 + 0.18
      cables.current.position.y = (from + to) / 2
      cables.current.scale.y = Math.max(0.01, from - to)
    }
  })

  return (
    <group ref={root} position={[center[0], 0, center[2]]}>
      <instancedMesh
        ref={stacked}
        args={[undefined, undefined, slots.length]}
        material={materials.stacked}
        castShadow
        receiveShadow
      >
        <boxGeometry args={size} />
      </instancedMesh>
      <mesh geometry={geometry.gantry} material={CRANE} castShadow />
      <group ref={hook} position={[hookX, hoisted.center[1], hookZ]}>
        <mesh material={materials.hoisted}>
          <boxGeometry args={size} />
        </mesh>
        <Detail>
          <mesh geometry={geometry.spreader} material={CRANE} />
          <CargoLabel label={CARGO[CARGO.length - 1].label} position={[0, 0, front]} />
        </Detail>
      </group>

      <Detail>
        <mesh ref={cables} geometry={geometry.cables} material={STEEL} position={[hookX, GANTRY_BEAM - 1, hookZ]} />
        <mesh position={[0, GANTRY_BEAM + 0.06, 0.195]} material={neon}>
          <boxGeometry args={[GANTRY_SPAN * 2, 0.05, 0.03]} />
        </mesh>
        {slots.map((slot, i) => (
          <CargoLabel key={CARGO[i].label} label={CARGO[i].label} position={[slot[0], slot[1], slot[2] + front]} />
        ))}
      </Detail>
    </group>
  )
}

// ---------------------------------------------------------------- Tarjeta gráfica

const GPU_FANS = [-1.45, -0.15, 1.15]

/** Tarjeta gráfica gigante, de canto sobre su ranura: dos ventiladores y su tira RGB. */
function Gpu() {
  const { center } = PARK.gpu
  const rgb = useMemo(() => createRgbMaterial(), [])
  const root = useRef<THREE.Group>(null)
  const fans = useRef<Array<THREE.Mesh | null>>([])
  const spin = useRef(0)

  const geometry = useMemo(
    () => ({
      // Placa trasera y la ranura en la que va pinchada.
      back: fuse([slab([4.4, 1.5, 0.05], [0, 0.97, -0.17]), slab([4.7, 0.18, 0.62], [0, 0.09, 0])]),
      wells: fuse(GPU_FANS.map((x) => new THREE.CircleGeometry(0.6, 36).translate(x, 0.97, 0.214))),
      // Aros de los ventiladores y la tira del canto, todo con el mismo arcoíris.
      rgb: fuse([
        ...GPU_FANS.map((x) => new THREE.TorusGeometry(0.58, 0.03, 8, 48).translate(x, 0.97, 0.235)),
        slab([4.3, 0.06, 0.06], [0.03, 1.69, 0.2]),
      ]),
    }),
    [],
  )

  useFrame((_, delta) => {
    appear(root.current, 2.7)
    spin.current += delta * (9 + uParty.value * 12 + uAlarm.value * 8)
    fans.current.forEach((fan) => {
      if (fan) fan.rotation.z = -spin.current
    })
  })

  return (
    <group ref={root} position={[center[0], 0, center[2]]}>
      {/* Carcasa */}
      <mesh position={[0.03, 0.97, 0.03]} material={CASE} castShadow receiveShadow>
        <boxGeometry args={[4.3, 1.4, 0.36]} />
      </mesh>
      <Detail>
        <mesh geometry={geometry.back} material={DARK} />
        {/* Chapa de los conectores */}
        <mesh position={[-2.25, 0.95, 0]} material={STEEL}>
          <boxGeometry args={[0.07, 1.62, 0.56]} />
        </mesh>
        <mesh geometry={geometry.wells} material={INK} />
        <mesh geometry={geometry.rgb} material={rgb} />
        {GPU_FANS.map((x, i) => (
          <mesh
            key={x}
            ref={(mesh) => {
              fans.current[i] = mesh
            }}
            geometry={FAN}
            material={BLADES}
            position={[x, 0.97, 0.262]}
            scale={0.52}
          />
        ))}
        <Text
          font={fontBold}
          fontSize={0.2}
          position={[1.96, 0.97, 0.214]}
          rotation-z={Math.PI / 2}
          color={[0.6, 2.4, 1.1]}
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          GPU 9090 Ti
        </Text>
      </Detail>
    </group>
  )
}

// ---------------------------------------------------------------- Teclas

const KEY_LABELS = ['Ctrl', 'C', 'V']
/** Cuánto se hunde una tecla al pisarla */
const KEY_TRAVEL = 0.1

/**
 * Tres teclas gigantes en el suelo. Al pisarlas se hunden (su colisión baja
 * con ellas) y suenan; pisar la C y luego la V tiene premio.
 */
function Keys() {
  const keys = PARK.keys
  const glow = useMemo(() => createNeonMaterial('#8b5cf6', 1.2), [])
  const root = useRef<THREE.Group>(null)
  const caps = useRef<Array<THREE.Group | null>>([])
  const state = useRef({ on: keys.map(() => false), press: keys.map(() => 0), last: -1 })

  // Tronco de pirámide de base 1×1: la forma de una tecla.
  const cap = useMemo(() => new THREE.CylinderGeometry(0.58, Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4), [])
  const materials = useMemo(
    () =>
      keys.map(
        () =>
          new THREE.MeshStandardMaterial({
            color: '#262b38',
            roughness: 0.55,
            metalness: 0.2,
            emissive: '#8b5cf6',
            emissiveIntensity: 0.12,
            flatShading: true,
          }),
      ),
    [keys],
  )

  const first = keys[0]
  const last = keys[keys.length - 1]
  const from = first.center[0] - first.size[0] / 2
  const to = last.center[0] + last.size[0] / 2
  const origin: Vec3 = [(from + to) / 2, 0, first.center[2]]
  const depth = first.size[2]

  useFrame((_, delta) => {
    appear(root.current, 3.1, 0.9)
    const s = state.current
    const play = useGame.getState().mode === 'play'
    const k = 1 - Math.exp(-18 * Math.min(delta, 0.05))
    keys.forEach((key, i) => {
      const c = key.collider
      const on =
        play &&
        body.grounded &&
        body.pos[0] > c.min[0] - 0.04 &&
        body.pos[0] < c.max[0] + 0.04 &&
        body.pos[2] > c.min[2] - 0.04 &&
        body.pos[2] < c.max[2] + 0.04 &&
        Math.abs(body.pos[1] - c.max[1]) < 0.14
      if (on && !s.on[i]) {
        sfx.beep()
        // Copiar y pegar: la C y, a continuación, la V.
        if (KEY_LABELS[i] === 'V' && KEY_LABELS[s.last] === 'C') playerSay(tr(TEXTS.paste))
        s.last = i
      }
      s.on[i] = on
      s.press[i] += ((on ? 1 : 0) - s.press[i]) * k
      // La colisión baja con la tecla: la física la lee cada frame.
      c.max[1] = key.size[1] - s.press[i] * KEY_TRAVEL
      const group = caps.current[i]
      if (group) group.position.y = -s.press[i] * KEY_TRAVEL
      materials[i].emissiveIntensity = 0.12 + s.press[i] * 1.8
    })
  })

  return (
    <group ref={root} position={origin}>
      <Detail>
        {/* Placa base y su luz */}
        <mesh position-y={0.02} material={DARK}>
          <boxGeometry args={[to - from + 0.3, 0.04, depth + 0.3]} />
        </mesh>
        <mesh position={[0, 0.03, depth / 2 + 0.15]} material={glow}>
          <boxGeometry args={[to - from + 0.3, 0.03, 0.03]} />
        </mesh>
        {keys.map((key, i) => (
          <group
            key={KEY_LABELS[i]}
            ref={(group) => {
              caps.current[i] = group
            }}
            position-x={key.center[0] - origin[0]}
          >
            <mesh position-y={key.size[1] / 2} scale={key.size} geometry={cap} material={materials[i]} />
            <Text
              font={fontBold}
              fontSize={i === 0 ? 0.3 : 0.46}
              position={[0, key.size[1] + 0.006, 0.02]}
              rotation-x={FLAT}
              color={[1.5, 2.2, 2.8]}
              anchorX="center"
              anchorY="middle"
              material-toneMapped={false}
            >
              {KEY_LABELS[i]}
            </Text>
          </group>
        ))}
      </Detail>
    </group>
  )
}

export function TechPark() {
  return (
    <>
      <DataCenter />
      <Globe />
      <Containers />
      <Pipeline />
      <Tower />
      <Gpu />
      <Keys />
    </>
  )
}
