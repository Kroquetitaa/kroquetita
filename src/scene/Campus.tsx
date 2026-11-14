import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import type { Localized } from '../data/career'
import { education } from '../data/education'
import { body } from '../game/state'
import { useLang } from '../i18n'
import { useGame } from '../store'
import { world } from '../world/layout'
import { Detail } from './Detail'
import { introProgress } from './intro'
import { createBeamMaterial, createNeonMaterial } from './materials/shaders'

/**
 * Biblioteca: la formación, a la izquierda del todo. Una pila de libros
 * gigantes hace de escalera (uno por título, el más antiguo en el suelo y la
 * carrera en curso arriba, bajo un birrete que flota); alrededor, el arco de
 * entrada, las estanterías del fondo, tres atriles y un camino de baldosas de
 * luz. Al pisar un libro se resalta y la interfaz enseña su ficha.
 *
 * Solo las tapas de los libros y la carpintería van en la capa normal (reflejo
 * y sombras); todo lo demás va dentro de <Detail>. No hay ni una luz: lo que
 * brilla es emisivo. Los textos salen de `education`.
 */

type Vec3 = [number, number, number]

const CAMPUS = world.props.campus
const BOOKS = CAMPUS.books
const LAST = BOOKS.length - 1
const [OX, , OZ] = CAMPUS.origin

const WOOD = new THREE.MeshStandardMaterial({ color: '#1d1a20', roughness: 0.6, metalness: 0.45 })
/** Tapas: el color llega por instancia y el lomo va algo más oscuro (color por vértice) */
const COVER = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.1 })
const PAPER = new THREE.MeshStandardMaterial({
  color: '#efe3c6',
  roughness: 0.9,
  emissive: '#5a4a2c',
  emissiveIntensity: 0.45,
})
const FELT = new THREE.MeshStandardMaterial({ color: '#20222c', roughness: 0.7, metalness: 0.2 })
/** Piezas emisivas con el color en los vértices o en la instancia (HDR: las recoge el bloom) */
const LIT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
/** Filos de neón de los lomos y baldosas: el color va por instancia */
const GLOW = new THREE.MeshBasicMaterial({ toneMapped: false })
const NEON = createNeonMaterial('#ffb347', 1.3)

/** Rótulos, en los dos idiomas. */
const TEXTS = {
  entrance: { es: 'FORMACIÓN', en: 'EDUCATION' },
  ongoing: { es: 'EN CURSO', en: 'IN PROGRESS' },
} satisfies Record<string, Localized>

// Los colores de los textos van como THREE.Color: troika ignora los arrays.
const WHITE = new THREE.Color(1, 1, 1)
const INK_SCHOOL = new THREE.Color(2.3, 2.35, 2.6)
const INK_TITLE = new THREE.Color(1.45, 1.5, 1.7)
const INK_SIGN = new THREE.Color(2.6, 1.75, 0.65)

/** Colores de cada libro: tapa (algo apagada, para que destaque el texto), filo de neón y fechas. */
const TONES = education.map((study) => {
  const hsl = { h: 0, s: 0, l: 0 }
  const cover = new THREE.Color(study.color)
  cover.getHSL(hsl, THREE.SRGBColorSpace)
  cover.setHSL(hsl.h, hsl.s * 0.72, Math.min(hsl.l, 0.5) * 0.9, THREE.SRGBColorSpace)
  return {
    cover,
    /** Tapa del libro que se está pisando */
    lit: cover.clone().multiplyScalar(1.8),
    edge: new THREE.Color(study.color).multiplyScalar(1.4),
    /** Filo del libro que se está pisando */
    hot: new THREE.Color(study.color).lerp(WHITE, 0.3).multiplyScalar(4.4),
    period: new THREE.Color(study.color).lerp(WHITE, 0.45).multiplyScalar(2.2),
    sign: new THREE.Color(study.color).lerp(WHITE, 0.15).multiplyScalar(2.6),
  }
})

/** Aleatorio determinista: las estanterías son idénticas en cada carga. */
const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

/** Del mundo a coordenadas de la biblioteca (el grupo raíz está en su origen). */
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

