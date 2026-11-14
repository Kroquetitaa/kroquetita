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
import { createGlowMaterial, createNeonMaterial, uAlarm, uTime } from './materials/shaders'
import { uDay } from './Weather'

/**
 * Ciudad: lo que hace que el escenario parezca construido y habitado sin
 * quitarle protagonismo a las cajas. Al fondo, una línea de edificios con las
 * ventanas encendidas y un dirigible publicitario; a ras de suelo, farolas,
 * bancos, árboles de neón, el «404 BAR» y un robot aspirador que barre la plaza.
 *
 * Todo va en la capa de detalle menos el cuerpo del bar (el único que entra en
 * el reflejo y en las sombras). No hay ni una luz: todo lo que brilla es emisivo.
 */

type Vec3 = [number, number, number]

const CITY = world.props.city
const PLAZA = world.plaza
const FLAT = -Math.PI / 2

const DARK = new THREE.MeshStandardMaterial({ color: '#16181e', roughness: 0.45, metalness: 0.75 })
const CASE = new THREE.MeshStandardMaterial({ color: '#232733', roughness: 0.5, metalness: 0.65 })
const TRIM = new THREE.MeshStandardMaterial({ color: '#2c3140', roughness: 0.4, metalness: 0.7 })
/** Piezas emisivas con el color en los vértices (HDR: las recoge el bloom) */
const LIT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
/** Farolas: material aparte, porque se atenúan al amanecer */
const LAMP = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
/** Lona a rayas del toldo */
const CANVAS = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })
// El dirigible vuela lejos: sin niebla, o se lo tragaría.
const HULL = new THREE.MeshStandardMaterial({
  color: '#1d2230',
  roughness: 0.55,
  metalness: 0.35,
  emissive: '#141c33',
  emissiveIntensity: 0.6,
  fog: false,
})
const HULL_LIT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false })
const BLADE = new THREE.MeshBasicMaterial({ color: '#566178', fog: false })
const BRUSH = new THREE.MeshBasicMaterial({ color: '#8f99ad' })

/** Rótulos y frases, en los dos idiomas. */
const TEXTS = {
  barNote: { es: 'local no encontrado', en: 'venue not found' },
  order: { es: 'Un café con leche y un 404, por favor.', en: 'One flat white and a 404, please.' },
} satisfies Record<string, Localized>

/** Lo que se oye al rebotar sobre el robot aspirador. */
const ROOMBA_LINES: Localized[] = [
  { es: 'He visto cosas. Sobre todo migas.', en: 'I have seen things. Mostly crumbs.' },
  { es: 'Recolector de basura, edición hardware.', en: 'Garbage collector, hardware edition.' },
  { es: 'La deuda técnica no la aspira. Lo he probado.', en: "It won't vacuum up tech debt. I tried." },
]

/** Aleatorio determinista: la ciudad es idéntica en cada carga. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

/** Cada objeto crece desde el suelo con su propio retardo. */
function appear(group: THREE.Object3D | null, delay: number, duration = 1) {
  if (group) group.scale.setScalar(Math.max(0.001, introProgress(delay, duration)))
}

/** Lo mismo para lo que está repartido por el escenario: solo crece en altura. */
function rise(group: THREE.Object3D | null, delay: number, duration = 1) {
  if (group) group.scale.y = Math.max(0.001, introProgress(delay, duration))
}

/** Caja ya colocada (y girada), lista para fundirse con otras. */
function slab(size: Vec3, at: Vec3, rotation?: Vec3) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2])
  if (rotation) {
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2])))
  }
  return g.translate(at[0], at[1], at[2])
}

/** Cilindro vertical ya colocado; `top` permite hacerlo cónico. */
function drum(radius: number, height: number, at: Vec3, segments = 12, top = radius) {
  return new THREE.CylinderGeometry(top, radius, height, segments).translate(at[0], at[1], at[2])
}

/** Da a toda la pieza un color por vértice (para LIT y compañía). */
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

// ---------------------------------------------------------------- Línea de edificios

const SKYLINE = 46

/**
 * Edificios lejanos: siluetas casi negras (sin niebla) con una rejilla de
 * ventanas. Cada ventana se enciende o no según un hash, unas pocas cambian
 * con el tiempo y todas se apagan al amanecer. El tamaño de cada edificio
 * llega como atributo: así la rejilla mide lo mismo en todas las caras.
 */
function createSkylineMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uDay },
    vertexShader: /* glsl */ `
      attribute vec3 aSize;
      attribute float aSeed;
      attribute float aPart;
      varying vec3 vP;
      varying vec3 vN;
      varying vec3 vSize;
      varying float vSeed;
      varying float vPart;
      void main() {
        vec3 p = position;
        if (aPart < 0.5) {
          // Cuerpo: un cubo unidad que se estira hasta el tamaño del edificio.
          p *= aSize;
        } else {
          // Mástil y baliza: solo en algunas azoteas; en el resto se colapsan en un punto.
          p *= step(0.6, aSeed);
          p.y += aSize.y;
        }
        vP = p;
        vN = normal;
        vSize = aSize;
        vSeed = aSeed;
        vPart = aPart;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDay;
      varying vec3 vP;
      varying vec3 vN;
      varying vec3 vSize;
      varying float vSeed;
      varying float vPart;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        if (vPart > 0.5) {
          // Baliza roja: un destello corto cada dos segundos, cada una a su aire.
          float on = step(fract(uTime * 0.5 + vSeed * 13.0), 0.2);
          vec3 beacon = vec3(1.0, 0.07, 0.05) * (0.2 + 2.2 * on);
          gl_FragColor = vec4(mix(vec3(0.018, 0.02, 0.028), beacon, step(1.5, vPart)), 1.0);
          return;
        }
        // Coordenadas de la cara en unidades de mundo (la azotea no lleva ventanas).
        bool alongX = abs(vN.z) > 0.5;
        float u = alongX ? vP.x : vP.z;
        float width = alongX ? vSize.x : vSize.z;
        float face = alongX ? 1.0 : 2.0;
        float wall = step(abs(vN.y), 0.5);

        vec2 pitch = vec2(0.84, 1.08);
        float cols = floor((width - 0.5) / pitch.x);
        float rows = floor((vSize.y - 1.5) / pitch.y);
        vec2 g = vec2(u / pitch.x + cols * 0.5, (vP.y - 0.9) / pitch.y);
        vec2 cell = floor(g);
        vec2 f = fract(g);
        float inside = step(0.0, g.x) * step(g.x, cols) * step(0.0, g.y) * step(g.y, rows);
        // De lejos las ventanas se funden en vez de parpadear.
        vec2 fw = clamp(fwidth(g), vec2(0.002), vec2(0.5));
        vec2 lo = vec2(0.24, 0.22);
        vec2 hi = vec2(0.76, 0.74);
        vec2 pane = smoothstep(lo - fw, lo + fw, f) * (1.0 - smoothstep(hi - fw, hi + fw, f));

        vec2 key = cell + vec2(vSeed * 91.7 + face * 13.0, vSeed * 37.3);
        float id = hash(key);
        float density = 0.2 + 0.3 * hash(vec2(vSeed * 5.3, 1.7));
        // Unas pocas ventanas se encienden y se apagan de cuando en cuando.
        float fickle = step(0.88, hash(key + 4.1));
        float tick = floor(uTime * 0.08 + id * 9.0);
        float lit = mix(step(id, density), step(0.5, hash(key + tick * 0.37)), fickle);
        // Cada edificio tira a cálido (viviendas) o a cian (oficinas).
        float bias = hash(vec2(vSeed * 7.9, 3.3));
        float warm = step(hash(key + 8.3), mix(0.25, 0.9, bias));
        vec3 tint = mix(vec3(0.35, 0.85, 1.0), vec3(1.0, 0.8, 0.5), warm);
        // Fondo discreto: las ventanas quedan claramente por debajo del brillo de las cajas.
        float glow = (0.14 + 0.24 * hash(key + 2.6)) * (1.0 - uDay * 0.75);

        vec3 col = vec3(0.009, 0.011, 0.018);
        // Un filo apenas más claro en la cornisa, para que se lea la silueta.
        col += vec3(0.01, 0.014, 0.024) * smoothstep(vSize.y - 0.3, vSize.y, vP.y) * wall;
        col += tint * glow * lit * pane.x * pane.y * inside * wall;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
  })
}

/** Línea de edificios al fondo: una sola malla instanciada. */
function Skyline() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(() => createSkylineMaterial(), [])

  const { geometry, spots } = useMemo(() => {
    const rand = rng(4041)
    const sizes = new Float32Array(SKYLINE * 3)
    const seeds = new Float32Array(SKYLINE)
    const spots: Array<[number, number]> = []
    for (let i = 0; i < SKYLINE; i++) {
      // Repartidos a lo ancho, cada uno en su franja, y a distinta profundidad.
      const x = -75 + ((i + 0.15 + rand() * 0.7) / SKYLINE) * 150
      const z = -26 - rand() * 22
      // Tras las cajas, bajos: más altos taparían el cerebro. A los lados pueden crecer.
      const height = Math.abs(x) < 40 ? 6 + Math.pow(rand(), 1.4) * 12 : 9 + rand() * 15
      sizes.set([3 + rand() * 4, height, 3 + rand() * 3], i * 3)
      // Semilla por encima de 0,6: lleva baliza. Solo los altos, no todos, y ninguno tras el cerebro.
      const beacon = height > 13.5 && (x < -6 || x > 18) && rand() < 0.7
      seeds[i] = beacon ? 0.62 + rand() * 0.38 : rand() * 0.58
      spots.push([x, z])
    }

    const tag = <T extends THREE.BufferGeometry>(g: T, part: number) => {
      const parts = new Float32Array(g.attributes.position.count).fill(part)
      g.setAttribute('aPart', new THREE.BufferAttribute(parts, 1))
      return g
    }
    // Cuerpo (cubo unidad con la base en el suelo), mástil y baliza de la azotea.
    const geometry = fuse([
      tag(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0),
      tag(slab([0.12, 1.5, 0.12], [0, 0.75, 0]), 1),
      tag(slab([0.32, 0.32, 0.32], [0, 1.62, 0]), 2),
    ])
    geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 3))
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    return { geometry, spots }
  }, [])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    spots.forEach(([x, z], i) => mesh.current?.setMatrixAt(i, m.makeTranslation(x, 0, z)))
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true
  }, [spots])

  // La ciudad se levanta del horizonte al arrancar.
  useFrame(() => rise(mesh.current, 1, 3))

  // El tamaño real sale del shader: no se puede recortar por la geometría.
  return <instancedMesh ref={mesh} args={[geometry, material, SKYLINE]} frustumCulled={false} />
}

// ---------------------------------------------------------------- Dirigible

/** Semiejes de la envoltura: largo y radio */
const BLIMP_LENGTH = 3.4
const BLIMP_RADIUS = 1
/** Recorre un óvalo muy alargado sobre el lado derecho: centro, semiejes en X y Z, y velocidad angular */
const BLIMP_PATH = { center: [25.5, 18.5, -18] as Vec3, reach: [8.5, 2.2], turn: 0.1, phase: -0.9 }
/** El rótulo se curva con la envoltura (propiedad de troika que drei no tipa) */
const BLIMP_BANNER = { curveRadius: -(BLIMP_LENGTH * BLIMP_LENGTH) / BLIMP_RADIUS } as object

/** Radio de la envoltura a una distancia `x` de su centro. */
const girth = (x: number) => BLIMP_RADIUS * Math.sqrt(Math.max(0, 1 - (x / BLIMP_LENGTH) ** 2))

/**
 * Dirigible publicitario: da vueltas despacio sobre el lado derecho, siempre
 * de morro hacia donde va. Lleva el rótulo en los dos costados y solo se
 * pinta el que mira a la cámara, así que se lee a la ida y a la vuelta.
 */
function Blimp() {
  const root = useRef<THREE.Group>(null)
  const sway = useRef<THREE.Group>(null)
  const propeller = useRef<THREE.Mesh>(null)
  const banners = useRef<Array<THREE.Object3D | null>>([])

  const geometry = useMemo(() => {
    const ring = (x: number) =>
      new THREE.TorusGeometry(girth(x) + 0.012, 0.035, 8, 36).rotateY(Math.PI / 2).translate(x, 0, 0)
    return {
      // Envoltura, góndola, las cuatro aletas de cola y el motor.
      hull: fuse([
        new THREE.SphereGeometry(1, 28, 16).scale(BLIMP_LENGTH, BLIMP_RADIUS, BLIMP_RADIUS),
        slab([1.5, 0.36, 0.52], [0.25, -BLIMP_RADIUS - 0.12, 0]),
        slab([1, 0.8, 0.06], [-2.9, 0.62, 0]),
        slab([1, 0.8, 0.06], [-2.9, -0.62, 0]),
        slab([1, 0.06, 0.8], [-2.9, 0, 0.62]),
        slab([1, 0.06, 0.8], [-2.9, 0, -0.62]),
        new THREE.CylinderGeometry(0.09, 0.13, 0.36, 10)
          .rotateZ(Math.PI / 2)
          .translate(-BLIMP_LENGTH - 0.1, 0, 0),
      ]),
      // Lo que brilla: dos aros de neón, las ventanillas, el faro del morro y la luz de cola.
      lights: fuse([
        paint(ring(2.32), [2, 0.35, 1.2]),
        paint(ring(-2.32), [2, 0.35, 1.2]),
        paint(slab([1.2, 0.11, 0.54], [0.25, -BLIMP_RADIUS - 0.08, 0]), [1.8, 1.35, 0.6]),
        paint(new THREE.SphereGeometry(0.09, 10, 8).translate(BLIMP_LENGTH, 0, 0), [1.6, 2, 2.2]),
        paint(slab([0.14, 0.07, 0.08], [-3.3, 1.05, 0]), [2.2, 0.2, 0.15]),
      ]),
      propeller: fuse([slab([0.03, 1, 0.11], [0, 0, 0]), slab([0.03, 0.11, 1], [0, 0, 0])]),
    }
  }, [])

  useFrame(({ clock, camera }) => {
    const g = root.current
    if (!g) return
    const t = clock.elapsedTime
    const { center, reach, turn, phase } = BLIMP_PATH
    const sin = Math.sin(t * turn + phase)
    const cos = Math.cos(t * turn + phase)
    const bob = Math.sin(t * 0.45) * 0.45
    g.position.set(center[0] + sin * reach[0], center[1] + bob, center[2] + cos * reach[1])
    // El morro (+X local) apunta según la tangente del óvalo.
    const yaw = Math.atan2(reach[1] * sin, reach[0] * cos)
    g.rotation.y = yaw
    appear(g, 3.8, 1.6)
    // Cabeceo y balanceo leves: flota, no va sobre raíles.
    if (sway.current) sway.current.rotation.set(Math.sin(t * 0.5) * 0.03, 0, Math.sin(t * 0.37) * 0.035)
    if (propeller.current) propeller.current.rotation.x = t * 5

    // Solo se pinta el rótulo del costado que da a la cámara.
    const toCameraX = camera.position.x - g.position.x
    const toCameraZ = camera.position.z - g.position.z
    const facing = Math.sin(yaw) * toCameraX + Math.cos(yaw) * toCameraZ
    const [near, far] = banners.current
    if (near) near.visible = facing >= 0
    if (far) far.visible = facing < 0
  })

  return (
    <Detail>
      <group ref={root} position={BLIMP_PATH.center}>
        <group ref={sway}>
          <mesh geometry={geometry.hull} material={HULL} />
          <mesh geometry={geometry.lights} material={HULL_LIT} />
          <mesh
            ref={propeller}
            geometry={geometry.propeller}
            material={BLADE}
            position-x={-BLIMP_LENGTH - 0.3}
          />
          {[1, -1].map((side, i) => (
            <Text
              key={side}
              ref={(text: THREE.Object3D | null) => {
                banners.current[i] = text
              }}
              font={fontBold}
              fontSize={0.5}
              position={[0, 0.02, side * (BLIMP_RADIUS + 0.035)]}
              rotation-y={side > 0 ? 0 : Math.PI}
              color={[1.3, 1.7, 2]}
              anchorX="center"
              anchorY="middle"
              material-toneMapped={false}
              material-fog={false}
              {...BLIMP_BANNER}
            >
              kroquetita.com
            </Text>
          ))}
        </group>
      </group>
    </Detail>
  )
}

// ---------------------------------------------------------------- Farolas

/**
 * Farolas (x, z): a los lados y en los bordes. Desde la portada, el farol de
 * cada una cae sobre suelo vacío (no sobre el botón, la salida o un personaje).
 */
const LAMPS: Array<[number, number]> = [
  [-20.5, 18.9],
  [17.6, 16.7],
  [-32.4, 15.2],
  [31.6, 15.2],
  [-32.4, 3.2],
  [31.9, 8.4],
  [-32.6, -4.4],
  [30.9, 2],
  [-19.4, -8.4],
  [20.4, -8.4],
]
const LAMP_GLOW = 0.55

/** Farolas: un poste fino con un farol emisivo y un charco de luz en el suelo (sin luces de verdad). */
function Lamps() {
  const root = useRef<THREE.Group>(null)
  const posts = useRef<THREE.InstancedMesh>(null)
  const glow = useMemo(() => createGlowMaterial('#ffcf8a', LAMP_GLOW), [])

  const geometry = useMemo(() => {
    const steel: Vec3 = [0.035, 0.04, 0.055]
    return {
      // Base, poste, farol y su tapa: 3,2 de alto en total.
      post: fuse([
        paint(slab([0.26, 0.1, 0.26], [0, 0.05, 0]), steel),
        paint(slab([0.08, 2.8, 0.08], [0, 1.45, 0]), steel),
        paint(slab([0.24, 0.3, 0.24], [0, 3, 0]), [1.9, 1.5, 0.95]),
        paint(slab([0.34, 0.05, 0.34], [0, 3.175, 0]), steel),
      ]),
      // Los charcos de luz, todos en una malla.
      pools: fuse(
        LAMPS.map(([x, z]) => new THREE.PlaneGeometry(3.4, 3.4).rotateX(FLAT).translate(x, 0.025, z)),
      ),
    }
  }, [])

  useLayoutEffect(() => {
    const mesh = posts.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    LAMPS.forEach(([x, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, 0, z)))
    mesh.instanceMatrix.needsUpdate = true
    // Están repartidas por todo el escenario: la esfera de recorte ha de abarcarlas todas.
    mesh.computeBoundingSphere()
  }, [])

  useFrame(() => {
    rise(root.current, 3.3, 1.2)
    // Al amanecer se quedan a media luz.
    const night = 1 - uDay.value * 0.6
    LAMP.color.setScalar(night)
    glow.uniforms.uIntensity.value = LAMP_GLOW * night * introProgress(3.9, 1.2)
  })

  return (
    <Detail>
      <group ref={root}>
        <instancedMesh ref={posts} args={[geometry.post, LAMP, LAMPS.length]} />
        <mesh geometry={geometry.pools} material={glow} />
      </group>
    </Detail>
  )
}

// ---------------------------------------------------------------- Bancos

/** Bancos de cara a las cajas (el respaldo da a la cámara), con un filo de neón. */
function Benches() {
  const root = useRef<THREE.Group>(null)
  const neon = useMemo(() => createNeonMaterial('#ffb020', 1.1), [])

  const geometry = useMemo(() => {
    const frame: THREE.BufferGeometry[] = []
    const strips: THREE.BufferGeometry[] = []
    for (const bench of CITY.benches) {
      const [x, , z] = bench.center
      const [w, top, d] = bench.size
      const leg = w / 2 - 0.14
      frame.push(
        // Asiento (su cara de arriba es la colisión), respaldo algo tumbado y los dos costados.
        slab([w, 0.07, d - 0.16], [x, top - 0.035, z - 0.08]),
        slab([w, 0.3, 0.05], [x, 0.6, z + 0.27], [0.14, 0, 0]),
        ...[-1, 1].flatMap((side) => [
          slab([0.07, top - 0.07, d - 0.1], [x + side * leg, (top - 0.07) / 2, z - 0.02]),
          slab([0.07, 0.4, 0.05], [x + side * leg, top + 0.13, z + 0.2]),
        ]),
      )
      strips.push(
        slab([w - 0.1, 0.025, 0.03], [x, 0.765, z + 0.3]),
        slab([w - 0.5, 0.025, 0.03], [x, 0.04, z + 0.3]),
      )
    }
    return { frame: fuse(frame), strips: fuse(strips) }
  }, [])

  useFrame(() => rise(root.current, 3.5, 0.9))

  return (
    <Detail>
      <group ref={root}>
        <mesh geometry={geometry.frame} material={CASE} />
        <mesh geometry={geometry.strips} material={neon} />
      </group>
    </Detail>
  )
}

// ---------------------------------------------------------------- Árboles de neón

const TEAL: Vec3 = [0.12, 1.15, 0.95]
const MAGENTA: Vec3 = [1.2, 0.22, 0.85]
/** Árboles: todos fuera de los límites del jugador, así no hace falta colisión. */
const TREES: Array<{ at: [number, number]; height: number; tint: Vec3 }> = [
  { at: [-35.6, 6.5], height: 2.9, tint: TEAL },
  { at: [-36.4, -1], height: 2.5, tint: MAGENTA },
  { at: [-36, -8.2], height: 3, tint: TEAL },
  { at: [-33.8, -13.4], height: 2.7, tint: MAGENTA },
  { at: [20.6, -13.5], height: 3, tint: TEAL },
  { at: [35.2, -5.2], height: 2.6, tint: MAGENTA },
  { at: [35, 8.8], height: 2.9, tint: TEAL },
]
/** Cubos de la copa: desplazamiento respecto a su centro y tamaño */
const LEAVES: Array<{ at: Vec3; size: number }> = [
  { at: [0, 0, 0], size: 1.15 },
  { at: [0.5, -0.15, 0.25], size: 0.7 },
  { at: [-0.48, 0.05, -0.2], size: 0.75 },
  { at: [0.1, 0.48, -0.05], size: 0.64 },
  { at: [-0.1, -0.2, 0.5], size: 0.55 },
]

/** Copa de vóxeles emisiva: se mece y late en el shader, y se pierde en la niebla como lo demás. */
function createCanopyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uDay,
      uFog: { value: new THREE.Vector2(30, 100) },
      uFogColor: { value: new THREE.Color('#020203') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec3 aTint;
      attribute vec2 aSway;
      varying vec3 vTint;
      varying vec3 vN;
      varying vec2 vUv;
      varying float vPulse;
      varying float vDepth;
      void main() {
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        // aSway: fase del árbol entero y fase de cada cubo.
        float tree = aSway.x * 6.2831;
        float leaf = aSway.y * 6.2831;
        world.x += sin(uTime * 0.9 + tree) * 0.07 + sin(uTime * 1.9 + leaf) * 0.02;
        world.y += sin(uTime * 1.3 + leaf) * 0.025;
        vec4 mv = viewMatrix * world;
        vTint = aTint;
        vN = normal;
        vUv = uv;
        vPulse = 0.85 + 0.15 * sin(uTime * 1.1 + tree + leaf);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uDay;
      uniform vec2 uFog;
      uniform vec3 uFogColor;
      varying vec3 vTint;
      varying vec3 vN;
      varying vec2 vUv;
      varying float vPulse;
      varying float vDepth;
      void main() {
        // Sombreado fijo por cara: arriba lo más claro, abajo lo más oscuro.
        float shade = 0.4 + 0.4 * max(vN.y, 0.0) + 0.2 * max(vN.z, 0.0) + 0.08 * abs(vN.x);
        // Cada cara, partida en 2×2 vóxeles con su junta oscura.
        vec2 f = abs(fract(vUv * 2.0) - 0.5);
        float joint = 1.0 - smoothstep(0.43, 0.5, max(f.x, f.y));
        vec3 col = vTint * shade * (0.5 + 0.5 * joint) * vPulse * (1.0 - uDay * 0.3);
        float fog = clamp((vDepth - uFog.x) / max(uFog.y - uFog.x, 0.001), 0.0, 1.0);
        gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
      }
    `,
    toneMapped: false,
  })
}

