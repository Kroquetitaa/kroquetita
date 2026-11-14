import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { body } from '../game/state'
import { world } from '../world/layout'
import { Detail } from './Detail'

/**
 * Lluvia de croquetas: durante unos doce segundos caen del cielo alrededor
 * del jugador, girando; rebotan una vez, se quedan tumbadas y se deshacen
 * miga a miga. Todas van en una sola malla instanciada, y mientras no llueve
 * no hay nada montado.
 */

// ---------------------------------------------------------------- Croqueta

/** Croqueta de tamaño unidad: 1 de grosor y 2,1 de largo, con el eje a lo largo de Y. */
export function createCroquetaGeometry() {
  return new THREE.CapsuleGeometry(0.5, 1.1, 3, 8)
}

/**
 * Rebozado dorado: migas en una rejilla 3D (en el espacio de la propia
 * croqueta, así giran con ella) y una luz fija, sin depender de las de la
 * escena. Con `fade`, cada instancia se deshace según su atributo `aFade`.
 */
export function createCroquetaMaterial({ fade = false, glow = 1.25 } = {}) {
  return new THREE.ShaderMaterial({
    defines: fade ? { USE_FADE: '' } : {},
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uGlow: { value: glow } },
    vertexShader: /* glsl */ `
      #ifdef USE_FADE
        attribute float aFade;
        varying float vFade;
      #endif
      varying vec3 vLocal;
      varying vec3 vFacing;
      #include <fog_pars_vertex>
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        #ifdef USE_FADE
          vFade = aFade;
        #endif
        vLocal = position;
        vFacing = mat3(m) * normal;
        vec4 mvPosition = viewMatrix * m * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      #ifdef USE_FADE
        varying float vFade;
      #endif
      varying vec3 vLocal;
      varying vec3 vFacing;
      #include <fog_pars_fragment>
      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      void main() {
        float crumb = hash(floor(vLocal * 9.0 + 0.5));
        float fine = hash(floor(vLocal * 23.0 + 0.5) + 7.0);
        #ifdef USE_FADE
          // Se deshace miga a miga.
          if (crumb * 0.8 + fine * 0.2 > vFade) discard;
        #endif
        // Del tostado al dorado, con alguna miga más clara.
        vec3 col = mix(vec3(0.6, 0.27, 0.05), vec3(1.0, 0.64, 0.18), crumb);
        col = mix(col, vec3(1.0, 0.85, 0.45), step(0.88, fine));
        vec3 n = normalize(vFacing);
        float light = 0.5 + 0.34 * max(n.y, 0.0) + 0.26 * max(dot(n, vec3(0.37, 0.28, 0.885)), 0.0);
        gl_FragColor = vec4(col * light * uGlow, 1.0);
        #include <fog_fragment>
      }
    `,
    fog: true,
    toneMapped: false,
  })
}

// ---------------------------------------------------------------- Estado

/** Cuántas croquetas caen */
const COUNT = 150
/** Las croquetas van naciendo durante este tiempo; con la caída, el rebote y el final, unos 12 s en total */
const SPAWN_WINDOW = 8.7
const GRAVITY = 15
/** Radio alrededor del jugador en el que caen */
const REACH = 10
/** Reposo en el suelo antes de deshacerse, y lo que tarda en hacerlo */
const REST = 0.35
const CRUMBLE = 0.9

/** Lluvia en curso: `run` cambia en cada disparo, y con él se reinicia todo. */
let rain = { active: false, run: 0 }
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const snapshot = () => rain
const publish = (next: typeof rain) => {
  rain = next
  listeners.forEach((listener) => listener())
}

/** Hace llover croquetas alrededor del jugador. Si ya llovía, vuelve a empezar. */
export function rainCroquetas() {
  publish({ active: true, run: rain.run + 1 })
}

function endRain(run: number) {
  if (rain.active && rain.run === run) publish({ active: false, run })
}

// ---------------------------------------------------------------- Lluvia

const WAITING = 0
const FALLING = 1
const BOUNCED = 2
const RESTING = 3
const GONE = 4

interface Drop {
  stage: number
  /** Segundo en el que nace */
  delay: number
  age: number
  position: THREE.Vector3
  velocity: THREE.Vector3
  /** Altura de lo que tiene debajo: el suelo o una azotea */
  floor: number
  size: number
  axis: THREE.Vector3
  spin: number
  turn: THREE.Quaternion
  /** Postura tumbada en la que acaba */
  flat: THREE.Quaternion
  rest: number
}

