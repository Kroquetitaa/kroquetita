import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import fontRegular from '@fontsource/poppins/files/poppins-latin-400-normal.woff?url'
import { education } from '../data/education'
import { useLang } from '../i18n'
import { useGame } from '../store'
import { world } from '../world/layout'
import { Detail } from './Detail'
import { introProgress } from './intro'
import { createGlowMaterial, uParty } from './materials/shaders'

/**
 * Lo que da vida a la biblioteca de formación:
 *  - al pisar un libro de la escalera se abre delante un ejemplar, con las
 *    páginas pasando, y dentro lo que se aprendió en ese título;
 *  - de cada libro sale un rastro de puntos de luz hasta la caja de la empresa
 *    donde se aplicó; el del libro que pisas se enciende entero, como un hilo.
 */

const PAPER = new THREE.MeshStandardMaterial({ color: '#b3ab99', roughness: 1, side: THREE.DoubleSide })
const INK = '#0d0b09'
const PAGE: [number, number] = [1.05, 1.36]
const FLIPS = 3

const ease = (t: number) => t * t * (3 - 2 * t)

/** Libro abierto que aparece delante del que pisas. */
function OpenBook() {
  const active = useGame((s) => (s.mode === 'play' ? s.study : null))
  const lang = useLang()
  // Se recuerda el último para poder cerrarlo con su animación.
  const [shown, setShown] = useState<number | null>(null)
  useEffect(() => {
    if (active !== null) setShown(active)
  }, [active])

  const root = useRef<THREE.Group>(null)
  const halves = useRef<Array<THREE.Group | null>>([])
  const flips = useRef<Array<THREE.Group | null>>([])
  const texts = useRef<THREE.Group>(null)
  const open = useRef(0)

  const study = shown === null ? null : education[shown]
  const box = shown === null ? null : world.props.campus.books[shown]
  const cover = useMemo(
    () => new THREE.MeshStandardMaterial({ color: study?.color ?? '#444', roughness: 0.55, metalness: 0.1 }),
    [study?.color],
  )
  const glow = useMemo(() => createGlowMaterial(study?.color ?? '#ffffff', 0.9), [study?.color])

  useFrame(({ clock }, delta) => {
    const g = root.current
    if (!g) return
    const t = clock.elapsedTime
    const target = useGame.getState().study === shown && useGame.getState().mode === 'play' ? 1 : 0
    open.current += (target - open.current) * (1 - Math.exp(-6 * delta))
    const k = open.current
    g.visible = k > 0.02
    g.scale.setScalar(Math.max(0.001, Math.min(1, k * 1.4)))
    g.position.y = (box ? box.center[1] + box.size[1] / 2 : 0) + 1.25 + Math.sin(t * 1.5) * 0.05
    // Las dos mitades se abren desde el lomo; al cerrarse quedan juntas y de pie.
    const fold = (1 - ease(Math.min(1, k * 1.2))) * 1.42
    if (halves.current[0]) halves.current[0].rotation.y = fold
    if (halves.current[1]) halves.current[1].rotation.y = -fold
    if (texts.current) texts.current.visible = k > 0.85
    // Páginas que van pasando de derecha a izquierda, una tras otra.
    flips.current.forEach((page, i) => {
      if (!page) return
      const phase = (t * (0.32 + uParty.value * 0.5) + i / FLIPS) % 1
      const turn = ease(Math.min(1, phase * 2.2))
      page.rotation.y = -turn * Math.PI
      page.visible = k > 0.85 && phase < 0.5
    })
  })

  if (!study || !box) return null
  const z = box.center[2] + box.size[2] / 2 + 1.35
  return (
    <Detail>
      <group ref={root} position={[box.center[0], 0, z]} rotation-x={-0.42} visible={false}>
        <mesh rotation-x={-Math.PI / 2 + 0.42} position={[0, -1.1, 0]} material={glow}>
          <planeGeometry args={[3.2, 2.2]} />
        </mesh>
        {/* Lomo */}
        <mesh position-z={-0.05} material={cover}>
          <boxGeometry args={[0.12, PAGE[1] + 0.1, 0.07]} />
        </mesh>
        {[-1, 1].map((side, i) => (
          <group
            key={side}
            ref={(group) => {
              halves.current[i] = group
            }}
          >
            {/* Tapa y taco de páginas de cada lado */}
            <mesh position={[side * (PAGE[0] / 2 + 0.03), 0, -0.05]} material={cover}>
              <boxGeometry args={[PAGE[0] + 0.1, PAGE[1] + 0.1, 0.04]} />
            </mesh>
            <mesh position={[side * (PAGE[0] / 2 + 0.01), 0, -0.012]} material={PAPER}>
              <boxGeometry args={[PAGE[0], PAGE[1], 0.045]} />
            </mesh>
          </group>
        ))}
        {/* Páginas sueltas que pasan */}
        {Array.from({ length: FLIPS }, (_, i) => (
          <group
            key={i}
            ref={(group) => {
              flips.current[i] = group
            }}
            position-z={0.02 + i * 0.004}
          >
            <mesh position-x={PAGE[0] / 2} material={PAPER}>
              <planeGeometry args={[PAGE[0] - 0.04, PAGE[1] - 0.06]} />
            </mesh>
          </group>
        ))}
        {/* Lo escrito: a la izquierda, el título; a la derecha, lo aprendido */}
        <group ref={texts} visible={false}>
          <Text
            font={fontBold}
            fontSize={0.1}
            position={[-PAGE[0] / 2, 0.42, 0.014]}
            maxWidth={PAGE[0] - 0.2}
            textAlign="center"
            anchorX="center"
            anchorY="middle"
            color={INK}
          >
            {study.school}
          </Text>
          <Text
            font={fontRegular}
            fontSize={0.068}
            lineHeight={1.3}
            position={[-PAGE[0] / 2, 0.02, 0.014]}
            maxWidth={PAGE[0] - 0.22}
            textAlign="center"
            anchorX="center"
            anchorY="middle"
            color={INK}
          >
            {study.title[lang]}
          </Text>
          <Text
            font={fontRegular}
            fontSize={0.06}
            position={[-PAGE[0] / 2, -0.46, 0.014]}
            anchorX="center"
            anchorY="middle"
            color="#6d655b"
          >
            {study.period[lang]}
          </Text>
          {study.learned[lang].map((line, i) => (
            <Text
              key={line}
              font={fontRegular}
              fontSize={0.066}
              lineHeight={1.25}
              position={[0.1, 0.42 - i * 0.36, 0.03]}
              maxWidth={PAGE[0] - 0.2}
              anchorX="left"
              anchorY="top"
              color={INK}
            >
              {`• ${line}`}
            </Text>
          ))}
        </group>
      </group>
    </Detail>
  )
}

