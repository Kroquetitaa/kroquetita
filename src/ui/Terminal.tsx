import { useEffect, useRef, useState } from 'react'
import { durationOf, periodOf, profile, stages, type Lang, type Stage } from '../data/career'
import { sfx } from '../game/audio'
import { body } from '../game/state'
import { MEDALS, useLang, useUI } from '../i18n'
import { ACHIEVEMENTS, useGame } from '../store'
import { world } from '../world/layout'

/**
 * Terminal de comandos: una consola de mentira para recorrer el portfolio
 * tecleando. `help` lista lo que hay; `cd <empresa>` teletransporta al
 * personaje a la azotea de esa caja.
 */

type Tone = 'in' | 'out' | 'ok' | 'error' | 'dim'
interface Line {
  text: string
  tone: Tone
  href?: string
}

const out = (text: string, tone: Tone = 'out'): Line => ({ text, tone })

/** «Plexus Tech» → «plexus-tech» (como se escribe en el terminal) */
const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
/** En pantallas estrechas las columnas no caben: cada dato va en su línea */
const narrow = () => window.innerWidth < 560
const compact = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

function findStage(query: string): number {
  const q = compact(query)
  if (!q) return -1
  const exact = stages.findIndex((s) => compact(s.title) === q)
  return exact >= 0 ? exact : stages.findIndex((s) => compact(s.title).startsWith(q))
}

const HELP: Record<Lang, Array<[string, string]>> = {
  es: [
    ['whoami', 'quién soy'],
    ['ls', 'lista de empresas'],
    ['cat cv', 'toda la trayectoria'],
    ['cat <empresa>', 'detalle de una etapa'],
    ['cd <empresa>', 'teletransporte a su caja'],
    ['skills', 'tecnologías'],
    ['contact', 'cómo escribirme'],
    ['play · tour · exit', 'jugar, recorrido, salir'],
    ['weather rain|storm|clear|auto', 'cambia el clima'],
    ['time dawn|night|auto', 'cambia la hora'],
    ['lang es|en', 'idioma'],
    ['medals', 'logros conseguidos'],
    ['clear', 'limpia la pantalla'],
  ],
  en: [
    ['whoami', 'who I am'],
    ['ls', 'list of companies'],
    ['cat cv', 'the whole career'],
    ['cat <company>', 'details of one stage'],
    ['cd <company>', 'teleport to its box'],
    ['skills', 'technologies'],
    ['contact', 'how to reach me'],
    ['play · tour · exit', 'play, tour, leave'],
    ['weather rain|storm|clear|auto', 'change the weather'],
    ['time dawn|night|auto', 'change the time of day'],
    ['lang es|en', 'language'],
    ['medals', 'achievements so far'],
    ['clear', 'clear the screen'],
  ],
}

const describe = (stage: Stage, lang: Lang): Line[] => [
  out(`${stage.title} — ${stage.role}`, 'ok'),
  out(`${periodOf(stage, lang)} · ${durationOf(stage, lang)}`),
  out(stage.stack.join(' · '), 'dim'),
  ...(stage.highlights?.[lang] ?? []).map((line) => out(`› ${line}`)),
]

