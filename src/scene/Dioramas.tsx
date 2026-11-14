import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { LID, world, type Block } from '../world/layout'
import { introProgress } from './intro'
import { createGlowMaterial, createNeonMaterial, createRackMaterial, uParty } from './materials/shaders'

/**
 * Mini-escenarios: cada caja lleva encima un diorama animado de su
 * disciplina. Todos caben bajo el logo flotante (menos de 1,4 de alto en el
 * centro) y se dibujan respecto al centro de la tapa.
 */

const DARK = new THREE.MeshStandardMaterial({ color: '#15171d', roughness: 0.4, metalness: 0.8 })
const STEEL = new THREE.MeshStandardMaterial({ color: '#8d95a3', roughness: 0.3, metalness: 0.9 })
const WHITE = new THREE.MeshStandardMaterial({ color: '#f1f3f7', roughness: 0.5 })
const INK = new THREE.MeshBasicMaterial({ color: '#12141a' })
const SCREEN_GLOW: [number, number, number] = [1.25, 1.25, 1.25]

const UP = new THREE.Vector3(0, 1, 0)
const hdr = (color: string, gain = 2.2) => new THREE.Color(color).multiplyScalar(gain)

interface DioramaProps {
  block: Block
  accent: string
}

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext('2d')! }
}

function toTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** Ventana de navegador dibujada en un canvas: landing, panel de datos o editor. */
function createBrowserTexture(accent: string, variant: number) {
  const w = 256
  const h = 176
  const { canvas, ctx } = canvas2d(w, h)
  ctx.fillStyle = '#0c0f17'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#1c2130'
  ctx.fillRect(0, 0, w, 24)
  ;['#ff5f57', '#febc2e', '#28c840'].forEach((color, i) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(14 + i * 14, 12, 4, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.fillStyle = '#0c0f17'
  ctx.fillRect(66, 6, 150, 12)

  const line = (x: number, y: number, width: number, color = '#cfd6e4', height = 6) => {
    ctx.fillStyle = color
    ctx.fillRect(x, y, width, height)
  }
  if (variant % 3 === 0) {
    // Landing: cabecera de color, titular y tres tarjetas.
    const gradient = ctx.createLinearGradient(0, 34, w, 90)
    gradient.addColorStop(0, accent)
    gradient.addColorStop(1, '#141826')
    ctx.fillStyle = gradient
    ctx.fillRect(14, 34, 228, 58)
    line(26, 48, 110, '#ffffff', 9)
    line(26, 64, 150, 'rgba(255,255,255,0.7)')
    line(26, 76, 52, '#0c0f17', 9)
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#171c2a'
      ctx.fillRect(14 + i * 78, 102, 72, 60)
      line(22 + i * 78, 112, 30, accent, 16)
      line(22 + i * 78, 136, 54)
      line(22 + i * 78, 148, 38, '#6c7486')
    }
  } else if (variant % 3 === 1) {
    // Panel de datos: barra lateral y gráfica de barras.
    ctx.fillStyle = '#141926'
    ctx.fillRect(0, 24, 54, h - 24)
    for (let i = 0; i < 5; i++) line(10, 40 + i * 22, 34, i === 1 ? accent : '#4a5266')
    line(68, 38, 80, '#ffffff', 9)
    const heights = [38, 62, 46, 84, 70, 96, 58]
    heights.forEach((height, i) => {
      ctx.fillStyle = i === 5 ? '#ffffff' : accent
      ctx.fillRect(70 + i * 25, 160 - height, 16, height)
    })
    line(66, 161, 180, '#4a5266', 2)
  } else {
    // Editor: renglones de código con sangría.
    const colors = [accent, '#ff7ab8', '#cfd6e4', '#8bd5ff', '#6c7486']
    for (let i = 0; i < 11; i++) {
      line(8, 36 + i * 12, 8, '#3b4254')
      let x = 24 + ((i * 7) % 4) * 12
      for (let k = 0; k < 2 + ((i * 5) % 3); k++) {
        const width = 18 + ((i * 13 + k * 29) % 40)
        line(x, 36 + i * 12, width, colors[(i + k * 2) % colors.length])
        x += width + 6
      }
    }
  }
  return toTexture(canvas)
}

/** Feed de una app: tarjetas que se repiten en vertical (la textura se desplaza). */
function createFeedTexture(accent: string, variant: number) {
  const w = 128
  const h = 256
  const { canvas, ctx } = canvas2d(w, h)
  ctx.fillStyle = '#0b0e15'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 4; i++) {
    const y = i * 64
    ctx.fillStyle = '#161b28'
    ctx.fillRect(7, y + 5, 114, 54)
    ctx.fillStyle = (i + variant) % 2 ? accent : '#ffffff'
    ctx.beginPath()
    ctx.arc(21, y + 19, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#cfd6e4'
    ctx.fillRect(35, y + 13, 56, 5)
    ctx.fillStyle = '#6c7486'
    ctx.fillRect(35, y + 22, 36, 4)
    ctx.fillStyle = (i + variant) % 2 ? '#232a3c' : accent
    ctx.fillRect(13, y + 33, 102, 20)
  }
  const texture = toTexture(canvas)
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1, 0.8)
  return texture
}

