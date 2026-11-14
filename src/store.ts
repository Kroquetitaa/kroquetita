import { create } from 'zustand'
import { stages, type Lang } from './data/career'
import { concepts } from './data/concepts'
import { education } from './data/education'
import { track } from './net/track'
import { isCrawler, langOfPath } from './seo/sync'
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
  'social',
  'errands',
  'boss',
  'speedrun',
  'graduate',
  'wrecker',
  'curious',
  'teammates',
  'trainer',
  'photographer',
  'retro',
] as const
export type Achievement = (typeof ACHIEVEMENTS)[number]
export type CameraMode = 'wide' | 'chase'

/** Paneles a pantalla completa: solo hay uno abierto a la vez y, mientras, el jugador no se mueve */
export type Panel = 'map' | 'photo' | 'train' | 'scores'
/** Calidad gráfica: 'auto' baja sola si el equipo no llega */
export type Quality = 'auto' | 'high' | 'low'
/** Compañeros de trabajo que hay en la plaza (los cinco dan una medalla) */
export const TEAMMATES = ['alex', 'dani', 'josete', 'cristian', 'pablo'] as const

/** Encargos que piden los personajes (los textos están en i18n) */
export const QUESTS = ['recruiter', 'guide', 'qa', 'sysadmin', 'intern', 'librarian'] as const
export type QuestId = (typeof QUESTS)[number]
export type QuestState = 'idle' | 'active' | 'done'

/** Cosas que se pueden romper en la sala de la derecha (los textos van en la propia escena) */
export const SMASHABLES = [
  'tests',
  'network',
  'gauss',
  'dice',
  'graph',
  'prs',
  'legacy',
  'pinata',
  'stack',
  'table',
  'overfit',
] as const
export type Smashable = (typeof SMASHABLES)[number]

/** Vidas del jefe final y tiempo (s) por debajo del cual la contrarreloj da medalla */
export const BOSS_HP = 3
export const SPEEDRUN_GOAL = 120

const LANG_KEY = 'kroquetita:lang'
const MEDALS_KEY = 'kroquetita:medals'
const BEST_KEY = 'kroquetita:best'
const QUALITY_KEY = 'kroquetita:quality'

function initialQuality(): Quality {
  try {
    const saved = localStorage.getItem(QUALITY_KEY)
    if (saved === 'high' || saved === 'low') return saved
  } catch {
    // Sin almacenamiento: automática.
  }
  return 'auto'
}

