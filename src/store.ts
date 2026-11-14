import { create } from 'zustand'
import { stages, type Lang } from './data/career'
import { world } from './world/layout'

/** 'tour': la cámara recorre sola las cajas, sin jugar */
export type Mode = 'intro' | 'play' | 'tour'
export type Weather = 'auto' | 'clear' | 'rain' | 'storm'
export type Daytime = 'auto' | 'night' | 'dawn'

/** Logros que se pueden desbloquear (los textos están en i18n) */
export const ACHIEVEMENTS = [
  'bug',
  'exterminator',
  'meeting',
  'deploy',
  'coffee',
  'summit',
  'coins',
  'party',
  'tour',
  'hired',
] as const
export type Achievement = (typeof ACHIEVEMENTS)[number]
export type CameraMode = 'wide' | 'chase'

const LANG_KEY = 'kroquetita:lang'
const MEDALS_KEY = 'kroquetita:medals'

/** Logros ya conseguidos en visitas anteriores. */
function initialMedals(): Achievement[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(MEDALS_KEY) ?? '[]')
    if (Array.isArray(saved)) return ACHIEVEMENTS.filter((id) => saved.includes(id))
  } catch {
    // Sin almacenamiento o con datos rotos: se empieza de cero.
  }
  return []
}

/** Idioma guardado; si no hay, el del navegador (por defecto, español). */
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'es' || saved === 'en') return saved
  } catch {
    // Sin almacenamiento (modo privado): se decide por el navegador.
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es'
}

interface GameState {
  /** Shaders compilados y escena lista para mostrarse */
  ready: boolean
  mode: Mode
  camera: CameraMode
  muted: boolean
  /** Idioma de la web */
  lang: Lang
  /** Clima y hora: 'auto' sigue el ciclo; el terminal puede forzarlos */
  weather: Weather
  daytime: Daytime
  /** Terminal de comandos abierto */
  terminal: boolean
  /** Logros conseguidos y el último (para el aviso en pantalla) */
  medals: Achievement[]
  lastMedal: { id: Achievement; at: number } | null
  /** Color de acento de cada etapa (el del logo, cuando ya se ha analizado) */
  accents: string[]
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
  /** Empieza el recorrido de cámara por las cajas */
  tour: () => void
  exit: () => void
  toggleCamera: () => void
  toggleMuted: () => void
  setLang: (lang: Lang) => void
  setWeather: (weather: Weather) => void
  setDaytime: (daytime: Daytime) => void
  setTerminal: (open: boolean) => void
  unlock: (id: Achievement) => void
  setAccent: (index: number, color: string) => void
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

export const useGame = create<GameState>((set, get) => ({
  ready: false,
  mode: 'intro',
  camera: 'wide',
  muted: false,
  lang: initialLang(),
  weather: 'auto',
  daytime: 'auto',
  terminal: false,
  medals: initialMedals(),
  lastMedal: null,
  accents: stages.map((stage) => stage.color),
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
  tour: () => set((s) => (s.ready ? { mode: 'tour', stage: 0, stageHold: 0 } : s)),
  exit: () => set({ mode: 'intro' }),
  toggleCamera: () => set((s) => ({ camera: s.camera === 'wide' ? 'chase' : 'wide' })),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // No pasa nada si no se puede guardar.
    }
    set({ lang })
  },
  setWeather: (weather) => set({ weather }),
  setDaytime: (daytime) => set({ daytime }),
  setTerminal: (terminal) => set({ terminal }),
  unlock: (id) =>
    set((s) => {
      if (s.medals.includes(id)) return s
      const medals = [...s.medals, id]
      try {
        localStorage.setItem(MEDALS_KEY, JSON.stringify(medals))
      } catch {
        // No pasa nada si no se puede guardar.
      }
      return { medals, lastMedal: { id, at: performance.now() } }
    }),
  setAccent: (index, color) =>
    set((s) => (s.accents[index] === color ? s : { accents: s.accents.map((c, i) => (i === index ? color : c)) })),
  toggleParty: () => {
    if (!get().party) get().unlock('party')
    set((s) => ({ party: !s.party }))
  },
  setCrash: (crash) => {
    if (crash) get().unlock('deploy')
    set({ crash })
  },
  squashBug: () => {
    set((s) => ({ bugs: s.bugs + 1 }))
    get().unlock('bug')
    if (get().bugs >= 5) get().unlock('exterminator')
  },
  startMeeting: (seconds) => set({ meetingUntil: performance.now() + seconds * 1000 }),
  drinkCoffee: (seconds) => {
    get().unlock('coffee')
    set({ boostUntil: performance.now() + seconds * 1000 })
  },
  setStage: (index, manual) =>
    set((s) => {
      const count = world.blocks.length
      return {
        stage: ((index % count) + count) % count,
        stageHold: manual ? performance.now() + 14000 : s.stageHold,
      }
    }),
  collect: (id) => {
    set((s) => {
      if (s.collected.includes(id)) return s
      const collected = [...s.collected, id]
      return { collected, wonAt: collected.length === s.total ? performance.now() : s.wonAt }
    })
    if (get().collected.length === get().total) get().unlock('coins')
  },
  restart: () => set((s) => ({ collected: [], wonAt: null, bugs: 0, runId: s.runId + 1 })),
}))

/** Segundos desde la victoria, o -1 si aún no se han recogido todas las monedas. */
export function celebrationTime() {
  const { wonAt } = useGame.getState()
  return wonAt === null ? -1 : (performance.now() - wonAt) / 1000
}
