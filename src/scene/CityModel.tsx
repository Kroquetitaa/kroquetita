import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useCityLife } from '../game/cityLife'
import { atmosphere } from './atmosphere'
import { useGame, type Smashable } from '../store'
import { bookLanding } from '../world/bookLanding'
import { lab } from '../world/lab'
import { warp } from '../game/state'
import { isWorldClick } from '../game/worldClick'

type Props = { name: string; position?: [number, number, number]; scale?: number; rotation?: [number, number, number]; fallback?: ReactNode }

export class AssetBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.warn('City asset could not be loaded', error) }
  render() { return this.state.failed ? this.props.fallback ?? null : this.props.children }
}

function Model({ name }: { name: string }) {
  const gltf = useGLTF(`/models/city/${name}.glb`)
  const object = useMemo(() => {
    const copy = gltf.scene.clone(true)
    copy.traverse(o => {
      if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true }
    })
    return copy
  }, [gltf.scene])
  const mixer = useMemo(() => new THREE.AnimationMixer(object), [object])
  const levers = useMemo(() => ['load', 'agents', 'data'].map(id => object.getObjectByName(`Lever_${id}`)), [object])
  const rigs = useMemo(() => ['Left', 'Right', 'Croquette'].map(id => {
    const node = object.getObjectByName(`Rig_${id}`)
    return node ? { node, y: node.position.y } : null
  }), [object])
  const pending = useRef(0)
  const books = useMemo(() => Array.from({ length: 8 }, (_, i) => object.getObjectByName(`Hook_Library_Cover_${String(i + 1).padStart(2, '0')}`)), [object])
  const breakables = useMemo(() => {
    const list: { node: THREE.Object3D; scale: THREE.Vector3; y: number }[] = []
    object.traverse(node => { if (/^Breakable_/.test(node.name)) list.push({ node, scale: node.scale.clone(), y: node.position.y }) })
    return list
  }, [object])
  useEffect(() => {
    if (name !== 'hangar') gltf.animations.forEach(clip => mixer.clipAction(clip).play())
    return () => { mixer.stopAllAction(); mixer.uncacheRoot(object) }
  }, [mixer, object, name, gltf.animations])
  useFrame(({ clock }, dt) => {
    for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) return
    if (atmosphere.reducedMotion) {
      if (name === 'hangar') levers.forEach((lever, i) => { if (lever) lever.rotation.x = useCityLife.getState().demoAfter[i] ? -0.65 : 0.65 })
      const game = useGame.getState()
      books.forEach((book, i) => { if (book) book.rotation.z = game.study === i ? -.7 : 0 })
      breakables.forEach(({ node, scale, y }) => {
        node.scale.copy(scale)
        node.position.y = y
        node.rotation.set(0, 0, 0)
      })
      return
    }
    pending.current += Math.min(dt, 0.1)
    if (atmosphere.low && pending.current < 1 / 30) return
    const delta = pending.current
    pending.current = 0
    const life = useCityLife.getState()
    const game = useGame.getState()
    books.forEach((book, i) => { if (book) book.rotation.z = THREE.MathUtils.damp(book.rotation.z, game.study === i ? -0.7 : 0, 5, delta) })
    breakables.forEach(({ node, scale, y }) => {
      const id = node.name.slice(10) as Smashable
      const at = life.impacts[id]
      const age = at === undefined ? 10 : (performance.now()-at)/1000
      const hit = age < 2.2
      const bounce = age < 1 ? Math.sin(age*Math.PI) : 0
      node.scale.y = THREE.MathUtils.damp(node.scale.y, scale.y * (hit && id !== 'dice' && id !== 'pinata' ? .22 : 1), 8, delta)
      node.scale.x = scale.x * (1 + bounce * .12)
      node.position.y = y + bounce * (id === 'dice' ? 1.6 : .35)
      node.rotation.z = THREE.MathUtils.damp(node.rotation.z, hit ? id === 'table' ? 1.1 : .15 : 0, 7, delta)
      if(id === 'dice') node.rotation.x = hit ? age*Math.PI*2 : 0
      if(id === 'pinata') node.rotation.z = Math.sin(age*9)*Math.exp(-age*2)*.8
    })
    mixer.update(delta * (name === 'factory' ? life.factoryStarted ? 1.8 : 0.3 : 1))
    if (name === 'hangar') levers.forEach((lever, i) => {
      if (lever) lever.rotation.x = THREE.MathUtils.damp(lever.rotation.x, life.demoAfter[i] ? -0.65 : 0.65, 8, delta)
    })
    if (name === 'factory') {
      const t = clock.elapsedTime
      rigs.forEach((rig, i) => {
        if (!rig) return
        if (i < 2) rig.node.rotation.y = Math.sin(t * (life.factoryStarted ? 2.5 : 0.65) + i * Math.PI) * 0.22
        else {
          rig.node.position.y = rig.y + Math.sin(t * 2) * 0.035
          rig.node.rotation.z = Math.sin(t * 1.6) * (life.factoryStarted ? 0.12 : 0.025)
        }
      })
    }
  })
  return <primitive object={object} dispose={null} onClick={(e: ThreeEvent<MouseEvent>) => {
    if (!isWorldClick(e)) return
    const game = useGame.getState()
    for (let node: THREE.Object3D | null = e.object; node; node = node.parent) {
      if (/^Career_Stage_/.test(node.name)) {
        e.stopPropagation(); const index = Number(node.name.slice(13, 15)) - 1
        if (game.mode === 'intro') game.tour()
        game.setStage(index, true); return
      }
      if (/^Library_Book_/.test(node.name)) {
        e.stopPropagation(); const index = Number(node.name.slice(-2)) - 1
        game.play(); warp(...bookLanding(index)); game.setStudy(index); return
      }
      if (/^ExhibitRoot_/.test(node.name)) {
        e.stopPropagation(); const exhibit = lab.exhibits.find(x => x.id === node!.name.slice(12))
        if (exhibit) { game.play(); warp(exhibit.pad.center[0],0,exhibit.pad.center[2]) }; return
      }
      if (/^Breakable_/.test(node.name)) { e.stopPropagation(); useCityLife.getState().hitExhibit(node.name.slice(10) as Smashable); return }
      if (node.name === 'Rig_Core') { e.stopPropagation(); game.enterBrain(); return }
    }
  }} />
}

/** Local suspense prevents one late model from blanking the playable city. */
export function CityModel({ name, position, scale, rotation, fallback }: Props) {
  return <group position={position} scale={scale} rotation={rotation}>
    <AssetBoundary fallback={fallback}><Suspense fallback={fallback ?? null}><Model name={name} /></Suspense></AssetBoundary>
  </group>
}
