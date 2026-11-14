import { profile } from '../data/career'
import { talkers, type Talker, type TalkerId } from '../data/folk'
import { currentLang, tr } from '../i18n'
import { useGame, type Weather } from '../store'
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

/** Conversación que toca ahora con este personaje, en el idioma actual */
export function scriptOf(talker: Talker): string[] {
  const index = (visits[talker.id] ?? 0) % talker.scripts.length
  return talker.scripts[index][currentLang()]
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
  visits[talker.id] = (visits[talker.id] ?? 0) + 1
  game.markTalked(talker.id)
  sfx.ding()
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
