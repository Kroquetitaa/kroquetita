import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import { world } from '../world/layout'
import { introProgress } from './intro'
import {
  createCaseMaterial,
  createCoolantMaterial,
  createCoreMaterial,
  createGlassMaterial,
  createPcbTexture,
  createPipeMaterial,
  createRackMaterial,
  createRgbMaterial,
  uParty,
} from './materials/shaders'

/**
 * La torre, construida como un PC de chasis abierto: bandeja negra al fondo
 * con la placa, la gráfica y la fuente a la izquierda, el depósito de la
 * refrigeración en el centro, tres ventiladores RGB en columna a la derecha
 * y un panel de cristal delante sujeto por cuatro separadores.
 */

const PC = world.pc
const HALF_PI = Math.PI / 2
const WIDTH = PC.right - PC.left
const HEIGHT = PC.top - PC.bottom
const MID_Y = (PC.top + PC.bottom) / 2
/** Z de una pieza que sobresale `depth` de la bandeja (su centro). */
const out = (depth: number) => PC.trayZ + depth / 2

type GroupProps = React.ComponentProps<'group'>

/** Envuelve una pieza para que aparezca creciendo durante la entrada. */
function Pop({ delay, children, ...props }: { delay: number; children: React.ReactNode } & GroupProps) {
  const ref = useRef<THREE.Group>(null)
  const done = useRef(false)
  useFrame(() => {
    if (done.current || !ref.current) return
    const k = introProgress(delay, 1.1)
    ref.current.scale.setScalar(Math.max(0.001, k))
    if (k >= 1) done.current = true
  })
  return (
    <group ref={ref} scale={0.001} {...props}>
      {children}
    </group>
  )
}

/** Ventilador con aro RGB. Mira hacia +Z y gira sobre ese eje. */
function Fan({
  radius,
  speed = 9,
  phase = 0,
  blades = 9,
  ...props
}: { radius: number; speed?: number; phase?: number; blades?: number } & GroupProps) {
  const spin = useRef<THREE.Group>(null)
  const rgb = useMemo(() => createRgbMaterial(phase, 0.3), [phase])

  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.z -= delta * speed * (1 + uParty.value * 2)
  })

  return (
    <group {...props}>
      {/* Marco cuadrado, fondo y aros de luz */}
      <mesh position-z={-0.2}>
        <boxGeometry args={[radius * 2.16, radius * 2.16, 0.3]} />
        <meshStandardMaterial color="#0b0c10" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position-z={-0.03} rotation-x={HALF_PI}>
        <cylinderGeometry args={[radius * 0.98, radius * 0.98, 0.06, 48]} />
        <meshStandardMaterial color="#050608" roughness={0.8} />
      </mesh>
      <mesh material={rgb} position-z={0.1}>
        <torusGeometry args={[radius * 0.97, radius * 0.07, 10, 72]} />
      </mesh>
      <mesh material={rgb} position-z={0.16}>
        <torusGeometry args={[radius * 0.3, radius * 0.035, 8, 40]} />
      </mesh>
      {/* Aspas translúcidas y buje */}
      <group ref={spin} position-z={0.05}>
        {Array.from({ length: blades }, (_, i) => (
          <group key={i} rotation-z={(i / blades) * Math.PI * 2}>
            <mesh position={[radius * 0.6, 0, 0.04]} rotation={[0.5, 0, 0.32]}>
              <boxGeometry args={[radius * 0.66, radius * 0.3, 0.03]} />
              <meshStandardMaterial
                color="#3a4154"
                roughness={0.3}
                metalness={0.2}
                emissive="#1c3050"
                emissiveIntensity={1}
                transparent
                opacity={0.8}
              />
            </mesh>
          </group>
        ))}
        <mesh position-z={0.1} rotation-x={HALF_PI}>
          <cylinderGeometry args={[radius * 0.24, radius * 0.24, 0.24, 24]} />
          <meshStandardMaterial color="#14161c" roughness={0.3} metalness={0.8} />
        </mesh>
      </group>
    </group>
  )
}

