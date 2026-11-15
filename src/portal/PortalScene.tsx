import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Html, Lightformer, MeshReflectorMaterial, Text, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import { COFFEE_POINT, CORE_POINT, PORTAL_ACTORS, portalActorPose, type Point, type PortalSide, type SceneEdge } from './portalStory'
import { portalGatePoint } from './portalGeometry'

export type PortalSceneProps = {
  side: PortalSide
  time: number
  connected: boolean
  edge: SceneEdge
  anchor: number
  reducedMotion: boolean
  stretch?: number
  onReady?: () => void
  onError?: (error: unknown) => void
}
type SceneState = { time: number; gate: Point }
const paths = ['/models/portal/outpost.glb', ...PORTAL_ACTORS.map(name => `/models/city/cast/${name}.glb`)]
const clamp = (v: number, low = 0, high = 1) => Math.max(low, Math.min(high, v))

class SceneBoundary extends Component<{ children: ReactNode; onError?: (error: unknown) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { this.props.onError?.(error) }
  render() {
    return this.state.failed ? this.props.onError ? null : <Html center><div style={{ width: 240, padding: 20, borderRadius: 18, background: '#251d3e', color: '#fff', textAlign: 'center' }}>El portal necesita recargarse.<br />Vuelve a abrir el experimento.</div></Html> : this.props.children
  }
}

/** Drop rejected GLTF promises before mounting a fresh canvas on user retry. */
export function clearPortalSceneAssets() { useGLTF.clear(paths) }

/** An isolated canvas per pane. No city stores, controllers or world assets. */
export function PortalScene(props: PortalSceneProps) {
  return <Canvas orthographic shadows dpr={[1, 1.4]}
    camera={{ position: [0, 37.28, 71.12], zoom: 70, near: .1, far: 240 }}
    gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
    aria-label={props.side === 'day' ? 'Diorama del portal de día' : 'Diorama del portal de noche'}
    onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.15 }}>
    <SceneBoundary onError={props.onError}><Stage {...props} /></SceneBoundary>
  </Canvas>
}

function Stage(props: PortalSceneProps) {
  const { side, time, connected, edge, anchor, reducedMotion } = props
  const state = useRef<SceneState>({ time, gate: { x: 6.4, y: .65, z: 0 } })
  const sample = useRef({ time, at: performance.now() })
  useLayoutEffect(() => { sample.current = { time, at: performance.now() } }, [time])
  useFrame(() => {
    const extra = connected || sample.current.time < 4 ? Math.min(.12, (performance.now() - sample.current.at) / 1000) : 0
    state.current.time = clamp(sample.current.time + extra, 0, !connected && sample.current.time < 4 ? 4 : 32)
  }, -2)
  const night = side === 'night'
  return <>
    <color attach="background" args={[night ? '#14172e' : '#f1d9ce']} />
    <fog attach="fog" args={[night ? '#14172e' : '#f1d9ce', 180, 230]} />
    <CameraLayout edge={edge} anchor={anchor} state={state} />
    <ambientLight intensity={night ? .65 : .85} color={night ? '#afb9ff' : '#fff1e5'} />
    <hemisphereLight intensity={night ? 1.1 : 1.4} color={night ? '#98baff' : '#fff2db'} groundColor="#614269" />
    <directionalLight position={[-4, 7, 5]} intensity={night ? 1.5 : 3.4} color={night ? '#b7ceff' : '#ffe4bd'} castShadow
      shadow-mapSize={[1024, 1024]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={5} shadow-camera-bottom={-5}
      shadow-normalBias={.025} shadow-bias={-.00008} shadow-radius={4} />
    <directionalLight position={[4, 4, -3]} intensity={night ? 2.2 : 1.35} color={night ? '#d7a0ff' : '#c8ccff'} />
    <Environment frames={1} resolution={128}>
      <Lightformer form="rect" intensity={3.5} position={[0, 6, 5]} scale={[10, 4, 1]} />
      <Lightformer form="rect" color="#b2bcff" intensity={4} position={[5, 3, 0]} scale={[3, 7, 1]} rotation-y={-Math.PI / 2} />
      <Lightformer form="ring" color={night ? '#c997ff' : '#ffc181'} intensity={2} position={[-4, 3, -4]} scale={4} />
    </Environment>
    <Backdrop night={night} />
    <mesh rotation-x={-Math.PI / 2} position={[0, -.34, 0]} receiveShadow>
      <planeGeometry args={[50, 50]} /><meshStandardMaterial color={night ? '#24283e' : '#b9a4b7'} roughness={.78} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, -.325, 2.35]}>
      <planeGeometry args={[10.2, 1.1]} />
      <MeshReflectorMaterial resolution={256} blur={[48, 24]} mixBlur={.55} mixStrength={night ? 3 : 1.8} mirror={.3}
        roughness={.28} depthScale={.5} minDepthThreshold={.3} maxDepthThreshold={1.2} metalness={.3} color={night ? '#464d77' : '#c0a7bf'} />
    </mesh>
    <Suspense fallback={<WaitingIsland />}>
      <Contents {...props} state={state} />
    </Suspense>
    <Iris side={side} connected={connected} reducedMotion={reducedMotion} state={state} edge={edge} stretch={props.stretch ?? 0} />
    <PortalDust night={night} reducedMotion={reducedMotion} state={state} />
  </>
}

