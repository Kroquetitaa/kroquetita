import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { sfx } from '../game/audio'
import { body } from '../game/state'
import { introProgress } from './intro'
import { createGlowMaterial, uTime } from './materials/shaders'
import { loadImage, voxelize, type Crop, type VoxelLogoData } from './voxelize'

/** Lado mayor del logo en unidades de mundo y grosor de los vóxeles. */
const SIZE = 1.7
const DEPTH = 0.24

interface Uniforms {
  assemble: { value: number }
  burst: { value: number }
  hover: { value: number }
}

/**
 * Material estándar ampliado en el shader:
 * - los vóxeles llegan volando y se ensamblan (uAssemble),
 * - se separan como una explosión controlada al tocarlos (uBurst),
 * - una onda y un brillo diagonal recorren el logo,
 * - el color de cada vóxel emite luz, para que destaque en la oscuridad.
 */
function createVoxelMaterial(u: Uniforms) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.4 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    shader.uniforms.uAssemble = u.assemble
    shader.uniforms.uBurst = u.burst
    shader.uniforms.uHover = u.hover
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        uniform float uAssemble;
        uniform float uBurst;
        attribute vec3 aScatter;
        attribute float aDelay;
        varying float vShimmer;`,
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        float vt = clamp((uAssemble - aDelay) / 0.45, 0.0, 1.0);
        float ve = 1.0 - pow(1.0 - vt, 3.0);
        // Al explotar, cada cubo encoge un poco y gira sobre sí mismo.
        float spread = uBurst * (0.45 + aDelay * 1.8);
        float ca = cos(spread * 5.0);
        float sa = sin(spread * 5.0);
        vec3 local = transformed * mix(0.15, 1.0, ve) * (1.0 - min(0.5, spread * 0.35));
        local.xy = mat2(ca, -sa, sa, ca) * local.xy;
        vec4 mvPosition = vec4(local, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec3 away = normalize(aScatter + vec3(0.0, -2.0, 0.0));
        mvPosition.xyz += aScatter * (1.0 - ve) + away * spread;
        mvPosition.z += sin(uTime * 1.7 + mvPosition.x * 3.2 + mvPosition.y * 2.1) * 0.045 * ve;
        // Brillo diagonal que barre el logo cada pocos segundos.
        float band = fract((mvPosition.x * 0.6 + mvPosition.y) * 0.22 - uTime * 0.2);
        vShimmer = smoothstep(0.07, 0.0, abs(band - 0.5)) * ve;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uHover;
        varying float vShimmer;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * (0.5 + vShimmer * 1.5 + uHover * 0.45)
          + vec3(vShimmer * 0.3);`,
      )
  }
  return material
}

function Voxels({ data, index, uniforms }: { data: VoxelLogoData; index: number; uniforms: Uniforms }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const material = useMemo(() => createVoxelMaterial(uniforms), [uniforms])
  const cell = SIZE / Math.max(data.cols, data.rows)

  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    const scatter = new Float32Array(data.count * 3)
    const delay = new Float32Array(data.count)
    // Aleatorio determinista: misma animación en cada carga.
    let seed = 99 + index * 7919
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < data.count; i++) {
      const angle = rand() * Math.PI * 2
      const radius = 1.5 + rand() * 3.5
      scatter[i * 3] = Math.cos(angle) * radius
      scatter[i * 3 + 1] = 1 + rand() * 5
      scatter[i * 3 + 2] = Math.sin(angle) * radius
      // De abajo arriba, con algo de ruido.
      const y = data.cells[i * 2 + 1] / Math.max(1, data.rows) + 0.5
      delay[i] = Math.min(0.55, y * 0.4 + rand() * 0.15)
    }
    g.setAttribute('aScatter', new THREE.InstancedBufferAttribute(scatter, 3))
    g.setAttribute('aDelay', new THREE.InstancedBufferAttribute(delay, 1))
    return g
  }, [data, index])

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    for (let i = 0; i < data.count; i++) {
      // Relieve: los tonos claros sobresalen un poco más.
      const r = data.colors[i * 3]
      const g = data.colors[i * 3 + 1]
      const b = data.colors[i * 3 + 2]
      const lift = 1 + (0.2126 * r + 0.7152 * g + 0.0722 * b) * 0.5
      matrix.makeScale(cell, cell, DEPTH * lift)
      matrix.setPosition(data.cells[i * 2] * cell, data.cells[i * 2 + 1] * cell, 0)
      m.setMatrixAt(i, matrix)
      m.setColorAt(i, color.setRGB(r, g, b))
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [data, cell])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  const plate = data.plate
  const plateColor = useMemo(
    () => (plate ? new THREE.Color().setRGB(plate[0], plate[1], plate[2]) : null),
    [plate],
  )
  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[geometry, material, data.count]}
        castShadow
        frustumCulled={false}
        raycast={() => null}
      />
      {plateColor && (
        <mesh castShadow>
          <boxGeometry args={[data.cols * cell + 0.16, data.rows * cell + 0.16, DEPTH * 0.55]} />
          <meshStandardMaterial
            color={plateColor}
            emissive={plateColor}
            emissiveIntensity={0.35}
            roughness={0.4}
            metalness={0.3}
          />
        </mesh>
      )}
    </>
  )
}

