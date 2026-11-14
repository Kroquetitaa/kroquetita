import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import { world } from '../world/layout'
import { introProgress } from './intro'
import {
  createCaseMaterial,
  createCoolantMaterial,
  createPipeMaterial,
  createRackMaterial,
  createRgbMaterial,
  uParty,
} from './materials/shaders'

const PC = world.pc
const HALF_PI = Math.PI / 2

/** Envuelve una pieza para que aparezca creciendo durante la entrada. */
function Pop({ delay, children, ...props }: { delay: number; children: React.ReactNode } & React.ComponentProps<'group'>) {
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

/** Ventilador con aro RGB. Gira sobre su eje Z local. */
function Fan({
  radius,
  speed = 9,
  phase = 0,
  blades = 9,
  ...props
}: { radius: number; speed?: number; phase?: number; blades?: number } & React.ComponentProps<'group'>) {
  const spin = useRef<THREE.Group>(null)
  const rgb = useMemo(() => createRgbMaterial(phase, 0.3), [phase])

  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.z -= delta * speed * (1 + uParty.value * 2)
  })

  return (
    <group {...props}>
      {/* Marco y aros de luz */}
      <mesh position-z={-0.12} rotation-x={HALF_PI}>
        <cylinderGeometry args={[radius * 1.04, radius * 1.04, 0.14, 48]} />
        <meshStandardMaterial color="#0b0c10" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh material={rgb}>
        <torusGeometry args={[radius, radius * 0.065, 10, 72]} />
      </mesh>
      <mesh material={rgb} position-z={0.12}>
        <torusGeometry args={[radius * 0.3, radius * 0.03, 8, 40]} />
      </mesh>
      {/* Aspas y buje */}
      <group ref={spin}>
        {Array.from({ length: blades }, (_, i) => (
          <group key={i} rotation-z={(i / blades) * Math.PI * 2}>
            <mesh position={[radius * 0.6, 0, 0.04]} rotation={[0.55, 0, 0.3]}>
              <boxGeometry args={[radius * 0.68, radius * 0.3, 0.03]} />
              <meshStandardMaterial
                color="#2b3040"
                roughness={0.35}
                metalness={0.3}
                emissive="#16263d"
                emissiveIntensity={0.9}
                transparent
                opacity={0.88}
              />
            </mesh>
          </group>
        ))}
        <mesh position-z={0.1} rotation-x={HALF_PI}>
          <cylinderGeometry args={[radius * 0.24, radius * 0.24, 0.22, 24]} />
          <meshStandardMaterial color="#14161c" roughness={0.3} metalness={0.8} />
        </mesh>
      </group>
    </group>
  )
}

/** La caja: tres paredes de chapa perforada y una tira RGB en el zócalo. */
function Case() {
  const { minX, maxX, minZ, maxZ, height } = PC.walls
  const width = maxX - minX
  const depth = maxZ - minZ
  const back = useMemo(() => createCaseMaterial([width, height]), [width, height])
  const side = useMemo(() => createCaseMaterial([depth, height]), [depth, height])
  const rgb = useMemo(() => createRgbMaterial(0, 0.12), [])
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2

  return (
    <>
      <mesh position={[cx, height / 2, minZ]} material={back}>
        <planeGeometry args={[width, height]} />
      </mesh>
      <mesh position={[minX, height / 2, cz]} rotation-y={HALF_PI} material={side}>
        <planeGeometry args={[depth, height]} />
      </mesh>
      <mesh position={[maxX, height / 2, cz]} rotation-y={-HALF_PI} material={side}>
        <planeGeometry args={[depth, height]} />
      </mesh>
      {/* Zócalo luminoso */}
      <mesh position={[cx, 0.08, minZ + 0.1]} material={rgb}>
        <boxGeometry args={[width, 0.14, 0.14]} />
      </mesh>
      <mesh position={[minX + 0.1, 0.08, cz]} rotation-y={HALF_PI} material={rgb}>
        <boxGeometry args={[depth, 0.14, 0.14]} />
      </mesh>
      <mesh position={[maxX - 0.1, 0.08, cz]} rotation-y={HALF_PI} material={rgb}>
        <boxGeometry args={[depth, 0.14, 0.14]} />
      </mesh>
    </>
  )
}