/** Altura de lo que hay bajo ese punto (sin contar lo que quede por encima de `below`). */
function floorAt(x: number, z: number, below: number) {
  let top = 0
  for (const c of world.colliders) {
    if (c.max[1] <= top || c.max[1] > below) continue
    if (x > c.min[0] && x < c.max[0] && z > c.min[2] && z < c.max[2]) top = c.max[1]
  }
  return top
}

function createDrops(): Drop[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    stage: WAITING,
    // Repartidas por toda la ventana, con un poco de desorden.
    delay: ((i + Math.random()) / COUNT) * SPAWN_WINDOW,
    age: 0,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    floor: 0,
    size: 0.24 + Math.random() * 0.12,
    axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
    spin: 3 + Math.random() * 6,
    turn: new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
    ),
    flat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.random() * Math.PI * 2)),
    rest: 0,
  }))
}

function Shower({ run }: { run: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const clock = useRef(0)

  const kit = useMemo(() => {
    const geometry = createCroquetaGeometry()
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1)
    fade.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aFade', fade)
    return {
      geometry,
      fade,
      material: createCroquetaMaterial({ fade: true }),
      drops: createDrops(),
      matrix: new THREE.Matrix4(),
      step: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
    }
  }, [])

  useEffect(
    () => () => {
      kit.geometry.dispose()
      kit.material.dispose()
    },
    [kit],
  )

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    // Hasta que nacen, las croquetas no ocupan nada.
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < COUNT; i++) m.setMatrixAt(i, hidden)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.instanceMatrix.needsUpdate = true
  }, [])

  useFrame((_, delta) => {
    const m = mesh.current
    if (!m) return
    const dt = Math.min(delta, 1 / 20)
    clock.current += dt
    const t = clock.current
    const { drops, fade, matrix, step, scale } = kit
    let pending = false

    for (let i = 0; i < COUNT; i++) {
      const d = drops[i]
      if (d.stage === GONE) continue
      pending = true
      if (d.stage === WAITING) {
        if (t < d.delay) continue
        // Nace sobre el jugador, esté donde esté en ese momento.
        const angle = Math.random() * Math.PI * 2
        const reach = Math.sqrt(Math.random()) * REACH
        const y = Math.max(0, body.pos[1]) + 14 + Math.random() * 5
        d.position.set(body.pos[0] + Math.sin(angle) * reach, y, body.pos[2] + Math.cos(angle) * reach)
        d.velocity.set((Math.random() - 0.5) * 1.2, -2 - Math.random() * 3, (Math.random() - 0.5) * 1.2)
        d.floor = floorAt(d.position.x, d.position.z, y - 2)
        d.stage = FALLING
      }

      d.age += dt
      const radius = d.size * 0.5
      let visible = Math.min(1, d.age / 0.25)

      if (d.stage === RESTING) {
        // Tumbada en el suelo: se acomoda y, al poco, se deshace.
        d.rest += dt
        d.turn.slerp(d.flat, 1 - Math.exp(-12 * dt))
        visible = 1 - Math.min(1, Math.max(0, d.rest - REST) / CRUMBLE)
        if (visible <= 0) d.stage = GONE
      } else {
        d.velocity.y -= GRAVITY * dt
        d.position.addScaledVector(d.velocity, dt)
        d.turn.premultiply(step.setFromAxisAngle(d.axis, d.spin * dt))
        if (d.position.y <= d.floor + radius && d.velocity.y < 0) {
          d.position.y = d.floor + radius
          if (d.stage === FALLING) {
            // Un único rebote, corto y perdiendo fuelle.
            d.velocity.set(d.velocity.x * 0.6, Math.min(5.5, -d.velocity.y * 0.36), d.velocity.z * 0.6)
            d.spin *= 0.6
            d.stage = BOUNCED
          } else {
            d.stage = RESTING
          }
        }
      }

      fade.array[i] = visible
      if (d.stage === GONE) matrix.makeScale(0, 0, 0)
      else matrix.compose(d.position, d.turn, scale.setScalar(d.size))
      m.setMatrixAt(i, matrix)
    }

    fade.needsUpdate = true
    m.instanceMatrix.needsUpdate = true
    if (!pending) endRain(run)
  })

  return (
    <Detail>
      <instancedMesh ref={mesh} args={[kit.geometry, kit.material, COUNT]} frustumCulled={false} />
    </Detail>
  )
}

/** Móntalo dentro del `<Canvas>`: no pinta nada hasta que `rainCroquetas()` lo dispara. */
export function CroquetaRain() {
  const state = useSyncExternalStore(subscribe, snapshot)
  if (!state.active) return null
  return <Shower key={state.run} run={state.run} />
}