/** Árboles estilizados: tronco oscuro y una copa de cubos de neón, turquesa o magenta. */
function Trees() {
  const root = useRef<THREE.Group>(null)
  const canopy = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(() => createCanopyMaterial(), [])
  const count = TREES.length * LEAVES.length

  const { trunks, leaves, matrices } = useMemo(() => {
    const rand = rng(77)
    const tints = new Float32Array(count * 3)
    const sways = new Float32Array(count * 2)
    const matrices: THREE.Matrix4[] = []
    TREES.forEach((tree, t) => {
      const phase = rand()
      // Cada árbol, espejado o no, para que no parezcan copias.
      const flip = rand() < 0.5 ? -1 : 1
      LEAVES.forEach((leaf, l) => {
        const i = t * LEAVES.length + l
        // Los cubos pequeños, algo más apagados: da volumen a la copa.
        const dim = l === 0 ? 1 : 0.72 + rand() * 0.2
        tints.set([tree.tint[0] * dim, tree.tint[1] * dim, tree.tint[2] * dim], i * 3)
        sways.set([phase, rand()], i * 2)
        const x = tree.at[0] + leaf.at[0] * flip
        const y = tree.height - 0.8 + leaf.at[1]
        const z = tree.at[1] + leaf.at[2]
        matrices.push(new THREE.Matrix4().makeScale(leaf.size, leaf.size, leaf.size).setPosition(x, y, z))
      })
    })
    const leaves = new THREE.BoxGeometry(1, 1, 1)
    leaves.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3))
    leaves.setAttribute('aSway', new THREE.InstancedBufferAttribute(sways, 2))
    const trunks = fuse(
      TREES.flatMap((tree) => [
        slab([0.22, tree.height - 1.2, 0.22], [tree.at[0], (tree.height - 1.2) / 2, tree.at[1]]),
        slab([0.5, 0.08, 0.5], [tree.at[0], 0.04, tree.at[1]]),
      ]),
    )
    return { trunks, leaves, matrices }
  }, [count])

  useLayoutEffect(() => {
    const mesh = canopy.current
    if (!mesh) return
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [matrices])

  useFrame(({ scene }) => {
    rise(root.current, 3.4, 1.2)
    // Misma niebla que el resto de la escena (la cámara la va moviendo).
    const fog = scene.fog
    if (fog instanceof THREE.Fog) {
      material.uniforms.uFog.value.set(fog.near, fog.far)
      material.uniforms.uFogColor.value.copy(fog.color)
    }
  })

  return (
    <Detail>
      <group ref={root}>
        <mesh geometry={trunks} material={DARK} />
        <instancedMesh ref={canopy} args={[leaves, material, count]} />
      </group>
    </Detail>
  )
}