function CameraLayout({ edge, anchor, state }: { edge: SceneEdge; anchor: number; state: React.RefObject<SceneState> }) {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.zoom = Math.min(size.width / 12.6, size.height / 6.8)
    cam.position.set(0, 5.15, 10).normalize().multiplyScalar(80).add(new THREE.Vector3(0, .65, 0))
    cam.lookAt(0, .65, 0); cam.updateProjectionMatrix(); cam.updateMatrixWorld()
    const point = portalGatePoint(cam, edge, anchor)
    state.current.gate = { x: point.x, y: point.y, z: point.z }
  }, [camera, size.width, size.height, edge, anchor, state])
  return null
}

function WaitingIsland() {
  return <mesh position-y={-.17}><boxGeometry args={[10, .28, 3.4]} /><meshStandardMaterial color="#665b83" roughness={.5} /></mesh>
}

function Backdrop({ night }: { night: boolean }) {
  return <group>
    <mesh position={[-3.9, 3.3, -4.5]}>
      <sphereGeometry args={[night ? .46 : .65, 32, 20]} /><meshBasicMaterial color={night ? '#f9ecce' : '#ffb56e'} />
    </mesh>
    {night && <mesh position={[-3.66, 3.46, -4.31]}><sphereGeometry args={[.43, 24, 18]} /><meshBasicMaterial color="#14172e" /></mesh>}
    {Array.from({ length: night ? 22 : 7 }, (_, i) => <mesh key={i} position={[-5.5 + ((i * 1.73) % 11), 2.3 + ((i * .91) % 2.4), -4.2 - (i % 3)]}>
      <sphereGeometry args={[night ? .018 + (i % 3) * .009 : .12, 6, 5]} /><meshBasicMaterial color={night ? '#dfdcff' : '#f7e6e6'} transparent opacity={night ? .7 : .6} />
    </mesh>)}
  </group>
}

function Contents(props: PortalSceneProps & { state: React.RefObject<SceneState> }) {
  const assets = useGLTF(paths)
  const onReady = useRef(props.onReady); onReady.current = props.onReady
  useEffect(() => { onReady.current?.() }, [])
  return <>
    <Outpost scene={assets[0].scene} state={props.state} side={props.side} reducedMotion={props.reducedMotion} />
    {PORTAL_ACTORS.map((name, index) => <Performer key={name} scene={assets[index + 1].scene} index={index} {...props} />)}
    <StolenNeuron {...props} />
    <StoryBubbles {...props} />
  </>
}

function cloneScene(scene: THREE.Group) {
  const clone = scene.clone(true)
  clone.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true } })
  return clone
}

function Outpost({ scene, state, side, reducedMotion }: { scene: THREE.Group; state: React.RefObject<SceneState>; side: PortalSide; reducedMotion: boolean }) {
  const object = useMemo(() => cloneScene(scene), [scene])
  const parts = useMemo(() => ({ neuron: object.getObjectByName('Portal_Neuron'), lid: object.getObjectByName('CoffeeLid'), brain: object.getObjectByName('Core_Brain') }), [object])
  const lidRest = useMemo(() => parts.lid?.rotation.x ?? 0, [parts])
  useFrame(() => {
    const t = state.current.time
    if (parts.neuron) parts.neuron.visible = false // the transferable light is one coherent story object
    if (parts.lid) parts.lid.rotation.x = lidRest - (side === 'day' && t > 29.7 && t < 31.1 ? Math.sin(clamp((t - 29.7) / 1.4) * Math.PI) * 1.2 : 0)
    if (parts.brain) parts.brain.rotation.y = reducedMotion ? 0 : Math.sin(t * 1.4) * .035
  })
  return <primitive object={object} dispose={null} />
}