/** Chasis: bandeja trasera, base con patas, tapa y la tira de luz inferior. */
function Chassis() {
  const hex = useMemo(() => createCaseMaterial([WIDTH, HEIGHT]), [])
  const rgb = useMemo(() => createRgbMaterial(0, 0.12), [])
  const steel = <meshStandardMaterial color="#0c0d11" roughness={0.45} metalness={0.8} />
  const depth = PC.glassZ - PC.trayZ
  const centerZ = (PC.glassZ + PC.trayZ) / 2

  return (
    <>
      <mesh position={[0, MID_Y, PC.trayZ - 0.26]} castShadow receiveShadow>
        <boxGeometry args={[WIDTH, HEIGHT, 0.5]} />
        {steel}
      </mesh>
      <mesh position={[0, MID_Y, PC.trayZ + 0.002]} material={hex}>
        <planeGeometry args={[WIDTH, HEIGHT]} />
      </mesh>
      {/* Base y tapa */}
      <mesh position={[0, PC.bottom - 0.35, centerZ - 0.3]} castShadow receiveShadow>
        <boxGeometry args={[WIDTH + 0.6, 0.7, depth + 1.4]} />
        {steel}
      </mesh>
      <mesh position={[0, PC.roof - 0.2, centerZ - 0.3]} castShadow receiveShadow>
        <boxGeometry args={[WIDTH + 0.6, 0.4, depth + 1.4]} />
        {steel}
      </mesh>
      {world.feet.map((foot, i) => (
        <mesh key={i} position={foot.center} castShadow receiveShadow>
          <boxGeometry args={foot.size} />
          {steel}
        </mesh>
      ))}
      <mesh position={[0, PC.bottom + 0.02, PC.glassZ + 0.38]} material={rgb}>
        <boxGeometry args={[WIDTH + 0.6, 0.12, 0.12]} />
      </mesh>
      <mesh position={[0, PC.roof + 0.02, PC.glassZ + 0.38]} material={rgb}>
        <boxGeometry args={[WIDTH + 0.6, 0.1, 0.1]} />
      </mesh>
    </>
  )
}

/** Panel de cristal templado y sus cuatro separadores cromados. */
function Glass() {
  const glass = useMemo(() => createGlassMaterial([WIDTH, HEIGHT]), [])
  const length = PC.glassZ - PC.trayZ + 0.5
  const chrome = <meshStandardMaterial color="#cfd4de" roughness={0.12} metalness={1} />
  const corners: Array<[number, number]> = [
    [PC.left + 1, PC.bottom + 1],
    [PC.right - 1, PC.bottom + 1],
    [PC.left + 1, PC.top - 1],
    [PC.right - 1, PC.top - 1],
  ]
  return (
    <>
      <mesh position={[0, MID_Y, PC.glassZ]} material={glass} renderOrder={2}>
        <planeGeometry args={[WIDTH, HEIGHT]} />
      </mesh>
      {corners.map(([x, y], i) => (
        <group key={i} position={[x, y, PC.trayZ + length / 2]}>
          <mesh rotation-x={HALF_PI} castShadow>
            <cylinderGeometry args={[0.26, 0.26, length, 20]} />
            {chrome}
          </mesh>
          <mesh position-z={length / 2 + 0.05} rotation-x={HALF_PI}>
            <cylinderGeometry args={[0.46, 0.46, 0.22, 24]} />
            {chrome}
          </mesh>
        </group>
      ))}
    </>
  )
}

/** Radiador con tres ventiladores RGB en columna, a la derecha. */
function Radiator() {
  const { x, ys, radius } = PC.radiator
  return (
    <>
      <mesh position={[x, MID_Y, out(0.9)]} castShadow>
        <boxGeometry args={[radius * 2.3, HEIGHT - 1.4, 0.9]} />
        <meshStandardMaterial color="#101116" roughness={0.6} metalness={0.6} />
      </mesh>
      {ys.map((y, i) => (
        <Pop key={y} delay={1.2 + i * 0.25} position={[x, y, PC.trayZ + 1.25]}>
          <Fan radius={radius} phase={i * 0.33} speed={7 + i * 1.5} />
        </Pop>
      ))}
    </>
  )
}

