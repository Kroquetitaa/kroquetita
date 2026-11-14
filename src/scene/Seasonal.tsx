import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import type { Localized } from '../data/career'
import { talkers } from '../data/folk'
import { sfx } from '../game/audio'
import { useSeason, type Season } from '../game/season'
import { body, lastLanding } from '../game/state'
import { useLang } from '../i18n'
import { useGame } from '../store'
import { world } from '../world/layout'
import { createCroquetaGeometry, createCroquetaMaterial } from './CroquetaRain'
import { Detail } from './Detail'
import { introProgress } from './intro'
import { createBeamMaterial, createBurstGeometry, createBurstMaterial, uTime } from './materials/shaders'

/**
 * Huevos de pascua por fechas: en Navidad nieva y hay un árbol en la plaza,
 * en Halloween salen calabazas, murciélagos y un fantasma, el 16 de enero
 * manda la croqueta y en fin de año se cuentan las doce uvas. Fuera de esas
 * fechas no se monta nada.
 *
 * Todo es procedimental y sin una sola luz: lo que brilla es emisivo. Lo
 * estático de cada temporada se funde en una o dos mallas y lo que se mueve va
 * instanciado. Nada tiene colisión.
 */

type Vec3 = [number, number, number]

const PLAZA = world.plaza
const UP = new THREE.Vector3(0, 1, 0)
const FORWARD = new THREE.Vector3(0, 0, 1)

/** Rótulos, en los dos idiomas. */
const TEXTS = {
  croqueta: {
    es: '16 DE ENERO\nDía Internacional de la Croqueta',
    en: 'JANUARY 16\nInternational Croqueta Day',
  },
  newYear: { es: '¡Feliz año!', en: 'Happy New Year!' },
} satisfies Record<string, Localized>

/** Aleatorio determinista: la decoración sale igual en cada carga. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

// ---------------------------------------------------------------- Piezas y material

/** Efecto de una pieza: [brilla (sin sombreado), fase 0..1, cuánto parpadea 0..1] */
const MATTE: Vec3 = [0, 0, 0]
const lit = (phase = 0, blink = 0): Vec3 => [1, phase, blink]

/** Da a toda la pieza su color y su efecto (atributos del material de vóxel). */
function paint<T extends THREE.BufferGeometry>(g: T, color: Vec3, fx: Vec3 = MATTE) {
  const count = g.attributes.position.count
  const colors = new Float32Array(count * 3)
  const effects = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors.set(color, i * 3)
    effects.set(fx, i * 3)
  }
  g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  g.setAttribute('aFx', new THREE.BufferAttribute(effects, 3))
  return g
}

/** Caja ya colocada (y girada sobre su centro) y pintada, lista para fundirse con otras. */
function box(size: Vec3, at: Vec3, color: Vec3, fx: Vec3 = MATTE, rotation?: Vec3) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2])
  if (rotation) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)))
  return paint(g.translate(at[0], at[1], at[2]), color, fx)
}

/** Lleva un objeto montado en el origen a su sitio, girado y a escala. */
function move(parts: THREE.BufferGeometry[], at: Vec3, yaw = 0, scale = 1) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(at[0], at[1], at[2]),
    new THREE.Quaternion().setFromAxisAngle(UP, yaw),
    new THREE.Vector3(scale, scale, scale),
  )
  parts.forEach((part) => part.applyMatrix4(m))
  return parts
}

/** Funde varias piezas en una sola geometría: todo lo estático en un único dibujado. */
function fuse(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return merged
}

/** Cubo unidad para instanciar, con color y efecto por instancia. */
function instancedCube(colors: Float32Array, effects: Float32Array) {
  const g = new THREE.BoxGeometry(1, 1, 1)
  g.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3))
  g.setAttribute('aFx', new THREE.InstancedBufferAttribute(effects, 3))
  return g
}

/**
 * Material de vóxel: color por pieza y un sombreado fijo por cara, sin luces
 * (de noche se ve igual que de día). Las piezas que «brillan» se saltan el
 * sombreado y pueden parpadear cada una a su ritmo; con el color por encima
 * de 1 las recoge el bloom. Vale para mallas sueltas y para instancias.
 */