/** Ejecuta un comando y devuelve lo que hay que imprimir (o 'clear'). */
function run(input: string, lang: Lang): Line[] | 'clear' {
  const es = lang === 'es'
  const game = useGame.getState()
  const [command = '', ...rest] = input.trim().split(/\s+/)
  const args = rest.join(' ')
  const name = command.toLowerCase()

  switch (name) {
    case '':
      return []
    case 'help':
    case 'ayuda':
    case '?':
      return HELP[lang].map(([usage, what]) => out(narrow() ? `${usage}
   ${what}` : `${usage.padEnd(30)} ${what}`))
    case 'whoami':
      return [out(`${profile.name} — ${profile.headline.join(' ')}`, 'ok')]
    case 'ls':
    case 'dir':
      return [out(stages.map((s) => `${slug(s.title)}/`).join('  ')), out('cv.txt  contact.txt', 'dim')]
    case 'cat':
    case 'info': {
      const target = args.replace(/\.txt$/, '').toLowerCase()
      if (target === 'cv') {
        return stages.map((s) =>
          out(
            narrow()
              ? `${s.title} · ${periodOf(s, lang)}
   ${s.role}`
              : `${periodOf(s, lang).padEnd(22)} ${s.role} @ ${s.title}`,
          ),
        )
      }
      if (target === 'contact' || target === 'contacto') return run('contact', lang)
      const index = findStage(args)
      if (index < 0) return [out(es ? `cat: ${args || '?'}: no existe. Prueba con ls` : `cat: ${args || '?'}: no such file. Try ls`, 'error')]
      game.setStage(index, true)
      return describe(stages[index], lang)
    }
    case 'cd':
    case 'goto':
    case 'tp': {
      const index = findStage(args)
      if (index < 0) return [out(es ? `cd: ${args || '?'}: no existe. Prueba con ls` : `cd: ${args || '?'}: no such directory. Try ls`, 'error')]
      const block = world.blocks[index]
      // Se aterriza en el centro de la azotea, lejos de los muelles.
      game.play()
      body.pos[0] = block.x
      body.pos[1] = block.height + 0.4
      body.pos[2] = block.z + 0.15
      body.vel[0] = body.vel[1] = body.vel[2] = 0
      body.ballistic = 0
      game.setStage(index, true)
      sfx.portal()
      return [out(es ? `Teletransportado a ${block.stage.title}.` : `Teleported to ${block.stage.title}.`, 'ok')]
    }
    case 'skills':
    case 'stack':
      return [out(profile.skills.join(' · '))]
    case 'contact':
    case 'contacto':
    case 'linkedin':
      return profile.links.map((link) => ({ text: `${link.label}: ${link.href}`, tone: 'ok' as Tone, href: link.href }))
    case 'play':
    case 'jugar':
      game.play()
      return [out(es ? 'A jugar. WASD para moverte, espacio para saltar.' : 'Game on. WASD to move, space to jump.', 'ok')]
    case 'tour':
    case 'recorrido':
      game.tour()
      return [out(es ? 'Recorrido en marcha. Esc para salir.' : 'Tour started. Esc to leave.', 'ok')]
    case 'exit':
    case 'quit':
    case 'salir':
      game.exit()
      game.setTerminal(false)
      return []
    case 'weather':
    case 'clima': {
      const value = args.toLowerCase()
      if (value === 'rain' || value === 'storm' || value === 'clear' || value === 'auto') {
        game.setWeather(value)
        return [out(es ? `Clima: ${value}.` : `Weather: ${value}.`, 'ok')]
      }
      return [out('weather rain | storm | clear | auto', 'error')]
    }
    case 'rain':
    case 'storm':
      game.setWeather(name)
      return [out(es ? `Clima: ${name}.` : `Weather: ${name}.`, 'ok')]
    case 'time':
    case 'hora': {
      const value = args.toLowerCase()
      if (value === 'dawn' || value === 'night' || value === 'auto') {
        game.setDaytime(value)
        return [out(es ? `Hora: ${value}.` : `Time: ${value}.`, 'ok')]
      }
      return [out('time dawn | night | auto', 'error')]
    }
    case 'dawn':
    case 'night':
      game.setDaytime(name)
      return [out(es ? `Hora: ${name}.` : `Time: ${name}.`, 'ok')]
    case 'lang':
    case 'idioma': {
      const value = args.toLowerCase()
      if (value === 'es' || value === 'en') {
        game.setLang(value)
        return [out(value === 'es' ? 'Idioma: español.' : 'Language: English.', 'ok')]
      }
      return [out('lang es | en', 'error')]
    }
    case 'medals':
    case 'logros':
      return ACHIEVEMENTS.map((id) =>
        game.medals.includes(id)
          ? out(`[x] ${MEDALS[id].title[lang]}`, 'ok')
          : out(`[ ] ${MEDALS[id].hint[lang]}`, 'dim'),
      )
    case 'coins':
    case 'monedas':
      return [out(`${game.collected.length} / ${game.total}`)]
    case 'hire':
      return [out(es ? 'Permiso denegado. ¿Has probado con sudo?' : 'Permission denied. Have you tried sudo?', 'error')]
    case 'sudo': {
      if (/^hire\s+sergio/i.test(args)) {
        game.unlock('hired')
        if (!useGame.getState().party) game.toggleParty()
        sfx.win()
        return [
          out('[sudo] password: ********'),
          out(es ? 'Permiso concedido. Sergio empieza el lunes.' : 'Access granted. Sergio starts on Monday.', 'ok'),
          ...profile.links.map((link) => ({
            text: es ? `Siguiente paso → ${link.href}` : `Next step → ${link.href}`,
            tone: 'ok' as Tone,
            href: link.href,
          })),
        ]
      }
      if (/^rm\b/i.test(args)) return [out(es ? 'Buen intento. Producción ya se rompe sola.' : 'Nice try. Production breaks on its own.', 'error')]
      return [out(es ? 'sudo: prueba con «sudo hire sergio»' : 'sudo: try "sudo hire sergio"', 'dim')]
    }
    case 'rm':
      return [out(es ? 'Buen intento. Producción ya se rompe sola.' : 'Nice try. Production breaks on its own.', 'error')]
    case 'git':
      return [out(es ? 'git blame dice que has sido tú.' : 'git blame says it was you.', 'dim')]
    case 'deploy':
      return [out(es ? 'Para eso está el botón rojo. Es viernes, ánimo.' : "That's what the red button is for. It's Friday, go on.", 'dim')]
    case 'date':
      return [out(new Date().toLocaleString(es ? 'es-ES' : 'en-GB'))]
    case 'echo':
      return [out(args)]
    case 'clear':
    case 'cls':
      return 'clear'
    default:
      return [out(es ? `${command}: comando no encontrado. Escribe help` : `${command}: command not found. Type help`, 'error')]
  }
}