// ---------------------------------------------------------------- 404 BAR

/** Altura a la que queda el suelo del quiosco: va sobre patas y lo de abajo queda libre */
const BAR_LIFT = 0.38
const COUNTER = 1.05
/** Distancia al mostrador a la que el jugador pide, y a la que se da por terminada la visita */
const BAR_NEAR = 1.6
const BAR_AWAY = 2.8

/**
 * «404 BAR»: un quiosco sobre patas con el mostrador hacia la cámara. Cartel
 * de neón en el tejado, toldo a rayas, botellas, dos taburetes y una pantalla
 * al fondo. No hay camarero: el local, como dice el cartel, no se ha encontrado.
 */
function Bar() {
  const { center, size } = CITY.bar
  const [w, h, d] = size
  const lang = useLang()
  const neon = useMemo(() => createNeonMaterial('#ff3d9a', 1.2), [])
  const screen = useMemo(() => createScreenMaterial(2, '#ff3d9a', 4.04), [])
  const root = useRef<THREE.Group>(null)
  const visiting = useRef(false)

  const geometry = useMemo(() => {
    const front = d / 2
    const wall = h - 0.12 - BAR_LIFT
    const mid = BAR_LIFT + wall / 2
    const pink: Vec3 = [0.95, 0.2, 0.42]
    const cream: Vec3 = [0.9, 0.86, 0.92]
    const stripes = 8
    const stripe = (w + 0.2) / stripes

    const bottle = (x: number, y: number, z: number, color: Vec3) => [
      paint(drum(0.055, 0.26, [x, y + 0.13, z], 10), color),
      paint(drum(0.024, 0.1, [x, y + 0.31, z], 8), color),
    ]
    const glass = (x: number, y: number, z: number, color: Vec3) =>
      paint(drum(0.04, 0.13, [x, y + 0.065, z], 10, 0.055), color)

    return {
      // Lo único que va al reflejo y a las sombras: suelo, paredes, tejado y mostrador.
      body: fuse([
        slab([w, 0.1, d], [0, BAR_LIFT + 0.05, 0]),
        slab([w, wall, 0.1], [0, mid, -front + 0.05]),
        slab([0.1, wall, d - 0.1], [-w / 2 + 0.05, mid, 0.05]),
        slab([0.1, wall, d - 0.1], [w / 2 - 0.05, mid, 0.05]),
        slab([w + 0.16, 0.12, d + 0.16], [0, h - 0.06, 0]),
        slab([w - 0.2, COUNTER - BAR_LIFT - 0.1, 0.1], [0, (COUNTER + BAR_LIFT + 0.1) / 2, front - 0.05]),
        slab([w + 0.1, 0.06, 0.55], [0, COUNTER + 0.03, front - 0.12]),
        slab([w - 0.2, 0.34, 0.1], [0, h - 0.29, front - 0.05]),
      ]),
      // Patas, soporte del cartel, baldas y los dos taburetes.
      trim: fuse([
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) =>
            slab([0.14, BAR_LIFT, 0.14], [sx * (w / 2 - 0.2), BAR_LIFT / 2, sz * (front - 0.2)]),
          ),
        ),
        slab([2.5, 0.72, 0.08], [0, h + 0.52, front - 0.25]),
        slab([0.07, 0.2, 0.07], [-0.9, h + 0.08, front - 0.25]),
        slab([0.07, 0.2, 0.07], [0.9, h + 0.08, front - 0.25]),
        slab([0.9, 0.04, 0.16], [0.9, 1.22, -front + 0.18]),
        slab([0.9, 0.04, 0.16], [0.9, 1.68, -front + 0.18]),
        ...[-0.95, 0.95].flatMap((x) => [
          drum(0.2, 0.06, [x, 0.62, front + 0.6], 14),
          drum(0.035, 0.57, [x, 0.305, front + 0.6], 8),
          drum(0.18, 0.04, [x, 0.02, front + 0.6], 14, 0.15),
        ]),
      ]),
      // Toldo: ocho franjas inclinadas hacia fuera, rosa y crema.
      awning: fuse(
        Array.from({ length: stripes }, (_, i) =>
          paint(
            slab([stripe, 0.04, 0.62], [(i + 0.5) * stripe - (w + 0.2) / 2, 2.3, front + 0.3], [0.38, 0, 0]),
            i % 2 ? cream : pink,
          ),
        ),
      ),
      // Neón: canto del mostrador, bajos, esquinas, luz interior y marco del cartel.
      neon: fuse([
        slab([w + 0.1, 0.03, 0.03], [0, COUNTER + 0.03, front + 0.17]),
        slab([w - 0.4, 0.03, 0.03], [0, BAR_LIFT - 0.02, front - 0.03]),
        slab([0.03, wall - 0.2, 0.03], [-w / 2 + 0.05, mid, front + 0.02]),
        slab([0.03, wall - 0.2, 0.03], [w / 2 - 0.05, mid, front + 0.02]),
        slab([w - 0.4, 0.03, 0.03], [0, 2.1, front - 0.14]),
        slab([2.5, 0.03, 0.03], [0, h + 0.875, front - 0.2]),
        slab([2.5, 0.03, 0.03], [0, h + 0.165, front - 0.2]),
        slab([0.03, 0.68, 0.03], [-1.235, h + 0.52, front - 0.2]),
        slab([0.03, 0.68, 0.03], [1.235, h + 0.52, front - 0.2]),
      ]),
      // Tres consumiciones en el mostrador y unas cuantas botellas en las baldas.
      drinks: fuse([
        ...bottle(-0.78, COUNTER + 0.06, front - 0.12, [0.3, 1.9, 0.8]),
        glass(-0.08, COUNTER + 0.06, front - 0.1, [2, 1.1, 0.25]),
        ...bottle(0.6, COUNTER + 0.06, front - 0.14, [0.3, 1.4, 2.2]),
        ...bottle(0.6, 1.24, -front + 0.18, [2, 0.4, 1.2]),
        ...bottle(0.9, 1.24, -front + 0.18, [0.3, 1.9, 0.8]),
        ...bottle(1.18, 1.24, -front + 0.18, [2, 1.1, 0.25]),
        ...bottle(0.72, 1.7, -front + 0.18, [0.3, 1.4, 2.2]),
        ...bottle(1.06, 1.7, -front + 0.18, [2, 0.4, 1.2]),
      ]),
    }
  }, [w, h, d])

  useFrame(() => {
    appear(root.current, 3, 1)
    // Al acercarse al mostrador, el jugador pide (una vez por visita).
    const dx = body.pos[0] - center[0]
    const dz = body.pos[2] - (center[2] + d / 2 + 0.2)
    const distance = Math.hypot(dx, dz)
    const there = useGame.getState().mode === 'play' && body.grounded && body.pos[1] < 0.5
    if (there && distance < BAR_NEAR && !visiting.current) {
      visiting.current = true
      playerSay(tr(TEXTS.order))
    } else if (distance > BAR_AWAY) visiting.current = false
  })

  return (
    <group ref={root} position={[center[0], 0, center[2]]}>
      <mesh geometry={geometry.body} material={DARK} castShadow receiveShadow />
      <Detail>
        <mesh geometry={geometry.trim} material={TRIM} />
        <mesh geometry={geometry.awning} material={CANVAS} />
        <mesh geometry={geometry.neon} material={neon} />
        <mesh geometry={geometry.drinks} material={LIT} />
        {/* Pantalla del fondo: un terminal que no deja de escribir */}
        <mesh position={[-0.55, 1.4, -d / 2 + 0.106]} material={screen}>
          <planeGeometry args={[1.5, 0.62]} />
        </mesh>
        <Text
          font={fontBold}
          fontSize={0.42}
          position={[0, h + 0.6, d / 2 - 0.2]}
          color={[2.4, 0.5, 1.3]}
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          404 BAR
        </Text>
        <Text
          font={fontBold}
          fontSize={0.13}
          position={[0, h + 0.28, d / 2 - 0.2]}
          color={[0.6, 1.7, 2]}
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          {TEXTS.barNote[lang]}
        </Text>
      </Detail>
    </group>
  )
}