/** Placa base con su bloque de CPU, memoria, disipadores y conectores. */
function Motherboard() {
  const { center, size } = PC.board
  const pcb = useMemo(() => createPcbTexture(size), [size])
  const core = useMemo(() => createCoreMaterial(), [])
  const ring = useMemo(() => createRgbMaterial(0.1, 0.5), [])
  const sticks = useMemo(() => PC.ram.map((_, i) => createRgbMaterial(i * 0.2, 0.55)), [])
  const shell = useRef<THREE.LineSegments>(null)
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.95, 1)), [])
  const [cx, cy] = PC.cpu

  useFrame(({ clock }) => {
    if (shell.current) shell.current.rotation.set(clock.elapsedTime * 0.3, clock.elapsedTime * 0.45, 0)
  })

  const alu = <meshStandardMaterial color="#2a2e39" roughness={0.3} metalness={0.9} />
  const dark = <meshStandardMaterial color="#14161b" roughness={0.4} metalness={0.7} />

  return (
    <>
      <mesh position={center} receiveShadow>
        <planeGeometry args={size} />
        <meshStandardMaterial map={pcb} roughness={0.55} metalness={0.35} />
      </mesh>

      {/* Bloque de agua de la CPU, con el núcleo de IA dentro */}
      <Pop delay={1.5} position={[cx, cy, PC.trayZ]}>
        <mesh position-z={0.2}>
          <boxGeometry args={[3.8, 3.8, 0.4]} />
          {dark}
        </mesh>
        <mesh position-z={0.75} rotation-x={HALF_PI} castShadow>
          <cylinderGeometry args={[1.55, 1.7, 0.9, 40]} />
          {alu}
        </mesh>
        <mesh position-z={1.22} material={ring}>
          <torusGeometry args={[1.3, 0.09, 10, 56]} />
        </mesh>
        <mesh position-z={1.5} material={core}>
          <sphereGeometry args={[0.72, 32, 24]} />
        </mesh>
        <lineSegments ref={shell} position-z={1.5} geometry={edges}>
          <lineBasicMaterial color={[0.7, 2, 3.6]} toneMapped={false} transparent opacity={0.9} />
        </lineSegments>
        {/* Racores donde entran los tubos */}
        {[-0.6, 0.6].map((dx) => (
          <mesh key={dx} position={[dx, 0.75, 1.3]} rotation-x={HALF_PI}>
            <cylinderGeometry args={[0.3, 0.3, 0.4, 16]} />
            <meshStandardMaterial color="#d9b25a" roughness={0.25} metalness={1} />
          </mesh>
        ))}
      </Pop>

      {/* Memoria: cuatro módulos con su filo de luz */}
      {PC.ram.map((x, i) => (
        <Pop key={x} delay={1.7 + i * 0.1} position={[x, cy, PC.trayZ]}>
          <mesh position-z={1.05} castShadow>
            <boxGeometry args={[0.24, 7, 2.1]} />
            {alu}
          </mesh>
          <mesh position-z={2.16} material={sticks[i]}>
            <boxGeometry args={[0.3, 7, 0.24]} />
          </mesh>
        </Pop>
      ))}

      {/* Disipadores de la alimentación, cubierta de puertos, chipset y conectores */}
      <mesh position={[cx - 3.1, cy + 0.2, out(1)]} castShadow>
        <boxGeometry args={[1.3, 4.8, 1]} />
        {alu}
      </mesh>
      <mesh position={[cx, cy + 3.7, out(1)]} castShadow>
        <boxGeometry args={[4.6, 1.2, 1]} />
        {alu}
      </mesh>
      <mesh position={[center[0] - size[0] / 2 + 1.3, cy + 1.4, out(1.7)]} castShadow>
        <boxGeometry args={[2.2, 7.6, 1.7]} />
        {dark}
      </mesh>
      <mesh position={[center[0] - size[0] / 2 + 2.42, cy + 1.4, out(1.7) + 0.5]} material={ring}>
        <boxGeometry args={[0.08, 7.2, 0.08]} />
      </mesh>
      <mesh position={[-3.4, 13.3, out(0.5)]}>
        <boxGeometry args={[3.2, 2.3, 0.5]} />
        {alu}
      </mesh>
      <Text
        font={fontBold}
        fontSize={0.9}
        position={[-3.4, 13.3, PC.trayZ + 0.52]}
        color={[0.5, 2.2, 3.2]}
        anchorX="center"
        anchorY="middle"
        material-toneMapped={false}
      >
        AI
      </Text>
      <mesh position={[center[0] + size[0] / 2 - 0.5, cy - 0.4, out(1)]}>
        <boxGeometry args={[0.7, 3, 1]} />
        {dark}
      </mesh>
      <mesh position={[-8.8, 13.1, out(0.35)]}>
        <boxGeometry args={[4.4, 0.95, 0.35]} />
        {alu}
      </mesh>
    </>
  )
}

