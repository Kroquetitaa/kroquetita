import { syncSeo } from '../seo/sync'
import { useEffect, useRef, useState } from 'react'
import { durationOf, linesOf, periodOf, profile, stages, type Lang } from '../data/career'
import { concepts } from '../data/concepts'
import { education } from '../data/education'
import { isAudioRunning, setMuted, sfx, unlockAudio } from '../game/audio'
import { setMusicIntensity } from '../game/music'
import { input, isTyping } from '../game/input'
import { install, useCanInstall } from '../game/install'
import { interact, scriptOf, talkerById } from '../game/talk'
import { MEDALS, QUEST_TEXT, ui, useLang, useUI } from '../i18n'
import { track } from '../net/track'
import { ACHIEVEMENTS, BOSS_HP, QUESTS, useGame, type Quality } from '../store'
import { world } from '../world/layout'
import { Minimap } from './Minimap'
import { PhotoPanel } from './PhotoPanel'
import { Scores } from './Scores'
import { Terminal } from './Terminal'
import { TrainGame } from './TrainGame'
import { CameraViews } from './CameraViews'
import { LoadingCity } from './LoadingCity'

const Icon = {
  camera: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </svg>
  ),
  restart: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 12a7 7 0 1 1-2.1-5" />
      <path d="M19 4v4h-4" />
    </svg>
  ),
  sound: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10v4h3l4 3.5v-11L7 10z" />
      <path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />
    </svg>
  ),
  muted: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10v4h3l4 3.5v-11L7 10z" />
      <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
    </svg>
  ),
  terminal: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 8l4 4-4 4M12 16h7" />
    </svg>
  ),
  medal: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3l4 6 4-6" />
      <circle cx="12" cy="15" r="5" />
      <path d="M12 13v4" />
    </svg>
  ),
  exit: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  map: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5l5-2 6 2 5-2v13l-5 2-6-2-5 2z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />
    </svg>
  ),
}

const QUALITY_CYCLE: Quality[] = ['auto', 'high', 'low']

/** Menú de la barra: lo que no cabe como botón (mapa, modo foto, récords, terminal, calidad…). */
function MoreMenu({ playing, onClose }: { playing: boolean; onClose: () => void }) {
  const t = useUI()
  const quality = useGame((s) => s.quality)
  const canInstall = useCanInstall()
  const { setPanel, setTerminal, setQuality, restart } = useGame.getState()
  const pick = (action: () => void) => () => {
    action()
    onClose()
  }
  // Se cierra al pulsar fuera (el botón que lo abre está en la propia barra y ya lo alterna).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.toolbar')) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      // Que el Esc cierre solo el menú, no la partida.
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])
  return (
    <div className="menu" role="menu" aria-label={t.moreOptions}>
      {playing && (
        <>
          <button type="button" role="menuitem" onClick={pick(() => setPanel('map'))}>
            {t.menuMap} <kbd>M</kbd>
          </button>
          <button type="button" role="menuitem" onClick={pick(() => setPanel('photo'))}>
            {t.menuPhoto} <kbd>P</kbd>
          </button>
        </>
      )}
      <button type="button" role="menuitem" onClick={pick(() => setPanel('scores'))}>
        {t.menuScores} <kbd>L</kbd>
      </button>
      <button type="button" role="menuitem" onClick={pick(() => useGame.getState().enterBrain())}>
        {t.stationPrompt.brain} <span aria-hidden="true">✧</span>
      </button>
      <button type="button" role="menuitem" onClick={pick(() => setTerminal(true))}>
        {t.menuTerminal} <kbd>T</kbd>
      </button>
      {playing && (
        <button type="button" role="menuitem" onClick={pick(restart)}>
          {t.menuRestart} <kbd>R</kbd>
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => setQuality(QUALITY_CYCLE[(QUALITY_CYCLE.indexOf(quality) + 1) % QUALITY_CYCLE.length])}
      >
        {t.menuQuality} <i>{t.qualityNames[quality]}</i>
      </button>
      {canInstall && (
        <button type="button" role="menuitem" onClick={pick(() => void install())}>
          {t.menuInstall}
        </button>
      )}
    </div>
  )
}

