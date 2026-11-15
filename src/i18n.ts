import type { Lang, Localized } from './data/career'
import { useGame, type Achievement, type QuestId } from './store'

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
    loading: ['Descargando el motor 3D…', 'Montando la escena…', 'Cargando los logos…', 'Compilando shaders…'],
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
    mute: 'Silenciar',
    today: 'HOY',
    tour: 'Recorrido',
    stages: 'Etapas',
    leave: 'Salir',
    terminal: 'Terminal (T)',
    terminalLabel: 'Abrir el terminal',
    terminalHint: 'Escribe help y pulsa Intro',
    medals: 'Logros',
    medalUnlocked: 'Logro desbloqueado',
    close: 'Cerrar',
    more: 'Ver más',
    talkTo: (name: string) => `Hablar con ${name}`,
    talkNext: 'Seguir',
    talkEnd: 'Vale',
    quests: 'Encargos',
    education: 'Formación',
    appliedAt: 'Aplicado en',
    concepts: 'Conceptos',
    questNew: 'Nuevo encargo',
    questDone: 'Encargo completado',
    bossName: 'Bug en producción',
    time: 'Tiempo',
    best: 'Mejor',
    newRecord: '¡Nuevo récord!',
    less: 'Ver menos',
    map: 'Mapa (M)',
    mapLabel: 'Abrir el mapa',
    moreOptions: 'Más opciones',
    menuMap: 'Mapa y viaje rápido',
    menuPhoto: 'Modo foto',
    menuScores: 'Tabla de récords',
    menuTerminal: 'Terminal',
    menuRestart: 'Reiniciar partida',
    menuInstall: 'Instalar como aplicación',
    menuQuality: 'Calidad gráfica',
    qualityNames: { auto: 'automática', high: 'alta', low: 'baja' },
    trainPrompt: 'Entrenar un modelo',
    retroOn: 'Modo 8 bits. Escribe retro otra vez para volver',
    retroOff: 'Modo 8 bits desactivado',
  },
  en: {
    loading: ['Downloading the 3D engine…', 'Setting up the scene…', 'Loading the logos…', 'Compiling shaders…'],
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
    mute: 'Mute',
    today: 'TODAY',
    tour: 'Tour',
    stages: 'Stages',
    leave: 'Exit',
    terminal: 'Terminal (T)',
    terminalLabel: 'Open the terminal',
    terminalHint: 'Type help and press Enter',
    medals: 'Achievements',
    medalUnlocked: 'Achievement unlocked',
    close: 'Close',
    more: 'Show more',
    talkTo: (name: string) => `Talk to ${name}`,
    talkNext: 'Next',
    talkEnd: 'OK',
    quests: 'Errands',
    education: 'Education',
    appliedAt: 'Applied at',
    concepts: 'Concepts',
    questNew: 'New errand',
    questDone: 'Errand complete',
    bossName: 'Bug in production',
    time: 'Time',
    best: 'Best',
    newRecord: 'New record!',
    less: 'Show less',
    map: 'Map (M)',
    mapLabel: 'Open the map',
    moreOptions: 'More options',
    menuMap: 'Map and fast travel',
    menuPhoto: 'Photo mode',
    menuScores: 'Leaderboard',
    menuTerminal: 'Terminal',
    menuRestart: 'Restart run',
    menuInstall: 'Install as an app',
    menuQuality: 'Graphics quality',
    qualityNames: { auto: 'automatic', high: 'high', low: 'low' },
    trainPrompt: 'Train a model',
    retroOn: '8-bit mode. Type retro again to go back',
    retroOff: '8-bit mode off',
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

/** Logros: título y pista de cómo se consiguen. */
export const MEDALS: Record<Achievement, { title: Localized; hint: Localized }> = {
  bug: {
    title: { es: 'Primer bicho', en: 'First bug' },
    hint: { es: 'Aplasta un bicho saltándole encima', en: 'Squash a bug by jumping on it' },
  },
  exterminator: {
    title: { es: 'Exterminador', en: 'Exterminator' },
    hint: { es: 'Aplasta cinco bichos', en: 'Squash five bugs' },
  },
  meeting: {
    title: { es: 'Superviviente', en: 'Survivor' },
    hint: { es: 'Sobrevive a una reunión', en: 'Survive a meeting' },
  },
  deploy: {
    title: { es: 'Deploy en viernes', en: 'Friday deploy' },
    hint: { es: 'Pulsa el botón que no debes', en: 'Press the button you should not press' },
  },
  coffee: {
    title: { es: 'Cafeinado', en: 'Caffeinated' },
    hint: { es: 'Tómate un café', en: 'Grab a coffee' },
  },
  summit: {
    title: { es: 'En la cima', en: 'At the top' },
    hint: { es: 'Llega a lo más alto', en: 'Reach the summit' },
  },
  coins: {
    title: { es: 'Trayectoria completa', en: 'Full career' },
    hint: { es: 'Recoge todas las monedas', en: 'Collect every coin' },
  },
  party: {
    title: { es: 'Modo fiesta', en: 'Party mode' },
    hint: { es: 'Un código clásico: ↑↑↓↓←→←→BA', en: 'A classic code: ↑↑↓↓←→←→BA' },
  },
  tour: {
    title: { es: 'Turista', en: 'Tourist' },
    hint: { es: 'Termina el recorrido', en: 'Finish the tour' },
  },
  social: {
    title: { es: 'Don de gentes', en: 'People person' },
    hint: { es: 'Habla con todos los personajes', en: 'Talk to every character' },
  },
  errands: {
    title: { es: 'Para todo', en: 'At your service' },
    hint: { es: 'Completa todos los encargos', en: 'Complete every errand' },
  },
  boss: {
    title: { es: 'Bug crítico resuelto', en: 'Critical bug fixed' },
    hint: { es: 'Vence al bug gigante que aparece al llegar a la cima', en: 'Beat the giant bug that shows up at the summit' },
  },
  speedrun: {
    title: { es: 'Velocista', en: 'Speedrunner' },
    hint: { es: 'Recoge todas las monedas en menos de dos minutos', en: 'Collect every coin in under two minutes' },
  },
  graduate: {
    title: { es: 'Promoción 2029', en: 'Class of 2029' },
    hint: { es: 'Sube hasta el último libro de la biblioteca', en: 'Climb to the last book in the library' },
  },
  wrecker: {
    title: { es: 'Lo rompo todo', en: 'Break everything' },
    hint: { es: 'Rompe cada cosa de la sala de romper', en: 'Break every item in the break room' },
  },
  curious: {
    title: { es: 'Curiosidad infinita', en: 'Endlessly curious' },
    hint: { es: 'Prueba todas las instalaciones de la sala de conceptos', en: 'Try every exhibit in the concepts room' },
  },
  teammates: {
    title: { es: 'Buen compañero', en: 'Team player' },
    hint: { es: 'Habla con todo el equipo', en: 'Talk to the whole team' },
  },
  trainer: {
    title: { es: 'Ni corto ni sobreajustado', en: 'Neither under nor overfit' },
    hint: { es: 'Supera los tres niveles de «Entrena tu modelo»', en: 'Beat all three levels of "Train your model"' },
  },
  photographer: {
    title: { es: 'Fotógrafo', en: 'Photographer' },
    hint: { es: 'Descarga una foto hecha en el modo foto', en: 'Download a picture taken in photo mode' },
  },
  retro: {
    title: { es: 'Ocho bits', en: 'Eight bits' },
    hint: { es: 'Hay una palabra que lo pixela todo…', en: 'There is a word that pixelates everything…' },
  },
  hired: {
    title: { es: 'Contratado', en: 'Hired' },
    hint: { es: 'Hay un comando en el terminal…', en: 'There is a command in the terminal…' },
  },
}

/** Encargos: lo que se ve en la lista, cómo lo pide el personaje y cómo lo agradece. */
export const QUEST_TEXT: Record<QuestId, { title: Localized; offer: Localized; thanks: Localized }> = {
  recruiter: {
    title: { es: 'Llega a la cima', en: 'Reach the summit' },
    offer: {
      es: 'Un favor: sube hasta la cima. Quiero ver si lo de «Head of AI» va en serio.',
      en: 'A favour: climb to the summit. I want to see if "Head of AI" is for real.',
    },
    thanks: {
      es: '¡Has llegado arriba! Vale, me lo creo: contratado.',
      en: 'You made it to the top! Fine, I believe it: hired.',
    },
  },
  guide: {
    title: { es: 'Pisa todas las cajas', en: 'Step on every box' },
    offer: {
      es: 'Y un reto: pisa la azotea de todas las cajas. Sin saltarte ninguna.',
      en: 'And a challenge: step on the roof of every box. No skipping.',
    },
    thanks: {
      es: '¡Las has pisado todas! Te has ganado el título de guía suplente.',
      en: 'You stepped on all of them! You have earned the title of deputy guide.',
    },
  },
  qa: {
    title: { es: 'Aplasta 3 bichos', en: 'Squash 3 bugs' },
    offer: {
      es: 'Ya que estás: aplasta tres bichos por mí. Yo solo los reporto.',
      en: 'While you are at it: squash three bugs for me. I only report them.',
    },
    thanks: {
      es: 'Tres bichos menos. Cierro los tickets… y abro seis.',
      en: 'Three bugs down. Closing the tickets… and opening six.',
    },
  },
  sysadmin: {
    title: { es: 'Súbete al servidor de PROD', en: 'Climb on the PROD server' },
    offer: {
      es: 'Necesito que alguien se suba al servidor de PROD a mirar una cosa. Yo tengo vértigo.',
      en: 'I need someone to climb on the PROD server and check something. I get vertigo.',
    },
    thanks: {
      es: '¿Estaba encendido? Perfecto. Eso era todo.',
      en: 'Was it switched on? Perfect. That was all.',
    },
  },
  librarian: {
    title: { es: 'Sube al último libro', en: 'Climb to the last book' },
    offer: {
      es: 'Hazme un favor: sube hasta el último libro. Dicen que arriba hay un birrete, y yo tengo vértigo.',
      en: 'Do me a favour: climb to the last book. They say there is a graduation cap up there, and I get vertigo.',
    },
    thanks: {
      es: '¡Has llegado arriba! Promoción de 2029… si aprueba, claro.',
      en: 'You made it to the top! Class of 2029… if he passes, that is.',
    },
  },
  intern: {
    title: { es: 'Llévale un café al becario', en: 'Bring the intern a coffee' },
    offer: {
      es: '¿Me traes un café? A mí la máquina no me hace caso.',
      en: 'Could you bring me a coffee? The machine ignores me.',
    },
    thanks: {
      es: '¡Café! Ahora programo el doble de rápido. O sea, despacio.',
      en: 'Coffee! Now I code twice as fast. So, slowly.',
    },
  },
}