/** Radiador de la refrigeración líquida: tres ventiladores en la pared del fondo. */
function Radiator() {
  const { xs, y, radius } = PC.radiator
  const z = PC.walls.minZ
  const span = xs[xs.length - 1] - xs[0] + radius * 2 + 1
  return (
    <Pop delay={1.6} position={[(xs[0] + xs[xs.length - 1]) / 2, y, z + 0.3]}>
      <mesh>
        <boxGeometry args={[span, radius * 2 + 1, 0.5]} />
        <meshStandardMaterial color="#0d0e12" roughness={0.6} metalness={0.5} />
      </mesh>
      {xs.map((x, i) => (
        <Fan
          key={x}
          radius={radius}
          position={[x - (xs[0] + xs[xs.length - 1]) / 2, 0, 0.45]}
          phase={i * 0.33}
          speed={7 + i}
        />
      ))}
    </Pop>
  )
}

/** Tarjeta gráfica: de canto, con tres ventiladores y su tira de luz. */
function Gpu() {
  const { center, size } = PC.gpu
  const rgb = useMemo(() => createRgbMaterial(0.2, 0.35), [])
  return (
    <Pop delay={1.9} position={center}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#14161b" roughness={0.35} metalness={0.7} />
      </mesh>
      {[-5.8, 0, 5.8].map((x, i) => (
        <Fan key={x} radius={1.45} position={[x, 0.1, size[2] / 2 + 0.14]} phase={i * 0.3 + 0.5} speed={12} blades={11} />
      ))}
      <mesh position={[0, size[1] / 2 + 0.02, size[2] / 2 - 0.05]} material={rgb}>
        <boxGeometry args={[size[0], 0.12, 0.12]} />
      </mesh>
      <Text
        font={fontBold}
        fontSize={0.42}
        position={[2.9, 1.2, size[2] / 2 + 0.01]}
        color={[0.5, 2.2, 3]}
        anchorX="center"
        material-toneMapped={false}
      >
        GPU
      </Text>
      {/* Contactos dorados de la ranura */}
      <mesh position={[0, -size[1] / 2 + 0.06, 0]}>
        <boxGeometry args={[size[0] * 0.7, 0.12, size[2] + 0.5]} />
        <meshStandardMaterial color="#d9b25a" roughness={0.3} metalness={1} />
      </mesh>
    </Pop>
  )
}

/** Módulos de RAM con disipador y luz superior, cada uno con su fase de color. */
function Ram() {
  const lights = useMemo(() => PC.ram.map((_, i) => createRgbMaterial(i * 0.18, 0.5)), [])
  return (
    <>
      {PC.ram.map((stick, i) => (
        <Pop key={i} delay={2.1 + i * 0.12} position={[stick.center[0], 0, stick.center[2]]}>
          <mesh position-y={stick.size[1] / 2} castShadow receiveShadow>
            <boxGeometry args={stick.size} />
            <meshStandardMaterial color="#1a1d24" roughness={0.3} metalness={0.85} />
          </mesh>
          <mesh position-y={stick.size[1] + 0.06} material={lights[i]}>
            <boxGeometry args={[stick.size[0] + 0.05, 0.2, stick.size[2]]} />
          </mesh>
        </Pop>
      ))}
    </>
  )
}

/** Cable con funda: un tubo que sigue una curva suave entre varios puntos. */
function Cable({ points, color, radius = 0.1 }: { points: Array<[number, number, number]>; color: string; radius?: number }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
    return new THREE.TubeGeometry(curve, 40, radius, 7)
  }, [points, radius])
  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color={color} roughness={0.75} emissive={color} emissiveIntensity={0.12} />
    </mesh>
  )
}

