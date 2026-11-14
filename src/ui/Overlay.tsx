import { useEffect, useRef, useState } from 'react'
import { profile } from '../data/career'
import { setMuted, sfx, unlockAudio } from '../game/audio'
import { setMusicIntensity } from '../game/music'
import { input } from '../game/input'
import { useGame } from '../store'

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
  exit: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
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

function Loader() {
  return (
    <div className="loader" role="status">
      <span className="loader__ring" />
      <span className="loader__label">Compilando shaders…</span>
    </div>
  )
}

function Hero({ hidden }: { hidden: boolean }) {
  return (
    <section className={`hero ${hidden ? 'is-hidden' : ''}`} aria-hidden={hidden}>
      <h1>
        {profile.headline.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </h1>
      <p>
        {profile.intro.map((part, i) =>
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
        Saltar
      </button>
    </div>
  )
}

export function Overlay() {
  const ready = useGame((s) => s.ready)
  const mode = useGame((s) => s.mode)
  const camera = useGame((s) => s.camera)
  const muted = useGame((s) => s.muted)
  const party = useGame((s) => s.party)
  const collected = useGame((s) => s.collected.length)
  const total = useGame((s) => s.total)
  const { play, exit, toggleCamera, toggleMuted, restart } = useGame.getState()

  const playing = mode === 'play'
  const won = collected === total
  const [touch] = useState(() => window.matchMedia('(pointer: coarse)').matches)

  useEffect(() => setMuted(muted), [muted])
  useEffect(() => setMusicIntensity(won ? 2 : playing ? 1 : 0), [playing, won])

  // El cartel de victoria se puede cerrar; vuelve a salir en la siguiente partida.
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    if (!won) setDismissed(false)
  }, [won])

  // El audio solo puede arrancar tras un gesto del usuario: vale el primero.
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
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
      if (e.repeat) return
      progress = e.code === code[progress] ? progress + 1 : e.code === code[0] ? 1 : 0
      if (progress < code.length) return
      progress = 0
      const game = useGame.getState()
      game.toggleParty()
      sfx.secret()
      setToast(game.party ? 'Modo fiesta desactivado' : 'Modo fiesta: neones arcoíris y gravedad lunar')
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setToast(''), 3800)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const game = useGame.getState()
      if (game.mode === 'intro') {
        if (e.code === 'KeyE' || e.code === 'Enter') {
          unlockAudio()
          game.play()
        }
        return
      }
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

  return (
    <div className="overlay">
      <div className={`curtain ${ready ? 'is-open' : ''}`} />

      <Brand />

      <Hero hidden={playing} />

      {!ready && <Loader />}

      <div className={`coins ${playing ? 'is-visible' : ''} ${won ? 'is-complete' : ''}`} aria-live="polite">
        <span className="coins__icon" aria-hidden="true" />
        <span className="coins__count">
          {collected} / {total}
        </span>
        <span className="coins__label">{won ? '¡Todas!' : 'Monedas'}</span>
      </div>

      {won && playing && !dismissed && (
        <div className="win" role="status">
          <p className="win__title">¡Recorrido completado!</p>
          <p className="win__text">
            {total} de {total} monedas: has subido por toda mi trayectoria.
          </p>
          <div className="win__actions">
            <button type="button" onClick={restart}>
              Jugar otra vez
            </button>
            <button type="button" className="is-quiet" onClick={() => setDismissed(true)}>
              Seguir explorando
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${party ? 'is-party' : ''}`} role="status">
          {toast}
        </div>
      )}

      <div className="hints">
        {ready && !playing && (
          <button type="button" className="pill pill--action" onClick={start}>
            <kbd>E</kbd>
            <span>Jugar</span>
          </button>
        )}
        {playing && !touch && (
          <div className="pill">
            <kbd>WASD</kbd>
            <span>Mover</span>
            <kbd>Shift</kbd>
            <span>Correr</span>
            <kbd>Espacio</kbd>
            <span>Saltar ×2</span>
          </div>
        )}
      </div>

      {playing && touch && <TouchControls />}

      <div className="toolbar">
        {playing && (
          <>
            <button type="button" onClick={exit} title="Salir (Esc)" aria-label="Salir del juego">
              {Icon.exit}
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              title={`Cámara: ${camera === 'wide' ? 'amplia' : 'cercana'} (C)`}
              aria-label="Cambiar cámara"
            >
              {Icon.camera}
            </button>
            <button type="button" onClick={restart} title="Reiniciar (R)" aria-label="Reiniciar">
              {Icon.restart}
            </button>
          </>
        )}
        {ready && (
          <button
            type="button"
            onClick={toggleMuted}
            title={muted ? 'Activar sonido' : 'Silenciar'}
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            aria-pressed={muted}
          >
            {muted ? Icon.muted : Icon.sound}
          </button>
        )}
      </div>
    </div>
  )
}