/** Da a toda la pieza un color por vértice (para LIT y para el tono del lomo). */
function paint<T extends THREE.BufferGeometry>(g: T, color: Vec3) {
  const count = g.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set(color, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

/** Gira una pieza alrededor del eje Y y la lleva a su sitio. */
function place<T extends THREE.BufferGeometry>(g: T, at: Vec3, yaw: number) {
  g.rotateY(yaw)
  g.translate(at[0], at[1], at[2])
  return g
}

/** Funde varias piezas en una sola geometría: todo lo estático en un único dibujado. */
function fuse(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return merged
}

/**
 * Cubo unidad con un tono por cara (+X, −X, +Y, −Y, +Z, −Z): sombreado fijo
 * para lo que va con material básico y no recibe luz.
 */
function shadedBox(tones: number[]) {
  const g = new THREE.BoxGeometry(1, 1, 1)
  const count = g.attributes.position.count
  const colors = new Float32Array(count * 3)
  // BoxGeometry da cuatro vértices por cara, en ese orden.
  for (let i = 0; i < count; i++) colors.fill(tones[Math.floor(i / 4)], i * 3, i * 3 + 3)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

// ---------------------------------------------------------------- Escalera de libros

/** Grosor de las tapas y del lomo, y márgenes del bloque de páginas (en fracción del libro) */
const BOARD = 0.12
const SPINE = 0.035
/** Sección de los filos de neón del lomo */
const EDGE = 0.03
/** Margen de los textos del lomo respecto a sus extremos */
const PAD = 0.2
/** Ancho medio de una letra de Poppins seminegrita, en fracción del cuerpo */
const EM = 0.6
/** Cuánto puede asomar el jugador por el borde de un libro y seguir sobre él */
const REACH = 0.2

/** Cuerpo de letra para que `text` quepa en `width` en una sola línea. */
const fit = (text: string, width: number, min: number, max: number) =>
  Math.min(max, Math.max(min, width / (text.length * EM)))

/** Libro de lado 1: dos tapas y el lomo (cara +Z); cada instancia lo estira a su tamaño. */
const COVER_SHAPE = fuse([
  paint(slab([1, BOARD, 1], [0, 0.5 - BOARD / 2, 0]), [1, 1, 1]),
  paint(slab([1, BOARD, 1], [0, BOARD / 2 - 0.5, 0]), [1, 1, 1]),
  paint(slab([1, 1 - BOARD * 2, SPINE], [0, 0, 0.5 - SPINE / 2]), [0.6, 0.6, 0.6]),
])
/** Bloque de páginas: asoma, algo metido, por los dos cantos y por detrás (va del lomo a 0,03 del borde). */
const PAGES_SHAPE = slab([0.964, 1 - BOARD * 2, 0.97 - SPINE], [0, 0, (0.03 - SPINE) / 2])
const UNIT = new THREE.BoxGeometry(1, 1, 1)

/**
 * La pila: un libro por título. Tapas, páginas y filos de neón van
 * instanciados; en cada lomo, el centro, las fechas y el título. También
 * avisa al juego de qué libro se está pisando y lo resalta.
 */
function Stack() {
  const lang = useLang()
  const covers = useRef<THREE.InstancedMesh>(null)
  const pages = useRef<THREE.InstancedMesh>(null)
  const edges = useRef<THREE.InstancedMesh>(null)
  const state = useRef({ on: -1, glow: BOOKS.map(() => 0), settled: false })
  const scratch = useMemo(() => new THREE.Color(), [])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    BOOKS.forEach((book, i) => {
      const [x, y, z] = local(book.center)
      const [length, thick, depth] = book.size
      m.makeScale(length, thick, depth).setPosition(x, y, z)
      covers.current?.setMatrixAt(i, m)
      covers.current?.setColorAt(i, TONES[i].cover)
      pages.current?.setMatrixAt(i, m)
      // Dos filos por libro: arriba y abajo del lomo.
      for (let side = 0; side < 2; side++) {
        const lift = (side ? 1 : -1) * (thick / 2 - 0.035)
        m.makeScale(length - 0.08, EDGE, EDGE).setPosition(x, y + lift, z + depth / 2 + 0.01)
        edges.current?.setMatrixAt(i * 2 + side, m)
        edges.current?.setColorAt(i * 2 + side, TONES[i].edge)
      }
    })
    for (const mesh of [covers.current, pages.current, edges.current]) {
      if (!mesh) continue
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      // Están lejos del origen del grupo: la esfera de recorte ha de abarcarlos todos.
      mesh.computeBoundingSphere()
    }
  }, [])

  useFrame(({ clock }, delta) => {
    const s = state.current
    const game = useGame.getState()

    // ¿Sobre qué libro está el jugador? (los pies, a la altura de su tapa).
    let on = -1
    if (game.mode === 'play' && body.grounded) {
      const [x, y, z] = body.pos
      for (let i = 0; i < BOOKS.length; i++) {
        const { center, size } = BOOKS[i]
        if (
          Math.abs(y - (center[1] + size[1] / 2)) < 0.12 &&
          Math.abs(x - center[0]) < size[0] / 2 + REACH &&
          Math.abs(z - center[2]) < size[2] / 2 + REACH
        ) {
          on = i
          break
        }
      }
    }
    game.setStudy(on < 0 ? null : on)
    if (on !== s.on) {
      s.on = on
      // El último libro es la carrera en curso: llegar arriba tiene premio.
      if (on === LAST) game.unlock('graduate')
    }

    // Resalte: el libro pisado se enciende y los demás vuelven a su tono.
    const k = 1 - Math.exp(-10 * Math.min(delta, 0.05))
    let moving = false
    for (let i = 0; i < BOOKS.length; i++) {
      const goal = i === on ? 1 : 0
      if (Math.abs(goal - s.glow[i]) > 0.002) {
        s.glow[i] += (goal - s.glow[i]) * k
        moving = true
      } else s.glow[i] = goal
    }
    // Sin nadie encima y con todo en reposo no hay nada que repintar.
    if (!moving && on < 0 && s.settled) return
    s.settled = !moving && on < 0
    const pulse = 0.86 + 0.14 * Math.sin(clock.elapsedTime * 5)
    for (let i = 0; i < BOOKS.length; i++) {
      const tone = TONES[i]
      const glow = s.glow[i]
      covers.current?.setColorAt(i, scratch.copy(tone.cover).lerp(tone.lit, glow * 0.6))
      scratch.copy(tone.edge).lerp(tone.hot, glow * (i === on ? pulse : 1))
      edges.current?.setColorAt(i * 2, scratch)
      edges.current?.setColorAt(i * 2 + 1, scratch)
    }
    for (const mesh of [covers.current, edges.current]) {
      if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })

  return (
    <>
      <instancedMesh ref={covers} args={[COVER_SHAPE, COVER, BOOKS.length]} castShadow receiveShadow />
      <Detail>
        <instancedMesh ref={pages} args={[PAGES_SHAPE, PAPER, BOOKS.length]} />
        <instancedMesh ref={edges} args={[UNIT, GLOW, BOOKS.length * 2]} />
        {education.map((study, i) => {
          const [x, y, z] = local(BOOKS[i].center)
          const [length, , depth] = BOOKS[i].size
          const title = study.title[lang]
          const period = study.period[lang]
          const periodSize = 0.1
          // El centro comparte renglón con las fechas: se encoge lo justo para no pisarlas.
          const room = length - PAD * 2 - period.length * periodSize * EM - 0.25
          return (
            <group key={i} position={[x, y, z + depth / 2 + 0.014]}>
              <Text
                font={fontBold}
                fontSize={fit(study.school, room, 0.12, 0.23)}
                position={[-length / 2 + PAD, 0.11, 0]}
                color={INK_SCHOOL}
                anchorX="left"
                anchorY="middle"
                whiteSpace="nowrap"
                material-toneMapped={false}
              >
                {study.school}
              </Text>
              <Text
                font={fontBold}
                fontSize={periodSize}
                position={[length / 2 - PAD, 0.11, 0]}
                color={TONES[i].period}
                anchorX="right"
                anchorY="middle"
                whiteSpace="nowrap"
                material-toneMapped={false}
              >
                {period}
              </Text>
              {/* El título, en una línea; si aun así no cabe, parte en dos (hay sitio justo) */}
              <Text
                font={fontBold}
                fontSize={fit(title, length - PAD * 2, 0.085, 0.125)}
                maxWidth={length - PAD * 2}
                lineHeight={1.12}
                position={[-length / 2 + PAD, -0.145, 0]}
                color={INK_TITLE}
                anchorX="left"
                anchorY="middle"
                material-toneMapped={false}
              >
                {title}
              </Text>
            </group>
          )
        })}
      </Detail>
    </>
  )
}

// ---------------------------------------------------------------- Birrete

/** Altura, sobre el último libro, a la que flota el birrete */
const CAP_LIFT = 1.7

/**
 * Sobre el último libro: un birrete que gira despacio en lo alto de un haz de
 * luz. Si esa formación sigue en curso, un rótulo lo dice.
 */
function Mortarboard() {
  const lang = useLang()
  const study = education[LAST]
  const book = BOOKS[LAST]
  const [x, , z] = local(book.center)
  const top = book.center[1] + book.size[1] / 2
  // El año en que acaba sale de sus fechas (el último que aparezca): «EN CURSO · 2029».
  const year = study.period[lang].match(/\d{4}/g)?.pop()
  const beam = useMemo(() => createBeamMaterial(study.color), [study.color])
  const float = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)

  const geometry = useMemo(() => {
    const gold: Vec3 = [2.1, 1.5, 0.45]
    const trim: Vec3 = [0.9, 0.62, 0.18]
    const rim = 0.54
    return {
      // Casquete y tablero.
      cap: fuse([
        new THREE.CylinderGeometry(0.36, 0.4, 0.3, 10).translate(0, -0.1, 0),
        slab([1.1, 0.07, 1.1], [0, 0.085, 0]),
      ]),
      // Botón, cordón y borla, y un ribete dorado en el canto del tablero.
      tassel: fuse([
        paint(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10).translate(0, 0.145, 0), gold),
        paint(slab([0.52, 0.03, 0.03], [0.27, 0.136, 0]), gold),
        paint(slab([0.03, 0.4, 0.03], [0.545, -0.05, 0]), gold),
        paint(slab([0.09, 0.2, 0.09], [0.545, -0.33, 0]), gold),
        paint(slab([1.1, 0.02, 0.02], [0, 0.125, rim]), trim),
        paint(slab([1.1, 0.02, 0.02], [0, 0.125, -rim]), trim),
        paint(slab([0.02, 0.02, 1.1], [rim, 0.125, 0]), trim),
        paint(slab([0.02, 0.02, 1.1], [-rim, 0.125, 0]), trim),
      ]),
    }
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (float.current) float.current.position.y = top + CAP_LIFT + Math.sin(t * 1.3) * 0.08
    if (spin.current) spin.current.rotation.y = t * 0.45
  })

  return (
    <Detail position={[x, 0, z]}>
      <mesh position-y={top + 0.82} material={beam}>
        <cylinderGeometry args={[0.85, 0.5, 1.6, 28, 1, true]} />
      </mesh>
      {/* Algo ladeado, para que se vea el tablero desde delante */}
      <group ref={float} position-y={top + CAP_LIFT} rotation={[0.24, 0, 0.1]} scale={1.2}>
        <group ref={spin}>
          <mesh geometry={geometry.cap} material={FELT} />
          <mesh geometry={geometry.tassel} material={LIT} />
        </group>
      </group>
      {study.ongoing && (
        <Text
          font={fontBold}
          fontSize={0.26}
          position={[0, top + 2.62, 0]}
          color={TONES[LAST].sign}
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          {year ? `${TEXTS.ongoing[lang]} · ${year}` : TEXTS.ongoing[lang]}
        </Text>
      )}
    </Detail>
  )
}

