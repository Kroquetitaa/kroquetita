import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { world } from '../world/layout'
import { introProgress } from './intro'
import {
  createBubblesMaterial,
  createCaseMaterial,
  createCoreMaterial,
  createGlassMaterial,
  createRgbMaterial,
  createSpinMaterial,
  uAlarm,
} from './materials/shaders'

/**
 * La torre es un modelo 3D (public/models/pc.glb, optimizado con
 * scripts/optimize-model.mjs) expuesto en una vitrina: peana, fondo, tapa con
 * iluminación y cristal templado delante y en los dos laterales.
 */

const PC = world.pc
const MODEL_URL = '/models/pc.glb'
const WIDTH = PC.right - PC.left
const DEPTH = PC.glassZ - PC.backZ
const CENTER_Z = (PC.glassZ + PC.backZ) / 2
const GLASS_H = PC.glassTop - PC.plinth
const GLASS_Y = (PC.glassTop + PC.plinth) / 2

/** El equipo: el modelo, con sus materiales ajustados para que luzca. */
function Tower() {
  const { scene } = useGLTF(MODEL_URL)

  useLayoutEffect(() => {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const material = mesh.material as THREE.MeshStandardMaterial
      // La textura de color hace también de mapa de emisión: las zonas RGB
      // (ventiladores, memoria, depósito) brillan y lo oscuro sigue oscuro.
      material.emissiveMap = material.map
      material.emissive = new THREE.Color('#ffffff')
      material.emissiveIntensity = 0.55
      material.envMapIntensity = 1.5
      material.normalScale = new THREE.Vector2(1.3, 1.3)
      if (material.map) material.map.anisotropy = 8
      material.needsUpdate = true
    })
  }, [scene])

  return (
    <group position={PC.model.position} scale={PC.model.scale}>
      <primitive object={scene} />
    </group>
  )
}

/** Panel de cristal templado: lámina con grosor, canto verdoso y reflejos. */
function GlassPanel({
  size,
  ...props
}: { size: [number, number] } & React.ComponentProps<'group'>) {
  const sheen = useMemo(() => createGlassMaterial(size), [size])
  const [w, h] = size
  const edge = (
    <meshStandardMaterial
      color="#8fd9c4"
      emissive="#3fae96"
      emissiveIntensity={0.5}
      roughness={0.2}
      transparent
      opacity={0.7}
    />
  )
  return (
    <group {...props}>
      <mesh renderOrder={2}>
        <boxGeometry args={[w, h, 0.14]} />
        <meshPhysicalMaterial
          color="#dff5f0"
          transparent
          opacity={0.07}
          roughness={0.03}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.03}
          envMapIntensity={2.6}
          depthWrite={false}
        />
      </mesh>
      <mesh position-z={0.08} material={sheen} renderOrder={2}>
        <planeGeometry args={[w, h]} />
      </mesh>
      {/* Cantos: el cristal templado se ve verdoso de perfil */}
      {[-1, 1].map((side) => (
        <mesh key={`x${side}`} position={[(side * w) / 2, 0, 0]}>
          <boxGeometry args={[0.05, h, 0.16]} />
          {edge}
        </mesh>
      ))}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, 0.05, 0.16]} />
        {edge}
      </mesh>
    </group>
  )
}

/** La vitrina que rodea al equipo. */
function Showcase() {
  const hex = useMemo(() => createCaseMaterial([WIDTH, GLASS_H]), [])
  const rgb = useMemo(() => createRgbMaterial(0, 0.12), [])
  const steel = <meshStandardMaterial color="#0c0d11" roughness={0.42} metalness={0.85} />
  const outerW = WIDTH + 1
  const outerD = DEPTH + 1

  return (
    <>
      {/* Peana, con su filo de luz */}
      <mesh position={[0, PC.plinth / 2, CENTER_Z]} castShadow receiveShadow>
        <boxGeometry args={[outerW, PC.plinth, outerD]} />
        {steel}
      </mesh>
      <mesh position={[0, PC.plinth + 0.004, CENTER_Z]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[WIDTH - 0.3, DEPTH - 0.3]} />
        <meshStandardMaterial color="#15171c" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[0, PC.plinth - 0.06, PC.glassZ + 0.52]} material={rgb}>
        <boxGeometry args={[outerW, 0.1, 0.1]} />
      </mesh>

      {/* Fondo de chapa perforada */}
      <mesh position={[0, GLASS_Y, PC.backZ - 0.2]} castShadow>
        <boxGeometry args={[WIDTH, GLASS_H, 0.4]} />
        {steel}
      </mesh>
      <mesh position={[0, GLASS_Y, PC.backZ + 0.004]} material={hex}>
        <planeGeometry args={[WIDTH, GLASS_H]} />
      </mesh>

      {/* Tapa con el panel de luz que ilumina el equipo */}
      <mesh position={[0, PC.glassTop + 0.3, CENTER_Z]} castShadow>
        <boxGeometry args={[outerW, 0.6, outerD]} />
        {steel}
      </mesh>
      <mesh position={[0, PC.glassTop - 0.005, CENTER_Z + 1]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[PC.model.width + 2, DEPTH - 5]} />
        <meshBasicMaterial color={[1.5, 1.45, 1.35]} toneMapped={false} />
      </mesh>
      <mesh position={[0, PC.roof + 0.02, PC.glassZ + 0.52]} material={rgb}>
        <boxGeometry args={[outerW, 0.08, 0.08]} />
      </mesh>
      <pointLight position={[-6, PC.glassTop - 1.2, CENTER_Z + 2.5]} color="#fff3e2" intensity={260} distance={34} decay={2} />
      <pointLight position={[6, PC.glassTop - 1.2, CENTER_Z + 2.5]} color="#fff3e2" intensity={260} distance={34} decay={2} />
      {/* Relleno frontal, como la luz de la sala */}
      <pointLight position={[-4, 15, PC.glassZ + 11]} color="#dfe8ff" intensity={420} distance={50} decay={2} />

      {/* Montantes de las esquinas */}
      {(
        [
          [PC.left, PC.glassZ],
          [PC.right, PC.glassZ],
          [PC.left, PC.backZ],
          [PC.right, PC.backZ],
        ] as const
      ).map(([x, z], i) => (
        <mesh key={i} position={[x, GLASS_Y, z]} castShadow>
          <boxGeometry args={[0.36, GLASS_H, 0.36]} />
          <meshStandardMaterial color="#1a1c22" roughness={0.25} metalness={1} />
        </mesh>
      ))}

      {/* Cristal: delante y en los dos laterales */}
      <GlassPanel size={[WIDTH - 0.36, GLASS_H]} position={[0, GLASS_Y, PC.glassZ]} />
      <GlassPanel
        size={[DEPTH - 0.36, GLASS_H]}
        position={[PC.left, GLASS_Y, CENTER_Z]}
        rotation-y={-Math.PI / 2}
      />
      <GlassPanel
        size={[DEPTH - 0.36, GLASS_H]}
        position={[PC.right, GLASS_Y, CENTER_Z]}
        rotation-y={Math.PI / 2}
      />
    </>
  )
}