function Performer({ scene, index, side, edge, reducedMotion, state }: PortalSceneProps & { scene: THREE.Group; index: number; state: React.RefObject<SceneState> }) {
  const root = useRef<THREE.Group>(null)
  const model = useMemo(() => cloneScene(scene), [scene])
  const parts = useMemo(() => Object.fromEntries(['Head', 'Body', 'Arm_L', 'Arm_R', 'Leg_L', 'Leg_R', 'Wing_L', 'Wing_R', 'Foot_L', 'Foot_R', 'Eyes'].map(name => [name, model.getObjectByName(name)])), [model])
  useFrame(() => {
    if (!root.current) return
    const t = state.current.time
    const pose = portalActorPose(side, t, index, state.current.gate, edge, reducedMotion)
    root.current.visible = pose.visible
    if (!pose.visible) return
    const phase = t * (index ? 12 : 17) - index * 1.2
    const gait = reducedMotion ? 0 : Math.sin(phase) * pose.walk
    root.current.position.set(pose.x, pose.y + (reducedMotion ? 0 : Math.abs(gait) * .035), pose.z)
    root.current.rotation.set(0, pose.yaw, reducedMotion ? 0 : gait * (index ? .025 : .09))
    root.current.scale.set(1 + pose.stretch * .2, 1 - pose.stretch * .16, 1)
    if (parts.Leg_L) parts.Leg_L.rotation.x = gait * .72
    if (parts.Leg_R) parts.Leg_R.rotation.x = -gait * .72
    if (parts.Foot_L) parts.Foot_L.rotation.x = gait * .8
    if (parts.Foot_R) parts.Foot_R.rotation.x = -gait * .8
    const wave = reducedMotion ? 0 : Math.sin(t * 8 + index) * .15
    if (parts.Arm_L) parts.Arm_L.rotation.x = -gait * .55 - pose.cheer * (1.7 + wave)
    if (parts.Arm_R) parts.Arm_R.rotation.x = gait * .55 - pose.cheer * (1.7 - wave)
    if (parts.Wing_L) parts.Wing_L.rotation.z = -.18 - Math.abs(gait) * .6 - pose.cheer * .3
    if (parts.Wing_R) parts.Wing_R.rotation.z = .18 + Math.abs(gait) * .6 + pose.cheer * .3
    if (parts.Head) parts.Head.rotation.z = reducedMotion ? 0 : Math.sin(t * 2 + index) * .035 + pose.cheer * Math.sin(t * 3 + index) * .08
    if (parts.Eyes) parts.Eyes.scale.y = (t + index * .63) % 3.2 < .12 ? .12 : 1
  })
  return <group ref={root}><primitive object={model} dispose={null} /></group>
}

function StolenNeuron({ side, edge, reducedMotion, state }: PortalSceneProps & { state: React.RefObject<SceneState> }) {
  const root = useRef<THREE.Group>(null)
  const gem = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (!root.current) return
    const t = state.current.time, duck = portalActorPose(side, t, 0, state.current.gate, edge, reducedMotion)
    const carrying = t >= 2.05 && t < 30.55
    root.current.visible = t < 2.05 ? side === 'day' : carrying ? duck.visible : side === 'day'
    if (t < 2.05) root.current.position.set(CORE_POINT.x, CORE_POINT.y, CORE_POINT.z)
    else if (carrying) {
      root.current.position.set(duck.x + Math.sin(duck.yaw) * .39, duck.y + .43, duck.z + Math.cos(duck.yaw) * .39)
      if (t < 2.2) root.current.position.lerp(new THREE.Vector3(CORE_POINT.x, CORE_POINT.y, CORE_POINT.z), 1 - clamp((t - 2.05) / .15))
      if (t > 30.05) root.current.position.lerp(new THREE.Vector3(COFFEE_POINT.x, COFFEE_POINT.y, COFFEE_POINT.z), clamp((t - 30.05) / .5))
    }
    else root.current.position.set(COFFEE_POINT.x, COFFEE_POINT.y - .12, COFFEE_POINT.z)
    root.current.scale.setScalar(t > 30.55 ? Math.max(.08, 1 - (t - 30.55) * 2) : 1)
    if (gem) gem.current?.rotation.set(t * .4, reducedMotion ? .3 : t * 1.3, .2)
    if (halo.current) halo.current.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(t * 4) * .08)
  })
  return <group ref={root}>
    <mesh ref={gem}><icosahedronGeometry args={[.14, 1]} /><meshStandardMaterial color="#ffe6a3" emissive="#ffba51" emissiveIntensity={2.5} metalness={.4} roughness={.17} toneMapped={false} /></mesh>
    <mesh ref={halo}><sphereGeometry args={[.23, 16, 12]} /><meshBasicMaterial color="#ffd385" transparent opacity={.15} depthWrite={false} /></mesh>
    <pointLight color="#ffc36b" intensity={2.6} distance={2.4} decay={2} />
  </group>
}

