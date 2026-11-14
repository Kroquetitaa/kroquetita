import { create } from 'zustand'
import { world } from './world/layout'

export type Mode = 'intro' | 'play'
export type CameraMode = 'wide' | 'chase'

interface GameState {
  /** Shaders compilados y escena lista para mostrarse */
  ready: boolean
  mode: Mode
  camera: CameraMode
  muted: boolean
  collected: number[]
  total: number
  /** performance.now() del momento en que se recogió la última moneda */
  wonAt: number | null
  /** Modo fiesta (código Konami): neones arcoíris y gravedad lunar */
  party: boolean
  /** Etapa resaltada en el cristal y ampliada en la ficha */
  stage: number
  /** Hasta cuándo (performance.now) se pausa el avance automático de etapas */
  stageHold: number
  /** Bichos aplastados */
  bugs: number
  /** Hasta cuándo (performance.now) dura la reunión en la que te ha metido el jefe de proyecto */
  meetingUntil: number
  /** Hasta cuándo (performance.now) dura el efecto del café */
  boostUntil: number
  /** Error de despliegue en pantalla (botón DEPLOY), o null */
  crash: { id: number; title: string; detail: string } | null
  /** Cambia en cada reinicio para recolocar al jugador */
  runId: number
  setReady: () => void
  play: () => void
  exit: () => void
  toggleCamera: () => void
  toggleMuted: () => void
  toggleParty: () => void
  setCrash: (crash: GameState['crash']) => void
  squashBug: () => void
  startMeeting: (seconds: number) => void
  drinkCoffee: (seconds: number) => void
  /** `manual`: lo eligió el usuario, así que el avance automático espera un rato */
  setStage: (index: number, manual?: boolean) => void
  collect: (id: number) => void
  restart: () => void
}

export const useGame = create<GameState>((set) => ({
  ready: false,
  mode: 'intro',
  camera: 'wide',
  muted: false,
  collected: [],
  total: world.coins.length,
  wonAt: null,
  party: false,
  bugs: 0,
  meetingUntil: 0,
  boostUntil: 0,
  stage: 0,
  stageHold: 0,
  crash: null,
  runId: 0,
  setReady: () => set({ ready: true }),
  play: () => set((s) => (s.ready ? { mode: 'play' } : s)),
  exit: () => set({ mode: 'intro' }),
  toggleCamera: () => set((s) => ({ camera: s.camera === 'wide' ? 'chase' : 'wide' })),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  toggleParty: () => set((s) => ({ party: !s.party })),
  setCrash: (crash) => set({ crash }),
  squashBug: () => set((s) => ({ bugs: s.bugs + 1 })),
  startMeeting: (seconds) => set({ meetingUntil: performance.now() + seconds * 1000 }),
  drinkCoffee: (seconds) => set({ boostUntil: performance.now() + seconds * 1000 }),
  setStage: (index, manual) =>
    set((s) => {
      const count = world.blocks.length
      return {
        stage: ((index % count) + count) % count,
        stageHold: manual ? performance.now() + 14000 : s.stageHold,
      }
    }),
  collect: (id) =>
    set((s) => {
      if (s.collected.includes(id)) return s
      const collected = [...s.collected, id]
      return { collected, wonAt: collected.length === s.total ? performance.now() : s.wonAt }
    }),
  restart: () => set((s) => ({ collected: [], wonAt: null, bugs: 0, runId: s.runId + 1 })),
}))

/** Segundos desde la victoria, o -1 si aún no se han recogido todas las monedas. */
export function celebrationTime() {
  const { wonAt } = useGame.getState()
  return wonAt === null ? -1 : (performance.now() - wonAt) / 1000
}
