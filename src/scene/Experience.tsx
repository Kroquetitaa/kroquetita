import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { celebrationTime, useGame } from '../store'
import { Boss } from './Boss'
import { CameraRig } from './CameraRig'
import { Detail, DETAIL_LAYER } from './Detail'
import { Fireworks } from './Celebration'
import { Folk } from './Folk'
import { Coins } from './Coins'
import { Player } from './Player'
import { Weather } from './Weather'
import { World } from './World'
import { startIntro } from './intro'
import { uParty, uTime } from './materials/shaders'

/** Sol: azimut 28°, elevación 54°. */
const SUN: [number, number, number] = (() => {
  const az = (28 * Math.PI) / 180
  const el = (54 * Math.PI) / 180
  const d = 40
  return [Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d]
})()

function Lights() {
  const blue = useRef<THREE.SpotLight>(null)
  const orange = useRef<THREE.SpotLight>(null)

  // Los focos de color se mecen despacio y "respiran": la escena nunca está quieta.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (blue.current) {
      blue.current.position.set(-24 + Math.sin(t * 0.23) * 5, 15 + Math.sin(t * 0.31) * 2, 13)
      blue.current.intensity = 1500 * (0.85 + 0.15 * Math.sin(t * 0.9))
    }
    if (orange.current) {
      orange.current.position.set(26 + Math.cos(t * 0.19) * 5, 17 + Math.cos(t * 0.27) * 2, 11)
      orange.current.intensity = 1700 * (0.85 + 0.15 * Math.sin(t * 0.7 + 2))
    }
  })

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight
        position={SUN}
        color="#e3d9c9"
        intensity={3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      >
        <orthographicCamera attach="shadow-camera" args={[-32, 32, 28, -14, 1, 110]} />
      </directionalLight>
      <spotLight
        ref={blue}
        position={[-24, 14, 12]}
        color="#1c42ff"
        intensity={1500}
        distance={90}
        angle={0.5}
        penumbra={1}
      />
      <spotLight
        ref={orange}
        position={[26, 16, 10]}
        color="#ff5217"
        intensity={1700}
        distance={100}
        angle={0.5}
        penumbra={1}
      />
    </>
  )
}

/** Entorno procedural (sin HDRI externo) para los reflejos metálicos. */
function Reflections() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={['#050506']} />
      <Lightformer form="rect" intensity={4} position={[0, 8, 6]} scale={[14, 3, 1]} />
      <Lightformer form="rect" intensity={6} color="#3c6bff" position={[-10, 3, 2]} scale={[4, 8, 1]} rotation-y={Math.PI / 2} />
      <Lightformer form="rect" intensity={6} color="#ff6a2b" position={[10, 3, 2]} scale={[4, 8, 1]} rotation-y={-Math.PI / 2} />
      <Lightformer form="ring" intensity={3} position={[0, 2, -9]} scale={5} />
    </Environment>
  )
}

/** Avanza el reloj de los shaders y precompila la escena antes de mostrarla. */
function Runtime() {
  const { gl, scene, camera } = useThree()
  const setReady = useGame((s) => s.setReady)

  useFrame((_, dt) => {
    uTime.value += dt
    // Modo fiesta: sube al ganar y baja al reiniciar.
    const party = celebrationTime() >= 0 || useGame.getState().party ? 1 : 0
    uParty.value += (party - uParty.value) * (1 - Math.exp(-3 * dt))
  })

  useEffect(() => {
    // Solo en desarrollo: acceso a la escena desde la consola.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __three: unknown }).__three = { gl, scene, camera, THREE }
    }
  }, [gl, scene, camera])

  useEffect(() => {
    let alive = true
    const done = () => {
      if (!alive) return
      startIntro()
      setReady()
    }
    // Un pequeño margen para que el indicador de carga no parpadee.
    const wait = new Promise((r) => setTimeout(r, 500))
    Promise.all([gl.compileAsync(scene, camera), wait]).then(done, done)
    return () => {
      alive = false
    }
  }, [gl, scene, camera, setReady])

  return null
}

export function Experience() {
  // En el móvil se pinta con menos densidad de píxeles; y, si el equipo no llega, se baja sobre la marcha.
  const [maxDpr, setMaxDpr] = useState(() => (window.matchMedia('(pointer: coarse)').matches ? 1.5 : 1.75))
  return (
    <Canvas
      flat
      shadows="percentage"
      dpr={[1, maxDpr]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ fov: 32, near: 0.5, far: 260 }}
      onCreated={({ camera, raycaster }) => {
        useGame.getState().setProgress(0.6)
        // La capa de detalle se ve y se puede pulsar, pero no entra en reflejos ni sombras.
        camera.layers.enable(DETAIL_LAYER)
        raycaster.layers.enable(DETAIL_LAYER)
      }}
    >
      <color attach="background" args={['#020203']} />
      <fog attach="fog" args={['#020203', 30, 100]} />
      <PerformanceMonitor onDecline={() => setMaxDpr((value) => Math.max(1, value - 0.25))} />
      <CameraRig />
      <Lights />
      <Suspense fallback={null}>
        <Reflections />
        <World />
        <Weather />
        <Detail>
          <Coins />
        </Detail>
        <Player />
        <Folk />
        <Boss />
        <Fireworks />
        <Runtime />
      </Suspense>
      <EffectComposer>
        <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.9} luminanceSmoothing={0.25} />
        <Vignette offset={0.22} darkness={0.78} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  )
}