const GLYPHS = '01<>/{}[]#$%&*+=?ABCDEFKQRSXZ'

/**
 * Marca de la cabecera. Al pasar el ratón las letras se "descifran" de
 * izquierda a derecha, como en un terminal, mientras un barrido de color
 * recorre el texto.
 */
function Brand() {
  const full = `${profile.brand} by ${profile.name}`
  const [text, setText] = useState(full)
  const [active, setActive] = useState(false)
  const frame = useRef(0)

  const scramble = () => {
    cancelAnimationFrame(frame.current)
    setActive(true)
    const start = performance.now()
    const duration = 900
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      // Cada letra se fija cuando el barrido la alcanza; antes, baila.
      const settled = Math.floor(progress * (full.length + 4))
      let out = ''
      for (let i = 0; i < full.length; i++) {
        if (full[i] === ' ' || i < settled - 4) out += full[i]
        else out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      }
      setText(progress < 1 ? out : full)
      if (progress < 1) frame.current = requestAnimationFrame(tick)
      else setActive(false)
    }
    frame.current = requestAnimationFrame(tick)
  }

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const split = profile.brand.length
  return (
    <header className={`brand ${active ? 'is-active' : ''}`} onPointerEnter={scramble} aria-label={full}>
      <p aria-hidden="true">
        <span className="brand__name">{text.slice(0, split)}</span>
        <span className="brand__by">{text.slice(split, split + 4)}</span>
        <span className="brand__author">{text.slice(split + 4)}</span>
      </p>
    </header>
  )
}

/**
 * Ficha de la etapa activa: amplía, con texto nítido, la tarjeta que está
 * resaltada en el cristal. Avanza sola en orden cronológico y se puede
 * recorrer con las flechas, los puntos o pasando el ratón por el cristal.
 */