/** Fuente de alimentación con su ventilador y el mazo de cables amarillos. */
function Psu() {
  const { center, size } = PC.psu
  const right = center[0] + size[0] / 2
  const boardEdge = world.board.minX + 0.3

  const cables = useMemo(() => {
    const list: Array<{ points: Array<[number, number, number]>; color: string }> = []
    // Mazo de 24 pines: de la fuente al borde izquierdo de la placa.
    for (let i = 0; i < 6; i++) {
      const z = -6.9 + i * 0.34
      list.push({
        color: i === 2 ? '#15161a' : '#f0be00',
        points: [
          [right, 1.3 + (i % 3) * 0.5, center[2] + 1.2 + i * 0.2],
          [right + 1.8, 3 + (i % 2) * 0.4, -13],
          [boardEdge - 1, 2.4, -9],
          [boardEdge, 0.7, z],
        ],
      })
    }
    // Alimentación de la gráfica: por encima, hasta su canto superior.
    const gpu = PC.gpu
    for (let i = 0; i < 2; i++) {
      list.push({
        color: '#f0be00',
        points: [
          [center[0] + 1 + i * 0.5, size[1], center[2] + 0.4],
          [center[0] + 5, 6.4 + i * 0.3, center[2]],
          [gpu.center[0] - 10.5, 6 + i * 0.3, gpu.center[2]],
          [gpu.center[0] - 7.5 + i * 0.5, gpu.size[1], gpu.center[2]],
        ],
      })
    }
    return list
  }, [center, size, right, boardEdge])

  return (
    <Pop delay={1.7}>
      <group position={center}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={size} />
          <meshStandardMaterial color="#121318" roughness={0.45} metalness={0.7} />
        </mesh>
        <Fan radius={1.5} position={[-1.8, 0, size[2] / 2 + 0.14]} phase={0.6} speed={6} blades={7} />
        <Text
          font={fontBold}
          fontSize={0.4}
          position={[2.3, 0.4, size[2] / 2 + 0.01]}
          color="#d7dbe4"
          anchorX="center"
          material-toneMapped={false}
        >
          PSU
        </Text>
        <Text
          font={fontBold}
          fontSize={0.2}
          position={[2.3, -0.1, size[2] / 2 + 0.01]}
          color="#f0be00"
          anchorX="center"
          material-toneMapped={false}
        >
          850 W
        </Text>
      </group>
      {cables.map((cable, i) => (
        <Cable key={i} {...cable} />
      ))}
      {/* Conector de 24 pines en el borde de la placa */}
      <mesh position={[boardEdge + 0.1, 0.4, -6.05]}>
        <boxGeometry args={[0.6, 0.8, 2.3]} />
        <meshStandardMaterial color="#1a1c22" roughness={0.6} />
      </mesh>
    </Pop>
  )
}

/** Jaula de discos: tres unidades apiladas con su LED de actividad. */
function Drives() {
  const { center, size } = PC.drives
  const leds = useMemo(() => [0, 1, 2].map((i) => createRackMaterial(40 + i * 9.7)), [])
  const slab = size[1] / 3
  return (
    <Pop delay={2} position={[center[0], 0, center[2]]}>
      {[0, 1, 2].map((i) => (
        <group key={i} position-y={slab * (i + 0.5)}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[size[0], slab - 0.1, size[2]]} />
            <meshStandardMaterial color="#1b1d24" roughness={0.3} metalness={0.85} />
          </mesh>
          <mesh position={[size[0] / 2 - 0.9, 0, size[2] / 2 + 0.006]} material={leds[i]}>
            <planeGeometry args={[1.4, 0.26]} />
          </mesh>
        </group>
      ))}
      <Text
        font={fontBold}
        fontSize={0.26}
        position={[-size[0] / 2 + 0.3, size[1] - 0.36, size[2] / 2 + 0.012]}
        color="#d7dbe4"
        anchorX="left"
        material-toneMapped={false}
      >
        SSD
      </Text>
    </Pop>
  )
}