/** Emblema de respaldo cuando no hay logo o no se pudo cargar. */
function Fallback({ color }: { color: string }) {
  return (
    <mesh castShadow>
      <icosahedronGeometry args={[0.62, 0]} />
      <meshPhysicalMaterial
        color={color}
        metalness={1}
        roughness={0.22}
        clearcoat={0.5}
        emissive={color}
        emissiveIntensity={0.25}
        flatShading
      />
    </mesh>
  )
}

interface Props {
  url?: string
  /** Recorte de la imagen para quedarse solo con el símbolo */
  crop?: Crop
  color: string
  index: number
  /** Se llama con el color dominante del logo cuando se conoce */
  onAccent?: (color: string) => void
}

const worldPosition = new THREE.Vector3()

/**
 * Logo de empresa construido con vóxeles a partir de su imagen. Es interactivo:
 * se abre al pasar el ratón, estalla y gira al hacer clic, y saluda con un
 * pulso cuando el jugador pasa cerca.
 */
export function VoxelLogo({ url, crop, color, index, onAccent }: Props) {
  const [data, setData] = useState<VoxelLogoData | 'error' | null>(url ? null : 'error')
  const sway = useRef<THREE.Group>(null)
  const uniforms = useMemo<Uniforms>(
    () => ({ assemble: { value: 0 }, burst: { value: 0 }, hover: { value: 0 } }),
    [],
  )
  const halo = useMemo(() => createGlowMaterial(color, 0.55), [color])
  // Muelle de la explosión, giro pendiente y estado de interacción.
  const motion = useRef({ burst: 0, velocity: 0, spin: 0, hovered: false, near: false })

  useEffect(() => {
    if (!url) return
    let alive = true
    loadImage(url).then((image) => {
      if (!alive) return
      const result = image === 'error' ? null : voxelize(image, crop)
      setData(result ?? 'error')
      if (result?.accent) onAccent?.(result.accent)
    })
    return () => {
      alive = false
    }
    // onAccent y crop son estables: solo se recalcula al cambiar la imagen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  useEffect(() => () => void (document.body.style.cursor = ''), [])

  const kick = (strength: number, spin: number) => {
    motion.current.velocity += strength
    motion.current.spin += spin
  }

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    motion.current.hovered = true
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    motion.current.hovered = false
    document.body.style.cursor = ''
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    kick(9, Math.PI * 2)
    sfx.hologram()
  }

  useFrame((state, delta) => {
    const g = sway.current
    if (!g) return
    const dt = Math.min(delta, 1 / 20)
    const m = motion.current
    const t = state.clock.elapsedTime

    // El jugador pasa cerca: el logo le saluda con un pulso.
    g.getWorldPosition(worldPosition)
    const dx = worldPosition.x - body.pos[0]
    const dy = worldPosition.y - (body.pos[1] + 0.5)
    const dz = worldPosition.z - body.pos[2]
    const near = dx * dx + dy * dy + dz * dz < 2.4 * 2.4
    if (near && !m.near) kick(5, Math.PI * 2)
    m.near = near

    // Muelle amortiguado hacia la apertura de reposo (algo abierto al pasar el ratón).
    const rest = m.hovered ? 0.16 : 0
    m.velocity += ((rest - m.burst) * 60 - m.velocity * 7) * dt
    m.burst = Math.max(0, m.burst + m.velocity * dt)
    m.spin *= Math.exp(-3.2 * dt)

    uniforms.assemble.value = introProgress(0.9 + index * 0.16, 1.9)
    uniforms.burst.value = m.burst
    uniforms.hover.value += ((m.hovered ? 1 : 0) - uniforms.hover.value) * (1 - Math.exp(-10 * dt))

    // Balanceo en vez de giro completo: el logo siempre se lee de frente.
    g.rotation.y = Math.sin(t * 0.55 + index * 1.3) * 0.55 + m.spin
    g.rotation.x = Math.sin(t * 0.4 + index) * 0.08
    g.position.y = Math.sin(t * 1.1 + index * 0.8) * 0.12
    g.scale.setScalar(1 + uniforms.hover.value * 0.12)
  })

  return (
    <group ref={sway}>
      {/* Halo de color tras el logo */}
      <mesh position-z={-0.35} material={halo}>
        <planeGeometry args={[3.4, 3.4]} />
      </mesh>
      {data === 'error' && <Fallback color={color} />}
      {data && data !== 'error' && <Voxels data={data} index={index} uniforms={uniforms} />}
      {/* Zona invisible que recibe el ratón (más barata que probar cada vóxel) */}
      <mesh onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
        <boxGeometry args={[SIZE + 0.3, SIZE + 0.3, 0.7]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