function StagePanel({ hidden }: { hidden: boolean }) {
  const index = useGame((s) => s.stage)
  const setStage = useGame((s) => s.setStage)
  const accent = useGame((s) => s.accents[s.stage])
  const lang = useLang()
  const t = useUI()
  const touring = useGame((s) => s.mode === 'tour')
  // En pantallas pequeñas el detalle va plegado: se abre con «Ver más».
  const [expanded, setExpanded] = useState(false)
  const stage = stages[index]

  useEffect(() => {
    if (hidden) return
    const timer = window.setInterval(
      () => {
        const game = useGame.getState()
        if (performance.now() <= game.stageHold) return
        // El recorrido acaba en la etapa actual: vuelta a la portada, con premio.
        if (game.mode === 'tour' && game.stage === stages.length - 1) {
          game.unlock('tour')
          game.exit()
          return
        }
        game.setStage(game.stage + 1)
      },
      touring ? 8000 : 7000,
    )
    return () => window.clearInterval(timer)
  }, [hidden, touring])

  return (
    <section
      className={`career ${hidden ? 'is-hidden' : ''} ${touring ? 'is-touring' : ''} ${expanded ? 'is-expanded' : ''}`}
      style={{ '--accent': accent } as React.CSSProperties}
      aria-hidden={hidden}
      aria-label={t.career}
    >
      <div className="career__body" key={index}>
        {stage.logo && <img src={stage.logo} alt="" />}
        <div>
          {stage.part && <p className="career__part">{stage.part[lang]}</p>}
          <h2>{stage.title}</h2>
          <p className="career__role">{stage.role}</p>
          <p className="career__period">
            {periodOf(stage, lang)} · {durationOf(stage, lang)}
          </p>
        </div>
      </div>
      {/* Lo que guarda la caja: tecnologías y, si los hay, logros */}
      <div className="career__more" key={`more-${index}`}>
        {stage.summary && <p className="career__summary">{stage.summary[lang]}</p>}
        <ul className="career__stack">
          {stage.stack.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {linesOf(stage, lang).length > 0 && (
          <ul className="career__lines">
            {linesOf(stage, lang).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="career__toggle"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          tabIndex={hidden ? -1 : 0}
        >
          {expanded ? t.less : t.more}
        </button>
      </div>
      <div className="career__nav">
        <button type="button" onClick={() => setStage(index - 1, true)} aria-label={t.previousStage} tabIndex={hidden ? -1 : 0}>
          ‹
        </button>
        <ol>
          {stages.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                className={i === index ? 'is-active' : ''}
                onClick={() => setStage(i, true)}
                aria-label={s.title}
                aria-current={i === index}
                tabIndex={hidden ? -1 : 0}
              />
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setStage(index + 1, true)} aria-label={t.nextStage} tabIndex={hidden ? -1 : 0}>
          ›
        </button>
        <span>
          {index + 1} / {stages.length}
        </span>
      </div>
    </section>
  )
}

const clock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`
}

/** Cronómetro de la contrarreloj: corre desde la primera moneda hasta la última. */
function RunTimer() {
  const runStart = useGame((s) => s.runStart)
  const runTime = useGame((s) => s.runTime)
  const [, tick] = useState(0)
  useEffect(() => {
    if (runStart === null || runTime !== null) return
    const timer = window.setInterval(() => tick((n) => n + 1), 100)
    return () => window.clearInterval(timer)
  }, [runStart, runTime])
  if (runStart === null) return null
  const seconds = runTime ?? (performance.now() - runStart) / 1000
  return <span className={`coins__time ${runTime !== null ? 'is-final' : ''}`}>{clock(seconds)}</span>
}

/** Ficha del título sobre cuyo libro está el jugador, en la biblioteca de formación. */
function StudyCard() {
  const index = useGame((s) => (s.mode === 'play' ? s.study : null))
  const lang = useLang()
  const t = useUI()
  if (index === null) return null
  const study = education[index]
  if (!study) return null
  return (
    <section
      className="career study"
      style={{ '--accent': study.color } as React.CSSProperties}
      aria-label={t.education}
      key={index}
    >
      <div className="career__body">
        <div>
          <p className="career__part">{study.kind[lang]}</p>
          <h2>{study.school}</h2>
          <p className="career__role">{study.title[lang]}</p>
          <p className="career__period">
            {study.period[lang]} · {index + 1} / {education.length}
          </p>
        </div>
      </div>
      {study.note && <p className="career__summary study__note">{study.note[lang]}</p>}
      <ul className="career__lines">
        {study.learned[lang].map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {study.appliedAt && (
        <p className="study__applied">
          {t.appliedAt} <b>{study.appliedAt}</b>
        </p>
      )}
    </section>
  )
}

/** Cartela de la instalación de la sala de conceptos en cuya plataforma está el jugador. */
function ConceptCard() {
  const index = useGame((s) => (s.mode === 'play' ? s.concept : null))
  const seen = useGame((s) => s.seenConcepts.length)
  const lang = useLang()
  const t = useUI()
  if (index === null) return null
  const concept = concepts[index]
  if (!concept) return null
  return (
    <section
      className="career study"
      style={{ '--accent': concept.color } as React.CSSProperties}
      aria-label={t.concepts}
      key={index}
    >
      <div className="career__body">
        <div>
          <p className="career__part">{concept.tag[lang]}</p>
          <h2>{concept.title[lang]}</h2>
        </div>
      </div>
      <p className="career__summary study__note">{concept.explain[lang]}</p>
      <p className="study__applied">
        {concept.action[lang]}{' '}
        <b>
          {seen} / {concepts.length}
        </b>
      </p>
    </section>
  )
}

/** Vidas del jefe final, mientras dura la pelea. */
function BossBar() {
  const active = useGame((s) => s.boss === 'active' && s.mode === 'play')
  const hp = useGame((s) => s.bossHp)
  const t = useUI()
  if (!active) return null
  return (
    <div className="boss" role="status">
      <span>{t.bossName}</span>
      <ol aria-label={`${hp} / ${BOSS_HP}`}>
        {Array.from({ length: BOSS_HP }, (_, i) => (
          <li key={i} className={i < hp ? 'is-on' : ''} />
        ))}
      </ol>
    </div>
  )
}

/** Lista de encargos pedidos por los personajes, con su avance. */
function QuestList() {
  const quests = useGame((s) => s.quests)
  const playing = useGame((s) => s.mode === 'play')
  const bugs = useGame((s) => s.bugs - s.questBase)
  const visited = useGame((s) => s.visited.length)
  // En el móvil la ficha de un libro o de un concepto ocupa este mismo sitio: la lista se aparta.
  const covered = useGame((s) => s.study !== null || s.concept !== null)
  const lang = useLang()
  const t = useUI()
  const listed = QUESTS.filter((id) => quests[id] !== 'idle')
  if (!playing || listed.length === 0) return null
  const progress = (id: (typeof QUESTS)[number]) => {
    if (quests[id] === 'done') return ''
    if (id === 'qa') return `${Math.min(3, Math.max(0, bugs))}/3`
    if (id === 'guide') return `${visited}/${world.blocks.length}`
    return ''
  }
  return (
    <section className={covered ? 'quests is-covered' : 'quests'} aria-label={t.quests}>
      <h2>{t.quests}</h2>
      <ul>
        {listed.map((id) => (
          <li key={id} className={quests[id] === 'done' ? 'is-done' : ''}>
            <i aria-hidden="true" />
            <span>{QUEST_TEXT[id].title[lang]}</span>
            <b>{progress(id)}</b>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Aviso de encargo nuevo o completado. */
function QuestToast() {
  const last = useGame((s) => s.lastQuest)
  const lang = useLang()
  const t = useUI()
  const [shown, setShown] = useState<typeof last>(null)

  useEffect(() => {
    if (!last) return
    setShown(last)
    if (last.kind === 'done') sfx.ding()
    const timer = window.setTimeout(() => setShown(null), 3600)
    return () => window.clearTimeout(timer)
  }, [last])

  if (!shown) return null
  return (
    <div className={`medal-toast quest-toast ${shown.kind === 'done' ? 'is-done' : ''}`} role="status" key={shown.at}>
      <p>
        <small>{shown.kind === 'done' ? t.questDone : t.questNew}</small>
        {QUEST_TEXT[shown.id].title[lang]}
      </p>
    </div>
  )
}

function Hero({ hidden }: { hidden: boolean }) {
  const lang = useLang()
  return (
    <section className={`hero ${hidden ? 'is-hidden' : ''}`} aria-hidden={hidden}>
      <h1>
        {profile.headline.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </h1>
      <p>
        {profile.intro[lang].map((part, i) =>
          typeof part === 'string' ? part : <strong key={i}>{part.strong}</strong>,
        )}
      </p>
      <nav className="hero__links">
        {profile.links.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noreferrer" tabIndex={hidden ? -1 : 0}>
            {link.label}
          </a>
        ))}
      </nav>
    </section>
  )
}

/** Joystick y botón de salto para pantallas táctiles. */
function TouchControls() {
  const t = useUI()
  const pad = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  useEffect(
    () => () => {
      input.stickX = 0
      input.stickZ = 0
    },
    [],
  )

  const move = (e: React.PointerEvent) => {
    const rect = pad.current!.getBoundingClientRect()
    const radius = rect.width / 2
    let x = (e.clientX - rect.left - radius) / radius
    let y = (e.clientY - rect.top - radius) / radius
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    input.stickX = Math.abs(x) > 0.15 ? x : 0
    input.stickZ = Math.abs(y) > 0.15 ? y : 0
    setKnob({ x, y })
  }
  const release = () => {
    input.stickX = 0
    input.stickZ = 0
    setKnob({ x: 0, y: 0 })
  }

  return (
    <div className="touch">
      <div
        ref={pad}
        className="touch__pad"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          move(e)
        }}
        onPointerMove={(e) => e.buttons > 0 && move(e)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <span style={{ transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` }} />
      </div>
      <button
        type="button"
        className="touch__jump"
        onPointerDown={() => {
          input.jumpQueued = true
        }}
      >
        {t.jump}
      </button>
    </div>
  )
}

