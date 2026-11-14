import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import fontRegular from '@fontsource/poppins/files/poppins-latin-400-normal.woff?url'
import { useUI } from '../i18n'
import { useGame } from '../store'
import { world } from '../world/layout'
import { introProgress } from './intro'
import { createNeonMaterial } from './materials/shaders'

const FLAT = -Math.PI / 2
const BAR = 0.16

/**
 * Línea de tiempo pintada en el suelo, delante de las cajas: un eje con los
 * años y una barra de luz por etapa. Las etapas que coincidieron en el tiempo
 * van en carriles paralelos, así que se ve de un vistazo qué fue simultáneo.
 * La barra de la etapa activa se enciende y un cursor se desliza hasta ella.
 */
export function Timeline() {
  const { left, right, z, lanePitch, lanes, bars, years, today } = world.timeline
  const accents = useGame((s) => s.accents)
  const t = useUI()
  const root = useRef<THREE.Group>(null)
  const playhead = useRef<THREE.Mesh>(null)
  const axis = useMemo(() => createNeonMaterial('#8fb8ff', 0.8), [])
  const now = useMemo(() => createNeonMaterial('#ff9f1c', 1.6), [])
  const materials = useMemo(() => accents.map((color) => createNeonMaterial(color, 0.7)), [accents])

  const laneZ = (lane: number) => z + 0.5 + lane * lanePitch
  const far = laneZ(lanes - 1) + 0.3
  const depth = far - z
  const middle = z + depth / 2
  // Todo se dibuja respecto al extremo izquierdo: así la línea "crece" hacia la derecha al aparecer.
  const local = (x: number) => x - left

  useFrame((_, delta) => {
    if (root.current) root.current.scale.x = Math.max(0.001, introProgress(2.8, 1.8))
    const stage = useGame.getState().stage
    const k = 1 - Math.exp(-6 * delta)
    materials.forEach((material, i) => {
      const uniform = material.uniforms.uIntensity
      uniform.value += ((i === stage ? 2.6 : 0.7) - uniform.value) * k
    })
    const bar = bars[stage]
    if (playhead.current && bar) {
      playhead.current.position.x += (local((bar.from + bar.to) / 2) - playhead.current.position.x) * k
    }
  })

  const select = (index: number) => (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    e.stopPropagation()
    useGame.getState().setStage(index, true)
  }

  return (
    <group ref={root} position={[left, 0, 0]}>
      {/* Fondo oscuro para que se lea sobre el suelo reflectante */}
      <mesh rotation-x={FLAT} position={[local((left + right) / 2), 0.018, middle]}>
        <planeGeometry args={[right - left + 0.8, depth + 0.5]} />
        <meshBasicMaterial color="#04060a" transparent opacity={0.5} depthWrite={false} />
      </mesh>

      {/* Eje y marcas de los años */}
      <mesh rotation-x={FLAT} position={[local((left + right) / 2), 0.03, z]} material={axis}>
        <planeGeometry args={[right - left, 0.05]} />
      </mesh>
      {years.map(({ year, x }) => (
        <group key={year} position={[local(x), 0, 0]}>
          <mesh rotation-x={FLAT} position={[0, 0.028, middle]}>
            <planeGeometry args={[0.035, depth]} />
            <meshBasicMaterial color="#9db4d8" transparent opacity={0.22} depthWrite={false} />
          </mesh>
          <mesh rotation-x={FLAT} position={[0, 0.032, z]} material={axis}>
            <planeGeometry args={[0.07, 0.3]} />
          </mesh>
          {/* El año, recostado hacia atrás para leerlo desde la cámara */}
          <Text
            font={fontBold}
            fontSize={0.46}
            position={[0.1, 0.03, far + 0.22]}
            rotation-x={-1}
            anchorX="left"
            anchorY="bottom"
            color={[1.3, 1.6, 2.1]}
            material-toneMapped={false}
          >
            {String(year)}
          </Text>
        </group>
      ))}

      {/* Hoy */}
      <mesh rotation-x={FLAT} position={[local(today), 0.034, middle]} material={now}>
        <planeGeometry args={[0.05, depth]} />
      </mesh>
      <Text
        font={fontBold}
        fontSize={0.2}
        position={[local(today) - 0.08, 0.036, z - 0.2]}
        rotation-x={FLAT}
        anchorX="right"
        anchorY="middle"
        color={[2.6, 1.6, 0.5]}
        material-toneMapped={false}
      >
        {t.today}
      </Text>

      {/* Una barra por etapa, con su nombre */}
      {bars.map((bar) => {
        const length = Math.max(0.3, bar.to - bar.from - 0.06)
        const stage = world.blocks[bar.index].stage
        const lane = laneZ(bar.lane)
        return (
          <group key={bar.index} position={[local(bar.from), 0, lane]}>
            <mesh rotation-x={FLAT} position={[length / 2, 0.032, 0]} material={materials[bar.index]}>
              <planeGeometry args={[length, BAR]} />
            </mesh>
            <mesh rotation-x={FLAT} position={[0, 0.034, 0]} material={materials[bar.index]}>
              <circleGeometry args={[BAR * 0.8, 20]} />
            </mesh>
            <Text
              font={fontRegular}
              fontSize={0.17}
              position={[0.2, 0.036, -0.2]}
              rotation-x={FLAT}
              anchorX="left"
              anchorY="middle"
              color="#dfe5ee"
              material-toneMapped={false}
            >
              {stage.title}
            </Text>
            {/* Zona de clic, algo mayor que la barra */}
            <mesh
              rotation-x={FLAT}
              position={[length / 2, 0.04, -0.06]}
              onPointerOver={select(bar.index)}
              onClick={select(bar.index)}
            >
              <planeGeometry args={[length, lanePitch]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        )
      })}

      {/* Cursor que se desliza hasta la etapa activa */}
      <mesh ref={playhead} rotation-x={FLAT} position={[0, 0.038, middle]}>
        <planeGeometry args={[0.045, depth]} />
        <meshBasicMaterial color={[2.2, 2.2, 2.4]} transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