// ---------------------------------------------------------------- Robot aspirador

const ROOMBA_RADIUS = 0.45
/** Altura de su tapa: lo que hay que pisar para rebotar */
const ROOMBA_TOP = 0.16
const ROOMBA_SPEED = 1.1
const ROOMBA_BOUNCE = 8.5
const TRAIL = 16
/** Cada cuánto deja una mota de luz, y cuánto tarda en apagarse */
const TRAIL_STEP = 0.3
const TRAIL_LIFE = 4.5
const TRAIL_COLOR = new THREE.Color(0.06, 0.42, 0.38)
const LED_OK = new THREE.Color(0.3, 2.2, 0.8)
const LED_DIZZY = new THREE.Color(2.4, 1.3, 0.2)
const LED_ALARM = new THREE.Color(2.6, 0.2, 0.15)

/** Por dónde puede barrer: la plaza, sin pisar nunca la línea de tiempo. */
const ROAM = {
  minX: PLAZA.minX + 0.5,
  maxX: PLAZA.maxX - 0.5,
  minZ: PLAZA.minZ + ROOMBA_RADIUS + 0.1,
  maxZ: PLAZA.maxZ,
}
/** Cosas del suelo que no son colisión pero que tampoco debe atravesar: x, z y radio. */
const KEEP_OUT: Vec3[] = [
  // Los taburetes que rodean la mesa de las IA.
  [world.props.table.center[0], world.props.table.center[2], 2.55],
  // El pato, mientras nadie lo mueva de su sitio.
  [world.props.duck[0], world.props.duck[2], 0.6],
  ...world.pads.map((pad): Vec3 => [pad.position[0], pad.position[2], pad.radius + 0.2]),
  ...LAMPS.map(([x, z]): Vec3 => [x, z, 0.15]),
  // Los personajes que charlan parados en la plaza (Folk).
  [-18, 12.2, 0.7],
  [-14.5, 9.8, 0.7],
]

