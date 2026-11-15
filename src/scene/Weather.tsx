import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sfx } from '../game/audio'
import { body, shake } from '../game/state'
import { useGame } from '../store'
import { world } from '../world/layout'
import { introProgress } from './intro'
import { uTime } from './materials/shaders'
import { atmosphere } from './atmosphere'

/**
 * Cielo vivo: un ciclo de noche y amanecer (sale un sol de neón tras las
 * cajas y el cielo se tiñe), lluvia de neón a ratos y tormenta con rayos
 * mientras producción está caída. El terminal puede forzar hora y clima.
 */

/** Duración del ciclo completo, en segundos */
const CYCLE = 240
/** El ciclo arranca poco antes del amanecer, para que se vea pronto */
const START = 0.26
const RAIN_HEIGHT = 34
const STREAKS = 900

const NIGHT = new THREE.Color('#152239')
const DAY = new THREE.Color('#829eb5')
const DAWN = new THREE.Color('#704a66')
const STORM = new THREE.Color('#0d0406')
const scratch = new THREE.Color()

/** 0 = noche cerrada, 1 = pleno amanecer. Lo leen otros shaders (las ventanas de la ciudad se apagan de día). */
export const uDay = { value: 0 }

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Fondo: degradado de horizonte y un sol de rayas que sube tras las cajas. */
function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uDay: { value: 0 }, uStorm: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDay;
      uniform float uStorm;
      varying vec2 vUv;
      void main() {
        // Coordenadas con el horizonte en y = 0 y proporción real del plano (2.6 : 1).
        vec2 p = vec2((vUv.x - 0.5) * 2.6, vUv.y - 0.25);
        // Resplandor del horizonte: naranja abajo, magenta y violeta hacia arriba.
        float h = clamp(p.y, 0.0, 1.0);
        vec3 glow = mix(vec3(1.0, 0.42, 0.12), vec3(0.75, 0.12, 0.5), smoothstep(0.0, 0.22, h));
        glow = mix(glow, vec3(0.16, 0.08, 0.42), smoothstep(0.15, 0.55, h));
        float band = (1.0 - smoothstep(0.0, 0.7, h)) * smoothstep(-0.06, 0.02, p.y);
        vec3 col = glow * band * uDay * 0.55;

        // Sol: sube con el día; rayas horizontales que se ensanchan hacia abajo.
        vec2 c = vec2(-0.03, mix(-0.2, 0.09, uDay));
        float d = length(p - c);
        float disc = smoothstep(0.045, 0.043, d);
        float y = (p.y - c.y) / 0.045;
        float gap = clamp(0.15 - y * 0.5, 0.0, 0.7);
        float stripes = step(gap, fract(y * 6.0 - uTime * 0.1));
        float cut = mix(1.0, stripes, step(y, 0.2));
        vec3 sun = mix(vec3(1.0, 0.16, 0.45), vec3(1.0, 0.62, 0.12), clamp(y * 0.5 + 0.5, 0.0, 1.0));
        col += sun * disc * cut * step(0.0, p.y) * uDay * 0.62;
        // Halo alrededor del sol.
        col += vec3(1.0, 0.45, 0.3) * exp(-d * 16.0) * 0.3 * uDay * step(-0.02, p.y);

        // Con tormenta el cielo se apaga y se enrojece un poco.
        col = mix(col, vec3(0.25, 0.02, 0.02) * band, uStorm * 0.8);
        float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  })
}