/** Tarjeta gráfica en horizontal, con tres ventiladores hacia el cristal. */
function Gpu() {
  const { center, size } = PC.gpu
  const rgb = useMemo(() => createRgbMaterial(0.2, 0.35), [])
  const front = size[2] / 2
  return (
    <Pop delay={1.9} position={center}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#17191f" roughness={0.35} metalness={0.75} />
      </mesh>
      {/* Remates en azul claro en los extremos, como embellecedores */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (size[0] / 2 - 0.55), 0, front + 0.03]}>
          <boxGeometry args={[1.1, size[1] * 0.92, 0.12]} />
          <meshStandardMaterial color="#8fdcff" roughness={0.3} metalness={0.5} emissive="#2a9ed8" emissiveIntensity={0.5} />
        </mesh>
      ))}
      {[-3.9, 0, 3.9].map((x, i) => (
        <Fan key={x} radius={1.32} position={[x, 0, front + 0.22]} phase={i * 0.3 + 0.5} speed={12} blades={11} />
      ))}
      <mesh position={[0, size[1] / 2 + 0.03, front - 0.1]} material={rgb}>
        <boxGeometry args={[size[0] - 2.4, 0.1, 0.14]} />
      </mesh>
      {/* Cable elevador hasta la placa */}
      <mesh position={[-2.4, size[1] / 2 + 1.1, -front + 0.25]}>
        <boxGeometry args={[4.6, 2.3, 0.14]} />
        <meshStandardMaterial color="#0d0e12" roughness={0.7} />
      </mesh>
    </Pop>
  )
}

/** Fuente de alimentación con su ventilador RGB. */
function Psu() {
  const { center, size } = PC.psu
  return (
    <Pop delay={1.4} position={center}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#121318" roughness={0.45} metalness={0.7} />
      </mesh>
      <Fan radius={1.9} position={[-1.2, 0, size[2] / 2 + 0.36]} phase={0.6} speed={6} blades={7} />
      <Text
        font={fontBold}
        fontSize={0.5}
        position={[2.5, 0.45, size[2] / 2 + 0.01]}
        color="#d7dbe4"
        anchorX="center"
        material-toneMapped={false}
      >
        PSU
      </Text>
      <Text
        font={fontBold}
        fontSize={0.24}
        position={[2.5, -0.2, size[2] / 2 + 0.01]}
        color="#f0be00"
        anchorX="center"
        material-toneMapped={false}
      >
        850 W
      </Text>
    </Pop>
  )
}

/** Unidad SSD con su LED de actividad. */
function Ssd() {
  const { center, size } = PC.ssd
  const led = useMemo(() => createRackMaterial(40), [])
  return (
    <Pop delay={1.6} position={center}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#1b1d24" roughness={0.3} metalness={0.85} />
      </mesh>
      <mesh position={[0.6, -0.45, size[2] / 2 + 0.006]} material={led}>
        <planeGeometry args={[2.2, 0.4]} />
      </mesh>
      <Text
        font={fontBold}
        fontSize={0.42}
        position={[-1.6, 0.3, size[2] / 2 + 0.012]}
        color="#d7dbe4"
        anchorX="left"
        material-toneMapped={false}
      >
        SSD
      </Text>
    </Pop>
  )
}

const tube = (points: Array<[number, number, number]>, radius: number, tension: number, segments: number) =>
  new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', tension),
    segments,
    radius,
    10,
  )