/** Tubo recto entre dos puntos. */
function Pipe({
  from,
  to,
  radius = 0.06,
  material = STEEL,
}: {
  from: [number, number, number]
  to: [number, number, number]
  radius?: number
  material?: THREE.Material
}) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const direction = b.clone().sub(a)
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()),
      length: direction.length(),
    }
    // Los extremos son literales fijos en cada diorama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <mesh position={position} quaternion={quaternion} material={material}>
      <cylinderGeometry args={[radius, radius, length, 12]} />
    </mesh>
  )
}

function Window({ texture, size = [1.14, 0.78] }: { texture: THREE.Texture; size?: [number, number] }) {
  return (
    <>
      <mesh material={DARK}>
        <boxGeometry args={[size[0] + 0.06, size[1] + 0.06, 0.04]} />
      </mesh>
      <mesh position-z={0.022}>
        <planeGeometry args={size} />
        <meshBasicMaterial map={texture} color={SCREEN_GLOW} toneMapped={false} />
      </mesh>
    </>
  )
}

/** Frontend: ventanas de navegador flotando; una pasa al frente por turnos y el cursor hace clic. */
function Windows({ block, accent }: DioramaProps) {
  const withPhone = block.stage.role.includes('Mobile')
  const textures = useMemo(
    () => [0, 1, 2].map((i) => createBrowserTexture(accent, i + block.variant)),
    [accent, block.variant],
  )
  const feed = useMemo(() => createFeedTexture(accent, block.variant), [accent, block.variant])
  const neon = useMemo(() => createNeonMaterial(accent, 1.4), [accent])
  const windows = useRef<Array<THREE.Group | null>>([])
  const cursor = useRef<THREE.Group>(null)
  const click = useRef<THREE.Mesh>(null)
  const spread = Math.min(1, (block.width - 0.6) / 3.4)
  const home = useMemo<Array<[number, number, number]>>(
    () => [
      [-1.05 * spread, 0.78, -0.35],
      [1.05 * spread, 0.84, -0.45],
      [0, 0.6, 0.25],
    ],
    [spread],
  )

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime + block.index
    const focused = Math.floor(t / 2.6) % 3
    feed.offset.y -= delta * 0.12
    windows.current.forEach((group, i) => {
      if (!group) return
      const front = i === focused ? 1 : 0
      const k = 1 - Math.exp(-6 * delta)
      group.position.x = home[i][0]
      group.position.y += (home[i][1] + Math.sin(t * 1.3 + i * 2.1) * 0.05 - group.position.y) * k
      group.position.z += (home[i][2] + front * 0.3 - group.position.z) * k
      group.rotation.y = Math.sin(t * 0.7 + i * 1.7) * 0.22 - home[i][0] * 0.22
      const scale = group.scale.x + ((i === 2 ? 0.82 : 0.9) + front * 0.1 - group.scale.x) * k
      group.scale.setScalar(scale)
    })
    // El cursor ronda la ventana que está al frente y "hace clic" al llegar.
    const target = windows.current[focused]
    if (cursor.current && target) {
      const phase = (t / 2.6) % 1
      cursor.current.position.set(
        target.position.x + Math.cos(t * 1.9) * 0.22,
        target.position.y + Math.sin(t * 2.6) * 0.14 - 0.05,
        target.position.z + 0.12,
      )
      if (click.current) {
        const pulse = Math.max(0, 1 - Math.abs(phase - 0.5) * 9)
        click.current.scale.setScalar(0.4 + pulse * 1.4)
        click.current.visible = pulse > 0.02
      }
    }
  })

  return (
    <>
      {home.map((position, i) => (
        <group
          key={i}
          position={position}
          ref={(group) => {
            windows.current[i] = group
          }}
        >
          {withPhone && i === 2 ? (
            <>
              <RoundedBox args={[0.5, 0.92, 0.06]} radius={0.05} smoothness={3} material={DARK} />
              <mesh position-z={0.032}>
                <planeGeometry args={[0.42, 0.82]} />
                <meshBasicMaterial map={feed} color={SCREEN_GLOW} toneMapped={false} />
              </mesh>
            </>
          ) : (
            <Window texture={textures[i]} />
          )}
        </group>
      ))}
      <group ref={cursor}>
        <mesh rotation-z={0.55} material={WHITE}>
          <coneGeometry args={[0.05, 0.14, 3]} />
        </mesh>
        <mesh ref={click} material={neon} position-z={-0.02}>
          <ringGeometry args={[0.07, 0.09, 24]} />
        </mesh>
      </group>
      {/* Base luminosa con el símbolo </> */}
      <mesh position={[0, 0.04, 0.55]} material={neon}>
        <boxGeometry args={[Math.min(2.6, block.width - 1.2), 0.03, 0.04]} />
      </mesh>
    </>
  )
}

