import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard, OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import font from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import { brain, neighborsOf, nodeOf } from '../data/brain'
import { useCityLife } from '../game/cityLife'
import { isWorldClick } from '../game/worldClick'
import { useLang } from '../i18n'
import { CityModel } from './CityModel'
import { atmosphere } from './atmosphere'

const COLORS = { skill: '#77d4ff', stage: '#ffb66e', concept: '#c6a5ff', demo: '#b5ec84', study: '#ffd88e' }
const points = brain.nodes.map(n => new THREE.Vector3(n.position[0] * 0.17, n.position[1] * 0.17 + 9, n.position[2] * 0.17))

export function BrainRoom() {
  const camera = useThree(s => s.camera)
  const lang = useLang()
  const selected = useCityLife(s => s.brainSelected)
  const group = useRef<THREE.Group>(null)
  const nodes = useRef<THREE.InstancedMesh>(null)
  const node = selected ? nodeOf(selected) : null
  const index = node ? brain.nodes.indexOf(node) : -1
  const linked = useMemo(() => new Set(selected ? [selected, ...neighborsOf(selected).map(n => n.id)] : []), [selected])
  const geometry = useMemo(() => {
    const positions: number[] = []
    const colors: number[] = []
    const color = new THREE.Color()
    for (const edge of brain.edges) {
      const active = selected === brain.nodes[edge.a].id || selected === brain.nodes[edge.b].id
      color.set(active ? '#d5b5ff' : '#344568')
      for (const i of [edge.a, edge.b]) { positions.push(...points[i].toArray()); colors.push(color.r, color.g, color.b) }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    return g
  }, [selected])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera
    const oldFov = perspective.fov
    perspective.fov = 45
    perspective.position.set(0, 16, 38)
    perspective.lookAt(0, 6, 0)
    perspective.updateProjectionMatrix()
    return () => { perspective.fov = oldFov; perspective.updateProjectionMatrix() }
  }, [camera])
  useEffect(() => {
    if (!nodes.current) return
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    brain.nodes.forEach((n, i) => {
      dummy.position.copy(points[i])
      dummy.scale.setScalar((n.id === selected ? 0.3 : n.kind === 'skill' ? 0.17 : 0.23) * (linked.has(n.id) ? 1.25 : 1))
      dummy.updateMatrix()
      nodes.current!.setMatrixAt(i, dummy.matrix)
      color.set(COLORS[n.kind]).multiplyScalar(!selected || linked.has(n.id) ? 1.5 : 0.3)
      nodes.current!.setColorAt(i, color)
    })
    nodes.current.instanceMatrix.needsUpdate = true
    if (nodes.current.instanceColor) nodes.current.instanceColor.needsUpdate = true
  }, [selected, linked])
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = atmosphere.reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.065) * 0.1
  })
  return <>
    <CityModel name="brain_inside" position={[0, -0.9, 0]} scale={3} />
    <OrbitControls makeDefault target={[0, 6, 0]} enablePan={false} minDistance={18} maxDistance={55} minPolarAngle={0.2} maxPolarAngle={Math.PI * 0.49} />
    <group ref={group}>
      <lineSegments geometry={geometry}><lineBasicMaterial vertexColors transparent opacity={0.6} toneMapped={false} /></lineSegments>
      <instancedMesh ref={nodes} args={[undefined, undefined, brain.nodes.length]} frustumCulled={false} onClick={e => {
        if (!isWorldClick(e)) return
        e.stopPropagation()
        if (e.instanceId !== undefined) useCityLife.getState().selectNeuron(brain.nodes[e.instanceId].id)
      }}>
        <icosahedronGeometry args={[1, 1]} /><meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {node && index >= 0 && <Billboard position={points[index].clone().add(new THREE.Vector3(0, 0.65, 0))}>
        <Text font={font} fontSize={0.38} color="#ffffff" outlineColor="#080d22" outlineWidth={0.04}>{node.label[lang]}</Text>
      </Billboard>}
    </group>
  </>
}