/**
 * Lo que da vida al modelo, que es una malla estática con todo pintado en la
 * textura: el giro de los ventiladores y su aro RGB, las burbujas del
 * depósito, un núcleo de IA sobre la CPU y la luz de color que baña el interior.
 */
function Effects() {
  const fx = PC.fx
  const fans = useMemo(() => fx.fans.map((_, i) => createSpinMaterial(i * 0.33, 9, 13 + i * 2)), [fx])
  const gpuFans = useMemo(() => fx.gpuFans.map((_, i) => createSpinMaterial(0.5 + i * 0.2, 11, 19)), [fx])
  const psuFan = useMemo(() => createSpinMaterial(0.7, 7, 9), [])
  const bubbles = useMemo(() => createBubblesMaterial(), [])
  const core = useMemo(() => createCoreMaterial(), [])
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.62, 1)), [])

  const root = useRef<THREE.Group>(null)
  const shell = useRef<THREE.LineSegments>(null)
  const glow = useRef<THREE.PointLight>(null)
  const spot = useRef<THREE.SpotLight>(null)

  useLayoutEffect(() => {
    // El foco de la tapa apunta al centro del equipo.
    const light = spot.current
    if (!light) return
    light.target.position.set(0, PC.plinth + PC.model.height * 0.4, PC.model.position[2])
    light.target.updateMatrixWorld()
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // Los efectos aparecen cuando la escena ya se ha descubierto.
    if (root.current) root.current.visible = introProgress(0.6, 0.4) > 0.5
    if (shell.current) shell.current.rotation.set(t * 0.4, t * 0.6, 0)
    if (glow.current) {
      // La luz de los ventiladores recorre el arcoíris; en alarma, rojo.
      glow.current.color.setHSL((t * 0.07) % 1, 0.9, 0.55)
      if (uAlarm.value > 0.5) glow.current.color.set('#ff1408')
    }
  })

  return (
    <group ref={root}>
      {fx.fans.map((position, i) => (
        <mesh key={i} position={position} material={fans[i]}>
          <planeGeometry args={[fx.fanRadius * 2.15, fx.fanRadius * 2.15]} />
        </mesh>
      ))}
      {fx.gpuFans.map((position, i) => (
        <mesh key={i} position={position} material={gpuFans[i]}>
          <planeGeometry args={[fx.gpuFanRadius * 2.1, fx.gpuFanRadius * 2.1]} />
        </mesh>
      ))}
      <mesh position={fx.psuFan} material={psuFan}>
        <planeGeometry args={[fx.psuFanRadius * 2.1, fx.psuFanRadius * 2.1]} />
      </mesh>

      <mesh position={fx.reservoir.center} material={bubbles}>
        <cylinderGeometry args={[fx.reservoir.radius, fx.reservoir.radius, fx.reservoir.height, 32, 1, true]} />
      </mesh>

      {/* Núcleo de IA: flota delante del bloque de la CPU */}
      <group position={fx.cpu}>
        <mesh material={core}>
          <sphereGeometry args={[0.46, 28, 20]} />
        </mesh>
        <lineSegments ref={shell} geometry={edges}>
          <lineBasicMaterial color={[0.7, 2, 3.6]} toneMapped={false} transparent opacity={0.9} />
        </lineSegments>
      </group>

      <pointLight
        ref={glow}
        position={[fx.fans[1][0] - 1.5, fx.fans[1][1], fx.fans[1][2] + 3]}
        intensity={150}
        distance={24}
        decay={2}
      />
      <spotLight
        ref={spot}
        position={[0, PC.glassTop - 0.8, PC.glassZ - 1.2]}
        color="#fff6ea"
        intensity={1100}
        distance={46}
        angle={1.05}
        penumbra={0.9}
        decay={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0008}
        shadow-normalBias={0.06}
      />
    </group>
  )
}

export function Computer() {
  return (
    <>
      <Showcase />
      <Tower />
      <Effects />
    </>
  )
}

useGLTF.preload(MODEL_URL)