const ICON_COLORS = ['#ff5f57', '#28c840', '#febc2e', '#4c8df6']

/** Móvil: un teléfono gigante con el feed en marcha, iconos en órbita y notificaciones que saltan. */
function Phone({ block, accent }: DioramaProps) {
  const feed = useMemo(() => createFeedTexture(accent, block.variant), [accent, block.variant])
  const neon = useMemo(() => createNeonMaterial(accent, 1.5), [accent])
  const glow = useMemo(() => createGlowMaterial(accent, 0.9), [accent])
  const phone = useRef<THREE.Group>(null)
  const icons = useRef<Array<THREE.Mesh | null>>([])
  const bubbles = useRef<Array<THREE.Group | null>>([])

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime + block.index * 1.3
    feed.offset.y -= delta * (0.16 + uParty.value * 0.4)
    if (phone.current) {
      phone.current.rotation.y = Math.sin(t * 0.6) * 0.55
      phone.current.rotation.z = Math.sin(t * 0.9) * 0.05
      phone.current.position.y = 0.74 + Math.sin(t * 1.4) * 0.04
    }
    icons.current.forEach((icon, i) => {
      if (!icon) return
      const angle = t * 0.8 + (i / ICON_COLORS.length) * Math.PI * 2
      icon.position.set(Math.cos(angle) * 0.95, 0.5 + Math.sin(t * 1.7 + i) * 0.18 + i * 0.12, Math.sin(angle) * 0.55)
      icon.rotation.y = -angle
    })
    // Notificaciones: salen de la esquina del teléfono, suben y se desvanecen.
    bubbles.current.forEach((bubble, i) => {
      if (!bubble) return
      const life = (t * 0.45 + i / 3) % 1
      bubble.position.set(0.42 + i * 0.06, 1.02 + life * 0.42, 0.2)
      bubble.scale.setScalar(Math.sin(Math.min(1, life * 4) * Math.PI * 0.5) * (1 - Math.max(0, life - 0.7) / 0.3))
    })
  })

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={0.03} material={glow}>
        <planeGeometry args={[2.2, 1.7]} />
      </mesh>
      <group ref={phone} position={[0, 0.74, 0]}>
        <RoundedBox args={[0.74, 1.3, 0.09]} radius={0.07} smoothness={3} material={DARK} />
        <mesh position-z={0.047}>
          <planeGeometry args={[0.64, 1.18]} />
          <meshBasicMaterial map={feed} color={SCREEN_GLOW} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.55, 0.05]} material={INK}>
          <planeGeometry args={[0.2, 0.04]} />
        </mesh>
        {/* Cámara y botón lateral */}
        <mesh position={[0.2, 0.45, -0.05]} material={STEEL}>
          <cylinderGeometry args={[0.07, 0.07, 0.02, 16]} />
        </mesh>
        <mesh position={[0.38, 0.2, 0]} material={neon}>
          <boxGeometry args={[0.02, 0.2, 0.03]} />
        </mesh>
      </group>
      {ICON_COLORS.map((color, i) => (
        <RoundedBox
          key={color}
          ref={(mesh: THREE.Mesh | null) => {
            icons.current[i] = mesh
          }}
          args={[0.2, 0.2, 0.06]}
          radius={0.04}
          smoothness={2}
         
        >
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} roughness={0.4} />
        </RoundedBox>
      ))}
      {[0, 1, 2].map((i) => (
        <group
          key={i}
          ref={(group) => {
            bubbles.current[i] = group
          }}
        >
          <RoundedBox args={[0.36, 0.15, 0.04]} radius={0.06} smoothness={2} material={WHITE} />
          <mesh position={[-0.11, 0, 0.025]} material={neon}>
            <circleGeometry args={[0.04, 16]} />
          </mesh>
          <mesh position={[0.04, 0, 0.025]} material={INK}>
            <planeGeometry args={[0.16, 0.03]} />
          </mesh>
        </group>
      ))}
    </>
  )
}