function StoryBubbles({ side, state, edge, reducedMotion }: PortalSceneProps & { state: React.RefObject<SceneState> }) {
  const root = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!root.current) return
    const t = state.current.time
    const show = side === 'day' ? t > 1.6 && t < 3.25 || t > 30.5 : t > 14.4 && t < 17
    const pose = portalActorPose(side, t, 0, state.current.gate, edge, reducedMotion)
    root.current.visible = show && pose.visible
    root.current.position.set(pose.x, pose.y + .95, pose.z)
  })
  return <group ref={root}><Text font={fontBold} fontSize={.17} color={side === 'day' ? '#7b487a' : '#f4d9ff'} outlineWidth={.01} outlineColor={side === 'day' ? '#fff3e4' : '#282346'} anchorX="center">¡CUAC!</Text></group>
}

function Iris({ side, connected, reducedMotion, state, edge, stretch }: { side: PortalSide; connected: boolean; reducedMotion: boolean; state: React.RefObject<SceneState>; edge: SceneEdge; stretch: number }) {
  const root = useRef<THREE.Group>(null), ring = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uColor: { value: new THREE.Color(side === 'day' ? '#9b75ff' : '#ffb881') } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float uTime;uniform float uOpen;uniform vec3 uColor;
      void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float a=atan(p.y,p.x);float bands=sin(r*25.-a*3.-uTime*2.5)*.5+.5;
      float edge=smoothstep(1.,.64,r);float mist=pow(1.-min(r,1.),2.)*.4+bands*.22;
      gl_FragColor=vec4(uColor*(.6+bands*.8),edge*(.14+mist)*(.3+uOpen*.7));}`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }), [side])
  useEffect(() => () => material.dispose(), [material])
  useFrame((_, dt) => {
    if (!root.current) return
    const gate = state.current.gate, t = state.current.time
    root.current.position.set(gate.x, gate.y, gate.z + .03)
    root.current.quaternion.copy(camera.quaternion)
    material.uniforms.uTime.value = reducedMotion ? 0 : t
    material.uniforms.uOpen.value = THREE.MathUtils.damp(material.uniforms.uOpen.value, connected ? 1 : 0, 5, Math.min(dt, .1))
    const open = material.uniforms.uOpen.value as number
    const size = .73 + open * .27
    const tension = reducedMotion ? 0 : clamp(stretch) * .4
    root.current.scale.set(size * (edge === 'left' || edge === 'right' ? 1 + tension : 1), size * (edge === 'top' || edge === 'bottom' ? 1 + tension : 1), size)
    if (ring.current) ring.current.rotation.z = reducedMotion ? .15 : t * .18
  })
  const color = side === 'day' ? '#ad8aff' : '#ffc38f'
  return <group ref={root}>
    <mesh><circleGeometry args={[1.02, 64]} /><primitive object={material} attach="material" /></mesh>
    <mesh><torusGeometry args={[1.08, .072, 12, 64]} /><meshStandardMaterial color="#665289" roughness={.25} metalness={.7} /></mesh>
    <mesh><torusGeometry args={[1.03, .022, 8, 64]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
    <group ref={ring}>{Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[Math.cos(i * Math.PI / 6) * 1.18, Math.sin(i * Math.PI / 6) * 1.18, 0]} rotation-z={i * Math.PI / 6}>
      <boxGeometry args={[.11, .035, .045]} /><meshBasicMaterial color={i % 3 ? color : '#fff3dd'} toneMapped={false} />
    </mesh>)}</group>
    <pointLight color={color} intensity={connected ? 4 : 1} distance={4} decay={2} />
  </group>
}

function PortalDust({ night, reducedMotion, state }: { night: boolean; reducedMotion: boolean; state: React.RefObject<SceneState> }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    if (!mesh.current) return
    const t = reducedMotion ? 0 : state.current.time
    const celebration = !reducedMotion && state.current.time > 30 ? 1 : 0
    for (let i = 0; i < 44; i++) {
      const seed = i * 2.39996
      dummy.position.set(Math.sin(seed) * 5.1, .3 + ((i * .137 + t * .035) % 1) * 2.9, Math.cos(seed * 1.7) * 1.6)
      dummy.rotation.set(t + seed, seed, t * .6)
      dummy.scale.setScalar((night ? .019 : .012) + celebration * .035)
      dummy.updateMatrix(); mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[undefined, undefined, 44]} frustumCulled={false}>
    <octahedronGeometry args={[1, 0]} /><meshBasicMaterial color={night ? '#c4b5ff' : '#efbc88'} transparent opacity={.7} toneMapped={false} />
  </instancedMesh>
}
