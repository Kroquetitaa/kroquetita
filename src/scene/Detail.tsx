import { useLayoutEffect, useRef } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import type * as THREE from 'three'

/** Capa de los objetos pequeños: la cámara principal la ve; el reflejo del suelo y las sombras, no. */
export const DETAIL_LAYER = 1

/**
 * Detalle fino (mini-escenarios, línea de tiempo…): se dibuja en la vista
 * principal pero no en el reflejo del suelo ni en el mapa de sombras, donde
 * no se aprecia y costaría pintarlo tres veces por fotograma.
 */
export function Detail({ children, ...props }: ThreeElements['group']) {
  const root = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    root.current?.traverse((object) => object.layers.set(DETAIL_LAYER))
  })
  return (
    <group ref={root} {...props}>
      {children}
    </group>
  )
}
