import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '../store'

/**
 * Carga y pintado por zonas.
 *
 * - `Deferred` monta su contenido cuando la portada ya está lista, por turnos:
 *   así la primera imagen no espera a salas que aún no se ven de cerca, y su
 *   código viaja en paquetes aparte (van con `lazy`).
 * - `Zone` deja de pintar una sala entera (también en sombras y reflejo)
 *   mientras queda fuera del encuadre o más allá de la niebla.
 */

interface Area {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

const frustum = new THREE.Frustum()
const matrix = new THREE.Matrix4()
const box = new THREE.Box3()

export function Zone({
  area,
  height = 45,
  margin = 6,
  children,
}: {
  area: Area
  /** Altura de lo más alto de la zona */
  height?: number
  /** Holgura alrededor del rectángulo (arcos, postes y adornos que sobresalen) */
  margin?: number
  children: ReactNode
}) {
  const group = useRef<THREE.Group>(null)
  // Cada zona comprueba en un momento distinto, cinco veces por segundo.
  const wait = useRef(Math.random() * 0.2)

  useFrame(({ camera, scene }, delta) => {
    wait.current -= delta
    if (wait.current > 0 || !group.current) return
    wait.current = 0.2
    box.min.set(area.minX - margin, -1, area.minZ - margin)
    box.max.set(area.maxX + margin, height, area.maxZ + margin)
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(matrix)
    const fog = scene.fog as THREE.Fog | null
    const reach = fog ? fog.far + 12 : 200
    group.current.visible = frustum.intersectsBox(box) && box.distanceToPoint(camera.position) < reach
  })

  return <group ref={group}>{children}</group>
}

/** Monta su contenido cuando la escena ya se ha enseñado; `order` escalona las zonas para repartir el trabajo. */
export function Deferred({ order = 0, children }: { order?: number; children: ReactNode }) {
  const ready = useGame((s) => s.ready)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (!ready || mounted) return
    const timer = window.setTimeout(() => setMounted(true), 250 + order * 300)
    return () => window.clearTimeout(timer)
  }, [ready, mounted, order])

  return mounted ? <Suspense fallback={null}>{children}</Suspense> : null
}
