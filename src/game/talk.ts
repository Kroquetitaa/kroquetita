import { profile } from '../data/career'
import { talkers, type Talker, type TalkerId } from '../data/folk'
import { currentLang, QUEST_TEXT, tr } from '../i18n'
import { useGame, type QuestId, type Weather } from '../store'
import { sfx } from './audio'
import { playerSay } from './events'

/**
 * Conversaciones con los personajes: `interact()` empieza a hablar con el que
 * esté cerca, pasa a la frase siguiente y, al terminar, hace lo que toque.
 */

/** Cuántas veces se ha hablado ya con cada uno (para rotar sus conversaciones) */
const visits: Partial<Record<TalkerId, number>> = {}

export const talkerById = (id: string | null | undefined): Talker | undefined =>
  talkers.find((talker) => talker.id === id)

/** Qué encargo da cada personaje (Joseba solo da ideas) */
const QUEST_OF: Partial<Record<TalkerId, QuestId>> = {
  recruiter: 'recruiter',
  guide: 'guide',
  qa: 'qa',
  sysadmin: 'sysadmin',
}
/** A quién se le ha oído ya dar las gracias por su encargo */
const thanked: Partial<Record<TalkerId, boolean>> = {}

/** ¿Toca que este personaje agradezca un encargo ya cumplido? */
function owesThanks(talker: Talker) {
  const quest = QUEST_OF[talker.id]
  return Boolean(quest && useGame.getState().quests[quest] === 'done' && !thanked[talker.id])
}

/** Conversación que toca ahora con este personaje, en el idioma actual */
export function scriptOf(talker: Talker): string[] {
  const lang = currentLang()
  const quest = QUEST_OF[talker.id]
  if (quest && owesThanks(talker)) return [QUEST_TEXT[quest].thanks[lang]]
  const visit = visits[talker.id] ?? 0
  const lines = talker.scripts[visit % talker.scripts.length][lang]
  // La primera vez, antes de despedirse, pide su encargo.
  if (quest && visit === 0) {
    const offer = QUEST_TEXT[quest].offer[lang]
    // La QA lo pide al final: su conversación es una pista que no conviene partir.
    return talker.id === 'qa' ? [...lines, offer] : [...lines.slice(0, -1), offer, lines[lines.length - 1]]
  }
  return lines
}

const WEATHER_CYCLE: Weather[] = ['rain', 'storm', 'clear', 'auto']
const WEATHER_NAMES: Record<Weather, { es: string; en: string }> = {
  rain: { es: 'Ahora llueve. Gracias, supongo.', en: 'Now it rains. Thanks, I guess.' },
  storm: { es: '¿Una tormenta? ¡Yo solo pasaba por aquí!', en: 'A storm? I was just passing by!' },
  clear: { es: 'Cielo despejado. Así sí.', en: 'Clear skies. Much better.' },
  auto: { es: 'El clima vuelve a ir a su aire.', en: 'The weather is back on autopilot.' },
}

/** Lo que pasa al acabar de hablar con cada uno */
function finish(talker: Talker) {
  const game = useGame.getState()
  const quest = QUEST_OF[talker.id]
  // Si solo ha dado las gracias, no hay más que hacer.
  if (owesThanks(talker)) {
    thanked[talker.id] = true
    sfx.ding()
    return
  }
  const first = (visits[talker.id] ?? 0) === 0
  visits[talker.id] = (visits[talker.id] ?? 0) + 1
  game.markTalked(talker.id)
  sfx.ding()
  if (quest && first) game.startQuest(quest)
  switch (talker.id) {
    case 'recruiter':
      window.open(profile.links[0].href, '_blank', 'noopener')
      break
    case 'guide':
      game.tour()
      break
    case 'sysadmin': {
      const next = WEATHER_CYCLE[(WEATHER_CYCLE.indexOf(game.weather) + 1) % WEATHER_CYCLE.length]
      game.setWeather(next)
      playerSay(tr(WEATHER_NAMES[next]))
      break
    }
    case 'joseba':
      // Su idea loca del día: un rato sin gravedad y con todo en arcoíris.
      if (!game.party) {
        game.toggleParty()
        window.setTimeout(() => {
          if (useGame.getState().party) useGame.getState().toggleParty()
        }, 12000)
      }
      playerSay(tr({ es: 'Joseba, ¿qué has tocado?', en: 'Joseba, what did you touch?' }))
      break
    case 'pochita':
      sfx.firework()
      playerSay(tr({ es: 'Con esos ánimos, me como el mundo.', en: 'With cheering like that, I can take on the world.' }))
      break
    default:
      break
  }
  if (talkers.every((t) => useGame.getState().talked.includes(t.id))) game.unlock('social')
}

/** Tecla E (o toque en el aviso): empezar a hablar o pasar a la frase siguiente. */
export function interact() {
  const game = useGame.getState()
  if (game.mode !== 'play') return
  const talker = talkerById(game.talk?.id ?? game.near)
  if (!talker) return
  if (!game.talk) {
    game.setTalk({ id: talker.id, line: 0 })
    sfx.beep()
    return
  }
  const next = game.talk.line + 1
  if (next < scriptOf(talker).length) {
    game.setTalk({ id: talker.id, line: next })
    sfx.beep()
    return
  }
  game.setTalk(null)
  finish(talker)
}
