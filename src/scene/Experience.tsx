import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { body } from '../game/state'
import { track } from '../net/track'
import { celebrationTime, useGame } from '../store'
import { zoneAt } from '../world/zones'
import { Boss } from './Boss'
import { CameraRig } from './CameraRig'
import { CroquetaRain } from './CroquetaRain'
import { Detail, DETAIL_LAYER } from './Detail'
import { Fireworks } from './Celebration'
import { Folk } from './Folk'
import { Lab } from './Lab'
import { Library } from './Library'
import { PhotoRig } from './PhotoRig'
import { Coins } from './Coins'
import { Player } from './Player'
import { Seasonal } from './Seasonal'
import { TrainStation } from './TrainStation'
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

  const pulse = useRef(0)

  useFrame((_, dt) => {
    uTime.value += dt
    // Analítica: qué zonas se pisan (cada una cuenta una vez por visita).
    pulse.current += dt
    if (pulse.current > 0.6) {
      pulse.current = 0
      if (useGame.getState().mode === 'play') {
        const zone = zoneAt(body.pos[0], body.pos[2])
        if (zone) track(`zone:${zone.id}`)
      }
    }
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

/**
 * Con la calidad baja las sombras se recalculan uno de cada tres fotogramas:
 * es lo más caro de la escena y, a esa cadencia, apenas se nota.
 */
function ShadowBudget({ low }: { low: boolean }) {
  const gl = useThree((state) => state.gl)
  const frame = useRef(0)
  useEffect(() => {
    gl.shadowMap.autoUpdate = !low
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl, low])
  useFrame(() => {
    if (!low) return
    frame.current = (frame.current + 1) % 3
    if (frame.current === 0) gl.shadowMap.needsUpdate = true
  })
  return null
}

/** Densidad de píxeles del modo 8 bits: el lienzo se pinta diminuto y se amplía sin suavizar */
const RETRO_DPR = 0.2

export function Experience() {
  const quality = useGame((s) => s.quality)
  const retro = useGame((s) => s.retro)
  const [coarse] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  // Calidad automática: en el móvil se pinta con menos densidad de píxeles y, si el equipo no llega,
  // se va bajando sobre la marcha; cuando ya no queda densidad que quitar, se pasa a calidad baja.
  const [autoDpr, setAutoDpr] = useState(coarse ? 1.5 : 1.75)
  const [struggling, setStruggling] = useState(false)
  const low = quality === 'low' || (quality === 'auto' && struggling)
  const maxDpr = quality === 'high' ? 2 : low ? 1 : autoDpr
  const decline = () => {
    if (useGame.getState().quality !== 'auto') return
    setAutoDpr((value) => {
      if (value <= 1) setStruggling(true)
      return Math.max(1, value - 0.25)
    })
  }
  return (
    <Canvas
      flat
      shadows="percentage"
      dpr={retro ? RETRO_DPR : [low ? 0.75 : 1, maxDpr]}
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
      <PerformanceMonitor onDecline={decline} />
      <ShadowBudget low={low} />
      <CameraRig />
      <PhotoRig />
      <Lights />
      <Suspense fallback={null}>
        <Reflections />
        <World />
        <Weather />
        <Detail>
          <Coins />
        </Detail>
        <Player />
        <TrainStation />
        <Seasonal />
        <CroquetaRain />
        <Folk />
        <Boss />
        <Library />
        <Lab />
        <Fireworks />
        <Runtime />
      </Suspense>
      <EffectComposer>
        {/* El resplandor es el efecto más caro: con calidad baja (y en 8 bits, donde no luce) se quita */}
        {low || retro ? null : <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.9} luminanceSmoothing={0.25} />}
        <Vignette offset={0.22} darkness={0.78} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  )
}