/** Mejor tiempo guardado de la contrarreloj, en segundos. */
function initialBest(): number | null {
  try {
    const saved = Number(localStorage.getItem(BEST_KEY))
    return Number.isFinite(saved) && saved > 0 ? saved : null
  } catch {
    return null
  }
}

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
  // La dirección manda: `/en/` es la versión inglesa. A los rastreadores se les enseña
  // siempre el idioma de la dirección, no el de su navegador.
  const fromPath = langOfPath()
  if (fromPath) return fromPath
  if (isCrawler()) return 'es'
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
  /** Avance de la carga inicial, 0..1 (solo sube) */
  progress: number
  /** Contrarreloj: cuándo se cogió la primera moneda, tiempo final (s), mejor marca y si se acaba de batir */
  runStart: number | null
  runTime: number | null
  best: number | null
  record: boolean
  /** En esta partida se han usado ayudas (viaje rápido, terminal, modo fiesta): no vale para la tabla de récords */
  assisted: boolean
  /** Panel abierto (mapa, modo foto, minijuego, récords) */
  panel: Panel | null
  /** Máquina del escenario que hay al alcance (tecla E), o null */
  station: 'train' | null
  /** Modo 8 bits y calidad gráfica elegida */
  retro: boolean
  quality: Quality
  /** Jefe final: aparece al llegar a la cima y se le vence saltándole encima */
  boss: 'none' | 'active' | 'defeated'
  bossHp: number
  /** Libro de la biblioteca (formación) sobre el que está el jugador, o null */
  study: number | null
  /** Ya se ha subido alguna vez al último libro */
  topBook: boolean
  /** Instalación de la sala de conceptos en cuya plataforma está el jugador, y las ya visitadas */
  concept: number | null
  seenConcepts: number[]
  /** Qué cosas de la sala de romper se han roto ya, y cuántas veces en total */
  smashed: Smashable[]
  smashCount: number
  /** Encargos de los personajes, y lo que hace falta para seguirlos */
  quests: Record<QuestId, QuestState>
  questBase: number
  visited: number[]
  summitReached: boolean
  lastQuest: { id: QuestId; kind: 'new' | 'done'; at: number } | null
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
  /** Personaje que hay al alcance para hablar, conversación en curso y con quién se ha hablado ya */
  near: string | null
  talk: { id: string; line: number } | null
  talked: string[]
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
  setPanel: (panel: Panel | null) => void
  setStation: (station: GameState['station']) => void
  toggleRetro: () => void
  setQuality: (quality: Quality) => void
  /** Marca la partida en curso como hecha con ayudas */
  assist: () => void
  setProgress: (value: number) => void
  setStudy: (index: number | null) => void
  setConcept: (index: number | null) => void
  /** Se ha roto algo en la sala de romper */
  smash: (id: Smashable) => void
  spawnBoss: () => void
  hitBoss: () => void
  startQuest: (id: QuestId) => void
  completeQuest: (id: QuestId) => void
  /** El jugador ha pisado la azotea de esa caja */
  visit: (index: number) => void
  reachSummit: () => void
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
  setNear: (id: string | null) => void
  setTalk: (talk: GameState['talk']) => void
  markTalked: (id: string) => void
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
  progress: 0,
  runStart: null,
  runTime: null,
  best: initialBest(),
  record: false,
  assisted: false,
  panel: null,
  station: null,
  retro: false,
  quality: initialQuality(),
  boss: 'none',
  bossHp: BOSS_HP,
  study: null,
  topBook: false,
  concept: null,
  seenConcepts: [],
  smashed: [],
  smashCount: 0,
  quests: { recruiter: 'idle', guide: 'idle', qa: 'idle', sysadmin: 'idle', intern: 'idle', librarian: 'idle' },
  questBase: 0,
  visited: [],
  summitReached: false,
  lastQuest: null,
  mode: 'intro',
  camera: 'wide',
  muted: false,
  lang: initialLang(),
  weather: 'auto',
  daytime: 'auto',
  terminal: false,
  near: null,
  talk: null,
  talked: [],
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
  setReady: () => set({ ready: true, progress: 1 }),
  setPanel: (panel) => {
    if (get().panel === panel) return
    set({ panel, talk: null })
    if (panel) track(`panel:${panel}`)
  },
  setStation: (station) => set((s) => (s.station === station ? s : { station })),
  toggleRetro: () => {
    if (!get().retro) {
      get().unlock('retro')
      track('retro')
    }
    set((s) => ({ retro: !s.retro }))
  },
  setQuality: (quality) => {
    try {
      if (quality === 'auto') localStorage.removeItem(QUALITY_KEY)
      else localStorage.setItem(QUALITY_KEY, quality)
    } catch {
      // No pasa nada si no se puede guardar.
    }
    set({ quality })
  },
  assist: () => set((s) => (s.assisted || s.runTime !== null ? s : { assisted: true })),
  setProgress: (value) => set((s) => (value > s.progress ? { progress: Math.min(1, value) } : s)),
  setStudy: (study) => {
    if (get().study === study) return
    set({ study })
    if (study === education.length - 1) {
      set({ topBook: true })
      get().completeQuest('librarian')
    }
  },
  setConcept: (concept) => {
    if (get().concept === concept) return
    set({ concept })
    if (concept === null || get().seenConcepts.includes(concept)) return
    set((s) => ({ seenConcepts: [...s.seenConcepts, concept] }))
    track(`concept:${concepts[concept]?.id ?? concept}`)
    if (get().seenConcepts.length >= concepts.length) get().unlock('curious')
  },
  smash: (id) => {
    if (!get().smashed.includes(id)) track(`smash:${id}`)
    set((s) => ({
      smashCount: s.smashCount + 1,
      smashed: s.smashed.includes(id) ? s.smashed : [...s.smashed, id],
    }))
    if (SMASHABLES.every((item) => get().smashed.includes(item))) get().unlock('wrecker')
  },
  spawnBoss: () => set((s) => (s.boss === 'none' ? { boss: 'active', bossHp: BOSS_HP } : s)),
  hitBoss: () => {
    const { boss, bossHp } = get()
    if (boss !== 'active') return
    if (bossHp > 1) set({ bossHp: bossHp - 1 })
    else {
      set({ bossHp: 0, boss: 'defeated' })
      track('boss')
      get().unlock('boss')
    }
  },
  startQuest: (id) => {
    if (get().quests[id] !== 'idle') return
    const s = get()
    set({ quests: { ...s.quests, [id]: 'active' }, lastQuest: { id, kind: 'new', at: performance.now() } })
    if (id === 'qa') set({ questBase: s.bugs })
    // Puede que ya esté hecho antes de que te lo pidan.
    if (id === 'recruiter' && s.summitReached) get().completeQuest(id)
    if (id === 'librarian' && s.topBook) get().completeQuest(id)
    if (id === 'guide' && s.visited.length >= world.blocks.length) get().completeQuest(id)
  },
  completeQuest: (id) => {
    const s = get()
    if (s.quests[id] !== 'active') return
    const quests = { ...s.quests, [id]: 'done' as const }
    set({ quests, lastQuest: { id, kind: 'done', at: performance.now() } })
    if (QUESTS.every((quest) => quests[quest] === 'done')) get().unlock('errands')
  },
  visit: (index) => {
    if (get().visited.includes(index)) return
    set((s) => ({ visited: [...s.visited, index] }))
    if (get().visited.length >= world.blocks.length) get().completeQuest('guide')
  },
  reachSummit: () => {
    if (!get().summitReached) {
      set({ summitReached: true })
      track('summit')
    }
    get().unlock('summit')
    get().completeQuest('recruiter')
    get().spawnBoss()
  },
  play: () => {
    if (!get().ready) return
    set({ mode: 'play' })
    track('play')
  },
  tour: () => {
    if (!get().ready) return
    set({ mode: 'tour', stage: 0, stageHold: 0, talk: null, near: null, panel: null })
    track('tour')
  },
  exit: () => set({ mode: 'intro', talk: null, near: null, panel: null, station: null }),
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
  setNear: (near) => set({ near }),
  setTalk: (talk) => set({ talk }),
  markTalked: (id) => {
    if (get().talked.includes(id)) return
    set((s) => ({ talked: [...s.talked, id] }))
    track(`talk:${id}`)
    if (TEAMMATES.every((mate) => get().talked.includes(mate))) get().unlock('teammates')
  },
  unlock: (id) =>
    set((s) => {
      if (s.medals.includes(id)) return s
      const medals = [...s.medals, id]
      try {
        localStorage.setItem(MEDALS_KEY, JSON.stringify(medals))
      } catch {
        // No pasa nada si no se puede guardar.
      }
      track(`medal:${id}`)
      return { medals, lastMedal: { id, at: performance.now() } }
    }),
  setAccent: (index, color) =>
    set((s) => (s.accents[index] === color ? s : { accents: s.accents.map((c, i) => (i === index ? color : c)) })),
  toggleParty: () => {
    if (!get().party) get().unlock('party')
    // Con gravedad lunar las monedas se cogen antes: esa partida no cuenta para la tabla.
    get().assist()
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
    if (get().bugs - get().questBase >= 3) get().completeQuest('qa')
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
    const before = get()
    if (before.collected.includes(id)) return
    const now = performance.now()
    const collected = [...before.collected, id]
    // La contrarreloj arranca con la primera moneda y para con la última.
    const runStart = before.runStart ?? now
    const done = collected.length === before.total
    set({ collected, runStart, wonAt: done ? now : before.wonAt })
    if (collected.length === 1) {
      track('coin')
      if (before.party) set({ assisted: true })
    }
    if (!done) return
    const runTime = (now - runStart) / 1000
    const record = before.best === null || runTime < before.best
    set({ runTime, record, best: record ? runTime : before.best })
    if (record) {
      try {
        localStorage.setItem(BEST_KEY, runTime.toFixed(2))
      } catch {
        // No pasa nada si no se puede guardar.
      }
    }
    track('coins')
    get().unlock('coins')
    if (runTime <= SPEEDRUN_GOAL) get().unlock('speedrun')
  },
  restart: () =>
    set((s) => ({
      collected: [],
      wonAt: null,
      bugs: 0,
      questBase: 0,
      runStart: null,
      runTime: null,
      record: false,
      assisted: false,
      boss: 'none',
      bossHp: BOSS_HP,
      runId: s.runId + 1,
    })),
}))

/** Segundos desde la victoria, o -1 si aún no se han recogido todas las monedas. */
export function celebrationTime() {
  const { wonAt } = useGame.getState()
  return wonAt === null ? -1 : (performance.now() - wonAt) / 1000
}
