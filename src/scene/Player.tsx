import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import fontMedium from '@fontsource/poppins/files/poppins-latin-500-normal.woff?url'
import { sfx } from '../game/audio'
import { input } from '../game/input'
import { stepBody } from '../game/physics'
import { body, respawn } from '../game/state'
import { celebrationTime, useGame } from '../store'
import { world } from '../world/layout'
import { introTime } from './intro'
import { createPuffMaterial } from './materials/shaders'

const HOOD = '#453c6e'
const HOODIE = '#5a4f8c'
const GLOW = '#ff8a1e'
const DARK = '#15131c'
const COIN_REACH = 0.75

/** Frases del personaje. El humor es de programador, claro. */
const QUIPS = {
  intro: ['Pulsa E. No muerdo.'],
  idle: [
    'sudo hazme un café',
    'En mi máquina funciona',
    'git push --force y a correr',
    'No es un bug, es una feature',
    '¿Has probado a reiniciar?',
    'Compilando… excusas',
    'Esto lo arreglo con IA',
    'console.log("aquí")',
    'Deploy en viernes, ¿qué puede salir mal?',
    'Quedan 99 bugs en el código…',
  ],
  coin: ['¡Otra para el bote!', 'Cha-ching', 'Esto cotiza', '+1 de reputación'],
  launch: ['¡YIJAAA!', '¡Escalando en vertical!'],
  doubleJump: ['¡Parkour!', 'Salto con doble factor'],
  fall: ['Ay. Rollback.', 'Eso no estaba en los tests'],
  win: ['¡Ascenso conseguido!'],
}
type QuipKind = keyof typeof QUIPS

type Face = 'normal' | 'blink' | 'wow' | 'happy'