/** Lluvia: trazos de luz que caen; todo el movimiento va en el shader (una sola draw call). */
function createRain() {
  const positions = new Float32Array(STREAKS * 6)
  const seeds = new Float32Array(STREAKS * 2)
  const tops = new Float32Array(STREAKS * 2)
  let seed = 31
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < STREAKS; i++) {
    const x = (rand() - 0.5) * 96
    const y = rand() * RAIN_HEIGHT
    const z = -16 + rand() * 46
    const s = rand()
    positions.set([x, y, z, x, y, z], i * 6)
    seeds.set([s, s], i * 2)
    tops.set([0, 1], i * 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geometry.setAttribute('aTop', new THREE.BufferAttribute(tops, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime, uRain: { value: 0 }, uStorm: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uStorm;
      attribute float aSeed;
      attribute float aTop;
      varying float vSeed;
      varying float vTop;
      void main() {
        vec3 p = position;
        float speed = 20.0 + aSeed * 12.0 + uStorm * 14.0;
        float y = mod(p.y - uTime * speed, ${RAIN_HEIGHT.toFixed(1)});
        float len = 0.7 + aSeed * 0.9 + uStorm * 0.8;
        // El viento inclina la lluvia; con tormenta, mucho más.
        float wind = 0.08 + uStorm * 0.3;
        p.y = y + aTop * len;
        p.x += (y + aTop * len) * wind;
        vSeed = aSeed;
        vTop = aTop;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uRain;
      uniform float uStorm;
      varying float vSeed;
      varying float vTop;
      void main() {
        vec3 col = mix(vec3(0.2, 0.9, 1.0), vec3(1.0, 0.3, 0.9), step(0.6, vSeed));
        col = mix(col, vec3(1.0, 0.25, 0.2), uStorm * 0.7);
        // Solo llueve una parte de los trazos si la lluvia es floja.
        float on = step(vSeed, 0.35 + uRain * 0.65) * uRain;
        float a = (1.0 - vTop) * 0.75 * on;
        gl_FragColor = vec4(col * a * 1.6, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  return { geometry, material }
}

const BOLT_POINTS = 14

export function Weather() {
  const sky = useMemo(() => createSkyMaterial(), [])
  const rain = useMemo(() => createRain(), [])
  const boltGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BOLT_POINTS * 3), 3))
    return g
  }, [])
  const boltMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: new THREE.Color(3, 3.4, 4), transparent: true, toneMapped: false }),
    [],
  )
  const dawn = useRef<THREE.HemisphereLight>(null)
  const flash = useRef<THREE.AmbientLight>(null)
  const bolt = useRef<THREE.Line>(null)
  const rainMesh = useRef<THREE.LineSegments>(null)
  const state = useRef({ day: 0, golden: 0, rain: 0, storm: 0, flash: 0, nextBolt: 0 })
  const line = useMemo(() => new THREE.Line(boltGeometry, boltMaterial), [boltGeometry, boltMaterial])

  useFrame(({ clock, scene }, delta) => {
    const s = state.current
    const t = clock.elapsedTime
    const game = useGame.getState()
    const phase = (t / CYCLE + START) % 1
    const k = 1 - Math.exp(-0.9 * delta)

    const autoDay = smooth(0.14, 0.35, phase) * (1 - smooth(0.62, 0.84, phase))
    const autoGolden = Math.sin(autoDay * Math.PI) ** 2
    const stormy = game.weather === 'storm' || (game.weather === 'auto' && game.crash !== null)
    const golden = game.daytime === 'dawn' || game.daytime === 'sunset'
    const day = golden ? 0.52 : game.daytime === 'day' ? 1 : game.daytime === 'night' ? 0 : autoDay
    const warmth = golden ? 1 : game.daytime === 'auto' ? autoGolden : 0
    // Lluvia: un chaparrón de noche en cada ciclo, o la que mande el terminal.
    const autoRain = smooth(0.02, 0.08, phase) * (1 - smooth(0.22, 0.3, phase))
    const raining = stormy ? 1 : game.weather === 'rain' ? 1 : game.weather === 'clear' ? 0 : autoRain

    const appear = introProgress(3.5, 2)
    s.day += (day * (stormy ? 0.25 : 1) * appear - s.day) * k
    s.golden += (warmth * appear - s.golden) * k
    s.rain += (raining * appear - s.rain) * (1 - Math.exp(-1.6 * delta))
    s.storm += ((stormy ? 1 : 0) - s.storm) * (1 - Math.exp(-2.5 * delta))

    sky.uniforms.uDay.value = s.golden * 0.9 + s.day * 0.1
    uDay.value = s.day
    atmosphere.day = s.day
    atmosphere.golden = s.golden
    atmosphere.wet = s.rain
    sky.uniforms.uStorm.value = s.storm
    rain.material.uniforms.uRain.value = s.rain
    rain.material.uniforms.uStorm.value = s.storm
    if (rainMesh.current) {
      rainMesh.current.visible = s.rain > 0.01
      rainMesh.current.position.set(game.mode === 'play' ? body.pos[0] : 0, 0, game.mode === 'play' ? body.pos[2] - 8 : 0)
    }

    // El fondo y la niebla se tiñen con la hora (sin dejar de ser oscuros: manda el neón).
    scratch.copy(NIGHT).lerp(DAY, s.day).lerp(DAWN, s.golden * 0.72).lerp(STORM, s.storm * 0.8)
    if (game.place === 'brain') scratch.set('#080d22')
    if (scene.background instanceof THREE.Color) scene.background.copy(scratch)
    if (scene.fog) scene.fog.color.copy(scratch)
    if (dawn.current) dawn.current.intensity = s.golden * 0.3
    scene.environmentIntensity = 0.65 + s.day * 0.55

    // Rayos: un fogonazo, el trazo en zigzag y el trueno un instante después.
    s.flash *= Math.exp(-7 * delta)
    if (s.storm > 0.6 && t > s.nextBolt && !atmosphere.reducedMotion) {
      s.nextBolt = t + 1.1 + Math.random() * 2.6
      s.flash = 1
      shake.value = Math.max(shake.value, 0.12)
      const target = world.props.server.center
      const x = target[0] - 14 + Math.random() * 20
      const z = target[2] - 10 + Math.random() * 8
      const positions = boltGeometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < BOLT_POINTS; i++) {
        const u = i / (BOLT_POINTS - 1)
        const wobble = (1 - u) * u * 4 + 0.3
        positions.setXYZ(
          i,
          x + (Math.random() - 0.5) * 2.6 * wobble + (1 - u) * 6,
          42 * (1 - u),
          z + (Math.random() - 0.5) * 1.4 * wobble,
        )
      }
      positions.needsUpdate = true
      window.setTimeout(() => sfx.thunder(), 180)
    }
    if (flash.current) flash.current.intensity = s.flash * 1.6
    boltMaterial.opacity = Math.min(1, s.flash * 1.6)
    if (bolt.current) bolt.current.visible = s.flash > 0.08
  }, -2)

  return (
    <>
      <mesh position={[0, 300, -200]} material={sky} frustumCulled={false}>
        <planeGeometry args={[2000, 1200]} />
      </mesh>
      <lineSegments ref={rainMesh} geometry={rain.geometry} material={rain.material} frustumCulled={false} visible={false} />
      <primitive ref={bolt} object={line} frustumCulled={false} visible={false} />
      <hemisphereLight ref={dawn} args={['#ff9a6b', '#3a1a5c', 0]} />
      <ambientLight ref={flash} color="#cfe0ff" intensity={0} />
    </>
  )
}
