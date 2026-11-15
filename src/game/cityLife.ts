import { create } from 'zustand'
import { useGame, type Smashable } from '../store'

export const FACTORY_DURATION = 6200

/** UI and 3D machines share the same state; closing a panel doesn't stop a machine. */
export const useCityLife = create<{
  introDistrict: 'city' | 'plaza' | 'career' | 'library' | 'arcade' | 'lab' | 'factory' | 'hangar'
  previewDistrict: (district: 'city' | 'plaza' | 'career' | 'library' | 'arcade' | 'lab' | 'factory' | 'hangar') => void
  impacts: Partial<Record<Smashable, number>>
  hitExhibit: (id: Smashable) => void
  factoryStarted: number
  factoryQuestion: string
  factoryCount: number
  demoAfter: boolean[]
  demoSeen: string[]
  brainSelected: string | null
  brainVisited: string[]
  runFactory: (question: string) => void
  finishFactory: () => void
  setDemo: (index: number, after: boolean) => void
  selectNeuron: (id: string) => void
}>((set, get) => ({
  introDistrict: 'city',
  previewDistrict: introDistrict => set({ introDistrict }),
  impacts: {},
  hitExhibit: id => {
    set(s => ({ impacts: { ...s.impacts, [id]: performance.now() } }))
    useGame.getState().smash(id)
  },
  factoryStarted: 0, factoryQuestion: '', factoryCount: 0,
  demoAfter: [false, false, false], demoSeen: [], brainSelected: null, brainVisited: [],
  runFactory: question => {
    if (get().factoryStarted) return
    set({ factoryStarted: performance.now(), factoryQuestion: question })
  },
  finishFactory: () => {
    if (!get().factoryStarted) return
    set(s => ({ factoryStarted: 0, factoryCount: s.factoryCount + 1 }))
    useGame.getState().unlock('chef')
  },
  setDemo: (index, after) => {
    const demoAfter = [...get().demoAfter]
    demoAfter[index] = after
    const demoSeen = [...new Set([...get().demoSeen, `${index}:${after}`])]
    set({ demoAfter, demoSeen })
    if (demoSeen.length === 6) useGame.getState().unlock('pilot')
  },
  selectNeuron: id => {
    const brainVisited = [...new Set([...get().brainVisited, id])]
    set({ brainSelected: id, brainVisited })
    if (brainVisited.length >= 12) useGame.getState().unlock('insider')
  },
}))