// ---------------------------------------------------------------- Alrededores

/** Dónde va el arco (en coordenadas de la biblioteca) y cuánto está girado */
const ARCH = local(CAMPUS.arch.position)
const ARCH_YAW = CAMPUS.arch.yaw
/** Medio ancho del arco, altura de sus pilares y altura del centro del dintel */
const ARCH_HALF = 1.75
const ARCH_PILLAR = 3.5
const ARCH_LINTEL = 3.87
/** Lomos apagados de las estanterías (los encendidos toman el color de un libro de la pila) */
const MUTED = ['#3b2f2a', '#2a3340', '#3a2a3c', '#2f3a2e', '#40342a', '#27323a', '#3c2b2b', '#34363f']
const TILE_DIM = new THREE.Color(0.2, 0.12, 0.04)
const TILE_LIT = new THREE.Color(2.4, 1.5, 0.5)
/** Lomo de estantería: cubo unidad con la cara de delante clara y los costados en sombra */
const SHELF_BOOK = shadedBox([0.5, 0.5, 1.15, 0.35, 1, 0.45])
const TILE = new THREE.BoxGeometry(0.62, 0.03, 0.62)

/**
 * Lo que hace de la pila un sitio: el arco de entrada con su rótulo, las
 * estanterías del fondo (los lomos, instanciados), los atriles con un libro
 * abierto que brilla y el camino de baldosas por el que corre una luz.
 */
