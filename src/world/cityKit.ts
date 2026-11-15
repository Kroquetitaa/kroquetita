import type { AABB } from './layout'
import type { StationId } from '../store'
import { blenderAssembly } from './blenderAssembly'

/** District GLBs already carry their native world transform. */
export const districts = {
  factory: { position: [17, 0, 9] as [number, number, number], scale: 1 },
  hangar: { position: [-17, 0, 9] as [number, number, number], scale: 1 },
}
export const cityStations: { id: StationId; position: [number, number, number]; color: string; label: { es: string; en: string } }[] = [
  { id: 'factory', position: [17, .08, 13], color: '#ffb347', label: { es: 'FABRICAR', en: 'MAKE' } },
  ...(['load', 'agents', 'data'] as const).map((name, i) => {
    const hook = blenderAssembly.hooks[`Hook_Demo_${name}`]
    return { id: ('hangar-' + i) as StationId, position: [hook[0], .08, hook[2] + .4] as [number, number, number],
      color: ['#38bdf8', '#ff6a2b', '#a3e635'][i], label: { es: ['CARGA', 'AGENTES', 'DATOS'][i], en: ['LOAD', 'AGENTS', 'DATA'][i] } }
  }),
  { id: 'brain', position: [2.5, .08, -14], color: '#c4a5ff', label: { es: 'EL CEREBRO', en: 'THE BRAIN' } },
]

/** These volumes are already included in world.colliders. */
export const cityKitColliders: AABB[] = blenderAssembly.colliders
  .filter(c => c.district === 'factory' || c.district === 'hangar')
  .map(c => ({ min: [...c.min] as [number, number, number], max: [...c.max] as [number, number, number] }))