function createVoxelMaterial(opacity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec3 aColor;
      attribute vec3 aFx;
      varying vec3 vColor;
      #include <fog_pars_vertex>
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        vec3 n = normalize(mat3(m) * normal);
        // Arriba lo más claro; después, lo que mira a la cámara.
        float shade = 0.42 + 0.4 * max(n.y, 0.0) + 0.2 * max(n.z, 0.0) + 0.1 * abs(n.x);
        float wave = 0.5 + 0.5 * sin(uTime * (1.6 + aFx.y * 2.4) + aFx.y * 43.0);
        float blink = mix(1.0, 0.15 + 1.1 * wave * wave, aFx.z);
        vColor = aColor * mix(shade, blink, aFx.x);
        vec4 mvPosition = viewMatrix * m * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec3 vColor;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(vColor, uOpacity);
        #include <fog_fragment>
      }
    `,
    transparent: opacity < 1,
    fog: true,
    toneMapped: false,
  })
}

// ---------------------------------------------------------------- Aparición

/** La decoración sale cuando el escenario ya ha terminado de montarse */
const INTRO = 3.4
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

type Appear = (delay?: number, duration?: number) => number

/**
 * Progreso 0..1 con el que crece la decoración: tras la entrada del escenario
 * al cargar, o en el momento en que el terminal cambia de temporada.
 */
function useAppear(): Appear {
  const [born] = useState(() => uTime.value)
  return useCallback(
    (delay = 0, duration = 1.1) => {
      const local = 1 - Math.pow(1 - clamp01((uTime.value - born - delay) / duration), 3)
      return Math.min(introProgress(INTRO + delay, duration), local)
    },
    [born],
  )
}

/** Crece desde el suelo (solo en altura: sirve para lo que está repartido por el escenario). */
function rise(object: THREE.Object3D | null, k: number) {
  if (object) object.scale.y = Math.max(0.001, k)
}

/** Crece desde su propio centro. */
function pop(object: THREE.Object3D | null, k: number, size = 1) {
  if (object) object.scale.setScalar(Math.max(0.001, k * size))
}

/** Geometrías y materiales de una temporada: se sueltan al desmontarla. */
function useKit<T extends { trash: Array<{ dispose: () => void }> }>(build: () => T) {
  // La decoración se calcula una sola vez, al montar la temporada.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kit = useMemo(build, [])
  useEffect(() => () => kit.trash.forEach((item) => item.dispose()), [kit])
  return kit
}

// ---------------------------------------------------------------- Sitio en la plaza

type Area = [x: number, z: number, radius: number]

/**
 * Reparte sitios libres por la plaza: lejos de lo que colisiona a ras de
 * suelo, de los personajes, de la salida y de lo que se pisa o se recoge.
 * Devuelve el punto libre más cercano al que se pide y se lo queda.
 */
function createPlacer() {
  const [tableX, , tableZ] = world.props.table.center
  const [portal] = world.props.portals
  const taken: Area[] = [
    ...talkers.map(({ position }): Area => [position[0], position[1], 2]),
    [world.spawn[0], world.spawn[2], 2],
    // Los taburetes que rodean la mesa de las IA.
    [tableX, tableZ, 2.55],
    [world.props.duck[0], world.props.duck[2], 0.8],
    [portal[0], portal[2], 1.3],
    ...world.pads.map((pad): Area => [pad.position[0], pad.position[2], pad.radius + 0.6]),
    ...world.coins
      .filter((coin) => coin.position[1] < 1.5)
      .map((coin): Area => [coin.position[0], coin.position[2], 0.7]),
  ]

  const fits = (x: number, z: number, radius: number) => {
    if (x < PLAZA.minX + radius || x > PLAZA.maxX - radius) return false
    if (z < PLAZA.minZ + radius || z > PLAZA.maxZ - radius) return false
    for (const c of world.colliders) {
      if (c.min[1] > 0.6) continue
      if (x > c.min[0] - radius && x < c.max[0] + radius && z > c.min[2] - radius && z < c.max[2] + radius) {
        return false
      }
    }
    return taken.every(([ax, az, reach]) => Math.hypot(x - ax, z - az) >= reach + radius)
  }

  return (x: number, z: number, radius: number): [number, number] => {
    // Anillos cada vez más anchos alrededor del punto pedido.
    for (let ring = 0; ring <= 16; ring++) {
      const steps = ring === 0 ? 1 : 6 + ring * 2
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2 + ring * 0.7
        const px = x + Math.sin(angle) * ring * 0.5
        const pz = z + Math.cos(angle) * ring * 0.5
        if (fits(px, pz, radius)) {
          taken.push([px, pz, radius])
          return [px, pz]
        }
      }
    }
    return [x, z]
  }
}

// ---------------------------------------------------------------- Gorros

/** Medidas del muñeco (Player.tsx): escala, pivote de la voltereta y pivote de la cabeza */
const PLAYER_SCALE = 1.15
const CHEST_Y = 0.45
const HEAD_Y = 0.5

/*
 * Los gorros se modelan en el espacio de la cabeza del jugador: origen en su
 * pivote (0,5 sobre los pies), coronilla en y = 0,43, cara hacia +Z. La
 * capucha mide 0,52 × 0,46 y su pico asoma por detrás hasta y ≈ 0,58: el
 * primer piso de cada gorro lo tapa.
 */

/** Gorro de Papá Noel: borde de piel, cuerpo rojo que se dobla hacia un lado y borla. */
function santaHat() {
  const RED: Vec3 = [0.82, 0.05, 0.07]
  const FUR: Vec3 = [0.86, 0.88, 0.95]
  return fuse([
    box([0.64, 0.14, 0.58], [0, 0.44, -0.01], FUR),
    box([0.52, 0.15, 0.48], [0, 0.585, -0.02], RED),
    box([0.4, 0.14, 0.38], [0.02, 0.73, -0.03], RED),
    box([0.28, 0.13, 0.28], [0.07, 0.865, -0.03], RED),
    box([0.19, 0.11, 0.2], [0.16, 0.95, -0.03], RED),
    box([0.14, 0.13, 0.16], [0.28, 0.9, -0.03], RED),
    box([0.17, 0.17, 0.17], [0.37, 0.79, -0.03], [1.15, 1.15, 1.3], lit()),
  ])
}

/** Sombrero de bruja: ala ancha, cinta de neón con hebilla y la punta torcida. */
function witchHat() {
  const FELT: Vec3 = [0.24, 0.1, 0.42]
  const BAND: Vec3 = [2.1, 0.75, 0.1]
  return fuse([
    box([0.92, 0.05, 0.88], [0, 0.455, -0.01], FELT),
    box([0.5, 0.16, 0.46], [0, 0.56, -0.02], FELT),
    box([0.53, 0.06, 0.49], [0, 0.52, -0.02], BAND, lit()),
    box([0.13, 0.1, 0.02], [0, 0.52, 0.232], [2.4, 1.9, 0.5], lit()),
    box([0.38, 0.16, 0.36], [0, 0.72, -0.03], FELT),
    box([0.27, 0.15, 0.26], [0.02, 0.875, -0.05], FELT),
    box([0.18, 0.14, 0.18], [0.06, 1.02, -0.08], FELT),
    box([0.11, 0.12, 0.11], [0.12, 1.14, -0.11], FELT),
  ])
}

/** Gorro de cocinero, para el día de la croqueta. */
function chefHat() {
  const WHITE: Vec3 = [0.88, 0.88, 0.93]
  return fuse([
    box([0.58, 0.2, 0.54], [0, 0.5, -0.02], WHITE),
    box([0.72, 0.24, 0.66], [0, 0.72, -0.02], WHITE),
    box([0.56, 0.1, 0.5], [0, 0.89, -0.02], WHITE),
  ])
}

/** Gorro de cotillón: cono a rayas con su borla. */
function partyHat() {
  const PINK: Vec3 = [0.92, 0.12, 0.55]
  const GOLD: Vec3 = [0.95, 0.7, 0.15]
  return fuse([
    box([0.44, 0.14, 0.46], [0, 0.5, -0.04], PINK),
    box([0.34, 0.13, 0.36], [0, 0.635, -0.04], GOLD),
    box([0.26, 0.13, 0.27], [0, 0.765, -0.04], PINK),
    box([0.18, 0.13, 0.18], [0, 0.895, -0.04], GOLD),
    box([0.1, 0.12, 0.1], [0, 1.02, -0.04], PINK),
    box([0.15, 0.15, 0.15], [0, 1.15, -0.04], [1.5, 1.5, 1.7], lit(0.4, 0.3)),
  ])
}

/**
 * Gorro del jugador: sigue a `body.pos` cada fotograma y repite los gestos del
 * muñeco (voltereta del doble salto, achatarse al caer, cabeceo) para no
 * despegarse de la cabeza.
 */
function PlayerHat({
  geometry,
  material,
  grow,
}: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  grow: Appear
}) {
  const root = useRef<THREE.Group>(null)
  const flip = useRef<THREE.Group>(null)
  const squash = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const hat = useRef<THREE.Mesh>(null)
  const state = useRef({ flip: 0, air: 0, jumps: 1 })

  useFrame(({ clock }, delta) => {
    const s = state.current
    const t = clock.elapsedTime
    const dt = Math.min(delta, 1 / 20)
    const playing = useGame.getState().mode === 'play'
    const airborne = playing && !body.grounded
    const moving = playing && body.grounded ? body.speed : 0

    // Doble salto: voltereta completa hacia delante, como la del muñeco.
    if (airborne && s.jumps > 0 && body.airJumps === 0) s.flip = Math.PI * 2
    s.jumps = body.airJumps
    s.flip = Math.max(0, s.flip - dt * 13)
    s.air += ((airborne ? 1 : 0) - s.air) * (1 - Math.exp(-14 * dt))
    const landed = Math.max(0, 1 - (performance.now() - lastLanding.time) * 0.006)

    if (root.current) {
      root.current.position.set(body.pos[0], body.pos[1], body.pos[2])
      root.current.rotation.y = body.facing
    }
    if (flip.current) flip.current.rotation.x = s.flip > 0 ? (1 - s.flip / (Math.PI * 2)) * Math.PI * 2 : 0
    if (squash.current) {
      const wide = 1 + landed * 0.16
      squash.current.scale.set(wide, 1 - landed * 0.22 + Math.sin(t * 2.4) * 0.015, wide)
      squash.current.rotation.x = moving * 0.16
    }
    if (head.current) {
      const typing = moving < 0.05 && !airborne
      head.current.rotation.z = Math.sin(t * 1.3) * 0.05
      head.current.rotation.x = typing ? 0.12 + Math.sin(t * 2.1) * 0.03 : -s.air * 0.25
    }
    pop(hat.current, grow(0.5, 0.6))
  })

  return (
    <Detail>
      <group ref={root} scale={PLAYER_SCALE}>
        <group ref={flip} position-y={CHEST_Y}>
          <group ref={squash} position-y={-CHEST_Y}>
            <group ref={head} position-y={HEAD_Y}>
              <mesh ref={hat} geometry={geometry} material={material} scale={0.001} />
            </group>
          </group>
        </group>
      </group>
    </Detail>
  )
}

// ---------------------------------------------------------------- Navidad

/** Colores de las bombillas (por encima de 1: las recoge el bloom) */
const BULBS: Vec3[] = [
  [2.6, 0.25, 0.2],
  [0.3, 2.2, 0.5],
  [2.4, 1.6, 0.3],
  [0.3, 1, 2.6],
  [2.2, 0.4, 1.6],
]

/** Volumen de la nevada (ancho, alto, fondo) y cuántos copos caben */
const SNOW_SIZE: Vec3 = [76, 30, 44]
const FLAKES = 2600

/**
 * Nieve: un solo `Points` con todo el movimiento en el shader. El volumen se
 * repite alrededor de `uCenter`, así que sigue al jugador sin que los copos
 * se muevan con él: cada uno conserva su sitio en el mundo.
 */
function createSnow() {
  const rand = rng(2512)
  const positions = new Float32Array(FLAKES * 3)
  const seeds = new Float32Array(FLAKES)
  for (let i = 0; i < FLAKES; i++) {
    positions.set([rand(), rand(), rand()], i * 3)
    seeds[i] = rand()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uPixelRatio: { value: 1 },
      uAmount: { value: 0 },
      uCenter: { value: new THREE.Vector3(0, SNOW_SIZE[1] / 2, 0) },
      uSize: { value: new THREE.Vector3(...SNOW_SIZE) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uAmount;
      uniform vec3 uCenter;
      uniform vec3 uSize;
      attribute float aSeed;
      varying float vAlpha;
      void main() {
        // La posición viene en 0..1: se estira al volumen, cae y se mece con el viento.
        vec3 p = position * uSize;
        p.y -= uTime * (0.9 + aSeed * 1.3);
        p.x += sin(uTime * (0.5 + aSeed) + aSeed * 40.0) * 0.55 + uTime * 0.25;
        p.z += cos(uTime * (0.4 + aSeed * 0.7) + aSeed * 17.0) * 0.45;
        // El volumen se repite alrededor del centro.
        vec3 low = uCenter - uSize * 0.5;
        p = low + mod(p - low, uSize);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((4.5 + aSeed * 6.5) * uPixelRatio / -mv.z, 1.5, 40.0);
        // Se funde al llegar al suelo y a lo lejos.
        float ground = smoothstep(0.0, 1.2, p.y - low.y);
        vAlpha = (0.45 + 0.4 * fract(aSeed * 7.0)) * ground * smoothstep(95.0, 45.0, -mv.z) * uAmount;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.25, d) * vAlpha;
        gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * a * 1.15, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  return { geometry, material }
}

/** Abeto de vóxeles (4,5 de alto): pisos con nieve, bombillas en los aleros y estrella. */
function pine(rand: () => number) {
  const GREEN: Vec3 = [0.06, 0.5, 0.2]
  const SNOWY: Vec3 = [0.8, 0.86, 0.95]
  const STAR: Vec3 = [2.6, 1.9, 0.5]
  const parts = [box([0.42, 0.62, 0.42], [0, 0.31, 0], [0.32, 0.17, 0.08])]
  let y = 0.6
  let bulb = 0
  ;[2.6, 2.1, 1.65, 1.25, 0.9, 0.56, 0.28].forEach((width, level) => {
    const tall = level < 4 ? 0.5 : 0.42
    parts.push(
      box([width, tall, width], [0, y + tall / 2, 0], GREEN),
      box([width - 0.08, 0.05, width - 0.08], [0, y + tall + 0.025, 0], SNOWY),
    )
    // Bombillas a lo largo de los cuatro aleros, a dos alturas.
    const perSide = Math.max(1, Math.round(width / 0.52))
    const out = width / 2 + 0.03
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < perSide; i++) {
        const along = ((i + 0.5) / perSide - 0.5) * width
        const x = side === 0 ? along : side === 1 ? out : side === 2 ? -along : -out
        const z = side === 0 ? out : side === 1 ? -along : side === 2 ? -out : along
        const color = BULBS[bulb++ % BULBS.length]
        parts.push(box([0.11, 0.11, 0.11], [x, y + 0.14 + (i % 2) * 0.12, z], color, lit(rand(), 1)))
      }
    }
    y += tall
  })
  const top = y + 0.36
  parts.push(
    box([0.56, 0.16, 0.12], [0, top, 0], STAR, lit(0.3, 0.2)),
    box([0.16, 0.56, 0.12], [0, top, 0], STAR, lit(0.3, 0.2)),
    box([0.3, 0.3, 0.14], [0, top, 0], STAR, lit(0.3, 0.2)),
  )
  return parts
}

/** Regalo: caja con su lazo en cruz. */
function gift(size: number, tall: number, paper: Vec3, ribbon: Vec3) {
  return [
    box([size, tall, size], [0, tall / 2, 0], paper),
    box([size + 0.02, tall + 0.01, size * 0.2], [0, tall / 2 + 0.005, 0], ribbon, lit()),
    box([size * 0.2, tall + 0.01, size + 0.02], [0, tall / 2 + 0.005, 0], ribbon, lit()),
    box([size * 0.45, 0.1, size * 0.16], [0, tall + 0.06, 0], ribbon, lit(), [0, 0.6, 0]),
    box([size * 0.45, 0.1, size * 0.16], [0, tall + 0.06, 0], ribbon, lit(), [0, -0.6, 0]),
  ]
}

/** Guirnaldas: un cable con bombillas por el borde de la azotea (frente y costados) de la primera fila. */
function garlands(rand: () => number) {
  const WIRE: Vec3 = [0.04, 0.14, 0.07]
  const parts: THREE.BufferGeometry[] = []
  let bulb = 0
  for (const block of world.blocks) {
    if (block.row !== 0) continue
    const y = block.height
    const halfX = block.width / 2 - 0.06
    const halfZ = block.depth / 2 - 0.06
    const corners: Array<[number, number]> = [
      [block.x - halfX, block.z - halfZ],
      [block.x - halfX, block.z + halfZ],
      [block.x + halfX, block.z + halfZ],
      [block.x + halfX, block.z - halfZ],
    ]
    for (let run = 0; run < 3; run++) {
      const [fromX, fromZ] = corners[run]
      const [toX, toZ] = corners[run + 1]
      const length = Math.hypot(toX - fromX, toZ - fromZ)
      const alongX = Math.abs(toX - fromX) > Math.abs(toZ - fromZ)
      parts.push(
        box(
          alongX ? [length, 0.025, 0.025] : [0.025, 0.025, length],
          [(fromX + toX) / 2, y + 0.02, (fromZ + toZ) / 2],
          WIRE,
        ),
      )
      const count = Math.max(2, Math.round(length / 0.44))
      for (let i = 0; i < count; i++) {
        const k = (i + 0.5) / count
        const at: Vec3 = [fromX + (toX - fromX) * k, y + 0.1, fromZ + (toZ - fromZ) * k]
        parts.push(box([0.09, 0.13, 0.09], at, BULBS[bulb++ % BULBS.length], lit(rand(), 1)))
      }
    }
  }
  return parts
}

function buildXmas() {
  const rand = rng(1224)
  const place = createPlacer()
  const [treeX, treeZ] = place(7.4, 13.3, 1.4)
  const tree = fuse(move(pine(rand), [treeX, 0, treeZ]))

  // Tres regalos al pie del árbol, cada uno a su aire.
  const presents: Array<{ at: [number, number]; size: number; tall: number; paper: Vec3; ribbon: Vec3 }> = [
    { at: [-1.75, 0.95], size: 0.7, tall: 0.5, paper: [0.8, 0.07, 0.1], ribbon: [1.7, 1.25, 0.3] },
    { at: [1.7, 1.05], size: 0.55, tall: 0.62, paper: [0.1, 0.3, 0.9], ribbon: [1.3, 1.4, 1.6] },
    { at: [0.35, 1.9], size: 0.46, tall: 0.36, paper: [0.1, 0.55, 0.22], ribbon: [1.9, 0.25, 0.2] },
  ]
  const decor = fuse([
    ...garlands(rand),
    ...presents.flatMap((present) => {
      const [x, z] = place(treeX + present.at[0], treeZ + present.at[1], 0.45)
      const parts = gift(present.size, present.tall, present.paper, present.ribbon)
      return move(parts, [x, 0, z], rand() * 1.2 - 0.6)
    }),
  ])

  const snow = createSnow()
  const voxel = createVoxelMaterial()
  const hat = santaHat()
  return { tree, decor, snow, voxel, hat, trash: [tree, decor, snow.geometry, snow.material, voxel, hat] }
}

/** Navidad: nieve, árbol con luces y regalos en la plaza, guirnaldas en las azoteas y gorro de Papá Noel. */
function Xmas() {
  const grow = useAppear()
  const kit = useKit(buildXmas)
  const tree = useRef<THREE.Mesh>(null)
  const decor = useRef<THREE.Mesh>(null)

  useFrame(({ gl, size }) => {
    rise(tree.current, grow(0, 1.3))
    rise(decor.current, grow(0.4, 1.1))

    // La nevada se centra en lo que se está mirando: el jugador, la caja del recorrido o la portada.
    const game = useGame.getState()
    const uniforms = kit.snow.material.uniforms
    const center = uniforms.uCenter.value as THREE.Vector3
    if (game.mode === 'play') {
      center.x = body.pos[0]
      center.z = body.pos[2] + 2
    } else if (game.mode === 'tour') {
      const block = world.blocks[game.stage] ?? world.blocks[0]
      center.x = block.x
      center.z = block.z + 6
    } else {
      center.x = world.view.look[0]
      center.z = 6
    }
    uniforms.uAmount.value = grow(0, 2.5)
    uniforms.uPixelRatio.value = gl.getPixelRatio() * (size.height / 900) * 13
  })

  return (
    <>
      {/* El árbol es grande: entra en el reflejo del suelo y da sombra */}
      <mesh ref={tree} geometry={kit.tree} material={kit.voxel} castShadow />
      <Detail>
        <mesh ref={decor} geometry={kit.decor} material={kit.voxel} />
        <points geometry={kit.snow.geometry} material={kit.snow.material} frustumCulled={false} />
      </Detail>
      <PlayerHat geometry={kit.hat} material={kit.voxel} grow={grow} />
    </>
  )
}

// ---------------------------------------------------------------- Halloween

/** Dónde se quieren las calabazas (x, z): repartidas por toda la plaza */
const PUMPKINS: Array<[number, number]> = [
  [-24.6, 14.6],
  [-16.4, 15.2],
  [-10.4, 13.6],
  [-2.4, 9.8],
  [5.6, 14.8],
  [11.2, 12.8],
  [19.2, 10],
  [26.4, 13.8],
]
const BATS = 20
/** Piezas de cada murciélago: cuerpo, dos alas y los ojos */
const BAT_PARTS = 4

/** Calabaza (0,8 de ancho) con la cara recortada y encendida por dentro; mira hacia +Z. */
function pumpkin(phase: number) {
  const ORANGE: Vec3 = [0.95, 0.36, 0.04]
  const RIND: Vec3 = [0.72, 0.24, 0.03]
  const FIRE: Vec3 = [2.6, 1.5, 0.25]
  const flame = lit(phase, 0.35)
  const cut = (width: number, height: number, x: number, y: number) =>
    box([width, height, 0.04], [x, y, 0.352], FIRE, flame)
  return [
    box([0.66, 0.08, 0.58], [0, 0.04, 0], RIND),
    box([0.8, 0.5, 0.7], [0, 0.33, 0], ORANGE),
    box([0.66, 0.08, 0.58], [0, 0.62, 0], RIND),
    box([0.12, 0.16, 0.12], [0.02, 0.73, 0], [0.16, 0.36, 0.1], MATTE, [0, 0, 0.2]),
    // Ojos en triángulo (dos piezas cada uno), nariz y sonrisa mellada.
    cut(0.18, 0.09, -0.19, 0.44),
    cut(0.09, 0.07, -0.19, 0.52),
    cut(0.18, 0.09, 0.19, 0.44),
    cut(0.09, 0.07, 0.19, 0.52),
    cut(0.07, 0.07, 0, 0.34),
    cut(0.5, 0.07, 0, 0.21),
    cut(0.08, 0.07, -0.27, 0.27),
    cut(0.08, 0.07, 0.27, 0.27),
    cut(0.1, 0.06, -0.1, 0.15),
    cut(0.1, 0.06, 0.12, 0.15),
  ]
}

/** Fantasma (1,3 de alto): sábana con flecos, bracitos y cara de susto. */
function ghost() {
  const SHEET: Vec3 = [1.1, 1.25, 1.4]
  const INK: Vec3 = [0.02, 0.02, 0.06]
  return fuse([
    box([0.6, 0.12, 0.5], [0, 1.26, 0], SHEET),
    box([0.8, 0.85, 0.6], [0, 0.775, 0], SHEET),
    box([0.2, 0.2, 0.6], [-0.3, 0.25, 0], SHEET),
    box([0.2, 0.28, 0.6], [0, 0.21, 0], SHEET),
    box([0.2, 0.2, 0.6], [0.3, 0.25, 0], SHEET),
    box([0.16, 0.16, 0.22], [-0.46, 0.74, 0.06], SHEET),
    box([0.16, 0.16, 0.22], [0.46, 0.8, 0.06], SHEET),
    box([0.14, 0.2, 0.03], [-0.17, 0.94, 0.305], INK, lit()),
    box([0.14, 0.2, 0.03], [0.17, 0.94, 0.305], INK, lit()),
    box([0.16, 0.13, 0.03], [0, 0.64, 0.305], INK, lit()),
  ])
}

interface Bat {
  /** Centro de su ronda, sobre una caja */
  x: number
  y: number
  z: number
  /** Semiejes de la ronda */
  reachX: number
  reachZ: number
  /** Velocidad angular, con signo: unos giran hacia un lado y otros hacia el otro */
  speed: number
  phase: number
  size: number
}

function buildHalloween() {
  const rand = rng(3110)
  const place = createPlacer()
  const pumpkins = fuse(
    PUMPKINS.flatMap(([wantX, wantZ]) => {
      const scale = 0.85 + rand() * 0.5
      const [x, z] = place(wantX, wantZ, 0.5 * scale + 0.2)
      return move(pumpkin(rand()), [x, 0, z], (rand() - 0.5) * 0.9, scale)
    }),
  )

  // Murciélagos: dos de cada tres rondan la fila delantera; el resto, las cajas altas
  // que no quedan bajo la cima.
  const front = world.blocks.filter((block) => block.row === 0)
  const back = world.blocks.filter((block) => block.row === 1 && Math.abs(block.x) > 5)
  const bats: Bat[] = Array.from({ length: BATS }, (_, i) => {
    const low = i % 3 !== 2 || back.length === 0
    const pool = low && front.length > 0 ? front : back.length > 0 ? back : world.blocks
    const home = pool[Math.floor(rand() * pool.length)]
    return {
      x: home.x,
      // Por encima del logo que flota sobre la caja.
      y: home.height + 3.3 + rand() * 2,
      z: home.z + (low ? 0.5 : 0),
      reachX: low ? 2.6 + rand() * 2.6 : 1.6 + rand() * 1.4,
      reachZ: 0.8 + rand() * 0.8,
      speed: (0.55 + rand() * 0.5) * (rand() < 0.5 ? -1 : 1),
      phase: rand() * Math.PI * 2,
      size: 1 + rand() * 0.35,
    }
  })
  const colors = new Float32Array(BATS * BAT_PARTS * 3)
  const effects = new Float32Array(BATS * BAT_PARTS * 3)
  const BODY: Vec3 = [0.34, 0.12, 0.6]
  const WING: Vec3 = [0.7, 0.22, 1.3]
  const EYES: Vec3 = [2.6, 0.7, 0.1]
  for (let i = 0; i < BATS; i++) {
    colors.set([...BODY, ...WING, ...WING, ...EYES], i * BAT_PARTS * 3)
    effects.set([...MATTE, ...lit(), ...lit(), ...lit()], i * BAT_PARTS * 3)
  }
  const cube = instancedCube(colors, effects)

  const voxel = createVoxelMaterial()
  // Las instancias llevan su propio material: así ninguno alterna entre dos programas en cada fotograma.
  const wings = createVoxelMaterial()
  const sheet = createVoxelMaterial(0.7)
  const spook = ghost()
  const hat = witchHat()
  return {
    pumpkins,
    bats,
    cube,
    voxel,
    wings,
    sheet,
    spook,
    hat,
    trash: [pumpkins, cube, voxel, wings, sheet, spook, hat],
  }
}

/** Halloween: calabazas encendidas, murciélagos sobre las cajas, un fantasma y sombrero de bruja. */
function Halloween() {
  const grow = useAppear()
  const kit = useKit(buildHalloween)
  const pumpkins = useRef<THREE.Mesh>(null)
  const flock = useRef<THREE.InstancedMesh>(null)
  const spook = useRef<THREE.Mesh>(null)
  const scratch = useMemo(
    () => ({
      root: new THREE.Matrix4(),
      part: new THREE.Matrix4(),
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      turn: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
    }),
    [],
  )

  useLayoutEffect(() => {
    flock.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    rise(pumpkins.current, grow(0, 0.9))

    // Fantasma: deambula por la plaza en una curva larga, flotando; atraviesa lo que haga falta.
    const g = spook.current
    if (g) {
      const a = t * 0.07 + 1
      const b = t * 0.19
      g.position.set(0.5 + Math.sin(a) * 24, 0.3 + Math.sin(t * 1.7) * 0.14, 12.6 + Math.sin(b) * 3)
      g.rotation.y = Math.atan2(Math.cos(a) * 24 * 0.07, Math.cos(b) * 3 * 0.19)
      g.rotation.z = Math.sin(t * 1.1) * 0.08
      pop(g, grow(0.8, 1.2), 1.1)
      kit.sheet.uniforms.uOpacity.value = 0.6 + 0.2 * Math.sin(t * 0.9)
    }

    // Murciélagos: cada uno da vueltas sobre su caja, de morro hacia donde vuela, batiendo las alas.
    const mesh = flock.current
    if (!mesh) return
    const { root, part, matrix, position, turn, scale } = scratch
    const shown = grow(0.6, 1.4)
    kit.bats.forEach((bat, i) => {
      const a = bat.phase + t * bat.speed
      const way = Math.sign(bat.speed)
      const x = bat.x + Math.sin(a) * bat.reachX + Math.sin(a * 2.3 + bat.phase) * 0.6
      const y = bat.y + Math.sin(a * 1.7 + bat.phase * 3) * 0.5 + Math.sin(t * 11 + bat.phase) * 0.12
      const z = bat.z + Math.cos(a) * bat.reachZ
      const vx = (Math.cos(a) * bat.reachX + Math.cos(a * 2.3 + bat.phase) * 1.38) * way
      const vz = -Math.sin(a) * bat.reachZ * way
      const flap = Math.sin(t * 13 + bat.phase * 5) * 0.75
      root.compose(
        position.set(x, y, z),
        turn.setFromAxisAngle(UP, Math.atan2(vx, vz)),
        scale.setScalar(Math.max(0.001, bat.size * shown)),
      )
      const slot = i * BAT_PARTS
      // Cuerpo.
      part.compose(position.set(0, 0, 0), turn.identity(), scale.set(0.2, 0.2, 0.36))
      mesh.setMatrixAt(slot, matrix.multiplyMatrices(root, part))
      // Alas: cada una gira sobre su hombro.
      for (let wing = 0; wing < 2; wing++) {
        const side = wing === 0 ? -1 : 1
        part.compose(
          position.set(side * (0.1 + 0.3 * Math.cos(flap)), 0.3 * Math.sin(flap), 0),
          turn.setFromAxisAngle(FORWARD, side * flap),
          scale.set(0.6, 0.03, 0.3),
        )
        mesh.setMatrixAt(slot + 1 + wing, matrix.multiplyMatrices(root, part))
      }
      // Ojos: una tira encendida en el morro.
      part.compose(position.set(0, 0.03, 0.185), turn.identity(), scale.set(0.16, 0.05, 0.02))
      mesh.setMatrixAt(slot + 3, matrix.multiplyMatrices(root, part))
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <Detail>
        <mesh ref={pumpkins} geometry={kit.pumpkins} material={kit.voxel} />
        <instancedMesh ref={flock} args={[kit.cube, kit.wings, BATS * BAT_PARTS]} frustumCulled={false} />
        <mesh ref={spook} geometry={kit.spook} material={kit.sheet} scale={0.001} />
      </Detail>
      <PlayerHat geometry={kit.hat} material={kit.voxel} grow={grow} />
    </>
  )
}

// ---------------------------------------------------------------- Día de la Croqueta

/** Altura a la que flota la croqueta gigante, y a la que queda el cartel */
const CROQUETA_Y = 3.7
const SIGN_Y = 5.95
const CRUMBS = 90
/** Franja (a lo ancho) y altura en las que cae el confeti de croquetas */
const CRUMBS_WIDE = 46
const CRUMBS_HIGH = 9.5

interface Crumb {
  x: number
  z: number
  speed: number
  /** Desfase en la caída */
  offset: number
  phase: number
  spin: number
  size: number
  axis: THREE.Vector3
}

function buildCroqueta() {
  const rand = rng(1601)
  const place = createPlacer()
  const [x, z] = place(5, 13.6, 1.3)
  const GOLD: Vec3 = [2.2, 1.5, 0.4]
  const PANEL: Vec3 = [0.05, 0.05, 0.08]

  const decor = fuse([
    // Peana del proyector, con un filo de neón por delante.
    box([1.8, 0.2, 1.8], [x, 0.1, z], [0.13, 0.14, 0.2]),
    box([1.4, 0.18, 1.4], [x, 0.29, z], [0.18, 0.19, 0.27]),
    box([1, 0.06, 1], [x, 0.41, z], GOLD, lit(0.2, 0.15)),
    box([1.84, 0.04, 0.04], [x, 0.2, z + 0.91], GOLD, lit()),
    // Cartel flotante: panel oscuro y marco de neón.
    box([6.8, 1.3, 0.08], [x, SIGN_Y, z], PANEL),
    box([6.9, 0.05, 0.1], [x, SIGN_Y + 0.675, z], GOLD, lit()),
    box([6.9, 0.05, 0.1], [x, SIGN_Y - 0.675, z], GOLD, lit()),
    box([0.05, 1.4, 0.1], [x - 3.425, SIGN_Y, z], GOLD, lit()),
    box([0.05, 1.4, 0.1], [x + 3.425, SIGN_Y, z], GOLD, lit()),
  ])

  const crumbs: Crumb[] = Array.from({ length: CRUMBS }, () => ({
    x: rand() * CRUMBS_WIDE,
    z: PLAZA.minZ - 0.5 + rand() * (PLAZA.maxZ - PLAZA.minZ + 1),
    speed: 0.7 + rand() * 0.6,
    offset: rand() * CRUMBS_HIGH,
    phase: rand() * Math.PI * 2,
    spin: 1.2 + rand() * 2.4,
    size: 0.13 + rand() * 0.07,
    axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
  }))

  const croqueta = createCroquetaGeometry()
  const golden = createCroquetaMaterial({ glow: 1.5 })
  const breading = createCroquetaMaterial()
  const beam = createBeamMaterial('#ffc933')
  const voxel = createVoxelMaterial()
  const hat = chefHat()
  return {
    spot: [x, z] as [number, number],
    decor,
    crumbs,
    croqueta,
    golden,
    breading,
    beam,
    voxel,
    hat,
    trash: [decor, croqueta, golden, breading, beam, voxel, hat],
  }
}

/** Día de la Croqueta: una croqueta gigante girando sobre su peana, su cartel y confeti de croquetas. */
function CroquetaDay() {
  const lang = useLang()
  const grow = useAppear()
  const kit = useKit(buildCroqueta)
  const [x, z] = kit.spot
  const decor = useRef<THREE.Group>(null)
  const hero = useRef<THREE.Group>(null)
  const light = useRef<THREE.Group>(null)
  const confetti = useRef<THREE.InstancedMesh>(null)
  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      turn: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
    }),
    [],
  )

  useLayoutEffect(() => {
    confetti.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    rise(decor.current, grow(0, 1))
    rise(light.current, grow(0.5, 0.8))
    if (hero.current) {
      hero.current.position.y = CROQUETA_Y + Math.sin(t * 1.1) * 0.15
      hero.current.rotation.y = t * 0.6
      pop(hero.current, grow(0.7, 1.2))
    }

    // Confeti: croquetas pequeñas que caen despacio en una franja que acompaña al jugador.
    const mesh = confetti.current
    if (!mesh) return
    const { matrix, position, turn, scale } = scratch
    const shown = grow(1, 1.5)
    const center = useGame.getState().mode === 'play' ? body.pos[0] : (PLAZA.minX + PLAZA.maxX) / 2
    kit.crumbs.forEach((crumb, i) => {
      const fallen = (t * crumb.speed + crumb.offset) % CRUMBS_HIGH
      const y = CRUMBS_HIGH - fallen
      // Nacen creciendo y se encogen al llegar al suelo.
      const life = Math.min(1, fallen / 0.8, y / 0.6)
      const drift = crumb.x + Math.sin(t * 0.6 + crumb.phase) * 0.5 - center + CRUMBS_WIDE / 2
      const wrapped = ((drift % CRUMBS_WIDE) + CRUMBS_WIDE) % CRUMBS_WIDE
      matrix.compose(
        position.set(center + wrapped - CRUMBS_WIDE / 2, y, crumb.z + Math.cos(t * 0.5 + crumb.phase) * 0.3),
        turn.setFromAxisAngle(crumb.axis, t * crumb.spin + crumb.phase),
        scale.setScalar(Math.max(0.0001, crumb.size * life * shown)),
      )
      mesh.setMatrixAt(i, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      {/* La croqueta es grande: entra en el reflejo del suelo y da sombra */}
      <group ref={hero} position={[x, CROQUETA_Y, z]} scale={0.001}>
        <mesh
          geometry={kit.croqueta}
          material={kit.golden}
          rotation-z={Math.PI / 2 - 0.3}
          scale={1.7}
          castShadow
        />
      </group>
      <Detail>
        {/* Peana y cartel, con su rótulo: crecen juntos */}
        <group ref={decor}>
          <mesh geometry={kit.decor} material={kit.voxel} />
          <Text
            font={fontBold}
            fontSize={0.29}
            lineHeight={1.45}
            position={[x, SIGN_Y, z + 0.06]}
            color={[2, 1.5, 0.5]}
            anchorX="center"
            anchorY="middle"
            textAlign="center"
            material-toneMapped={false}
          >
            {TEXTS.croqueta[lang]}
          </Text>
        </group>
        {/* Haz del proyector, de la peana a la croqueta */}
        <group ref={light} position={[x, 0.45, z]}>
          <mesh position-y={1.2} material={kit.beam}>
            <cylinderGeometry args={[1.15, 0.42, 2.4, 32, 1, true]} />
          </mesh>
        </group>
        <instancedMesh ref={confetti} args={[kit.croqueta, kit.breading, CRUMBS]} frustumCulled={false} />
      </Detail>
      <PlayerHat geometry={kit.hat} material={kit.voxel} grow={grow} />
    </>
  )
}

// ---------------------------------------------------------------- Fin de año

const GRAPES = 12
/** Reloj de las uvas: altura del centro y radio de la esfera */
const CLOCK_Y = 2.75
const CLOCK_RADIUS = 1.45
/** Cada ciclo: doce campanadas (una uva por segundo), traca, y a empezar otra vez */
const CYCLE = 26
const PARTY_FROM = 12
const PARTY_UNTIL = 20
/** Segundo del ciclo en el que sale cada cohete */
const VOLLEY = [12, 12.35, 12.75, 13.3, 14, 14.9, 16, 17.3, 18.8]
const ROCKETS = 5
const ROCKET_COLORS = ['#ffc933', '#ff3d9a', '#19e6ff', '#3df2b0', '#ffffff', '#ff6a2b']
const GRAPE_OFF = new THREE.Color(0.1, 0.22, 0.08)
const GRAPE_ON = new THREE.Color(0.8, 2.4, 0.45)
const GRAPE_PARTY = new THREE.Color(2.6, 2.1, 0.7)

function buildNewYear() {
  const place = createPlacer()
  const [x, z] = place(5, 13.8, 1)
  const GOLD: Vec3 = [0.9, 0.62, 0.16]
  const STEEL: Vec3 = [0.13, 0.14, 0.2]
  const HAND: Vec3 = [1.6, 1.6, 1.8]
  /** Pieza de la esfera: se monta en el centro del reloj y se gira sobre él. */
  const dial = (size: Vec3, lift: number, angle: number, color: Vec3, depth = 0) =>
    paint(
      new THREE.BoxGeometry(size[0], size[1], size[2])
        .translate(0, lift, 0)
        .rotateZ(angle)
        .translate(x, CLOCK_Y, z + depth),
      color,
      lit(),
    )
  const segments = 24
  const decor = fuse([
    // Pie y poste.
    box([1.3, 0.14, 0.7], [x, 0.07, z], STEEL),
    box([0.16, CLOCK_Y - CLOCK_RADIUS, 0.16], [x, (CLOCK_Y - CLOCK_RADIUS) / 2, z], STEEL),
    // Aro de la esfera, a tramos.
    ...Array.from({ length: segments }, (_, i) =>
      dial(
        [(Math.PI * 2 * CLOCK_RADIUS) / segments + 0.02, 0.07, 0.09],
        CLOCK_RADIUS,
        (i / segments) * Math.PI * 2,
        GOLD,
      ),
    ),
    // Las agujas, a un minuto de las doce.
    dial([0.1, 0.62, 0.05], 0.31, 0, HAND, 0.06),
    dial([0.06, 1, 0.05], 0.5, 0.105, HAND, 0.09),
    dial([0.2, 0.2, 0.1], 0, 0, HAND, 0.07),
    // Subrayado del rótulo.
    box([5.4, 0.05, 0.05], [x, CLOCK_Y + CLOCK_RADIUS + 0.42, z], [2.2, 1.5, 0.4], lit()),
  ])

  // Uvas: una por hora, de la una a las doce en el sentido de las agujas.
  const grapes = new THREE.IcosahedronGeometry(1, 1)
  const colors = new THREE.InstancedBufferAttribute(new Float32Array(GRAPES * 3), 3)
  colors.setUsage(THREE.DynamicDrawUsage)
  grapes.setAttribute('aColor', colors)
  grapes.setAttribute('aFx', new THREE.InstancedBufferAttribute(new Float32Array(GRAPES * 3), 3))
  const hours = Array.from({ length: GRAPES }, (_, i) => {
    const angle = ((i + 1) / GRAPES) * Math.PI * 2
    return new THREE.Vector3(
      x + Math.sin(angle) * CLOCK_RADIUS,
      CLOCK_Y + Math.cos(angle) * CLOCK_RADIUS,
      z + 0.12,
    )
  })

  const burst = createBurstGeometry(80, 0.15)
  const rockets = Array.from({ length: ROCKETS }, () =>
    createBurstMaterial('#ffffff', { speed: 2.4, gravity: 1.3, life: 1.15, size: 40 }),
  )
  const voxel = createVoxelMaterial()
  // Las uvas van instanciadas: material propio, para no alternar entre dos programas en cada fotograma.
  const skin = createVoxelMaterial()
  const hat = partyHat()
  // El año que se celebra: el que entra (en Nochevieja) o el que acaba de empezar.
  const today = new Date()
  const year = today.getMonth() >= 6 ? today.getFullYear() + 1 : today.getFullYear()
  return {
    spot: [x, z] as [number, number],
    decor,
    grapes,
    colors,
    hours,
    burst,
    rockets,
    voxel,
    skin,
    hat,
    year,
    trash: [decor, grapes, burst, ...rockets, voxel, skin, hat],
  }
}

/** Fin de año: el reloj de las doce uvas, que se encienden una a una, cohetes al dar las doce y el rótulo. */
function NewYear() {
  const lang = useLang()
  const grow = useAppear()
  const kit = useKit(buildNewYear)
  const [x, z] = kit.spot
  const decor = useRef<THREE.Group>(null)
  const bunch = useRef<THREE.InstancedMesh>(null)
  const state = useRef({ born: uTime.value, cycle: -1, fired: 0, launched: 0 })
  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      turn: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
      color: new THREE.Color(),
    }),
    [],
  )

  useLayoutEffect(() => {
    bunch.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }, [])

  useFrame(({ gl, size }) => {
    const s = state.current
    const shown = grow(0, 1)
    rise(decor.current, shown)
    // La cuenta no arranca hasta que el reloj está montado.
    if (shown < 1) s.born = uTime.value
    const elapsed = uTime.value - s.born
    const cycle = Math.floor(elapsed / CYCLE)
    const c = elapsed - cycle * CYCLE
    if (cycle !== s.cycle) {
      s.cycle = cycle
      s.fired = 0
    }

    // Uvas: se encienden una por segundo; con las doce, fiesta; después se apagan en fila.
    const mesh = bunch.current
    if (mesh) {
      const { matrix, turn, scale, color } = scratch
      const party = c >= PARTY_FROM && c < PARTY_UNTIL
      kit.hours.forEach((hour, i) => {
        const since = c - (i + 1)
        const on = since >= 0 && c < PARTY_UNTIL + i * 0.12
        color.copy(on ? GRAPE_ON : GRAPE_OFF)
        if (on && party) color.lerp(GRAPE_PARTY, 0.5 + 0.5 * Math.sin(c * 6 - i * 0.52))
        kit.colors.setXYZ(i, color.r, color.g, color.b)
        // Al encenderse da un respingo.
        const bump = on ? 1 + 0.6 * Math.exp(-since * 6) : 0.8
        mesh.setMatrixAt(i, matrix.compose(hour, turn, scale.setScalar(Math.max(0.001, 0.2 * bump * shown))))
      })
      kit.colors.needsUpdate = true
      mesh.instanceMatrix.needsUpdate = true
    }

    // Cohetes: una traca al dar las doce.
    while (s.fired < VOLLEY.length && c >= VOLLEY[s.fired]) {
      s.fired++
      const n = s.launched++
      const rocket = kit.rockets[n % ROCKETS]
      // Semilla determinista por lanzamiento (−1..1): distinto sitio y color cada vez.
      const r1 = (Math.sin(n * 12.9898) * 43758.5453) % 1
      const r2 = (Math.sin(n * 78.233) * 43758.5453) % 1
      const r3 = (Math.sin(n * 39.425) * 43758.5453) % 1
      rocket.uniforms.uOrigin.value.set(x + r1 * 15, 8.5 + r2 * 2, z - 2 + r3 * 3)
      rocket.uniforms.uColor.value.set(ROCKET_COLORS[n % ROCKET_COLORS.length])
      rocket.uniforms.uStart.value = uTime.value
      rocket.uniforms.uPixelRatio.value = gl.getPixelRatio() * (size.height / 900) * 13
      if (useGame.getState().mode === 'play') sfx.firework()
    }
  })

  return (
    <>
      <Detail>
        {/* Reloj y rótulos: crecen juntos */}
        <group ref={decor}>
          <mesh geometry={kit.decor} material={kit.voxel} />
          <Text
            font={fontBold}
            fontSize={0.8}
            position={[x, CLOCK_Y + CLOCK_RADIUS + 0.95, z]}
            color={[2.4, 1.8, 0.6]}
            anchorX="center"
            anchorY="middle"
            material-toneMapped={false}
          >
            {TEXTS.newYear[lang]}
          </Text>
          <Text
            font={fontBold}
            fontSize={0.46}
            position={[x, CLOCK_Y - 0.62, z + 0.06]}
            color={[2.2, 1.5, 0.4]}
            anchorX="center"
            anchorY="middle"
            material-toneMapped={false}
          >
            {String(kit.year)}
          </Text>
        </group>
        <instancedMesh ref={bunch} args={[kit.grapes, kit.skin, GRAPES]} frustumCulled={false} />
        {kit.rockets.map((rocket, i) => (
          <points key={i} geometry={kit.burst} material={rocket} frustumCulled={false} />
        ))}
      </Detail>
      <PlayerHat geometry={kit.hat} material={kit.voxel} grow={grow} />
    </>
  )
}

// ---------------------------------------------------------------- Temporada

const DECOR: Record<Exclude<Season, 'none'>, ComponentType> = {
  xmas: Xmas,
  halloween: Halloween,
  croqueta: CroquetaDay,
  newyear: NewYear,
}

/** Decoración de la temporada en curso. Sin temporada no monta nada. */
export function Seasonal() {
  const season = useSeason()
  if (season === 'none') return null
  const Decor = DECOR[season]
  // Límite propio: si un rótulo tuviera que esperar a su fuente, no se llevaría por delante el resto.
  return (
    <Suspense fallback={null}>
      <Decor key={season} />
    </Suspense>
  )
}
