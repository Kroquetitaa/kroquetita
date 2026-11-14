import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { stages } from '../data/career'
import { sfx } from '../game/audio'
import { celebrationTime } from '../store'
import { world } from '../world/layout'
import { createBurstGeometry, createBurstMaterial, uTime } from './materials/shaders'

const PALETTE = [...new Set(stages.map((s) => s.color)), '#ffc933', '#ffffff']
const POOL = 8

/** Fuegos artificiales sobre el diorama al completar todas las monedas. */
export function Fireworks() {
  const geometry = useMemo(() => createBurstGeometry(90, 0.15), [])
  const materials = useMemo(
    () =>
      Array.from({ length: POOL }, () =>
        createBurstMaterial('#ffffff', { speed: 3.4, gravity: 1.3, life: 1.15, size: 44 }),
      ),
    [],
  )
  const state = useRef({ next: 0, launched: 0, lastTime: -1 })

  useFrame(({ gl, size }) => {
    const s = state.current
    const t = celebrationTime()
    if (t < 0 || t < s.lastTime) {
      // Sin victoria (o partida reiniciada): se reinicia la secuencia.
      s.next = 0
      s.launched = 0
    }
    s.lastTime = t
    if (t < 0) return

    const ratio = gl.getPixelRatio() * (size.height / 900) * 13
    if (t >= s.next) {
      const material = materials[s.launched % POOL]
      // Semilla determinista por lanzamiento: distinta posición y color cada vez.
      const a = Math.sin(s.launched * 12.9898) * 43758.5453
      const b = Math.sin(s.launched * 78.233) * 43758.5453
      const c = Math.sin(s.launched * 39.425) * 43758.5453
      const r1 = a - Math.floor(a)
      const r2 = b - Math.floor(b)
      const r3 = c - Math.floor(c)
      material.uniforms.uOrigin.value.set(-16 + r1 * 32, world.top * 0.6 + r2 * (world.top * 0.6 + 3), -9 + r3 * 9)
      material.uniforms.uColor.value.set(PALETTE[s.launched % PALETTE.length])
      material.uniforms.uStart.value = uTime.value
      material.uniforms.uPixelRatio.value = ratio
      sfx.firework()
      s.launched++
      // Traca inicial y luego un goteo tranquilo mientras dure la victoria.
      s.next = t + (t < 9 ? 0.24 + r1 * 0.2 : 1.1 + r2)
    }
  })

  return (
    <>
      {materials.map((material, i) => (
        <points key={i} geometry={geometry} material={material} frustumCulled={false} />
      ))}
    </>
  )
}