/** ¿Cabe el robot en ese punto? Ni fuera de la plaza ni contra un obstáculo. */
function roombaFits(x: number, z: number) {
  if (x < ROAM.minX || x > ROAM.maxX || z < ROAM.minZ || z > ROAM.maxZ) return false
  const margin = ROOMBA_RADIUS + 0.15
  // La lista se lee cada vez: algunas colisiones se mueven.
  for (const c of world.colliders) {
    if (c.min[1] > 0.6) continue
    if (x > c.min[0] - margin && x < c.max[0] + margin && z > c.min[2] - margin && z < c.max[2] + margin) {
      return false
    }
  }
  for (const [kx, kz, radius] of KEEP_OUT) {
    if (Math.hypot(x - kx, z - kz) < radius + ROOMBA_RADIUS) return false
  }
  return true
}

/**
 * Robot aspirador: barre la plaza en línea recta y gira cuando topa con algo,
 * dejando una estela de luz que se apaga. No tiene colisión: si le caes
 * encima, te hace rebotar, se marea y suelta una frase.
 */
function Roomba() {
  const ring = useMemo(() => createNeonMaterial('#3df2b0', 1.2), [])
  const root = useRef<THREE.Group>(null)
  const led = useRef<THREE.MeshBasicMaterial>(null)
  const brushes = useRef<Array<THREE.Mesh | null>>([])
  const trail = useRef<THREE.InstancedMesh>(null)
  const state = useRef({
    x: 8,
    z: 14.3,
    dir: 2.2,
    /** Giro pendiente (radianes, con signo) antes de seguir avanzando */
    turn: 0,
    /** Velocidad de giro del mareo tras un pisotón (se va frenando) */
    spin: 0,
    squash: 0,
    dizzy: 0,
    cooldown: 0,
    stuck: 0,
    line: 0,
    /** Estela: siguiente mota, distancia recorrida desde la última y cuándo nació cada una */
    dot: 0,
    since: 0,
    born: new Float32Array(TRAIL).fill(-100),
  })
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), color: new THREE.Color() }), [])

  const geometry = useMemo(
    () => ({
      // Disco bajo con su tapa y el parachoques delantero.
      body: fuse([
        drum(ROOMBA_RADIUS, 0.11, [0, 0.085, 0], 28),
        drum(ROOMBA_RADIUS - 0.09, 0.02, [0, ROOMBA_TOP - 0.01, 0], 28),
        slab([0.5, 0.07, 0.06], [0, 0.09, ROOMBA_RADIUS - 0.03]),
      ]),
      ring: new THREE.TorusGeometry(ROOMBA_RADIUS - 0.045, 0.018, 8, 40).rotateX(FLAT).translate(0, 0.145, 0),
      // Cepillo de tres brazos, visto desde arriba.
      brush: fuse([0, 1, 2].map((i) => slab([0.26, 0.012, 0.03], [0, 0, 0], [0, (i * Math.PI) / 3, 0]))),
      dot: new THREE.CircleGeometry(0.11, 12).rotateX(FLAT),
    }),
    [],
  )

  useLayoutEffect(() => {
    const mesh = trail.current
    if (!mesh) return
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
    const black = new THREE.Color(0, 0, 0)
    for (let i = 0; i < TRAIL; i++) {
      mesh.setMatrixAt(i, hidden)
      mesh.setColorAt(i, black)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  useFrame(({ clock }, delta) => {
    const s = state.current
    const t = clock.elapsedTime
    const dt = Math.min(delta, 1 / 20)
    const shown = introProgress(3.7, 0.8)
    const play = useGame.getState().mode === 'play'
    const px = body.pos[0] - s.x
    const pz = body.pos[2] - s.z

    // Pisotón: el jugador cae sobre la tapa. Se mira un fotograma por delante,
    // porque el robot no tiene colisión y a esa velocidad podría atravesarlo.
    s.cooldown = Math.max(0, s.cooldown - dt)
    const reach = ROOMBA_TOP + 0.25 - body.vel[1] * dt
    const over = px * px + pz * pz < (ROOMBA_RADIUS + 0.1) ** 2
    if (play && s.cooldown === 0 && over && !body.grounded && body.vel[1] < -1 && body.pos[1] < reach) {
      body.vel[1] = ROOMBA_BOUNCE
      body.grounded = false
      s.cooldown = 0.5
      s.spin = 16
      s.squash = 1
      s.dizzy = 1.6
      sfx.beep()
      playerSay(tr(ROOMBA_LINES[s.line++ % ROOMBA_LINES.length]))
    }
    // El mareo le cambia el rumbo: cuando se le pasa, sale hacia donde haya quedado mirando.
    s.spin *= Math.exp(-2.4 * dt)
    s.dir += s.spin * dt
    s.squash = Math.max(0, s.squash - dt * 4)
    s.dizzy = Math.max(0, s.dizzy - dt)

    if (s.dizzy > 0 || shown < 1) {
      // Mareado (o aún apareciendo): no se mueve del sitio.
    } else if (Math.abs(s.turn) > 0.02) {
      // Gira sobre sí mismo antes de arrancar en la nueva dirección.
      const step = Math.sign(s.turn) * Math.min(Math.abs(s.turn), 2.6 * dt)
      s.dir += step
      s.turn -= step
    } else {
      const sin = Math.sin(s.dir)
      const cos = Math.cos(s.dir)
      const nx = s.x + sin * ROOMBA_SPEED * dt
      const nz = s.z + cos * ROOMBA_SPEED * dt
      // El jugador también es un obstáculo, pero solo si lo tiene delante.
      const ahead = px * sin + pz * cos > 0 && Math.hypot(body.pos[0] - nx, body.pos[2] - nz) < 0.8
      const bump = play && body.pos[1] < 0.4 && ahead
      if (!bump && roombaFits(nx, nz)) {
        s.x = nx
        s.z = nz
        s.since += ROOMBA_SPEED * dt
        s.stuck = 0
      } else if (++s.stuck > 12) {
        // Encerrado (algo se le ha echado encima): sale hacia el centro de la plaza.
        s.dir = Math.atan2((ROAM.minX + ROAM.maxX) / 2 - s.x, (ROAM.minZ + ROAM.maxZ) / 2 - s.z)
        s.x += Math.sin(s.dir) * ROOMBA_SPEED * dt
        s.z = Math.max(ROAM.minZ, s.z + Math.cos(s.dir) * ROOMBA_SPEED * dt)
      } else {
        // Topa: da media vuelta larga, hacia un lado al azar.
        s.turn = (Math.random() < 0.5 ? -1 : 1) * Math.PI * (0.55 + Math.random() * 0.5)
      }
    }

    const g = root.current
    if (g) {
      g.position.set(s.x, 0, s.z)
      g.rotation.y = s.dir
      // Al pisarlo se achata un instante.
      const wide = Math.max(0.001, shown * (1 + s.squash * 0.12))
      g.scale.set(wide, Math.max(0.001, shown * (1 - s.squash * 0.45)), wide)
    }
    brushes.current.forEach((brush, i) => {
      if (brush) brush.rotation.y = t * 9 * (i ? -1 : 1)
    })
    // Piloto: verde y tranquilo; ámbar y nervioso si está mareado; rojo con producción caída.
    if (led.current) {
      const blink = s.dizzy > 0 ? (Math.sin(t * 26) > 0 ? 1 : 0.15) : 0.7 + 0.3 * Math.sin(t * 2.4)
      const tone = uAlarm.value > 0.5 ? LED_ALARM : s.dizzy > 0 ? LED_DIZZY : LED_OK
      led.current.color.copy(tone).multiplyScalar(blink)
    }

    // Estela: una mota cada cierta distancia; todas se van apagando.
    const mesh = trail.current
    if (!mesh) return
    if (s.since > TRAIL_STEP) {
      s.since = 0
      mesh.setMatrixAt(s.dot, scratch.m.makeTranslation(s.x, 0.03, s.z))
      mesh.instanceMatrix.needsUpdate = true
      s.born[s.dot] = t
      s.dot = (s.dot + 1) % TRAIL
    }
    for (let i = 0; i < TRAIL; i++) {
      const life = Math.max(0, 1 - (t - s.born[i]) / TRAIL_LIFE)
      mesh.setColorAt(i, scratch.color.copy(TRAIL_COLOR).multiplyScalar(life * life))
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <Detail>
      <group ref={root}>
        <mesh geometry={geometry.body} material={CASE} />
        <mesh geometry={geometry.ring} material={ring} />
        <mesh position={[0, ROOMBA_TOP, 0.2]}>
          <boxGeometry args={[0.1, 0.02, 0.05]} />
          <meshBasicMaterial ref={led} color={LED_OK} toneMapped={false} />
        </mesh>
        {[-1, 1].map((side, i) => (
          <mesh
            key={side}
            ref={(mesh) => {
              brushes.current[i] = mesh
            }}
            geometry={geometry.brush}
            material={BRUSH}
            position={[side * 0.3, 0.03, 0.3]}
          />
        ))}
      </group>
      {/* Las motas se quedan donde cayeron: van en coordenadas de mundo */}
      <instancedMesh ref={trail} args={[geometry.dot, undefined, TRAIL]} frustumCulled={false}>
        <meshBasicMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </Detail>
  )
}

export function City() {
  return (
    <>
      <Skyline />
      <Blimp />
      <Lamps />
      <Benches />
      <Trees />
      <Bar />
      <Roomba />
    </>
  )
}
