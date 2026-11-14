import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import type { Localized } from '../data/career'
import { body } from '../game/state'
import { useLang } from '../i18n'
import { useGame } from '../store'
import { trainStation } from '../world/zones'
import { Detail } from './Detail'
import { introProgress } from './intro'
import { createNeonMaterial, uTime } from './materials/shaders'

/**
 * Máquina del minijuego «Entrena tu modelo»: un rack de entrenamiento entre la
 * plaza y la sala de conceptos. El frente (la consola y su pantalla) mira a la
 * plaza, hacia -Z; como la cámara del juego mira justo en ese sentido y solo ve
 * la espalda y el techo del mueble, encima lleva una pantalla holográfica que
 * se lee por las dos caras, con la misma gráfica de error, y el rótulo.
 *
 * Al acercarse a la alfombrilla (a menos de `reach` de `pad`) la máquina queda
 * «al alcance» (`setStation('train')`): la tecla E y el aviso son cosa de la
 * interfaz.
 *
 * Presupuesto: siete dibujados (mueble, neones, luces, pantallas, alfombrilla y
 * dos rótulos) y ni una luz: lo que brilla es emisivo. Solo el mueble va en la
 * capa normal (sombra y reflejo); lo demás, dentro de <Detail>.
 */

type Vec3 = [number, number, number]

const [SX, , SZ] = trainStation.position
const [WIDTH, HEIGHT, DEPTH] = trainStation.size
const [PAD_X, PAD_Z] = trainStation.pad
const REACH = trainStation.reach
/** Altura de los pies por debajo de la cual se considera que el jugador está en el suelo */
const GROUND = 0.5

const TEXTS = {
  sign: { es: 'ENTRENA TU MODELO', en: 'TRAIN YOUR MODEL' },
} satisfies Record<string, Localized>

// Los colores de los textos van como THREE.Color: troika ignora los arrays.
const INK_SIGN = new THREE.Color(2.2, 1.8, 3.1)

const CASE = new THREE.MeshStandardMaterial({ color: '#15141c', roughness: 0.5, metalness: 0.65 })
/** Piezas emisivas con el color en los vértices (HDR: las recoge el bloom) */
const LIT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
const NEON = createNeonMaterial('#a78bfa', 1.25)

/** 0..1: el jugador está al alcance (lo comparten las pantallas y la alfombrilla) */
const uNear = { value: 0 }

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * Pantalla: una gráfica de error que se dibuja sola, una y otra vez. La curva de
 * entrenamiento baja sin parar; la de validación baja, toca fondo y vuelve a
 * subir (sobreajuste). Todo sale del shader: ni texturas ni lienzos.
 */
