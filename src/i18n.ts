import type { Lang, Localized } from './data/career'
import { useGame } from './store'

/**
 * Idiomas de la web. El idioma vive en el store (`lang`); aquí están los
 * textos de la interfaz y los atajos para leerlos dentro y fuera de React.
 */

/** Idioma actual, para código que no es un componente (bucles de juego, eventos). */
export const currentLang = (): Lang => useGame.getState().lang

/** Idioma actual como hook: el componente se repinta al cambiarlo. */
export const useLang = (): Lang => useGame((s) => s.lang)

/** Elige el texto del idioma actual (o del indicado). */
export const tr = <T>(text: Localized<T>, lang: Lang = currentLang()): T => text[lang]

const UI = {
  es: {
    loading: 'Compilando shaders…',
    language: 'Idioma',
    career: 'Trayectoria',
    previousStage: 'Etapa anterior',
    nextStage: 'Etapa siguiente',
    coins: 'Monedas',
    allCoins: '¡Todas!',
    bugs: 'Bichos aplastados',
    coffee: 'Café ×1,7',
    meetingTitle: 'Reunión de seguimiento',
    meetingText: 'Podía haber sido un email.',
    winTitle: '¡Recorrido completado!',
    winText: (total: number) => `${total} de ${total} monedas: has subido por toda mi trayectoria.`,
    playAgain: 'Jugar otra vez',
    keepExploring: 'Seguir explorando',
    crashTitle: 'produccion — bash',
    crashLines: [
      '$ ./deploy.sh --prod --viernes',
      '> Subiendo cambios ............ OK',
      '> Ejecutando migraciones ...... OK',
      '> Reiniciando servicios ....... ',
    ],
    crashRollback: '> Rollback automático en marcha…',
    partyOn: 'Modo fiesta: neones arcoíris y gravedad lunar',
    partyOff: 'Modo fiesta desactivado',
    play: 'Jugar',
    move: 'Mover',
    run: 'Correr',
    space: 'Espacio',
    jump: 'Saltar',
    jumpTwice: 'Saltar ×2',
    exit: 'Salir (Esc)',
    exitLabel: 'Salir del juego',
    camera: (wide: boolean) => `Cámara: ${wide ? 'amplia' : 'cercana'} (C)`,
    cameraLabel: 'Cambiar cámara',
    restart: 'Reiniciar (R)',
    restartLabel: 'Reiniciar',
    musicHint: 'Haz clic para activar la música',
    unmute: 'Activar sonido',
    music: (house: boolean) => `Música: ${house ? 'French house' : 'synthwave'} (M para cambiar)`,
    musicLabel: 'Cambiar de música',
    mute: 'Silenciar',
    today: 'HOY',
  },
  en: {
    loading: 'Compiling shaders…',
    language: 'Language',
    career: 'Career',
    previousStage: 'Previous stage',
    nextStage: 'Next stage',
    coins: 'Coins',
    allCoins: 'All of them!',
    bugs: 'Bugs squashed',
    coffee: 'Coffee ×1.7',
    meetingTitle: 'Status meeting',
    meetingText: 'This could have been an email.',
    winTitle: 'Run complete!',
    winText: (total: number) => `${total} of ${total} coins: you climbed my whole career.`,
    playAgain: 'Play again',
    keepExploring: 'Keep exploring',
    crashTitle: 'production — bash',
    crashLines: [
      '$ ./deploy.sh --prod --friday',
      '> Pushing changes ............. OK',
      '> Running migrations .......... OK',
      '> Restarting services ......... ',
    ],
    crashRollback: '> Automatic rollback in progress…',
    partyOn: 'Party mode: rainbow neon and moon gravity',
    partyOff: 'Party mode off',
    play: 'Play',
    move: 'Move',
    run: 'Run',
    space: 'Space',
    jump: 'Jump',
    jumpTwice: 'Jump ×2',
    exit: 'Exit (Esc)',
    exitLabel: 'Exit the game',
    camera: (wide: boolean) => `Camera: ${wide ? 'wide' : 'close'} (C)`,
    cameraLabel: 'Switch camera',
    restart: 'Restart (R)',
    restartLabel: 'Restart',
    musicHint: 'Click to turn the music on',
    unmute: 'Unmute',
    music: (house: boolean) => `Music: ${house ? 'French house' : 'synthwave'} (M to switch)`,
    musicLabel: 'Switch music',
    mute: 'Mute',
    today: 'TODAY',
  },
}

/** Textos de la interfaz en el idioma actual (hook). */
export const useUI = () => UI[useLang()]

/** Textos de la interfaz en el idioma actual, fuera de React. */
export const ui = () => UI[currentLang()]

/** Frases sueltas que dice el personaje en la escena. */
const LINES = {
  toSummit: { es: '¡A la cima!', en: 'To the top!' },
  yay: { es: '¡Yuju!', en: 'Woohoo!' },
  desk: {
    es: 'Mi sitio: tres pantallas y solo miro una.',
    en: 'My desk: three screens and I only look at one.',
  },
} satisfies Record<string, Localized>

export const say = (key: keyof typeof LINES) => LINES[key][currentLang()]
