import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { world } from '../world/layout'
import { companyLogoPosition } from '../world/branding'
import { atmosphere } from './atmosphere'
import { useGame } from '../store'

/** Incoming knowledge stays legible: thin paths, small packets, one instanced draw. */
export function CoreSignals() {
  const packets = useRef<THREE.InstancedMesh>(null)
  const scratch = useMemo(() => ({ dummy: new THREE.Object3D(), point: new THREE.Vector3(), color: new THREE.Color() }), [])
  const paths = useMemo(() => {
    const sources = world.blocks.map((block, i) => ({ position: companyLogoPosition(i), color: block.stage.color }))
    sources.push({ position: [-17, 1.8, -7], color: '#ffb872' }, { position: [0, 2.2, 12], color: '#65e4e0' }, { position: [17, 2.7, 9], color: '#c3a5ff' })
    return sources.map(({ position, color }, i) => {
      const start = new THREE.Vector3(...position)
      const end = new THREE.Vector3(world.core[0] + (i % 2 ? .48 : -.48), world.core[1] - .8, world.core[2])
      const middle = start.clone().lerp(end, .5)
      middle.y = Math.max(start.y, end.y) + (i < 11 ? .5 : 2.4)
      const curve = new THREE.QuadraticBezierCurve3(start, middle, end)
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40))
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .14, depthWrite: false }))
      return { curve, line, color }
    })
  }, [])
  useFrame(({ clock }) => {
    const mesh = packets.current
    if (!mesh) return
    const time = atmosphere.reducedMotion ? 0 : clock.elapsedTime
    const selected = useGame.getState().stage
    paths.forEach(({ curve, color }, i) => {
      for (let j = 0; j < 3; j++) {
        const u = (time * .13 + j / 3 + i * .137) % 1
        curve.getPoint(u, scratch.point)
        scratch.dummy.position.copy(scratch.point)
        scratch.dummy.rotation.set(u * 4, u * 3, 0)
        scratch.dummy.scale.setScalar((i === selected ? .055 : .035) * Math.sin(u * Math.PI))
        scratch.dummy.updateMatrix()
        mesh.setMatrixAt(i * 3 + j, scratch.dummy.matrix)
        mesh.setColorAt(i * 3 + j, scratch.color.set(color).multiplyScalar(1.8))
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <>
    {paths.map(({ line }, i) => <primitive key={i} object={line} />)}
    <instancedMesh ref={packets} args={[undefined, undefined, paths.length * 3]} frustumCulled={false}>
      <octahedronGeometry /><meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  </>
}