export function Terminal() {
  const open = useGame((s) => s.terminal)
  const setTerminal = useGame((s) => s.setTerminal)
  const lang = useLang()
  const t = useUI()
  const [lines, setLines] = useState<Line[]>([])
  const [value, setValue] = useState('')
  const history = useRef<string[]>([])
  const cursor = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const screen = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  useEffect(() => {
    if (screen.current) screen.current.scrollTop = screen.current.scrollHeight
  }, [lines, open])

  const submit = (command: string) => {
    const result = run(command, lang)
    if (command.trim()) {
      history.current.push(command)
      sfx.beep()
    }
    cursor.current = history.current.length
    setValue('')
    if (result === 'clear') setLines([])
    else setLines((prev) => [...prev, out(`$ ${command}`, 'in'), ...result].slice(-120))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      setTerminal(false)
      input.current?.blur()
    } else if (e.key === 'Enter') {
      submit(value)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const list = history.current
      cursor.current = Math.min(list.length, Math.max(0, cursor.current + (e.key === 'ArrowUp' ? -1 : 1)))
      setValue(list[cursor.current] ?? '')
    }
  }

  if (!open) return null
  return (
    <section className="terminal" aria-label="Terminal" onPointerDown={() => input.current?.focus()}>
      <div className="terminal__bar">
        <span />
        <span />
        <span />
        <p>sergio@kroquetita: ~</p>
        <button type="button" onClick={() => setTerminal(false)} aria-label={t.close}>
          ×
        </button>
      </div>
      <div className="terminal__screen" ref={screen}>
        {lines.length === 0 && <p className="is-dim">{t.terminalHint}</p>}
        {lines.map((line, i) => (
          <p key={i} className={`is-${line.tone}`}>
            {line.href ? (
              <a href={line.href} target="_blank" rel="noreferrer">
                {line.text}
              </a>
            ) : (
              line.text
            )}
          </p>
        ))}
        <label className="terminal__prompt">
          <span>$</span>
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onKeyUp={(e) => e.stopPropagation()}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="send"
            aria-label="Terminal"
          />
        </label>
      </div>
      {/* Atajos para no tener que teclear (sobre todo en el móvil) */}
      <div className="terminal__chips">
        {['help', 'whoami', 'cat cv', 'ls', 'sudo hire sergio'].map((command) => (
          <button key={command} type="button" onClick={() => submit(command)}>
            {command}
          </button>
        ))}
      </div>
    </section>
  )
}
