import { Suspense, useLayoutEffect, useMemo, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { atmosphere } from './atmosphere'
import { AssetBoundary } from './CityModel'

type Joints = Record<string, { current: unknown }>
type ActorMaterials = Record<string, THREE.Material>
function Actor({ name, joints, materials }: { name: string; joints?: Joints; materials?: ActorMaterials }) {
  const gltf = useGLTF(`/models/city/${name === 'avatar' ? name : `cast/${name}`}.glb`)
  const object = useMemo(() => {
    const clone = gltf.scene.clone(true)
    clone.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow=true; o.receiveShadow=true } })
    return clone
  }, [gltf.scene])
  useLayoutEffect(() => {
    const entries = Object.entries(joints ?? {})
    for (const [name, ref] of entries) ref.current = object.getObjectByName(name) ?? null
    return () => { for (const [, ref] of entries) ref.current = null }
  }, [object, joints])
  useLayoutEffect(() => {
    const previous: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
    for (const [nodeName, material] of Object.entries(materials ?? {})) {
      const mesh = object.getObjectByName(nodeName)
      if (!(mesh instanceof THREE.Mesh)) continue
      previous.push([mesh, mesh.material])
      mesh.material = material
    }
    return () => { for (const [mesh, material] of previous) mesh.material = material }
  }, [object, materials])
  const limbs = useMemo(() => object.getObjectByName('Legs'), [object])
  useFrame(({ clock }) => {
    if ((name === 'boss' || name === 'bug') && limbs && !atmosphere.reducedMotion) limbs.rotation.y = Math.sin(clock.elapsedTime*16)*.1
  })
  return <primitive object={object} dispose={null} />
}

/** Bind the Blender joints to the original controller: dialogue, flight, chases and collisions survive. */
export function BlenderActor({ name, joints, materials, fallback }: { name: string; joints?: Joints; materials?: ActorMaterials; fallback?: ReactNode }) {
  return <AssetBoundary fallback={fallback}><Suspense fallback={fallback ?? null}><Actor name={name} joints={joints} materials={materials} /></Suspense></AssetBoundary>
}