/** Refrigeración líquida: depósito con el líquido girando y dos tubos hasta la CPU. */
function LiquidCooling() {
  const { position, radius, height } = PC.reservoir
  const [x, z] = position
  const coolant = useMemo(() => createCoolantMaterial(), [])
  const pipe = useMemo(() => createPipeMaterial(), [])
  const rgb = useMemo(() => createRgbMaterial(0.4, 0.4), [])
  const cpu = world.chips[world.chips.length - 1]
  const cpuBack = cpu.center[2] - cpu.size[2] / 2 - 0.25

  const pipes = useMemo(() => {
    const make = (points: Array<[number, number, number]>) =>
      new THREE.TubeGeometry(
        // Tensión baja: codos casi rectos, como tubo rígido doblado.
        new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.08),
        140,
        0.2,
        10,
      )
    const lane = z
    return [
      make([
        [x - radius, 2.2, lane],
        [cpu.center[0] + 1.4, 2.2, lane],
        [cpu.center[0] + 1.4, 2.2, cpuBack - 0.4],
        [cpu.center[0] + 1.4, 1.5, cpuBack],
      ]),
      make([
        [x - radius, 5.5, lane],
        [cpu.center[0] - 1.4, 5.5, lane],
        [cpu.center[0] - 1.4, 5.5, cpuBack - 0.4],
        [cpu.center[0] - 1.4, 3.4, cpuBack],
      ]),
    ]
  }, [x, z, radius, cpu, cpuBack])

  return (
    <Pop delay={2.3}>
      <group position={[x, 0, z]}>
        {/* Tapas, líquido y cristal */}
        {[0.25, height - 0.25].map((y) => (
          <mesh key={y} position-y={y} castShadow>
            <cylinderGeometry args={[radius + 0.18, radius + 0.18, 0.5, 32]} />
            <meshStandardMaterial color="#17191f" roughness={0.3} metalness={0.9} />
          </mesh>
        ))}
        <mesh position-y={height / 2} material={coolant}>
          <cylinderGeometry args={[radius * 0.86, radius * 0.86, height - 1, 40, 1, true]} />
        </mesh>
        <mesh position-y={height / 2}>
          <cylinderGeometry args={[radius, radius, height - 1, 40, 1, true]} />
          <meshPhysicalMaterial
            color="#bfe6ff"
            transparent
            opacity={0.14}
            roughness={0.05}
            metalness={0.2}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position-y={0.55} rotation-x={HALF_PI} material={rgb}>
          <torusGeometry args={[radius + 0.22, 0.07, 8, 48]} />
        </mesh>
        <mesh position-y={height - 0.55} rotation-x={HALF_PI} material={rgb}>
          <torusGeometry args={[radius + 0.22, 0.07, 8, 48]} />
        </mesh>
      </group>
      {pipes.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={pipe} castShadow />
      ))}
    </Pop>
  )
}

/** Condensadores: cilindros con tapa metálica, instanciados. */
function Capacitors() {
  const bodies = useRef<THREE.InstancedMesh>(null)
  const caps = useRef<THREE.InstancedMesh>(null)
  const count = PC.capacitors.length

  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4()
    PC.capacitors.forEach(([x, z, h], i) => {
      bodies.current?.setMatrixAt(i, matrix.makeScale(1, h, 1).setPosition(x, h / 2, z))
      caps.current?.setMatrixAt(i, matrix.makeScale(1, 1, 1).setPosition(x, h + 0.02, z))
    })
    if (bodies.current) bodies.current.instanceMatrix.needsUpdate = true
    if (caps.current) caps.current.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <Pop delay={2.5}>
      <instancedMesh ref={bodies} args={[undefined, undefined, count]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.36, 0.36, 1, 20]} />
        <meshStandardMaterial color="#182a52" roughness={0.4} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, count]} frustumCulled={false}>
        <cylinderGeometry args={[0.33, 0.33, 0.04, 20]} />
        <meshStandardMaterial color="#c9ced8" roughness={0.25} metalness={1} />
      </instancedMesh>
    </Pop>
  )
}

/** El interior del ordenador que rodea la placa base. */
export function Computer() {
  return (
    <>
      <Case />
      <Radiator />
      <Gpu />
      <Ram />
      <Psu />
      <Drives />
      <LiquidCooling />
      <Capacitors />
    </>
  )
}
