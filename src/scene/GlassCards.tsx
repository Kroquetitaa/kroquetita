import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import fontMedium from '@fontsource/poppins/files/poppins-latin-500-normal.woff?url'
import fontRegular from '@fontsource/poppins/files/poppins-latin-400-normal.woff?url'
import { useGame } from '../store'
import { CARD_H, CARD_W, world, type Card as CardData } from '../world/layout'
import { introProgress } from './intro'
import { createNeonMaterial, createScanMaterial, uParty } from './materials/shaders'
import { VoxelLogo } from './VoxelLogo'

/**
 * Las etapas de la trayectoria, grabadas en el cristal de la torre como
 * tarjetas holográficas: logo en vóxeles, empresa y fechas. Cada una tiene
 * una línea guía hasta el componente del PC con el que se asocia, y una pista
 * luminosa las recorre en orden cronológico hasta la etapa actual (la CPU).
 * La etapa activa (la que se amplía en la ficha de la interfaz) se resalta.
 */

const Z = world.pc.glassZ + 0.07
/** Margen interior izquierdo del texto: deja sitio al logo. */
const TEXT_X = -CARD_W / 2 + 2.5
const TEXT_W = CARD_W / 2 - TEXT_X - 0.3

function Card({ card }: { card: CardData }) {
  const { stage, index, x, y, scale, anchor } = card
  const [accent, setAccent] = useState(stage.color)
  const onAccent = useCallback((color: string) => setAccent(color), [])

  const border = useMemo(() => createNeonMaterial(accent, 0.75), [accent])
  const bar = useMemo(() => createNeonMaterial(accent, 1.5), [accent])
  const scan = useMemo(() => createScanMaterial(accent, index * 0.37, [CARD_W, CARD_H]), [accent, index])
  const hdr = useMemo(() => new THREE.Color(accent).multiplyScalar(2.2), [accent])

  const root = useRef<THREE.Group>(null)
  const backdrop = useRef<THREE.MeshBasicMaterial>(null)
  const pulse = useRef<THREE.Mesh>(null)
  const marker = useRef<THREE.Mesh>(null)
  const focus = useRef(0)

  // Línea guía: del borde de la tarjeta más cercano al componente, hasta él.
  const leader = useMemo(() => {
    const halfW = (CARD_W / 2) * scale
    const halfH = (CARD_H / 2) * scale
    const from = new THREE.Vector3(
      THREE.MathUtils.clamp(anchor[0], x - halfW, x + halfW),
      THREE.MathUtils.clamp(anchor[1], y - halfH, y + halfH),
      Z,
    )
    // Si el componente queda justo detrás, la línea sale de una esquina.
    if (from.x === anchor[0] && from.y === anchor[1]) from.set(x + halfW, y - halfH, Z)
    const geometry = new THREE.BufferGeometry().setFromPoints([from, new THREE.Vector3(...anchor)])
    const material = new THREE.LineBasicMaterial({ color: hdr, transparent: true, opacity: 0.5, toneMapped: false })
    return { line: new THREE.Line(geometry, material), material }
  }, [x, y, scale, anchor, hdr])

  const titleSize = Math.min(0.62, TEXT_W / (stage.title.length * 0.6))

  useFrame(({ clock }, delta) => {
    const g = root.current
    if (!g) return
    const t = clock.elapsedTime
    const appear = introProgress(1.6 + index * 0.16, 0.9)
    const active = useGame.getState().stage === index ? 1 : 0
    focus.current += (active - focus.current) * (1 - Math.exp(-8 * delta))
    const f = focus.current

    // Flotan apenas, cada una a su ritmo; la activa se adelanta y crece.
    g.position.set(x, y + Math.sin(t * 0.9 + index * 1.7) * 0.05, Z + f * 0.5)
    g.scale.setScalar(Math.max(0.001, appear * scale * (1 + f * 0.14)))
    if (backdrop.current) backdrop.current.opacity = 0.7 + f * 0.18
    leader.line.visible = appear > 0.6
    leader.material.opacity = 0.28 + f * 0.7
    if (marker.current) marker.current.scale.setScalar(1 + f * 1.2)
    if (pulse.current) {
      // Onda que late en el punto del componente; más fuerte si está activa.
      const k = (t * (0.7 + f * 0.8) + index * 0.31) % 1
      pulse.current.scale.setScalar((0.4 + k * (1.6 + f * 2.4)) * (1 + uParty.value))
      ;(pulse.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (0.5 + f * 0.5) * appear
    }
  })

  const select = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    e.stopPropagation()
    useGame.getState().setStage(index, true)
  }

  return (
    <>
      <group ref={root} position={[x, y, Z]}>
        {/* Fondo ahumado, barrido de luz y marco */}
        <mesh renderOrder={3} onPointerOver={select} onClick={select}>
          <planeGeometry args={[CARD_W, CARD_H]} />
          <meshBasicMaterial ref={backdrop} color="#05070c" transparent opacity={0.7} depthWrite={false} />
        </mesh>
        <mesh position-z={0.004} material={scan} renderOrder={4}>
          <planeGeometry args={[CARD_W, CARD_H]} />
        </mesh>
        {[1, -1].map((side) => (
          <mesh key={side} position={[0, (side * CARD_H) / 2, 0.01]} material={border}>
            <boxGeometry args={[CARD_W, 0.035, 0.02]} />
          </mesh>
        ))}
        <mesh position={[-CARD_W / 2, 0, 0.01]} material={bar}>
          <boxGeometry args={[0.1, CARD_H, 0.04]} />
        </mesh>
        <mesh position={[CARD_W / 2, 0, 0.01]} material={border}>
          <boxGeometry args={[0.035, CARD_H, 0.02]} />
        </mesh>

        {/* Logo en vóxeles, saliendo del cristal */}
        <group position={[-CARD_W / 2 + 1.3, -0.02, 0.5]} scale={0.86}>
          <VoxelLogo
            url={stage.logo}
            crop={stage.logoCrop}
            color={accent}
            index={index}
            onAccent={onAccent}
          />
        </group>

        {stage.part && (
          <Text
            font={fontMedium}
            fontSize={0.17}
            letterSpacing={0.08}
            anchorX="left"
            anchorY="top"
            position={[TEXT_X, CARD_H / 2 - 0.3, 0.02]}
            maxWidth={TEXT_W}
            color={hdr}
            material-toneMapped={false}
          >
            {stage.part}
          </Text>
        )}
        <Text
          font={fontBold}
          fontSize={titleSize}
          anchorX="left"
          anchorY="middle"
          position={[TEXT_X, -0.12, 0.02]}
          material-toneMapped={false}
        >
          {stage.title}
        </Text>
        <Text
          font={fontRegular}
          fontSize={0.25}
          anchorX="left"
          anchorY="bottom"
          position={[TEXT_X, -CARD_H / 2 + 0.26, 0.02]}
          color="#a4aab5"
          material-toneMapped={false}
        >
          {stage.period}
        </Text>
      </group>

      {/* Línea guía y marca sobre el componente */}
      <primitive object={leader.line} />
      <group position={anchor}>
        <mesh ref={marker}>
          <sphereGeometry args={[0.13, 12, 12]} />
          <meshBasicMaterial color={hdr} toneMapped={false} />
        </mesh>
        <mesh ref={pulse}>
          <ringGeometry args={[0.36, 0.42, 32]} />
          <meshBasicMaterial color={hdr} toneMapped={false} transparent depthWrite={false} />
        </mesh>
      </group>
    </>
  )
}