/** Refrigeración líquida: depósito vertical, bomba y el circuito de tubos. */
function LiquidCooling() {
  const { x, z, bottom, top, radius } = PC.reservoir
  const coolant = useMemo(() => createCoolantMaterial(), [])
  const pipe = useMemo(() => createPipeMaterial(), [])
  const rgb = useMemo(() => createRgbMaterial(0.4, 0.4), [])
  const height = top - bottom
  const [cx, cy] = PC.cpu
  const rad = PC.radiator.x - PC.radiator.radius * 1.15 + 0.5

  // Tubo rígido doblado (tensión baja = codos casi rectos): el circuito va de
  // la CPU al depósito, de la bomba al radiador y del radiador a la CPU.
  const pipes = useMemo(
    () => [
      tube(
        [
          [cx + 0.6, cy + 0.75, PC.trayZ + 1.5],
          [cx + 0.6, cy + 0.75, z],
          [cx + 0.6, PC.top - 1.9, z],
          [x, PC.top - 1.9, z],
          [x, top + 0.2, z],
        ],
        0.24,
        0.06,
        150,
      ),
      tube(
        [
          [x + 0.9, bottom - 1, z],
          [rad, bottom - 1, z],
          [rad, bottom - 1, PC.trayZ + 0.9],
        ],
        0.24,
        0.06,
        60,
      ),
      tube(
        [
          [rad, PC.top - 1, PC.trayZ + 0.9],
          [rad, PC.top - 1, z + 0.9],
          [cx - 0.6, PC.top - 1, z + 0.9],
          [cx - 0.6, cy + 0.75, z + 0.9],
          [cx - 0.6, cy + 0.75, PC.trayZ + 1.5],
        ],
        0.24,
        0.06,
        170,
      ),
    ],
    [cx, cy, x, z, top, bottom, rad],
  )

  const steel = <meshStandardMaterial color="#17191f" roughness={0.3} metalness={0.9} />
  return (
    <>
      <Pop delay={2} position={[x, bottom, z]}>
        {/* Bomba, tapas, líquido y cristal */}
        <mesh position-y={-0.9} castShadow>
          <boxGeometry args={[2.9, 1.6, 2.9]} />
          {steel}
        </mesh>
        {[0.1, height - 0.1].map((y) => (
          <mesh key={y} position-y={y} castShadow>
            <cylinderGeometry args={[radius + 0.16, radius + 0.16, 0.5, 32]} />
            {steel}
          </mesh>
        ))}
        <mesh position-y={height / 2} material={coolant}>
          <cylinderGeometry args={[radius * 0.86, radius * 0.86, height - 0.6, 40, 1, true]} />
        </mesh>
        <mesh position-y={height / 2} renderOrder={1}>
          <cylinderGeometry args={[radius, radius, height - 0.6, 40, 1, true]} />
          <meshPhysicalMaterial
            color="#cfeaff"
            transparent
            opacity={0.16}
            roughness={0.05}
            metalness={0.2}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        {[0.42, height - 0.42].map((y) => (
          <mesh key={y} position-y={y} rotation-x={HALF_PI} material={rgb}>
            <torusGeometry args={[radius + 0.2, 0.07, 8, 48]} />
          </mesh>
        ))}
        {/* Abrazaderas a la bandeja */}
        {[height * 0.25, height * 0.75].map((y) => (
          <mesh key={y} position={[0, y, (PC.trayZ - z) / 2]}>
            <boxGeometry args={[0.6, 0.35, Math.abs(PC.trayZ - z)]} />
            {steel}
          </mesh>
        ))}
      </Pop>
      {pipes.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={pipe} castShadow />
      ))}
    </>
  )
}

/** Cables con funda amarilla: el mazo de la placa y la alimentación de la gráfica. */
function Cables() {
  const psu = PC.psu
  const gpu = PC.gpu
  const board = PC.board
  const geometries = useMemo(() => {
    const list: Array<{ geometry: THREE.TubeGeometry; color: string }> = []
    const right = psu.center[0] + psu.size[0] / 2
    const plug = board.center[0] + board.size[0] / 2 - 0.5
    for (let i = 0; i < 6; i++) {
      const o = i * 0.26
      list.push({
        color: i === 3 ? '#16171b' : '#f0be00',
        geometry: tube(
          [
            [right, 3.2 + o, psu.center[2] + 0.6],
            [0.2 + o * 0.5, 4.6 + o, PC.trayZ + 2.2],
            [0.9 + o * 0.4, 11.5, PC.trayZ + 1.8],
            [0.3, 16.6 + o * 1.6, PC.trayZ + 1.4],
            [plug, 17.4 + o * 1.5, PC.trayZ + 1],
          ],
          0.11,
          0.5,
          50,
        ),
      })
    }
    for (let i = 0; i < 3; i++) {
      const x = psu.center[0] + 0.4 + i * 0.3
      list.push({
        color: '#f0be00',
        geometry: tube(
          [
            [x, psu.center[1] + psu.size[1] / 2, psu.center[2] + 0.5],
            [x + 0.2, gpu.center[1] - gpu.size[1] / 2 - 0.5, psu.center[2] + 1.6],
            [x, gpu.center[1] - gpu.size[1] / 2, gpu.center[2] + 0.2],
          ],
          0.11,
          0.5,
          24,
        ),
      })
    }
    return list
  }, [psu, gpu, board])

  return (
    <>
      {geometries.map(({ geometry, color }, i) => (
        <mesh key={i} geometry={geometry} castShadow>
          <meshStandardMaterial color={color} roughness={0.75} emissive={color} emissiveIntensity={0.14} />
        </mesh>
      ))}
    </>
  )
}

/** La torre completa. */
export function Computer() {
  return (
    <>
      <Chassis />
      <Radiator />
      <Motherboard />
      <Gpu />
      <Psu />
      <Ssd />
      <LiquidCooling />
      <Cables />
      <Glass />
    </>
  )
}