const TEAM_COLORS = ['#4c8df6', '#3df2b0', '#ff7ab8', '#ffd60a']
const NOTE_COLORS = ['#ffd60a', '#ff7ab8', '#3df2b0', '#8bd5ff', '#ffd60a']

/** Tech Lead: reunión diaria en corro; cada muñequito habla por turnos y las tareas avanzan en el tablero. */
function Team({ block, accent }: DioramaProps) {
  const neon = useMemo(() => createNeonMaterial(accent, 1.5), [accent])
  const puppets = useRef<Array<THREE.Group | null>>([])
  const bubbles = useRef<Array<THREE.Group | null>>([])
  const board = useRef<THREE.Group>(null)
  const note = useRef<THREE.Mesh>(null)
  const seats = useMemo(
    () =>
      TEAM_COLORS.map((_, i) => {
        const angle = (i / TEAM_COLORS.length) * Math.PI * 2 + Math.PI / 4 + block.variant * 0.4
        return { x: Math.sin(angle) * 0.82, z: Math.cos(angle) * 0.62, facing: angle + Math.PI }
      }),
    [block.variant],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + block.index
    const turn = t / 1.6
    const speaker = Math.floor(turn) % TEAM_COLORS.length
    puppets.current.forEach((puppet, i) => {
      if (!puppet) return
      const talking = i === speaker
      puppet.position.y = talking ? Math.abs(Math.sin(t * 9)) * 0.07 : 0
      // Los demás asienten; el que habla gesticula girándose a los lados.
      puppet.rotation.x = talking ? 0 : Math.sin(t * 3 + i * 2) * 0.07
      puppet.rotation.y = seats[i].facing + (talking ? Math.sin(t * 5) * 0.3 : 0)
    })
    bubbles.current.forEach((bubble, i) => {
      if (!bubble) return
      const phase = turn % 1
      const on = i === speaker ? Math.min(1, phase * 6) * Math.min(1, (1 - phase) * 6) : 0
      bubble.scale.setScalar(Math.max(0.001, on))
    })
    if (board.current) board.current.rotation.y = Math.sin(t * 0.5) * 0.45
    // Una tarea salta de columna en columna: por hacer → en curso → hecho.
    if (note.current) {
      const step = (t / 1.6) % 3
      const column = Math.floor(step)
      const hop = Math.min(1, (step - column) * 3)
      const from = -0.22 + column * 0.22
      const to = column === 2 ? -0.22 : from + 0.22
      note.current.position.x = from + (to - from) * hop
      note.current.position.y = -0.02 + Math.sin(hop * Math.PI) * 0.12
    }
  })

  return (
    <>
      {/* Tablero kanban en el centro */}
      <mesh position={[0, 0.45, 0]} material={STEEL}>
        <cylinderGeometry args={[0.025, 0.025, 0.9, 8]} />
      </mesh>
      <group ref={board} position={[0, 1.02, 0]}>
        <mesh material={DARK}>
          <boxGeometry args={[0.78, 0.5, 0.04]} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side} rotation-y={side === 1 ? 0 : Math.PI}>
            {[-0.11, 0.11].map((x) => (
              <mesh key={x} position={[x, 0, 0.022]} material={INK}>
                <planeGeometry args={[0.012, 0.42]} />
              </mesh>
            ))}
            <mesh position={[0, 0.2, 0.023]} material={neon}>
              <planeGeometry args={[0.7, 0.03]} />
            </mesh>
            {NOTE_COLORS.map((color, i) => (
              <mesh key={i} position={[-0.22 + (i % 3) * 0.22, 0.1 - Math.floor(i / 3) * 0.13 - (i % 2) * 0.02, 0.024]}>
                <planeGeometry args={[0.13, 0.09]} />
                <meshBasicMaterial color={color} toneMapped={false} />
              </mesh>
            ))}
          </group>
        ))}
        <mesh ref={note} position={[-0.22, -0.02, 0.03]}>
          <planeGeometry args={[0.13, 0.09]} />
          <meshBasicMaterial color={hdr(accent, 1.8)} toneMapped={false} />
        </mesh>
      </group>

      {seats.map((seat, i) => {
        const lead = i === 0
        const scale = lead ? 1.18 : 1
        return (
          <group key={i} position={[seat.x, 0, seat.z]}>
            <group
              ref={(group) => {
                puppets.current[i] = group
              }}
              rotation-y={seat.facing}
              scale={scale}
            >
              <mesh position-y={0.17}>
                <boxGeometry args={[0.24, 0.26, 0.17]} />
                <meshStandardMaterial color={lead ? accent : TEAM_COLORS[i]} roughness={0.6} />
              </mesh>
              <mesh position-y={0.43} material={WHITE}>
                <boxGeometry args={[0.26, 0.24, 0.22]} />
              </mesh>
              {[-0.06, 0.06].map((x) => (
                <mesh key={x} position={[x, 0.45, 0.112]} material={INK}>
                  <planeGeometry args={[0.04, 0.06]} />
                </mesh>
              ))}
              {/* El que lidera lleva gorra y auriculares */}
              {lead && (
                <>
                  <mesh position={[0, 0.57, 0.02]} material={neon}>
                    <boxGeometry args={[0.28, 0.05, 0.3]} />
                  </mesh>
                  <mesh position={[0, 0.45, 0]} material={DARK}>
                    <boxGeometry args={[0.31, 0.1, 0.1]} />
                  </mesh>
                </>
              )}
            </group>
            <group
              position={[0, 0.82 * scale, 0]}
              ref={(group) => {
                bubbles.current[i] = group
              }}
            >
              <RoundedBox args={[0.3, 0.17, 0.03]} radius={0.06} smoothness={2} material={WHITE} />
              {[-0.07, 0, 0.07].map((x) => (
                <mesh key={x} position={[x, 0, 0.02]} material={INK}>
                  <circleGeometry args={[0.02, 10]} />
                </mesh>
              ))}
            </group>
          </group>
        )
      })}
    </>
  )
}