/**
 * Hablar con los personajes: un aviso cuando hay alguien cerca y, durante la
 * conversación, un cuadro con lo que dice. Se avanza con E o tocándolo.
 */
function Dialogue() {
  const near = useGame((s) => s.near)
  const talk = useGame((s) => s.talk)
  const playing = useGame((s) => s.mode === 'play')
  const lang = useLang()
  const t = useUI()
  const [touch] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  if (!playing) return null

  if (talk) {
    const talker = talkerById(talk.id)
    if (!talker) return null
    const lines = scriptOf(talker)
    const last = talk.line >= lines.length - 1
    return (
      <button
        type="button"
        className="dialogue"
        style={{ '--accent': talker.accent } as React.CSSProperties}
        onClick={interact}
        aria-live="polite"
      >
        <span className="dialogue__name">{talker.name[lang]}</span>
        <span className="dialogue__text" key={talk.line}>
          {lines[talk.line]}
        </span>
        <span className="dialogue__next">
          {!touch && <kbd>E</kbd>}
          {last ? t.talkEnd : t.talkNext}
          <i>
            {talk.line + 1} / {lines.length}
          </i>
        </span>
      </button>
    )
  }

  const talker = talkerById(near)
  if (!talker) return null
  return (
    <button type="button" className="pill pill--action talk-prompt" onClick={interact}>
      {!touch && <kbd>E</kbd>}
      <span>{t.talkTo(talker.name[lang])}</span>
    </button>
  )
}

