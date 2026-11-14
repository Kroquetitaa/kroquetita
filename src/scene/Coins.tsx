import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { profile } from '../data/career'
import { celebrationTime, useGame } from '../store'
import { world, type Coin as CoinData } from '../world/layout'
import { introProgress } from './intro'
import {
  createBurstGeometry,
  createBurstMaterial,
  createCoinTexture,
  createGlowMaterial,
  createSparkleMaterial,
  uTime,
} from './materials/shaders'
import { loadImage } from './voxelize'

const GOLD = '#ffc933'
const RADIUS = 0.34
const THICKNESS = 0.07

const SPARKLES: Array<[number, number, number, number]> = [
  [0.42, 0.3, 0.1, 0.22],
  [-0.46, -0.12, 0.12, 0.16],
  [0.2, -0.44, 0.08, 0.14],
  [-0.26, 0.46, 0.1, 0.12],
]

interface Shared {
  face: THREE.Texture
  glow: THREE.Material
  sparkle: THREE.Material
}

/** La moneda en sí: canto, rebordes y las dos caras acuñadas. */
function CoinMesh({ shared }: { shared: Shared }) {
  const faceMaterial = (
    <meshStandardMaterial
      map={shared.face}
      emissiveMap={shared.face}
      emissive="#ffffff"
      emissiveIntensity={0.55}
      metalness={0.6}
      roughness={0.3}
    />
  )
  const goldMaterial = (
    <meshStandardMaterial
      color={GOLD}
      metalness={1}
      roughness={0.22}
      emissive={GOLD}
      emissiveIntensity={0.5}
    />
  )

  return (
    <>
        {/* Canto */}
        <mesh rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[RADIUS, RADIUS, THICKNESS, 48, 1, true]} />
          {goldMaterial}
        </mesh>
        {/* Rebordes en relieve */}
        {[1, -1].map((side) => (
          <mesh key={side} position-z={(side * THICKNESS) / 2}>
            <torusGeometry args={[RADIUS - 0.022, 0.024, 10, 48]} />
            {goldMaterial}
          </mesh>
        ))}
        {/* Caras con la imagen acuñada */}
        <mesh position-z={THICKNESS / 2 + 0.001}>
          <circleGeometry args={[RADIUS - 0.03, 48]} />
          {faceMaterial}
        </mesh>
        <mesh position-z={-THICKNESS / 2 - 0.001} rotation-y={Math.PI}>
          <circleGeometry args={[RADIUS - 0.03, 48]} />
          {faceMaterial}
        </mesh>
    </>
  )
}

function Coin({ coin, shared }: { coin: CoinData; shared: Shared }) {
  const group = useRef<THREE.Group>(null)
  const disc = useRef<THREE.Group>(null)
  const collected = useGame((s) => s.collected.includes(coin.id))
  const scale = useRef(1)

  useFrame((state, dt) => {
    const g = group.current
    if (!g || !disc.current) return
    const target = collected ? 0 : 1
    scale.current += (target - scale.current) * (1 - Math.exp(-10 * dt))
    // Las monedas aparecen cuando los bloques ya han emergido.
    const size = scale.current * introProgress(2 + coin.id * 0.07, 0.6)
    g.visible = size > 0.02
    if (!g.visible) return
    const t = state.clock.elapsedTime
    g.scale.setScalar(size)
    // Al recogerla sube y gira rápido antes de desaparecer.
    g.position.y = coin.position[1] + Math.sin(t * 2 + coin.id) * 0.1 + (1 - scale.current) * 0.9
    disc.current.rotation.y = t * 2.2 + coin.id + (1 - scale.current) * 12
    disc.current.rotation.z = Math.sin(t * 1.3 + coin.id) * 0.12
  })

  return (
    <group ref={group} position={coin.position}>
      <group ref={disc}>
        <CoinMesh shared={shared} />
      </group>
      <mesh material={shared.glow}>
        <planeGeometry args={[1.8, 1.8]} />
      </mesh>
      {SPARKLES.map(([x, y, z, size], i) => (
        <mesh key={i} position={[x, y, z]} material={shared.sparkle}>
          <planeGeometry args={[size, size]} />
        </mesh>
      ))}
    </group>
  )
}

/** Chispas que saltan en el punto donde se recoge una moneda. */
function Burst({ count = 28 }: { count?: number }) {
  const material = useMemo(() => createBurstMaterial(GOLD, { speed: 0.75 }), [])
  const geometry = useMemo(() => createBurstGeometry(count), [count])

  useEffect(
    () =>
      useGame.subscribe((state, previous) => {
        if (state.collected.length <= previous.collected.length) return
        const id = state.collected[state.collected.length - 1]
        const coin = world.coins.find((c) => c.id === id)
        if (!coin) return
        material.uniforms.uOrigin.value.set(...coin.position)
        material.uniforms.uStart.value = uTime.value
      }),
    [material],
  )

  useFrame(({ gl, size }) => {
    material.uniforms.uPixelRatio.value = gl.getPixelRatio() * (size.height / 900) * 13
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

/** Premio final: una moneda gigante que aparece girando sobre la cima. */
function Trophy({ shared }: { shared: Shared }) {
  const group = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const [tx, ty, tz] = world.trophy

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const t = celebrationTime()
    g.visible = t >= 0
    if (!g.visible) return
    // Entrada elástica: se pasa un poco de tamaño y rebota.
    const k = Math.min(1, t / 1.4)
    const pop = 1 - Math.pow(1 - k, 3) * Math.cos(k * Math.PI * 2.5)
    const clock = state.clock.elapsedTime
    g.scale.setScalar(pop * 3.2)
    g.position.y = ty + Math.sin(clock * 1.4) * 0.3
    g.rotation.y = clock * 1.5 + (1 - k) * 9
    if (light.current) light.current.intensity = pop * 260
  })

  return (
    <group ref={group} position={[tx, ty, tz]} visible={false}>
      <CoinMesh shared={shared} />
      <mesh material={shared.glow} scale={1.4}>
        <planeGeometry args={[1.8, 1.8]} />
      </mesh>
      <pointLight ref={light} color={GOLD} intensity={0} distance={40} decay={2} />
    </group>
  )
}

export function Coins() {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    let alive = true
    loadImage(profile.coinImage).then((result) => {
      if (alive && result !== 'error') setImage(result)
    })
    return () => {
      alive = false
    }
  }, [])

  const shared = useMemo<Shared>(
    () => ({
      face: createCoinTexture(image),
      glow: createGlowMaterial(GOLD, 0.45),
      sparkle: createSparkleMaterial('#fff2c0'),
    }),
    [image],
  )

  useEffect(
    () => () => {
      shared.face.dispose()
      shared.glow.dispose()
      shared.sparkle.dispose()
    },
    [shared],
  )

  return (
    <>
      {world.coins.map((coin) => (
        <Coin key={coin.id} coin={coin} shared={shared} />
      ))}
      <Burst />
      <Trophy shared={shared} />
    </>
  )
}