const CHAIN = 6
const LINK_GAP = 0.72

/** Blockchain: un bloque nuevo cae, se engancha a la cadena y todo avanza un puesto. */
function Chain({ block, accent }: DioramaProps) {
  const neon = useMemo(() => createNeonMaterial(accent, 1.6), [accent])
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.44, 0.44, 0.44)), [])
  const lines = useMemo(
    () => new THREE.LineBasicMaterial({ color: hdr(accent, 2.4), toneMapped: false }),
    [accent],
  )
  const cubes = useRef<Array<THREE.Group | null>>([])
  const links = useRef<Array<THREE.Group | null>>([])
  // Las cajas estrechas enseñan menos eslabones.
  const shown = Math.max(3, Math.min(CHAIN - 1, Math.floor((block.width - 0.5) / LINK_GAP)))

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * (1 + uParty.value) + block.index
    const p = (t / 1.9) % 1
    const offset = (shown - 1) / 2
    cubes.current.forEach((cube, k) => {
      if (!cube) return
      const slot = k - (CHAIN - 1 - shown)
      const newest = k === CHAIN - 1
      cube.visible = slot >= 0
      // El más antiguo se encoge al salir; el nuevo cae girando y rebota.
      const drop = newest ? Math.max(0, 1 - p / 0.42) : 0
      const bounce = newest && p > 0.42 ? Math.max(0, Math.sin((p - 0.42) * 16)) * Math.exp(-(p - 0.42) * 9) * 0.12 : 0
      cube.position.set((slot - offset - p) * LINK_GAP, 0.3 + drop * drop * 1.0 + bounce, 0)
      cube.rotation.y = drop * Math.PI
      cube.rotation.x = drop * 0.8
      const fade = slot === 0 ? 1 - p : newest ? Math.min(1, p * 6) : 1
      cube.scale.setScalar(Math.max(0.001, fade))
    })
    links.current.forEach((link, k) => {
      if (!link) return
      const slot = k - (CHAIN - 1 - shown)
      link.visible = slot >= 0
      link.position.set((slot + 0.5 - offset - p) * LINK_GAP, 0.3, 0)
      // El último eslabón se cierra cuando el bloque nuevo ya ha aterrizado.
      const grow = k === CHAIN - 2 ? Math.min(1, Math.max(0, (p - 0.45) * 4)) : slot === 0 ? 1 - p : 1
      link.scale.setScalar(Math.max(0.001, grow))
    })
  })

  return (
    <>
      {Array.from({ length: CHAIN }, (_, k) => (
        <group
          key={k}
          ref={(group) => {
            cubes.current[k] = group
          }}
        >
          <mesh material={DARK}>
            <boxGeometry args={[0.42, 0.42, 0.42]} />
          </mesh>
          <lineSegments geometry={edges} material={lines} />
          {/* El "hash" en la cara frontal */}
          {[0.09, 0, -0.09].map((y, i) => (
            <mesh key={y} position={[i === 1 ? -0.03 : 0, y, 0.213]} material={neon}>
              <planeGeometry args={[i === 1 ? 0.2 : 0.26, 0.035]} />
            </mesh>
          ))}
        </group>
      ))}
      {Array.from({ length: CHAIN - 1 }, (_, k) => (
        <group
          key={k}
          ref={(group) => {
            links.current[k] = group
          }}
        >
          <mesh position-x={-0.05} material={STEEL}>
            <torusGeometry args={[0.09, 0.024, 8, 20]} />
          </mesh>
          <mesh position-x={0.05} rotation-x={Math.PI / 2} material={STEEL}>
            <torusGeometry args={[0.09, 0.024, 8, 20]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.04, 0]} material={neon}>
        <boxGeometry args={[Math.min(3.6, block.width - 0.9), 0.03, 0.5]} />
      </mesh>
    </>
  )
}

const PIPE_PATH: Array<[number, number, number]> = [
  [-0.85, 0.3, 0],
  [-0.45, 0.3, 0],
  [-0.45, 1.02, 0],
  [0.45, 1.02, 0],
  [0.45, 0.3, 0],
  [0.8, 0.3, 0],
]
const PACKETS = 9

/** Datos: de las bases de datos al depósito por una tubería con válvula; los paquetes viajan por dentro. */
function Pipes({ block, accent }: DioramaProps) {
  const neon = useMemo(() => createNeonMaterial(accent, 1.6), [accent])
  const packets = useRef<THREE.InstancedMesh>(null)
  const valve = useRef<THREE.Group>(null)
  const level = useRef<THREE.Mesh>(null)
  const discs = useRef<Array<THREE.Mesh | null>>([])
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3() }), [])
  const reach = Math.min(1, (block.width - 0.9) / 2.9)
  const path = useMemo(() => {
    const points = PIPE_PATH.map(([x, y, z]) => new THREE.Vector3(x * reach, y, z))
    const curve = new THREE.CurvePath<THREE.Vector3>()
    for (let i = 0; i < points.length - 1; i++) curve.add(new THREE.LineCurve3(points[i], points[i + 1]))
    return { points, curve }
  }, [reach])

  useLayoutEffect(() => {
    const mesh = packets.current
    if (!mesh) return
    const color = hdr(accent, 2.6)
    for (let i = 0; i < PACKETS; i++) mesh.setColorAt(i, color)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [accent])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * (1 + uParty.value) + block.index
    const mesh = packets.current
    if (mesh) {
      for (let i = 0; i < PACKETS; i++) {
        const u = (t * 0.22 + i / PACKETS) % 1
        path.curve.getPointAt(u, scratch.p)
        const size = Math.min(1, u * 12, (1 - u) * 12)
        mesh.setMatrixAt(i, scratch.m.makeScale(size, size, size).setPosition(scratch.p))
      }
      mesh.instanceMatrix.needsUpdate = true
    }
    if (valve.current) valve.current.rotation.z = t * 1.6
    if (level.current) {
      const fill = 0.5 + Math.sin(t * 0.9) * 0.28
      level.current.scale.y = fill
      level.current.position.y = 0.08 + (0.92 * fill) / 2
    }
    discs.current.forEach((disc, i) => {
      if (disc) disc.position.y = 0.14 + i * 0.22 + Math.max(0, Math.sin(t * 2.2 - i * 0.9)) * 0.03
    })
  })

  const tankX = 1.12 * reach
  return (
    <>
      {/* Base de datos: tres discos apilados */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            discs.current[i] = mesh
          }}
          position={[-1.15 * reach, 0.14 + i * 0.22, 0]}
         
        >
          <cylinderGeometry args={[0.3, 0.3, 0.17, 24]} />
          <meshStandardMaterial color="#232732" roughness={0.35} metalness={0.85} emissive={accent} emissiveIntensity={0.18} />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-1.15 * reach, 0.14 + i * 0.22, 0]} rotation-x={Math.PI / 2} material={neon}>
          <torusGeometry args={[0.305, 0.012, 6, 32]} />
        </mesh>
      ))}

      {path.points.slice(0, -1).map((point, i) => (
        <Pipe key={i} from={point.toArray()} to={path.points[i + 1].toArray()} />
      ))}
      {path.points.slice(1, -1).map((point, i) => (
        <mesh key={i} position={point} material={STEEL}>
          <sphereGeometry args={[0.085, 12, 12]} />
        </mesh>
      ))}
      {/* Válvula de volante en el tramo alto */}
      <group ref={valve} position={[0, 1.02, 0.1]}>
        <mesh material={neon}>
          <torusGeometry args={[0.13, 0.022, 8, 24]} />
        </mesh>
        {[0, Math.PI / 2].map((angle) => (
          <mesh key={angle} rotation-z={angle} material={STEEL}>
            <boxGeometry args={[0.26, 0.025, 0.02]} />
          </mesh>
        ))}
      </group>

      {/* Depósito: el nivel sube y baja */}
      <mesh position={[tankX, 0.54, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 1, 28, 1, true]} />
        <meshStandardMaterial
          color="#9fc7ff"
          transparent
          opacity={0.22}
          roughness={0.05}
          metalness={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={level} position={[tankX, 0.3, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.92, 24]} />
        <meshBasicMaterial color={hdr(accent, 1.3)} transparent opacity={0.75} toneMapped={false} />
      </mesh>
      {[0.04, 1.04].map((y) => (
        <mesh key={y} position={[tankX, y, 0]} material={DARK}>
          <cylinderGeometry args={[0.36, 0.36, 0.07, 28]} />
        </mesh>
      ))}

      <instancedMesh ref={packets} args={[undefined, undefined, PACKETS]} frustumCulled={false}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  )
}