/** Pista que une las tarjetas en orden, con pulsos que la recorren. */
function Timeline({ pulses = 8 }: { pulses?: number }) {
  const dots = useRef<THREE.InstancedMesh>(null)
  const track = useMemo(() => {
    const points = world.cards.map((c) => new THREE.Vector3(c.x, c.y, Z - 0.02))
    const lengths = [0]
    for (let i = 1; i < points.length; i++) {
      lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]))
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: new THREE.Color(0.5, 1.5, 2.2),
        transparent: true,
        opacity: 0.45,
        toneMapped: false,
      }),
    )
    return { points, lengths, total: lengths[lengths.length - 1], line }
  }, [])
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3() }), [])

  useLayoutEffect(() => {
    const mesh = dots.current
    if (!mesh) return
    const color = new THREE.Color()
    for (let i = 0; i < pulses; i++) mesh.setColorAt(i, color.setRGB(1.4, 2.8, 4))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pulses])

  useFrame(({ clock }) => {
    const mesh = dots.current
    if (!mesh) return
    const { points, lengths, total } = track
    const visible = introProgress(3.4, 1)
    track.line.visible = visible > 0.01
    const t = clock.elapsedTime
    for (let i = 0; i < pulses; i++) {
      const d = (t * (3 + uParty.value * 6) + (i / pulses) * total) % total
      let seg = 1
      while (seg < lengths.length - 1 && lengths[seg] < d) seg++
      const span = lengths[seg] - lengths[seg - 1] || 1
      scratch.p.lerpVectors(points[seg - 1], points[seg], (d - lengths[seg - 1]) / span)
      const size = Math.min(1, d / 1.5, (total - d) / 1.5) * visible
      mesh.setMatrixAt(i, scratch.m.makeScale(size, size, size).setPosition(scratch.p))
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <primitive object={track.line} />
      <instancedMesh ref={dots} args={[undefined, undefined, pulses]} frustumCulled={false}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  )
}

export function GlassCards() {
  return (
    <>
      <Timeline />
      {world.cards.map((card) => (
        <Card key={card.index} card={card} />
      ))}
    </>
  )
}