const DOTS = 4
const SEGMENTS = 56

/**
 * Hilos de luz: de cada libro a la caja de la empresa donde se aplicó lo
 * aprendido. En reposo solo se ven puntos viajando; el hilo completo se
 * enciende para el libro que pisas.
 */
function Threads() {
  const dots = useRef<THREE.InstancedMesh>(null)
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3() }), [])
  const glowAt = useRef(education.map(() => 0))

  const links = useMemo(
    () =>
      education.flatMap((study, index) => {
        const block = world.blocks.find((b) => b.stage.title === study.appliedAt)
        const book = world.props.campus.books[index]
        if (!block || !book) return []
        const from = new THREE.Vector3(book.center[0], book.center[1] + book.size[1] / 2 + 0.3, book.center[2])
        const to = new THREE.Vector3(block.x, block.height + block.emblem[1], block.z + block.emblem[2])
        const mid = from.clone().lerp(to, 0.5)
        mid.y = Math.max(from.y, to.y) + 5 + index * 0.35
        mid.z += 3.5
        const curve = new THREE.QuadraticBezierCurve3(from, mid, to)
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(SEGMENTS))
        const material = new THREE.LineBasicMaterial({
          color: new THREE.Color(study.color).multiplyScalar(2.2),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
        const line = new THREE.Line(geometry, material)
        line.frustumCulled = false
        line.visible = false
        return [{ index, curve, line, material, color: study.color }]
      }),
    [],
  )

  useLayoutEffect(() => {
    const mesh = dots.current
    if (!mesh) return
    const color = new THREE.Color()
    links.forEach((link, i) => {
      color.set(link.color).multiplyScalar(2.4)
      for (let k = 0; k < DOTS; k++) mesh.setColorAt(i * DOTS + k, color)
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [links])

  useFrame(({ clock }, delta) => {
    const mesh = dots.current
    if (!mesh) return
    const t = clock.elapsedTime
    const appear = introProgress(4.4, 1.5)
    const game = useGame.getState()
    const active = game.mode === 'play' ? game.study : null
    links.forEach((link, i) => {
      const lit = active === link.index ? 1 : 0
      glowAt.current[i] += (lit - glowAt.current[i]) * (1 - Math.exp(-5 * delta))
      const glow = glowAt.current[i]
      link.material.opacity = glow * 0.9
      link.line.visible = glow > 0.02
      for (let k = 0; k < DOTS; k++) {
        const u = (t * (0.07 + glow * 0.16) + k / DOTS + i * 0.21) % 1
        link.curve.getPoint(u, scratch.p)
        const size = Math.sin(u * Math.PI) * appear * (0.55 + glow * 1.1)
        mesh.setMatrixAt(i * DOTS + k, scratch.m.makeScale(size, size, size).setPosition(scratch.p))
      }
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <Detail>
      {links.map((link) => (
        <primitive key={link.index} object={link.line} />
      ))}
      <instancedMesh ref={dots} args={[undefined, undefined, links.length * DOTS]} frustumCulled={false}>
        <sphereGeometry args={[0.13, 10, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </Detail>
  )
}

export function Library() {
  return (
    <>
      <OpenBook />
      <Threads />
    </>
  )
}