function Grounds() {
  const lang = useLang()
  const spines = useRef<THREE.InstancedMesh>(null)
  const tiles = useRef<THREE.InstancedMesh>(null)
  const scratch = useMemo(() => new THREE.Color(), [])

  const { frame, neon, lit, shelved } = useMemo(() => {
    const rand = rng(2029)
    const frame: THREE.BufferGeometry[] = []
    const neon: THREE.BufferGeometry[] = []
    const lit: THREE.BufferGeometry[] = []
    const shelved: Array<{ matrix: THREE.Matrix4; color: THREE.Color }> = []

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

    // Estanterías: fondo, costados, zócalo, cornisa y baldas; en cada balda, una fila de lomos.
    const emissive = education.map((study) => new THREE.Color(study.color).multiplyScalar(1.5))
    for (const shelf of CAMPUS.shelves) {
      const [x, , z] = local(shelf.center)
      const [w, h, d] = shelf.size
      frame.push(
        slab([w, h - 0.14, 0.08], [x, (h - 0.14) / 2, z - d / 2 + 0.04]),
        slab([0.12, h - 0.14, d - 0.08], [x - w / 2 + 0.06, (h - 0.14) / 2, z + 0.04]),
        slab([0.12, h - 0.14, d - 0.08], [x + w / 2 - 0.06, (h - 0.14) / 2, z + 0.04]),
        slab([w - 0.24, 0.22, d - 0.12], [x, 0.11, z + 0.02]),
        slab([w + 0.16, 0.14, d + 0.1], [x, h - 0.07, z]),
      )
      // Tira de luz bajo la cornisa.
      neon.push(slab([w - 0.3, 0.035, 0.035], [x, h - 0.16, z + d / 2 + 0.02]))

      const low = 0.22
      const rows = Math.round((h - 0.14 - low) / 0.95)
      const pitch = (h - 0.14 - low) / rows
      for (let row = 0; row < rows; row++) {
        const floor = low + row * pitch
        if (row > 0) frame.push(slab([w - 0.24, 0.06, d - 0.12], [x, floor - 0.03, z + 0.02]))
        let cursor = x - w / 2 + 0.16
        const end = x + w / 2 - 0.16
        for (;;) {
          // De vez en cuando falta un libro.
          if (rand() < 0.07) cursor += 0.2 + rand() * 0.3
          const width = 0.13 + rand() * 0.16
          if (cursor + width > end) break
          const height = (pitch - 0.12) * (0.68 + rand() * 0.3)
          const deep = 0.42 + rand() * 0.14
          const front = z + d / 2 - 0.05 - rand() * 0.06
          // Casi todos apagados; unos pocos brillan con el color de un libro de la pila.
          const color =
            rand() < 0.09
              ? emissive[Math.floor(rand() * emissive.length)]
              : new THREE.Color(MUTED[Math.floor(rand() * MUTED.length)]).multiplyScalar(0.6 + rand() * 0.7)
          shelved.push({
            matrix: new THREE.Matrix4()
              .makeScale(width, height, deep)
              .setPosition(cursor + width / 2, floor + height / 2, front - deep / 2),
            color,
          })
          cursor += width + 0.012
        }
      }
    }

    // Atriles: pie, tablero inclinado hacia quien lee (+Z) y, encima, un libro abierto que brilla.
    const tilt = new THREE.Matrix4().makeRotationX(0.5)
    for (const lectern of CAMPUS.lecterns) {
      const [x, , z] = local(lectern.center)
      frame.push(
        slab([0.7, 0.07, 0.5], [x, 0.035, z]),
        slab([0.16, 0.92, 0.16], [x, 0.5, z - 0.04]),
        slab([0.9, 0.06, 0.62], [x, 0.98, z], [0.5, 0, 0]),
        // Listón que sujeta el libro.
        slab([0.9, 0.08, 0.05], [0, 0.07, 0.3]).applyMatrix4(tilt).translate(x, 0.98, z),
      )
      for (const side of [-1, 1]) {
        // Cada hoja, algo levantada hacia fuera: el libro queda abierto en uve.
        const page = slab([0.37, 0.03, 0.46], [0, 0, 0], [0, 0, side * 0.12])
        page.translate(side * 0.19, 0.07, 0).applyMatrix4(tilt).translate(x, 0.98, z)
        lit.push(paint(page, side < 0 ? [1.9, 1.6, 1.1] : [1.7, 1.42, 0.98]))
      }
    }
    return { frame: fuse(frame), neon: fuse(neon), lit: fuse(lit), shelved }
  }, [])

  useLayoutEffect(() => {
    const mesh = spines.current
    if (mesh) {
      shelved.forEach((book, i) => {
        mesh.setMatrixAt(i, book.matrix)
        mesh.setColorAt(i, book.color)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    const path = tiles.current
    if (path) {
      const m = new THREE.Matrix4()
      CAMPUS.path.forEach((tile, i) => {
        const [x, , z] = local(tile)
        path.setMatrixAt(i, m.makeTranslation(x, 0.02, z))
        path.setColorAt(i, TILE_DIM)
      })
      path.instanceMatrix.needsUpdate = true
      if (path.instanceColor) path.instanceColor.needsUpdate = true
      path.computeBoundingSphere()
    }
  }, [shelved])

  useFrame(({ clock }) => {
    // Una luz recorre el camino, del mapa hacia los libros.
    const path = tiles.current
    if (!path) return
    const t = clock.elapsedTime
    for (let i = 0; i < CAMPUS.path.length; i++) {
      const wave = Math.max(0, Math.sin(t * 2.4 - i * 0.8))
      path.setColorAt(i, scratch.copy(TILE_DIM).lerp(TILE_LIT, wave * wave * wave * wave))
    }
    if (path.instanceColor) path.instanceColor.needsUpdate = true
  })

  return (
    <>
      <mesh geometry={frame} material={WOOD} />
      <Detail>
        <mesh geometry={neon} material={NEON} />
        <mesh geometry={lit} material={LIT} />
        <instancedMesh ref={spines} args={[SHELF_BOOK, LIT, shelved.length]} />
        <instancedMesh ref={tiles} args={[TILE, GLOW, CAMPUS.path.length]} />
        <group position={ARCH} rotation-y={ARCH_YAW}>
          <Text
            font={fontBold}
            fontSize={0.42}
            position={[0, ARCH_LINTEL, 0.2]}
            color={INK_SIGN}
            anchorX="center"
            anchorY="middle"
            material-toneMapped={false}
          >
            {TEXTS.entrance[lang]}
          </Text>
        </group>
      </Detail>
    </>
  )
}

// ---------------------------------------------------------------- Poste indicador

/** Altura del centro del cartel del poste */
const SIGN_Y = 2.25

/** Poste con un cartel y una flecha de neón hacia la izquierda: por ahí queda la biblioteca. */
function Signpost() {
  const lang = useLang()
  const geometry = useMemo(
    () => ({
      post: fuse([
        slab([0.4, 0.08, 0.4], [0, 0.04, 0]),
        slab([0.1, SIGN_Y - 0.31, 0.1], [0, (SIGN_Y - 0.31) / 2, 0]),
        slab([2.3, 0.62, 0.08], [0, SIGN_Y, 0]),
      ]),
      // La flecha (asta y punta) y un filo bajo el cartel.
      arrow: fuse([
        slab([0.44, 0.05, 0.02], [-0.72, SIGN_Y, 0.05]),
        slab([0.24, 0.05, 0.02], [-0.855, SIGN_Y + 0.072, 0.05], [0, 0, 0.7]),
        slab([0.24, 0.05, 0.02], [-0.855, SIGN_Y - 0.072, 0.05], [0, 0, -0.7]),
        slab([2.3, 0.03, 0.03], [0, SIGN_Y - 0.325, 0.05]),
      ]),
    }),
    [],
  )

  return (
    <Detail>
      <mesh geometry={geometry.post} material={WOOD} />
      <mesh geometry={geometry.arrow} material={NEON} />
      <Text
        font={fontBold}
        fontSize={0.22}
        position={[0.3, SIGN_Y, 0.05]}
        color={INK_SIGN}
        anchorX="center"
        anchorY="middle"
        material-toneMapped={false}
      >
        {TEXTS.entrance[lang]}
      </Text>
    </Detail>
  )
}

export function Campus() {
  const root = useRef<THREE.Group>(null)
  const post = useRef<THREE.Group>(null)

  useFrame(() => {
    appear(root.current, 3.6, 1.1)
    appear(post.current, 3.9, 0.9)
  })

  return (
    <>
      <group ref={root} position={CAMPUS.origin}>
        <Stack />
        <Mortarboard />
        <Grounds />
      </group>
      <group ref={post} position={CAMPUS.signpost}>
        <Signpost />
      </group>
    </>
  )
}