const SIGNALS = 10

/** IA: un núcleo neuronal enchufado al cerebro por un haz de luz por el que suben impulsos. */
function Cortex({ block, accent }: DioramaProps) {
  const neon = useMemo(() => createNeonMaterial(accent, 2.2), [accent])
  const ring = useMemo(() => createNeonMaterial(accent, 1.4), [accent])
  const glow = useMemo(() => createGlowMaterial(accent, 1.4), [accent])
  const core = useRef<THREE.Group>(null)
  const shell = useRef<THREE.Mesh>(null)
  const rings = useRef<Array<THREE.Group | null>>([])
  const signals = useRef<THREE.InstancedMesh>(null)
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3() }), [])

  // El haz sale del núcleo, rodea el logo por detrás y sube hasta la base del cerebro.
  const { curve, tube } = useMemo(() => {
    const from = new THREE.Vector3(0, 0.75, -0.3)
    const to = new THREE.Vector3(
      world.stem[0] - block.x,
      world.stem[1] - block.height,
      world.stem[2] - (block.z + LID.z),
    )
    const mid = new THREE.Vector3(-0.4, Math.max(4.5, to.y * 0.55), -1.6)
    const bezier = new THREE.QuadraticBezierCurve3(from, mid, to)
    return { curve: bezier, tube: new THREE.TubeGeometry(bezier, 48, 0.035, 8, false) }
  }, [block])

  useLayoutEffect(() => {
    const mesh = signals.current
    if (!mesh) return
    const color = hdr(accent, 3)
    for (let i = 0; i < SIGNALS; i++) mesh.setColorAt(i, color)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [accent])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (core.current) core.current.position.y = 0.72 + Math.sin(t * 1.5) * 0.05
    if (shell.current) {
      shell.current.rotation.y = t * 0.6
      shell.current.rotation.x = t * 0.35
    }
    rings.current.forEach((group, i) => {
      if (!group) return
      group.rotation.y = t * (0.9 + i * 0.35) * (i % 2 ? -1 : 1)
    })
    const mesh = signals.current
    if (mesh) {
      for (let i = 0; i < SIGNALS; i++) {
        const u = (t * (0.34 + uParty.value * 0.4) + i / SIGNALS) % 1
        curve.getPoint(u, scratch.p)
        const size = Math.sin(u * Math.PI) * (0.7 + 0.5 * Math.sin(i * 2.4))
        mesh.setMatrixAt(i, scratch.m.makeScale(size, size, size).setPosition(scratch.p))
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={0.03} material={glow}>
        <planeGeometry args={[3, 1.7]} />
      </mesh>
      <group ref={core} position={[0, 0.72, -0.3]}>
        <mesh>
          <sphereGeometry args={[0.2, 24, 24]} />
          <meshBasicMaterial color={hdr(accent, 2.6)} toneMapped={false} />
        </mesh>
        <mesh ref={shell}>
          <icosahedronGeometry args={[0.36, 1]} />
          <meshBasicMaterial color={hdr(accent, 1.5)} wireframe toneMapped={false} />
        </mesh>
        {/* Tres órbitas de neuronas */}
        {[0, 1, 2].map((i) => (
          <group key={i} rotation={[0.5 + i * 0.9, 0, i * 0.7]}>
            <group
              ref={(group) => {
                rings.current[i] = group
              }}
            >
              <mesh rotation-x={Math.PI / 2} material={ring}>
                <torusGeometry args={[0.52 + i * 0.1, 0.008, 6, 64]} />
              </mesh>
              {[0, 1, 2].map((k) => {
                const angle = (k / 3) * Math.PI * 2
                const radius = 0.52 + i * 0.1
                return (
                  <mesh key={k} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]} material={neon}>
                    <sphereGeometry args={[0.045, 10, 10]} />
                  </mesh>
                )
              })}
            </group>
          </group>
        ))}
      </group>
      <mesh geometry={tube} material={neon} frustumCulled={false} />
      <instancedMesh ref={signals} args={[undefined, undefined, SIGNALS]} frustumCulled={false}>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  )
}

