import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import font from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import { body } from '../game/state'
import { isWorldClick } from '../game/worldClick'
import { FACTORY_DURATION, useCityLife } from '../game/cityLife'
import { useGame } from '../store'
import { useLang } from '../i18n'
import { areaOf } from '../world/zones'
import { cityStations } from '../world/cityKit'
import { CityModel } from './CityModel'
import { Deferred, Zone } from './Zone'
import { Detail } from './Detail'
import { atmosphere } from './atmosphere'

export function CityStationProximity() {
  useFrame(() => {
    const game = useGame.getState()
    if (game.place !== 'city' || game.mode !== 'play') return
    const near = cityStations.find(s => Math.abs(body.pos[1] - s.position[1]) < .7 && Math.hypot(body.pos[0] - s.position[0], body.pos[2] - s.position[2]) < 1.15)
    if (near) game.setStation(near.id)
    else if (game.station && game.station !== 'train') game.setStation(null)
  })
  return null
}

function Station({ station }: { station: (typeof cityStations)[number] }) {
  const lang = useLang()
  const ring = useRef<THREE.Mesh>(null)
  const active = useGame(s => s.station === station.id)
  useFrame(({ clock }) => {
    if (ring.current && !atmosphere.reducedMotion) ring.current.rotation.z = clock.elapsedTime * 0.16
  })
  return <group position={station.position} onClick={e => {
    if (!isWorldClick(e)) return
    e.stopPropagation()
    const game = useGame.getState()
    if (game.ready) game.useStation(station.id)
  }}>
    <mesh ref={ring} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[.65, .70, 40, 1, 0, Math.PI * 1.75]} />
      <meshBasicMaterial color={station.color} toneMapped={false} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2}>
      <circleGeometry args={[.65, 24]} />
      <meshBasicMaterial color={station.color} transparent opacity={active ? 0.26 : 0.08} depthWrite={false} />
    </mesh>
    <Text font={font} fontSize={0.18} position={[0, 0.42, 0]} color={station.color} outlineColor="#080d22" outlineWidth={0.025}>{station.label[lang]}</Text>

  </group>
}

/** Tokens pulse along the workshop frontage; only one GPU draw call. */
function FactorySignals() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ clock }) => {
    if (!mesh.current) return
    const run = useCityLife.getState().factoryStarted
    const t = atmosphere.reducedMotion ? 0 : clock.elapsedTime
    for (let i = 0; i < 20; i++) {
      const u = ((t * (run ? 0.22 : 0.04) + i / 20) % 1)
      const station = cityStations.find(s => s.id === 'factory')!
      dummy.position.set(station.position[0] - 5 + u * 10, .10 + Math.sin(u * Math.PI) * .08, station.position[2] + .5)
      dummy.scale.setScalar(run ? 0.11 + Math.sin(u * Math.PI) * 0.06 : 0.07)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[undefined, undefined, 20]} frustumCulled={false}>
    <boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color={[2.6, 1.1, 0.2]} toneMapped={false} />
  </instancedMesh>
}

function HangarSignals() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }) => {
    if (!mesh.current || useGame.getState().place !== 'city') return
    const t = atmosphere.reducedMotion ? 0.5 : clock.elapsedTime
    const after = useCityLife.getState().demoAfter
    for (let i = 0; i < 24; i++) {
      const demo = Math.floor(i / 8)
      const lane = after[demo] ? i % (demo === 1 ? 4 : 3) : 1
      const u = (t * (after[demo] ? 0.28 : 0.09) + i / 8) % 1
      const station = cityStations.find(s => s.id === `hangar-${demo}`)!
      dummy.position.set(station.position[0] + (lane - 1.2) * .4, 1.4 + Math.sin(u * Math.PI) * .2, station.position[2] - .9 - u * 2)
      dummy.scale.setScalar(0.065)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
      mesh.current.setColorAt(i, color.set(after[demo] ? '#83f2c4' : ['#72caff', '#ffaf78', '#d6ef95'][demo]).multiplyScalar(1.8))
    }
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[undefined, undefined, 24]} frustumCulled={false}>
    <octahedronGeometry args={[1]} /><meshBasicMaterial toneMapped={false} />
  </instancedMesh>
}

export function CityDistricts() {
  useFrame(() => {
    const life = useCityLife.getState()
    if (life.factoryStarted && performance.now() - life.factoryStarted >= FACTORY_DURATION) life.finishFactory()
  })
  return <>
    <Deferred order={0}><Zone area={areaOf('factory')}><CityModel name="factory" /><FactorySignals /></Zone></Deferred>
    <Deferred order={1}><Zone area={areaOf('hangar')}><CityModel name="hangar" /><Detail><HangarSignals /></Detail></Zone></Deferred>
    <Detail>{cityStations.map(station => <Station key={station.id} station={station} />)}</Detail>
  </>
}
