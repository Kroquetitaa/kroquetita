import type { ConceptId } from '../data/concepts'
import { concepts } from '../data/concepts'
import type { AABB, Box } from './layout'
import { blenderAssembly } from './blenderAssembly'

type Vec3 = [number, number, number]
export interface Exhibit {
  id: ConceptId
  position: [number, number]
  base: [number, number]
  front: number
  pad: Box
}

/** The twelve native Blender pedestals; semantic order remains the portfolio's. */
const exhibits: Exhibit[] = concepts.map(concept => {
  const native = blenderAssembly.exhibits.find(e => e.id === concept.id)
  if (!native) throw new Error('Missing Blender concept: ' + concept.id)
  return {
    id: concept.id, position: [native.center[0], native.center[2]],
    base: [native.size[0], native.size[2]], front: native.center[2] + native.size[2] / 2,
    pad: { center: [native.pad[0], .02, native.pad[2]], size: [.8, .04, .65] },
  }
})
const area = { minX: -7, maxX: 7, minZ: 6, maxZ: 18 }
export const lab = {
  origin: [0, 0, 6] as Vec3, exhibits,
  colliders: blenderAssembly.colliders.filter(c => c.district === 'lab').map((c): AABB => ({
    min: [...c.min] as Vec3, max: [...c.max] as Vec3,
  })),
  maxZ: 18.5, area, pedestal: .64, lip: { depth: .12, height: .1 },
  arch: { position: [0, 0, 7.05] as Vec3, half: 6.45, height: 3.6, inscription: [0, 0, 7.1] as Vec3 },
  signpost: [-2, 0, 5.5] as Vec3,
  path: Array.from({ length: 7 }, (_, i): Vec3 => [0, 0, 5.5 + i * 1.6]),
}
