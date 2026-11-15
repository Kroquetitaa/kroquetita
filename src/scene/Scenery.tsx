import { CityModel } from './CityModel'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { body } from '../game/state'
import { useGame } from '../store'
import { cityAirNavigation } from '../game/cityNavigation'
import { safeAirPoint, stepAirFlight, type AirPoint } from '../game/airNavigation'
import { atmosphere } from './atmosphere'
import { introProgress } from './intro'

const LOOPS = [
  { x0: -27, x1: 27, z0: -9.5, z1: 17.5, speed: 11, dir: 1, color: [0.2, 2.4, 3.8] },
  { x0: -29.5, x1: 29.5, z0: -11.5, z1: 18.2, speed: 9, dir: -1, color: [3.8, 1.1, 0.25] },
]
const TRAIL = 26

/** Corredores de luz: dan vueltas a los bloques por el suelo dejando una estela. */
function Racers() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const scratch = useMemo(() => ({ m: new THREE.Matrix4() }), [])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const color = new THREE.Color()
    LOOPS.forEach((loop, i) => {
      for (let j = 0; j < TRAIL; j++) {
        // La estela se apaga hacia atrás.
        const fade = Math.pow(1 - j / TRAIL, 2)
        color.setRGB(loop.color[0] * fade, loop.color[1] * fade, loop.color[2] * fade)
        mesh.setColorAt(i * TRAIL + j, color)
      }
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    const appear = introProgress(3, 1.5)
    LOOPS.forEach((loop, i) => {
      const w = loop.x1 - loop.x0
      const h = loop.z1 - loop.z0
      const perimeter = 2 * (w + h)
      const head = (((loop.dir * t * loop.speed) % perimeter) + perimeter) % perimeter
      for (let j = 0; j < TRAIL; j++) {
        let d = (head - loop.dir * j * 0.55) % perimeter
        if (d < 0) d += perimeter
        // Rectángulo: borde delantero, lateral derecho, trasero, lateral izquierdo.
        let x: number
        let z: number
        let alongX = true
        if (d < w) {
          x = loop.x0 + d
          z = loop.z1
        } else if (d < w + h) {
          x = loop.x1
          z = loop.z1 - (d - w)
          alongX = false
        } else if (d < 2 * w + h) {
          x = loop.x1 - (d - w - h)
          z = loop.z0
        } else {
          x = loop.x0
          z = loop.z0 + (d - 2 * w - h)
          alongX = false
        }
        const thick = (j === 0 ? 0.34 : 0.13 * (1 - j / TRAIL) + 0.02) * appear
        const long = (j === 0 ? 0.9 : 0.58) * appear
        const tall = (j === 0 ? 0.24 : 0.07) * appear
        scratch.m.makeScale(alongX ? long : thick, tall, alongX ? thick : long)
        mesh.setMatrixAt(i * TRAIL + j, scratch.m.setPosition(x, 0.07 + tall / 2, z))
      }
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, LOOPS.length * TRAIL]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

/** Dron mascota: sigue al jugador a su aire, flotando junto a su hombro. */
export function PetDrone() {
  const group = useRef<THREE.Group>(null)
  const rotors = useRef<Array<THREE.Mesh | null>>([])
  const led = useRef<THREE.MeshBasicMaterial>(null)
  const target = useMemo(() => new THREE.Vector3(), [])
  const flight = useRef({ started: false, player: [...body.pos] as AirPoint, appear: 0 })
  const airspace = cityAirNavigation

  useFrame(({ clock }, delta) => {
    const g = group.current
    if (!g || useGame.getState().place !== 'city') return
    const t = clock.elapsedTime, dt = Math.min(delta, .05), still = atmosphere.reducedMotion
    target.set(
      body.pos[0] - .85 + (still ? 0 : Math.sin(t * .9) * .25),
      body.pos[1] + 1.7 + (still ? 0 : Math.sin(t * 2.3) * .12),
      body.pos[2] - .25 + (still ? 0 : Math.cos(t * .7) * .25),
    )
    const f = flight.current
    const travelled = Math.hypot(...body.pos.map((v, i) => v - f.player[i]))
    if (!f.started || travelled > 8) {
      g.position.set(...safeAirPoint(airspace, target.toArray() as AirPoint))
      f.started = true; f.appear = 0
    }
    f.player = [...body.pos]
    const before = g.position.x
    const wanted = Math.min(9 * dt, g.position.distanceTo(target) * (1 - Math.exp(-3.2 * dt)))
    g.position.set(...stepAirFlight(airspace, g.position.toArray() as AirPoint, target.toArray() as AirPoint, wanted))
    f.appear = Math.min(1, f.appear + dt * 4)
    g.rotation.set(0, Math.atan2(body.pos[0] - g.position.x, body.pos[2] - g.position.z), still ? 0 : (before - g.position.x) * 6)
    g.scale.setScalar(Math.max(.001, introProgress(3.6, 1) * .6 * f.appear))
    if (!still) rotors.current.forEach((rotor, i) => { if (rotor) rotor.rotation.y = t * 38 * (i % 2 ? 1 : -1) })
    if (led.current) led.current.color.setRGB(still ? .8 : Math.sin(t * 6) > .4 ? 4 : .3, .2, .2)

  })

  return (
    <group ref={group}>
<CityModel name="drone" fallback={<>

      <mesh castShadow>
        <boxGeometry args={[0.5, 0.16, 0.5]} />
        <meshStandardMaterial color="#1c1e26" roughness={0.4} metalness={0.8} />
      </mesh>
      <mesh position={[0, -0.02, 0.26]}>
        <boxGeometry args={[0.22, 0.08, 0.04]} />
        <meshBasicMaterial color={[0.4, 2.6, 3.6]} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.1, -0.2]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshBasicMaterial ref={led} toneMapped={false} />
      </mesh>
      {(
        [
          [-0.33, 0.33],
          [0.33, 0.33],
          [-0.33, -0.33],
          [0.33, -0.33],
        ] as const
      ).map(([x, z], i) => (
        <group key={i} position={[x, 0.1, z]}>
          <mesh>
            <cylinderGeometry args={[0.03, 0.03, 0.08, 8]} />
            <meshStandardMaterial color="#2a2d38" roughness={0.5} metalness={0.6} />
          </mesh>
          <mesh
            position-y={0.05}
            ref={(mesh) => {
              rotors.current[i] = mesh
            }}
          >
            <boxGeometry args={[0.36, 0.012, 0.04]} />
            <meshBasicMaterial color={[0.5, 1.8, 2.6]} toneMapped={false} transparent opacity={0.7} />
          </mesh>
        </group>
      ))}

</>} />
    </group>
  )
}

/** Lo que se mueve por el suelo alrededor de los bloques. */
export function Scenery() {
  return (
    <>
      <Racers />
      <PetDrone />
    </>
  )
}