/** Cara de la máscara en pixel art (32×32): sonrisa, bigote, perilla y coloretes. */
function createFaceTexture(face: Face) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32
  const ctx = canvas.getContext('2d')!
  const px = (color: string, x: number, y: number, w = 1, h = 1) => {
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, h)
  }
  const INK = '#16121c'
  px('#f6f2ea', 0, 0, 32, 32)
  // Barbilla y frente redondeadas con el color de la capucha.
  for (const [x, y, w, h] of [
    [0, 0, 2, 2], [30, 0, 2, 2], [0, 25, 2, 7], [30, 25, 2, 7],
    [2, 28, 3, 4], [27, 28, 3, 4], [5, 30, 4, 2], [23, 30, 4, 2],
  ]) {
    px(HOOD, x, y, w, h)
  }
  // Cejas arqueadas, nariz y coloretes.
  px(INK, 6, 7, 7, 1)
  px(INK, 5, 8, 2, 1)
  px(INK, 19, 7, 7, 1)
  px(INK, 25, 8, 2, 1)
  px('#d6cec0', 15, 13, 2, 5)
  px('#f2a2a2', 3, 16, 5, 3)
  px('#f2a2a2', 24, 16, 5, 3)

  if (face === 'blink') {
    px(INK, 7, 12, 6, 1)
    px(INK, 19, 12, 6, 1)
  } else if (face === 'wow') {
    px(INK, 7, 9, 6, 6)
    px(INK, 19, 9, 6, 6)
    px('#ffffff', 8, 10, 2, 2)
    px('#ffffff', 20, 10, 2, 2)
  } else if (face === 'happy') {
    // Ojos en ^ ^
    for (const ox of [7, 19]) {
      px(INK, ox, 12, 2, 1)
      px(INK, ox + 1, 11, 4, 1)
      px(INK, ox + 4, 12, 2, 1)
    }
  } else {
    px(INK, 7, 10, 6, 3)
    px(INK, 19, 10, 6, 3)
    px('#f6f2ea', 7, 12, 1, 1)
    px('#f6f2ea', 12, 12, 1, 1)
    px('#f6f2ea', 19, 12, 1, 1)
    px('#f6f2ea', 24, 12, 1, 1)
  }

  // Bigote con las puntas hacia arriba.
  px(INK, 11, 19, 10, 1)
  px(INK, 9, 18, 2, 1)
  px(INK, 8, 17, 1, 1)
  px(INK, 21, 18, 2, 1)
  px(INK, 23, 17, 1, 1)

  if (face === 'wow') {
    px(INK, 13, 21, 6, 6)
    px('#b3363f', 14, 22, 4, 4)
  } else {
    // Sonrisa pícara y perilla.
    px(INK, 10, 22, 12, 1)
    px(INK, 9, 21, 1, 1)
    px(INK, 22, 21, 1, 1)
    if (face === 'happy') px(INK, 11, 23, 10, 1)
    px(INK, 15, 25, 2, 5)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Tapa del portátil con el rayo. */
function createBoltTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 44
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#211d33'
  ctx.fillRect(0, 0, 64, 44)
  ctx.beginPath()
  for (const [i, [x, y]] of [[36, 5], [22, 24], [31, 24], [27, 39], [43, 19], [34, 19]].entries()) {
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.shadowColor = '#ff8a1e'
  ctx.shadowBlur = 8
  ctx.fillStyle = '#ffd23a'
  ctx.fill()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Bocadillo de cómic sobre la cabeza. */
function Bubble({ text, shownAt }: { text: string; shownAt: number }) {
  const group = useRef<THREE.Group>(null)
  const background = useRef<THREE.Mesh>(null)
  const tail = useRef<THREE.Mesh>(null)

  useFrame(() => {
    const g = group.current
    if (!g) return
    const age = (performance.now() - shownAt) / 1000
    const life = 1.6 + text.length * 0.055
    let scale = 0
    if (text && age < life) {
      const k = Math.min(1, age / 0.22)
      // Entra con rebote y se encoge al irse.
      scale = 1 - Math.pow(1 - k, 3) * Math.cos(k * 7)
      if (age > life - 0.2) scale *= (life - age) / 0.2
    }
    g.visible = scale > 0.01
    g.scale.setScalar(Math.max(scale, 0.001))
  })

  return (
    <Billboard ref={group} position={[0, 1.5, 0]} visible={false}>
      <mesh ref={background} renderOrder={20}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#dfe0ea" toneMapped={false} depthTest={false} />
      </mesh>
      <mesh ref={tail} renderOrder={20} rotation-z={Math.PI / 4} position-y={-0.2}>
        <planeGeometry args={[0.13, 0.13]} />
        <meshBasicMaterial color="#dfe0ea" toneMapped={false} depthTest={false} />
      </mesh>
      <Text
        font={fontMedium}
        fontSize={0.17}
        color={DARK}
        anchorX="center"
        anchorY="middle"
        textAlign="center"
        maxWidth={2.7}
        renderOrder={21}
        material-depthTest={false}
        material-toneMapped={false}
        onSync={(troika: { textRenderInfo?: { blockBounds: number[] } }) => {
          const bounds = troika.textRenderInfo?.blockBounds
          if (!bounds || !background.current || !tail.current) return
          const height = bounds[3] - bounds[1] + 0.22
          background.current.scale.set(bounds[2] - bounds[0] + 0.32, height, 1)
          tail.current.position.y = -height / 2
        }}
      >
        {text}
      </Text>
    </Billboard>
  )
}

/**
 * El protagonista: un hacker voxel con capucha, máscara sonriente y su
 * inseparable portátil. Teclea cuando está quieto y lo levanta al saltar.
 */
export function Player() {
  const root = useRef<THREE.Group>(null)
  const flip = useRef<THREE.Group>(null)
  const squash = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const laptop = useRef<THREE.Group>(null)
  const faceMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const puff = useRef<THREE.Mesh>(null)
  const puffMaterial = useMemo(() => createPuffMaterial(), [])

  const faces = useMemo(
    () => ({
      normal: createFaceTexture('normal'),
      blink: createFaceTexture('blink'),
      wow: createFaceTexture('wow'),
      happy: createFaceTexture('happy'),
    }),
    [],
  )
  const bolt = useMemo(() => createBoltTexture(), [])

  const anim = useRef({
    phase: 0,
    squash: 0,
    flip: 0,
    air: 0,
    idle: 0,
    fall: 0,
    happyUntil: 0,
    nextQuip: 0,
    saidIntro: false,
    last: { idle: -1, coin: -1 } as Record<string, number>,
  })
  const [bubble, setBubble] = useState({ text: '', shownAt: 0 })
  const runId = useGame((s) => s.runId)

  useEffect(() => {
    respawn()
  }, [runId])

  const say = (kind: QuipKind, force = false) => {
    const a = anim.current
    const now = performance.now()
    if (!force && now < a.nextQuip) return
    const list = QUIPS[kind]
    // Sin repetir la última frase del mismo tipo.
    let pick = Math.floor(Math.random() * list.length)
    if (list.length > 1 && pick === a.last[kind]) pick = (pick + 1) % list.length
    a.last[kind] = pick
    a.nextQuip = now + 4500
    setBubble({ text: list[pick], shownAt: now })
  }

  // Al completar todas las monedas, lo celebra.
  useEffect(
    () =>
      useGame.subscribe((state, previous) => {
        if (state.wonAt !== null && previous.wonAt === null) say('win', true)
      }),
    // `say` solo usa refs y un setState estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useFrame((state, delta) => {
    const game = useGame.getState()
    const playing = game.mode === 'play'
    const dt = Math.min(delta, 1 / 20)
    const a = anim.current
    const t = state.clock.elapsedTime

    if (playing) {
      const x = input.stickX || input.x
      const z = input.stickZ || input.z
      const physics = {
        colliders: world.colliders,
        bounds: world.bounds,
        pads: world.pads,
        gravityScale: game.party ? 0.45 : 1,
      }
      // Dos subpasos para que la colisión sea estable a pocos FPS.
      for (let i = 0; i < 2; i++) {
        const fallSpeed = body.vel[1]
        stepBody(
          body,
          { x, z, run: input.run || Math.hypot(input.stickX, input.stickZ) > 0.85, jump: input.jumpQueued },
          dt / 2,
          physics,
        )
        input.jumpQueued = false
        if (body.justJumped) sfx.jump()
        if (body.justDoubleJumped) {
          sfx.doubleJump()
          a.flip = Math.PI * 2
          if (Math.random() < 0.3) say('doubleJump')
        }
        if (body.justLaunched) {
          sfx.launch()
          say('launch', true)
        }
        if (body.justLanded) {
          sfx.land()
          a.squash = 1
          // Anillo de polvo en el punto de aterrizaje.
          puff.current?.position.set(body.pos[0], body.pos[1] + 0.04, body.pos[2])
          puffMaterial.uniforms.uProgress.value = 0
          if (fallSpeed < -13) say('fall', true)
        }
      }

      for (const coin of world.coins) {
        if (game.collected.includes(coin.id)) continue
        const dx = coin.position[0] - body.pos[0]
        const dy = coin.position[1] - (body.pos[1] + 0.45)
        const dz = coin.position[2] - body.pos[2]
        if (dx * dx + dy * dy + dz * dz < COIN_REACH * COIN_REACH) {
          const last = game.collected.length + 1 === game.total
          game.collect(coin.id)
          a.happyUntil = performance.now() + 900
          if (last) sfx.win()
          else {
            sfx.coin()
            if (Math.random() < 0.35) say('coin')
          }
        }
      }
    } else {
      input.jumpQueued = false
      // En la portada, un saludo al poco de cargar.
      if (!a.saidIntro && introTime() > 4.5) {
        a.saidIntro = true
        say('intro', true)
      }
    }

    const progress = puffMaterial.uniforms.uProgress
    progress.value = Math.min(1, progress.value + dt * 2.6)

    // ---------- Animación ----------
    const airborne = playing && !body.grounded
    const moving = playing && body.grounded ? body.speed : 0
    const celebrating = celebrationTime() >= 0 && celebrationTime() < 14
    a.phase += dt * (6 + moving * 12) * (moving > 0.05 ? 1 : 0)
    a.squash = Math.max(0, a.squash - dt * 6)
    a.flip = Math.max(0, a.flip - dt * 13)
    a.air += ((airborne ? 1 : 0) - a.air) * (1 - Math.exp(-14 * dt))

    // Si lleva un rato quieto, suelta una frase.
    if (playing && body.grounded && moving < 0.05) {
      a.idle += dt
      if (a.idle > 6) {
        a.idle = -4
        say('idle')
      }
    } else if (moving > 0.05) a.idle = 0

    const swing = Math.sin(a.phase) * 0.9 * Math.min(1, moving * 2.2)
    const typing = moving < 0.05 && !airborne
    const dance = celebrating && typing ? Math.abs(Math.sin(t * 8)) : 0

    if (legL.current && legR.current) {
      legL.current.rotation.x = airborne ? 0.5 : swing
      legR.current.rotation.x = airborne ? -0.3 : -swing
    }
    if (armL.current && armR.current) {
      // Quieto: teclea a toda velocidad. En el aire: portátil en alto.
      const hold = -1.15
      const tapL = typing ? Math.sin(t * 24) * 0.13 : 0
      const tapR = typing ? Math.sin(t * 24 + 2) * 0.13 : 0
      armL.current.rotation.x = THREE.MathUtils.lerp(hold + tapL, -2.95, a.air)
      armR.current.rotation.x = THREE.MathUtils.lerp(hold + tapR, -2.95, a.air)
    }
    if (laptop.current) {
      const bounce = Math.abs(Math.sin(a.phase)) * 0.04 * Math.min(1, moving * 2.2)
      laptop.current.position.set(
        0,
        THREE.MathUtils.lerp(0.34 + bounce, 1.06, a.air),
        THREE.MathUtils.lerp(0.29, 0.02, a.air),
      )
      laptop.current.rotation.x = THREE.MathUtils.lerp(0, -0.5, a.air)
    }
    if (head.current) {
      head.current.rotation.z = Math.sin(t * 1.3) * 0.05 + (dance ? Math.sin(t * 8) * 0.18 : 0)
      head.current.rotation.x = typing ? 0.12 + Math.sin(t * 2.1) * 0.03 : -a.air * 0.25
    }
    if (faceMaterial.current) {
      let face: Face = 'normal'
      if (airborne) face = 'wow'
      else if (celebrating || performance.now() < a.happyUntil) face = 'happy'
      else if (t % 3.4 < 0.13) face = 'blink'
      faceMaterial.current.map = faces[face]
    }
    if (squash.current) {
      const idle = Math.sin(t * 2.4) * 0.015
      const s = 1 - a.squash * 0.22 + idle
      squash.current.scale.set(1 + a.squash * 0.16, s, 1 + a.squash * 0.16)
      squash.current.rotation.x = moving * 0.16
    }
    if (flip.current) {
      // Doble salto: voltereta completa hacia delante.
      const k = 1 - a.flip / (Math.PI * 2)
      flip.current.rotation.x = a.flip > 0 ? k * Math.PI * 2 : 0
    }
    if (root.current) {
      root.current.position.set(body.pos[0], body.pos[1] + dance * 0.16, body.pos[2])
      // Antes de empezar a jugar mira a cámara, que para eso lleva la máscara.
      if (!playing) body.facing = 0
      root.current.rotation.y = body.facing + (dance ? Math.sin(t * 4) * 0.5 : 0)
    }
  })

  const hoodie = <meshStandardMaterial color={HOODIE} roughness={0.85} emissive={HOODIE} emissiveIntensity={0.25} />
  const hood = <meshStandardMaterial color={HOOD} roughness={0.9} emissive={HOOD} emissiveIntensity={0.25} />
  // Contorno naranja como el del avatar: una copia algo mayor vista por dentro.
  const outline = <meshBasicMaterial color={GLOW} side={THREE.BackSide} toneMapped={false} />
  const dark = <meshStandardMaterial color={DARK} roughness={0.8} />

  return (
    <>
      <mesh ref={puff} rotation-x={-Math.PI / 2} material={puffMaterial}>
        <planeGeometry args={[1.9, 1.9]} />
      </mesh>
      <group ref={root} scale={1.15}>
        {/* Pivote de la voltereta, a la altura del pecho */}
        <group ref={flip} position-y={0.45}>
          <group ref={squash} position-y={-0.45}>
            {/* Piernas: el pivote está en la cadera */}
            <group ref={legL} position={[-0.11, 0.2, 0]}>
              <mesh position-y={-0.1} castShadow>
                <boxGeometry args={[0.14, 0.2, 0.16]} />
                {dark}
              </mesh>
            </group>
            <group ref={legR} position={[0.11, 0.2, 0]}>
              <mesh position-y={-0.1} castShadow>
                <boxGeometry args={[0.14, 0.2, 0.16]} />
                {dark}
              </mesh>
            </group>

            {/* Sudadera, con su bolsillo canguro */}
            <mesh position={[0, 0.35, 0]} castShadow>
              <boxGeometry args={[0.46, 0.3, 0.32]} />
              {hoodie}
            </mesh>
            <mesh position={[0, 0.35, 0]} scale={[1.09, 1.05, 1.12]}>
              <boxGeometry args={[0.46, 0.3, 0.32]} />
              {outline}
            </mesh>
            <mesh position={[0, 0.28, 0.165]}>
              <boxGeometry args={[0.26, 0.1, 0.02]} />
              {hood}
            </mesh>

            {/* Cabeza: capucha con pico y la máscara */}
            <group ref={head} position={[0, 0.5, 0]}>
              <mesh position={[0, 0.21, -0.01]} castShadow>
                <boxGeometry args={[0.52, 0.44, 0.46]} />
                {hood}
              </mesh>
              <mesh position={[0, 0.21, -0.01]} scale={1.07}>
                <boxGeometry args={[0.52, 0.44, 0.46]} />
                {outline}
              </mesh>
              <mesh position={[0, 0.46, -0.12]} rotation-x={-0.5} castShadow>
                <boxGeometry args={[0.24, 0.14, 0.24]} />
                {hood}
              </mesh>
              <mesh position={[0, 0.2, 0.222]}>
                <planeGeometry args={[0.38, 0.36]} />
                <meshBasicMaterial ref={faceMaterial} map={faces.normal} />
              </mesh>
            </group>

            {/* Brazos: el pivote está en el hombro */}
            <group ref={armL} position={[-0.285, 0.46, 0.02]}>
              <mesh position-y={-0.11} castShadow>
                <boxGeometry args={[0.1, 0.26, 0.12]} />
                {hoodie}
              </mesh>
            </group>
            <group ref={armR} position={[0.285, 0.46, 0.02]}>
              <mesh position-y={-0.11} castShadow>
                <boxGeometry args={[0.1, 0.26, 0.12]} />
                {hoodie}
              </mesh>
            </group>

            {/* Portátil: base y tapa con el rayo mirando al público */}
            <group ref={laptop} position={[0, 0.34, 0.29]}>
              <mesh castShadow>
                <boxGeometry args={[0.36, 0.03, 0.22]} />
                {dark}
              </mesh>
              <group position={[0, 0.015, 0.11]} rotation-x={0.22}>
                <mesh position-y={0.12}>
                  <boxGeometry args={[0.36, 0.24, 0.025]} />
                  <meshStandardMaterial color="#211d33" roughness={0.5} />
                </mesh>
                <mesh position={[0, 0.12, 0.014]}>
                  <planeGeometry args={[0.34, 0.22]} />
                  <meshBasicMaterial map={bolt} toneMapped={false} />
                </mesh>
              </group>
              <pointLight position={[0, 0.15, 0.25]} color="#ff9a2e" intensity={1.6} distance={2.6} decay={2} />
            </group>
          </group>
        </group>
        <Bubble text={bubble.text} shownAt={bubble.shownAt} />
      </group>
    </>
  )
}