const REQUESTS = 6

/** Full stack: una ventana (frontend) y un servidor (backend) que se pasan peticiones y respuestas. */
function Stack({ block, accent }: DioramaProps) {
  const texture = useMemo(() => createBrowserTexture(accent, block.variant), [accent, block.variant])
  const rack = useMemo(() => createRackMaterial(block.index * 3.1), [block.index])
  const neon = useMemo(() => createNeonMaterial(accent, 1.5), [accent])
  const browser = useRef<THREE.Group>(null)
  const requests = useRef<THREE.InstancedMesh>(null)
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), color: new THREE.Color() }), [])
  const reach = Math.min(1, (block.width - 0.9) / 2.8)
  const left = -0.85 * reach
  const right = 0.95 * reach

  useLayoutEffect(() => {
    const mesh = requests.current
    if (!mesh) return
    for (let i = 0; i < REQUESTS; i++) {
      // Las peticiones van del color de la etapa; las respuestas, en blanco.
      mesh.setColorAt(i, i % 2 ? scratch.color.setRGB(2.4, 2.4, 2.4) : scratch.color.copy(hdr(accent, 2.6)))
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [accent, scratch])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * (1 + uParty.value) + block.index
    if (browser.current) {
      browser.current.position.y = 0.72 + Math.sin(t * 1.3) * 0.05
      browser.current.rotation.y = 0.3 + Math.sin(t * 0.7) * 0.12
    }
    const mesh = requests.current
    if (!mesh) return
    for (let i = 0; i < REQUESTS; i++) {
      const u = (t * 0.5 + i / REQUESTS) % 1
      const back = i % 2 === 1
      // Ida por arriba y vuelta por abajo, en dos arcos.
      const x = back ? right + (left - right) * u : left + (right - left) * u
      const y = 0.72 + Math.sin(u * Math.PI) * (back ? -0.32 : 0.42)
      const size = Math.sin(u * Math.PI)
      mesh.setMatrixAt(i, scratch.m.makeScale(size, size, size).setPosition(x, y, 0.15))
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <group ref={browser} position={[left - 0.15, 0.72, 0.05]} scale={0.86}>
        <Window texture={texture} />
      </group>
      {/* Servidor: armario con luces y una base de datos al lado */}
      <group position={[right + 0.2, 0, -0.1]}>
        <mesh position-y={0.6} material={DARK}>
          <boxGeometry args={[0.56, 1.2, 0.5]} />
        </mesh>
        <mesh position={[0, 0.6, 0.252]} material={rack}>
          <planeGeometry args={[0.46, 1.08]} />
        </mesh>
        <mesh position={[0, 1.22, 0]} material={neon}>
          <boxGeometry args={[0.58, 0.03, 0.52]} />
        </mesh>
      </group>
      <instancedMesh ref={requests} args={[undefined, undefined, REQUESTS]} frustumCulled={false}>
        <boxGeometry args={[0.11, 0.11, 0.11]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  )
}

const SCENES = {
  fullstack: Stack,
  frontend: Windows,
  mobile: Phone,
  lead: Team,
  blockchain: Chain,
  data: Pipes,
  ai: Cortex,
} as const

export function Diorama({ block, accent }: DioramaProps) {
  const root = useRef<THREE.Group>(null)
  const Scene = SCENES[block.stage.discipline]

  useFrame(() => {
    if (root.current) root.current.scale.setScalar(Math.max(0.001, introProgress(1.5 + block.index * 0.16, 0.9)))
  })

  return (
    <group ref={root}>
      <Scene block={block} accent={accent} />
    </group>
  )
}