const SCREEN = new THREE.ShaderMaterial({
  uniforms: { uTime, uNear },
  vertexShader: vertex,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uNear;
    varying vec2 vUv;
    float stroke(float y, float at, float width) {
      return smoothstep(width, width * 0.3, abs(y - at));
    }
    void main() {
      vec2 uv = vUv;
      // Por detrás se vería en espejo: se le da la vuelta para que se lea igual.
      if (!gl_FrontFacing) uv.x = 1.0 - uv.x;
      vec2 p = (uv - vec2(0.09, 0.15)) / vec2(0.84, 0.72);
      float inside = step(0.0, p.x) * step(p.x, 1.0) * step(-0.02, p.y) * step(p.y, 1.02);

      // Ciclo: la gráfica se traza en unos segundos, aguanta y se apaga.
      float cycle = mod(uTime, 7.5);
      float reveal = clamp(cycle / 4.4, 0.0, 1.0);
      float alive = 1.0 - smoothstep(6.6, 7.4, cycle);
      float drawn = step(p.x, reveal) * inside * alive;

      float seenY = 0.07 + 0.84 * exp(-5.0 * p.x);
      float seenSlope = -4.2 * exp(-5.0 * p.x);
      float over = max(0.0, p.x - 0.4);
      float newY = 0.17 + 0.76 * exp(-5.6 * p.x) + 1.15 * over * over;
      float newSlope = -4.26 * exp(-5.6 * p.x) + 2.3 * over;
      // El grosor se corrige con la pendiente para que el trazo sea parejo.
      float seen = stroke(p.y, seenY, 0.03 * sqrt(1.0 + seenSlope * seenSlope * 0.22)) * drawn;
      float fresh = stroke(p.y, newY, 0.03 * sqrt(1.0 + newSlope * newSlope * 0.22)) * drawn;
      // Punta de cada curva, más viva mientras se traza.
      float tip = smoothstep(0.06, 0.0, abs(p.x - reveal)) * step(reveal, 0.999);
      float goal = stroke(p.y, 0.3, 0.014) * step(0.45, fract(p.x * 10.0)) * inside;

      vec2 cell = abs(fract(p * vec2(6.0, 4.0)) - 0.5);
      float grid = (smoothstep(0.46, 0.5, cell.x) + smoothstep(0.45, 0.5, cell.y)) * inside;
      vec2 border = min(uv, 1.0 - uv);
      float frame = smoothstep(0.022, 0.006, min(border.x, border.y * 0.6));

      vec3 cyan = vec3(0.1, 0.9, 1.0);
      vec3 amber = vec3(1.0, 0.62, 0.2);
      vec3 green = vec3(0.24, 0.95, 0.69);
      vec3 violet = vec3(0.65, 0.55, 0.98);
      vec3 col = cyan * seen * (1.5 + tip * 1.5) + amber * fresh * (1.5 + tip * 1.5);
      col += green * goal * 0.9 + violet * (grid * 0.1 + frame * 0.7 + 0.035);
      float scan = 0.88 + 0.12 * sin(uv.y * 150.0 - uTime * 5.0);
      gl_FragColor = vec4(col * scan * (0.75 + 0.55 * uNear), 1.0);
    }
  `,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  // Al sumar la luz da igual el orden de las caras: un solo dibujado en vez de dos.
  forceSinglePass: true,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
})

/**
 * Alfombrilla: un rectángulo luminoso delante de la consola, con flechas que
 * avanzan hacia la máquina, y un aro discontinuo que marca hasta dónde llega.
 * Se enciende más cuando el jugador está al alcance.
 */
const PAD = new THREE.ShaderMaterial({
  uniforms: { uTime, uNear, uColor: { value: new THREE.Color('#a78bfa') } },
  vertexShader: vertex,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uNear;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      // De -1 a 1: el radio 1 es el alcance. La máquina queda hacia -y.
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      vec2 q = abs(p) - vec2(0.44, 0.27);
      float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.05;
      float rug = smoothstep(0.015, 0.0, d);
      float edge = smoothstep(0.03, 0.0, abs(d));
      float wave = fract((p.y - abs(p.x) * 0.55) * 3.2 + uTime * 0.55);
      float arrows = smoothstep(0.0, 0.1, wave) * smoothstep(0.34, 0.2, wave) * rug;
      float dash = step(0.5, fract(atan(p.y, p.x) * 3.8197 + uTime * 0.12));
      float ring = smoothstep(0.022, 0.0, abs(r - 0.96)) * dash;
      float a = rug * (0.07 + 0.16 * uNear) + arrows * (0.14 + 0.5 * uNear) + edge * (0.4 + 0.8 * uNear);
      a += ring * (0.1 + 0.5 * uNear);
      a *= 0.86 + 0.14 * sin(uTime * 2.6);
      gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.25 * uNear) * a * 1.9, a);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  toneMapped: false,
})

/** Caja ya colocada, lista para fundirse con otras. */
const slab = (size: Vec3, at: Vec3) => new THREE.BoxGeometry(size[0], size[1], size[2]).translate(at[0], at[1], at[2])

/** Da a toda la pieza un color por vértice (para LIT). */
function paint<T extends THREE.BufferGeometry>(geometry: T, color: Vec3) {
  const count = geometry.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set(color, i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/** Funde varias piezas en una sola geometría: todo lo estático en un único dibujado. */
function fuse(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return merged
}

// Medidas del mueble, todas dentro de la caja de colisión (el frente es -Z).
const HALF_W = WIDTH / 2
const HALF_D = DEPTH / 2
/** Zócalo, cuerpo bajo (hasta la consola), cuerpo alto (retranqueado, con la pantalla) y cabezal */
const PLINTH = 0.12
const DESK = 0.96
const HEAD = HEIGHT - 0.18
const UPPER_FRONT = -0.18
/** Pantalla holográfica sobre el mueble: de `HOLO.low` a `HOLO.high`, entre dos postes */
const HOLO = { low: HEIGHT + 0.1, high: HEIGHT + 1.05, width: WIDTH - 0.14 }
const SIGN_Y = HOLO.high + 0.24

const CYAN: Vec3 = [0.2, 1.7, 1.9]
const AMBER: Vec3 = [2.1, 1.2, 0.35]
const GREEN: Vec3 = [0.45, 1.9, 1.3]
const VIOLET: Vec3 = [1.2, 0.95, 2.0]
const DIM: Vec3 = [0.32, 0.27, 0.55]

function build() {
  /** Ancho del cuerpo, entre los dos costados */
  const inner = WIDTH - 0.14
  const cabinet = fuse([
    slab([WIDTH, PLINTH, DEPTH], [0, PLINTH / 2, 0]),
    slab([inner, DESK - PLINTH, DEPTH - 0.06], [0, (DESK + PLINTH) / 2, 0]),
    slab([inner, HEAD - DESK, HALF_D - UPPER_FRONT - 0.03], [0, (HEAD + DESK) / 2, (HALF_D - 0.03 + UPPER_FRONT) / 2]),
    // Costados: por los lados el mueble se ve entero, como una recreativa.
    slab([0.07, HEAD - DESK, DEPTH - 0.06], [-HALF_W + 0.035, (HEAD + DESK) / 2, 0]),
    slab([0.07, HEAD - DESK, DEPTH - 0.06], [HALF_W - 0.035, (HEAD + DESK) / 2, 0]),
    slab([WIDTH, HEIGHT - HEAD, DEPTH], [0, (HEIGHT + HEAD) / 2, 0]),
  ])

  const edge = HALF_D + 0.008
  const neon = fuse([
    // Zócalo: un aro a ras de suelo.
    slab([WIDTH + 0.04, 0.03, 0.03], [0, PLINTH + 0.015, -edge]),
    slab([WIDTH + 0.04, 0.03, 0.03], [0, PLINTH + 0.015, edge]),
    slab([0.03, 0.03, DEPTH], [-HALF_W - 0.005, PLINTH + 0.015, 0]),
    slab([0.03, 0.03, DEPTH], [HALF_W + 0.005, PLINTH + 0.015, 0]),
    // Cabezal: una línea delante y otra detrás.
    slab([WIDTH, 0.03, 0.02], [0, HEAD + 0.02, -edge]),
    slab([WIDTH, 0.03, 0.02], [0, HEAD + 0.02, edge]),
    // Espalda (lo que ve la cámara): dos montantes.
    slab([0.03, HEAD - PLINTH - 0.1, 0.02], [-HALF_W + 0.1, (HEAD + PLINTH) / 2, edge - 0.03]),
    slab([0.03, HEAD - PLINTH - 0.1, 0.02], [HALF_W - 0.1, (HEAD + PLINTH) / 2, edge - 0.03]),
    // Marco de la pantalla de la consola.
    slab([inner - 0.16, 0.02, 0.02], [0, DESK + 0.07, UPPER_FRONT - 0.01]),
    slab([inner - 0.16, 0.02, 0.02], [0, HEAD - 0.06, UPPER_FRONT - 0.01]),
    // Postes y dintel de la pantalla holográfica.
    slab([0.03, HOLO.high - HEIGHT + 0.04, 0.03], [-HALF_W + 0.04, (HOLO.high + HEIGHT) / 2 + 0.02, 0]),
    slab([0.03, HOLO.high - HEIGHT + 0.04, 0.03], [HALF_W - 0.04, (HOLO.high + HEIGHT) / 2 + 0.02, 0]),
    slab([WIDTH - 0.05, 0.03, 0.03], [0, HOLO.high + 0.04, 0]),
    slab([WIDTH - 0.3, 0.025, 0.07], [0, HEIGHT + 0.012, 0]),
  ])

  // Luces: los mandos de la consola (delante) y las filas de pilotos del rack (detrás).
  const bits: THREE.BufferGeometry[] = []
  const knobs: Array<[number, number, Vec3]> = [
    [-0.56, 0.08, CYAN],
    [-0.14, -0.06, AMBER],
    [0.28, 0.03, VIOLET],
  ]
  const deskZ = (-HALF_D + 0.03 + UPPER_FRONT) / 2
  for (const [x, shift, color] of knobs) {
    // Tres deslizadores (los hiperparámetros) y el botón de entrenar.
    bits.push(paint(slab([0.34, 0.012, 0.025], [x, DESK + 0.006, deskZ]), DIM))
    bits.push(paint(slab([0.05, 0.035, 0.08], [x + shift, DESK + 0.018, deskZ]), color))
  }
  bits.push(paint(slab([0.16, 0.035, 0.11], [0.64, DESK + 0.018, deskZ]), GREEN))
  const palette = [CYAN, GREEN, AMBER, VIOLET, GREEN, CYAN, DIM, GREEN]
  const backZ = HALF_D - 0.03 + 0.006
  for (let row = 0; row < 5; row++) {
    const y = PLINTH + 0.24 + row * 0.3
    // Cada balda del rack: una regleta apagada y sus pilotos.
    bits.push(paint(slab([inner - 0.5, 0.012, 0.012], [0, y - 0.07, backZ]), DIM))
    for (let col = 0; col < 8; col++) {
      const color = palette[(col * 3 + row * 5) % palette.length]
      bits.push(paint(slab([0.07, 0.035, 0.012], [-0.49 + col * 0.14, y, backZ]), color))
    }
  }
  const lit = fuse(bits)

  // Las dos pantallas en una sola malla: la de la consola (mira a -Z) y la holográfica.
  const desk = new THREE.PlaneGeometry(inner - 0.2, HEAD - DESK - 0.18)
    .rotateY(Math.PI)
    .translate(0, (HEAD + DESK) / 2 + 0.005, UPPER_FRONT - 0.008)
  const hologram = new THREE.PlaneGeometry(HOLO.width - 0.06, HOLO.high - HOLO.low).translate(
    0,
    (HOLO.high + HOLO.low) / 2,
    0,
  )
  const screens = fuse([desk, hologram])

  const pad = new THREE.PlaneGeometry(REACH * 2, REACH * 2).rotateX(-Math.PI / 2)

  return {
    cabinet,
    neon,
    lit,
    screens,
    pad,
    dispose() {
      for (const geometry of [cabinet, neon, lit, screens, pad]) geometry.dispose()
    },
  }
}

/** Ancho medio de una mayúscula de Poppins seminegrita, en fracción del cuerpo */
const EM_CAPS = 0.72
/** Cuerpo de letra para que `text` quepa en `width` en una sola línea. */
const fit = (text: string, width: number, max: number) => Math.min(max, width / (text.length * EM_CAPS))

export function TrainStation() {
  const lang = useLang()
  const stage = useMemo(() => build(), [])
  const root = useRef<THREE.Group>(null)

  useEffect(() => () => stage.dispose(), [stage])

  // Al desmontarse, la máquina deja de estar al alcance.
  useEffect(
    () => () => {
      uNear.value = 0
      if (useGame.getState().station === 'train') useGame.getState().setStation(null)
    },
    [],
  )

  useFrame((_, delta) => {
    const group = root.current
    if (!group) return
    group.scale.setScalar(Math.max(0.001, introProgress(4.3, 1.2)))

    // ¿Está el jugador delante de la consola, con los pies en el suelo?
    const game = useGame.getState()
    const [px, py, pz] = body.pos
    const near = game.mode === 'play' && py < GROUND && Math.hypot(px - PAD_X, pz - PAD_Z) < REACH
    if (near) game.setStation('train')
    else if (game.station === 'train') game.setStation(null)
    uNear.value += ((near ? 1 : 0) - uNear.value) * (1 - Math.exp(-6 * Math.min(delta, 0.1)))
  })

  const sign = TEXTS.sign[lang]
  const size = fit(sign, WIDTH + 0.5, 0.2)

  return (
    <group ref={root} position={[SX, 0, SZ]}>
      {/* El mueble mira hacia la cámara (+Z): así se ve la pantalla y al jugador usándola */}
      <mesh geometry={stage.cabinet} material={CASE} rotation-y={Math.PI} castShadow receiveShadow />
      <Detail>
        <group rotation-y={Math.PI}>
          <mesh geometry={stage.neon} material={NEON} />
          <mesh geometry={stage.lit} material={LIT} />
          <mesh geometry={stage.screens} material={SCREEN} />
        </group>
        <mesh geometry={stage.pad} material={PAD} position={[PAD_X - SX, 0.03, PAD_Z - SZ]} />
        {/* El rótulo, por las dos caras: hacia la cámara y hacia la plaza */}
        {[0, Math.PI].map((turn) => (
          <Text
            key={turn}
            font={fontBold}
            fontSize={size}
            letterSpacing={0.05}
            position={[0, SIGN_Y, turn === 0 ? 0.02 : -0.02]}
            rotation-y={turn}
            color={INK_SIGN}
            anchorX="center"
            anchorY="middle"
            whiteSpace="nowrap"
            material-toneMapped={false}
          >
            {sign}
          </Text>
        ))}
      </Detail>
    </group>
  )
}