/** Aviso que salta al conseguir un logro. */
function MedalToast() {
  const last = useGame((s) => s.lastMedal)
  const lang = useLang()
  const t = useUI()
  const [shown, setShown] = useState<typeof last>(null)

  useEffect(() => {
    if (!last) return
    setShown(last)
    sfx.ding()
    const timer = window.setTimeout(() => setShown(null), 4200)
    return () => window.clearTimeout(timer)
  }, [last])

  if (!shown) return null
  return (
    <div className="medal-toast" role="status" key={shown.at}>
      <span className="medal-toast__icon">{Icon.medal}</span>
      <p>
        <small>{t.medalUnlocked}</small>
        {MEDALS[shown.id].title[lang]}
      </p>
    </div>
  )
}

/** Panel con todos los logros: los conseguidos y la pista de los que faltan. */
function MedalsPanel({ onClose }: { onClose: () => void }) {
  const medals = useGame((s) => s.medals)
  const lang = useLang()
  const t = useUI()
  return (
    <section className="medals" aria-label={t.medals}>
      <header>
        <h2>
          {t.medals}{' '}
          <span>
            {medals.length} / {ACHIEVEMENTS.length}
          </span>
        </h2>
        <button type="button" onClick={onClose} aria-label={t.close}>
          ×
        </button>
      </header>
      <ul>
        {ACHIEVEMENTS.map((id) => {
          const done = medals.includes(id)
          return (
            <li key={id} className={done ? 'is-done' : ''}>
              <span className="medals__icon">{Icon.medal}</span>
              <p>
                <strong>{done ? MEDALS[id].title[lang] : '???'}</strong>
                {MEDALS[id].hint[lang]}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Selector de idioma, arriba a la derecha. */
function LanguageSwitch() {
  const lang = useLang()
  const t = useUI()
  const setLang = useGame((s) => s.setLang)

  useEffect(() => {
    syncSeo(lang)
  }, [lang])

  const options: Array<{ code: Lang; label: string; name: string }> = [
    { code: 'es', label: 'ES', name: 'Español' },
    { code: 'en', label: 'EN', name: 'English' },
  ]
  return (
    <div className="lang" role="group" aria-label={t.language}>
      {options.map((option) => (
        <button
          key={option.code}
          type="button"
          className={lang === option.code ? 'is-active' : ''}
          aria-pressed={lang === option.code}
          title={option.name}
          onClick={() => setLang(option.code)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Overlay() {
  const t = useUI()
  const ready = useGame((s) => s.ready)
  const mode = useGame((s) => s.mode)
  const muted = useGame((s) => s.muted)
  const terminal = useGame((s) => s.terminal)
  const medalCount = useGame((s) => s.medals.length)
  const runTime = useGame((s) => s.runTime)
  const best = useGame((s) => s.best)
  const record = useGame((s) => s.record)
  const [showMedals, setShowMedals] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const panel = useGame((s) => s.panel)
  const station = useGame((s) => s.station)
  const near = useGame((s) => s.near)
  const talking = useGame((s) => s.talk !== null)
  const retro = useGame((s) => s.retro)
  const place = useGame((s) => s.place)
  const party = useGame((s) => s.party)
  const crash = useGame((s) => s.crash)
  const bugs = useGame((s) => s.bugs)
  const meetingUntil = useGame((s) => s.meetingUntil)
  const boostUntil = useGame((s) => s.boostUntil)
  // Reunión y café duran unos segundos: se vuelve a pintar cuando caducan.
  const [, tick] = useState(0)
  useEffect(() => {
    const end = Math.max(meetingUntil, boostUntil) - performance.now()
    if (end <= 0) return
    const timer = window.setTimeout(() => tick((n) => n + 1), end + 30)
    return () => window.clearTimeout(timer)
  }, [meetingUntil, boostUntil])
  // Sobrevivir a una reunión tiene premio.
  useEffect(() => {
    const wait = meetingUntil - performance.now()
    if (wait <= 0) return
    const timer = window.setTimeout(() => useGame.getState().unlock('meeting'), wait)
    return () => window.clearTimeout(timer)
  }, [meetingUntil])
  const inMeeting = performance.now() < meetingUntil
  const caffeinated = performance.now() < boostUntil
  const collected = useGame((s) => s.collected.length)
  const total = useGame((s) => s.total)
  const { play, tour, exit, toggleMuted, setPanel } = useGame.getState()

  const playing = mode === 'play'
  const touring = mode === 'tour'
  const won = collected === total
  const [touch] = useState(() => window.matchMedia('(pointer: coarse)').matches)

  useEffect(() => setMuted(muted), [muted])
  useEffect(() => setMusicIntensity(won ? 2 : playing ? 1 : 0), [playing, won])

  // El cartel de victoria se puede cerrar; vuelve a salir en la siguiente partida.
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    if (!won) setDismissed(false)
  }, [won])

  // El audio solo puede arrancar tras un gesto del usuario; hasta entonces se avisa.
  const [soundOn, setSoundOn] = useState(false)
  useEffect(() => {
    // Se reintenta en cada gesto hasta que el audio arranca de verdad.
    const unlock = () => {
      unlockAudio()
      window.setTimeout(() => {
        if (!isAudioRunning()) return
        setSoundOn(true)
        window.removeEventListener('pointerdown', unlock)
        window.removeEventListener('keydown', unlock)
      }, 150)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Sorpresa: el código Konami (↑↑↓↓←→←→BA) activa el modo fiesta.
  const [toast, setToast] = useState('')
  useEffect(() => {
    const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA']
    let progress = 0
    let timer = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTyping(e)) return
      progress = e.code === code[progress] ? progress + 1 : e.code === code[0] ? 1 : 0
      if (progress < code.length) return
      progress = 0
      const game = useGame.getState()
      game.toggleParty()
      sfx.secret()
      setToast(game.party ? ui().partyOff : ui().partyOn)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setToast(''), 3800)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
    }
  }, [])

  // El modo 8 bits se activa desde el terminal: se avisa aquí.
  const retroSeen = useRef(retro)
  useEffect(() => {
    if (retroSeen.current === retro) return
    retroSeen.current = retro
    setToast(retro ? ui().retroOn : ui().retroOff)
    const timer = window.setTimeout(() => setToast(''), 3800)
    return () => window.clearTimeout(timer)
  }, [retro])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      const game = useGame.getState()
      // Con un panel abierto (mapa, modo foto, minijuego, récords) las teclas son suyas: solo se atiende a cerrarlo.
      if (game.panel) {
        if (e.code === 'Escape' || (e.code === 'KeyM' && game.panel === 'map')) {
          e.preventDefault()
          game.setPanel(null)
        }
        return
      }
      // Dentro del cerebro manda su propia interfaz: aquí solo se atiende a salir.
      if (game.place === 'brain') {
        if (e.code === 'Escape') game.leaveBrain()
        return
      }
      if (e.code === 'KeyL') {
        game.setPanel('scores')
        return
      }
      if (e.code === 'KeyT') {
        e.preventDefault()
        if (!game.terminal) track('terminal')
        game.setTerminal(!game.terminal)
        return
      }
      if (game.mode !== 'play') {
        if (game.mode === 'intro') {
          if (e.code === 'KeyE' || e.code === 'Enter') {
            unlockAudio()
            game.play()
          }
          if (e.code === 'KeyR') {
            unlockAudio()
            game.tour()
          }
        } else if (e.code === 'Escape') game.exit()
        // En la portada y en el recorrido, las flechas pasan de etapa.
        if (e.code === 'ArrowRight') game.setStage(game.stage + 1, true)
        if (e.code === 'ArrowLeft') game.setStage(game.stage - 1, true)
        return
      }
      if (e.code === 'KeyE' || e.code === 'KeyF') {
        // Si no hay nadie con quien hablar pero sí una máquina al alcance, se usa la máquina.
        if (game.station && !game.near && !game.talk) game.useStation(game.station)
        else interact()
      }
      if (e.code === 'KeyM') game.setPanel('map')
      if (e.code === 'KeyP') game.setPanel('photo')
      if (e.code === 'Escape') game.exit()
      if (e.code === 'KeyC') game.toggleCamera()
      if (e.code === 'KeyR') game.restart()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const start = () => {
    unlockAudio()
    play()
  }
  const startTour = () => {
    unlockAudio()
    tour()
  }

  return (
    <div className={`overlay ${panel === 'photo' ? 'is-photo' : ''} ${place === 'brain' ? 'is-brain' : ''}`}>
      <div className={`curtain ${ready ? 'is-open' : ''}`} />

      <Brand />
      <LanguageSwitch />

      <Hero hidden={playing || touring} />
      <StagePanel hidden={!touring || !ready} />

      {!ready && <LoadingCity />}

      <div className={`coins ${playing ? 'is-visible' : ''} ${won ? 'is-complete' : ''}`} aria-live="polite">
        <span className="coins__icon" aria-hidden="true" />
        <span className="coins__count">
          {collected} / {total}
        </span>
        <span className="coins__label">{won ? t.allCoins : t.coins}</span>
        {bugs > 0 && (
          <span className="coins__bugs" title={t.bugs}>
            <i aria-hidden="true" />
            {bugs}
          </span>
        )}
        {caffeinated && <span className="coins__boost">{t.coffee}</span>}
        <RunTimer />
      </div>

      {inMeeting && playing && (
        <div className="meeting" role="alert">
          <p className="meeting__title">{t.meetingTitle}</p>
          <p>{t.meetingText}</p>
          <span className="meeting__bar" />
        </div>
      )}

      {won && playing && !dismissed && (
        <div className="win" role="status">
          <p className="win__title">{t.winTitle}</p>
          <p className="win__text">{t.winText(total)}</p>
          {runTime !== null && (
            <p className="win__time">
              {t.time} <b>{clock(runTime)}</b>
              {best !== null && (
                <>
                  {' · '}
                  {t.best} <b>{clock(best)}</b>
                </>
              )}
              {record && <em>{t.newRecord}</em>}
            </p>
          )}
          <div className="win__actions">
            <button type="button" onClick={() => useGame.getState().restart()}>
              {t.playAgain}
            </button>
            <button type="button" onClick={() => setPanel('scores')}>
              {t.menuScores}
            </button>
            <button type="button" className="is-quiet" onClick={() => setDismissed(true)}>
              {t.keepExploring}
            </button>
          </div>
        </div>
      )}

      {crash && (
        <>
          <div className="alarm" aria-hidden="true" />
          <div className="crash" role="alert" key={crash.id}>
            <div className="crash__bar">
              <span />
              <span />
              <span />
              <p>{t.crashTitle}</p>
            </div>
            <pre>
              {t.crashLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
              <span className="crash__error">[X] ERROR 500 · {crash.title}</span>
              <span className="crash__detail">    {crash.detail}</span>
              <span className="crash__rollback">{t.crashRollback}</span>
            </pre>
          </div>
        </>
      )}

      <Dialogue />
      {playing && station && !near && !talking && !panel && (
        <button type="button" className="pill pill--action talk-prompt" onClick={() => useGame.getState().useStation(station)}>
          {!touch && <kbd>E</kbd>}
          <span>{t.stationPrompt[station]}</span>
        </button>
      )}
      <Minimap />
      <PhotoPanel />
      <TrainGame />
      <Scores />
      <BossBar />
      <StudyCard />
      <ConceptCard />
      <QuestList />
      <QuestToast />
      <MedalToast />
      {showMedals && <MedalsPanel onClose={() => setShowMedals(false)} />}
      <Terminal />

      {toast && (
        <div className={`toast ${party ? 'is-party' : ''}`} role="status">
          {toast}
        </div>
      )}

      <div className="hints">
        {ready && mode === 'intro' && (
          <>
            <button type="button" className="pill pill--action" onClick={start}>
              <kbd>E</kbd>
              <span>{t.play}</span>
            </button>
            <button type="button" className="pill pill--action pill--quiet" onClick={startTour}>
              <kbd>R</kbd>
              <span>{t.tour}</span>
            </button>
          </>
        )}
        {touring && !touch && (
          <div className="pill">
            <kbd>← →</kbd>
            <span>{t.stages}</span>
            <kbd>Esc</kbd>
            <span>{t.leave}</span>
          </div>
        )}
        {playing && !touch && (
          <div className="pill">
            <kbd>WASD</kbd>
            <span>{t.move}</span>
            <kbd>Shift</kbd>
            <span>{t.run}</span>
            <kbd>{t.space}</kbd>
            <span>{t.jumpTwice}</span>
          </div>
        )}
      </div>

      {playing && touch && <TouchControls />}

      <div className="toolbar">
        {touring && (
          <button type="button" onClick={exit} title={t.exit} aria-label={t.exitLabel}>
            {Icon.exit}
          </button>
        )}
        {playing && (
          <>
            <button type="button" onClick={exit} title={t.exit} aria-label={t.exitLabel}>
              {Icon.exit}
            </button>
            <CameraViews />
            <button
              type="button"
              className={panel === 'map' ? 'is-on' : ''}
              onClick={() => setPanel(panel === 'map' ? null : 'map')}
              title={t.map}
              aria-label={t.mapLabel}
              aria-pressed={panel === 'map'}
            >
              {Icon.map}
            </button>
          </>
        )}
        {ready && !soundOn && <span className="toolbar__hint">{t.musicHint}</span>}
        {ready && (
          <button
            type="button"
            className={showMenu || terminal ? 'is-on' : ''}
            onClick={() => setShowMenu((open) => !open)}
            title={t.moreOptions}
            aria-label={t.moreOptions}
            aria-haspopup="menu"
            aria-expanded={showMenu}
          >
            {Icon.more}
          </button>
        )}
        {showMenu && <MoreMenu playing={playing} onClose={() => setShowMenu(false)} />}
        {ready && (
          <button
            type="button"
            className={`toolbar__medals ${showMedals ? 'is-on' : ''}`}
            onClick={() => setShowMedals((open) => !open)}
            title={t.medals}
            aria-label={t.medals}
            aria-pressed={showMedals}
          >
            {Icon.medal}
            {medalCount > 0 && <i>{medalCount}</i>}
          </button>
        )}
        {ready && (
          <button
            type="button"
            onClick={toggleMuted}
            title={muted ? t.unmute : t.mute}
            aria-label={muted ? t.unmute : t.mute}
            aria-pressed={muted}
          >
            {muted ? Icon.muted : Icon.sound}
          </button>
        )}
      </div>
    </div>
  )
}
