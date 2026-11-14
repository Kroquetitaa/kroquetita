import { useEffect, useId, useRef, useState } from 'react'
import { useLang } from '../i18n'
import { fetchScores, submitScore, type ApiError, type Result, type Score, type Submitted } from '../net/api'
import { track } from '../net/track'
import { useGame } from '../store'
import './scores.css'

/**
 * Tabla global de récords de la contrarreloj: los 20 mejores tiempos y, si se
 * acaba de completar una partida sin ayudas, el formulario para enviar la marca.
 */

const NAME_KEY = 'kroquetita:name'
const NAME_MAX = 16

const TEXT = {
  es: {
    title: 'Tabla de récords',
    lead: 'Todas las monedas en el menor tiempo.',
    close: 'Cerrar',
    list: 'Mejores tiempos',
    loading: 'Cargando la tabla…',
    empty: 'Todavía no hay marcas. La primera puede ser la tuya.',
    loadError: 'No se ha podido cargar la tabla.',
    retry: 'Reintentar',
    yourTime: 'Tu tiempo',
    name: 'Tu nombre',
    nameHint: 'De 2 a 16 caracteres.',
    submit: 'Enviar mi tiempo',
    sending: 'Enviando…',
    sent: (rank: number) => `¡Marca enviada! Estás en el puesto ${rank}.`,
    sentWorse: (rank: number, best: string) => `Ya tenías una marca mejor (${best}): sigues en el puesto ${rank}.`,
    sentOut: 'Marca enviada, pero la tabla está llena y no ha entrado.',
    assisted:
      'Esta partida no vale para la tabla porque se han usado ayudas (viaje rápido, terminal o modo fiesta). Reinicia y juega sin ellas.',
    noRun: 'Recoge todas las monedas para entrar en la tabla: el reloj arranca con la primera y se para con la última.',
    errors: {
      name: 'Ese nombre no vale: de 2 a 16 letras, números, espacios, guiones o puntos, sin enlaces ni palabrotas.',
      time: 'Ese tiempo no entra en la tabla: solo valen marcas de entre 25 segundos y una hora.',
      network: 'No hay conexión. Inténtalo de nuevo.',
      server: 'No se ha podido guardar la marca. Inténtalo de nuevo.',
      body: 'No se ha podido guardar la marca. Inténtalo de nuevo.',
    },
  },
  en: {
    title: 'Leaderboard',
    lead: 'Every coin in the shortest time.',
    close: 'Close',
    list: 'Best times',
    loading: 'Loading the leaderboard…',
    empty: 'No times yet. The first one could be yours.',
    loadError: 'The leaderboard could not be loaded.',
    retry: 'Retry',
    yourTime: 'Your time',
    name: 'Your name',
    nameHint: '2 to 16 characters.',
    submit: 'Submit my time',
    sending: 'Sending…',
    sent: (rank: number) => `Time submitted! You are in position ${rank}.`,
    sentWorse: (rank: number, best: string) => `You already had a better time (${best}): you stay in position ${rank}.`,
    sentOut: 'Time submitted, but the leaderboard is full and it did not make it in.',
    assisted:
      'This run does not count for the leaderboard because assists were used (fast travel, terminal or party mode). Restart and play without them.',
    noRun: 'Collect every coin to enter the leaderboard: the clock starts with the first one and stops with the last.',
    errors: {
      name: 'That name is not valid: 2 to 16 letters, numbers, spaces, hyphens or dots, with no links or swear words.',
      time: 'That time cannot enter the leaderboard: only runs between 25 seconds and one hour count.',
      network: 'No connection. Please try again.',
      server: 'The time could not be saved. Please try again.',
      body: 'The time could not be saved. Please try again.',
    },
  },
} satisfies Record<'es' | 'en', unknown>

const clock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`
}

/** Un mismo nombre con otras mayúsculas es la misma entrada (igual que en el servidor) */
const keyOf = (name: string) => name.toLowerCase()

function savedName() {
  try {
    return (localStorage.getItem(NAME_KEY) ?? '').slice(0, NAME_MAX)
  } catch {
    return ''
  }
}

/** Lo último que se ha enviado en esta visita: qué partida era y cómo quedó */
interface Sent {
  runTime: number
  rank: number | null
  entry: Score | null
}
/** Viven fuera del componente para que cerrar y abrir el panel no permita enviar dos veces la misma marca */
let lastSent: Sent | null = null
let pending: Promise<Result<Submitted>> | null = null

/** Envía la marca y apunta el resultado, siga o no abierto el panel. */
function submit(name: string, runTime: number) {
  const request = submitScore(name, runTime).then((result) => {
    pending = null
    if (!result.ok) return result
    lastSent = { runTime, rank: result.data.rank, entry: result.data.entry }
    try {
      localStorage.setItem(NAME_KEY, name)
    } catch {
      // No pasa nada si no se puede guardar.
    }
    track('score')
    return result
  })
  pending = request
  return request
}

type Board = { status: 'loading' } | { status: 'error' } | { status: 'ready'; scores: Score[] }

function ScoresPanel() {
  const t = TEXT[useLang()]
  const runTime = useGame((s) => s.runTime)
  const assisted = useGame((s) => s.assisted)
  const [board, setBoard] = useState<Board>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [name, setName] = useState(savedName)
  const [sending, setSending] = useState(pending !== null)
  const [problem, setProblem] = useState<ApiError | null>(null)
  const [sent, setSent] = useState(lastSent)
  const panel = useRef<HTMLElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const pressedOutside = useRef(false)
  const titleId = useId()
  const hintId = useId()

  const close = () => useGame.getState().setPanel(null)

  // Se pide la tabla al abrir y cada vez que se pulsa «Reintentar».
  useEffect(() => {
    let alive = true
    setBoard({ status: 'loading' })
    void fetchScores().then((result) => {
      if (alive) setBoard(result.ok ? { status: 'ready', scores: result.data } : { status: 'error' })
    })
    return () => {
      alive = false
    }
  }, [attempt])

  // Al abrir, el foco entra en el panel; al cerrar, vuelve a donde estaba.
  useEffect(() => {
    const before = document.activeElement
    panel.current?.focus()
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus()
    }
  }, [])

  // Tras enviar, la fila propia queda a la vista.
  useEffect(() => {
    if (sent) list.current?.querySelector('.is-mine')?.scrollIntoView({ block: 'nearest' })
  }, [sent, board])

  /** Esta partida ya está enviada */
  const done = sent !== null && sent.runTime === runTime ? sent : null

  const settle = (result: Result<Submitted>) => {
    setSending(false)
    if (!result.ok) {
      setProblem(result.error)
      return
    }
    setSent(lastSent)
    setBoard({ status: 'ready', scores: result.data.scores })
  }

  // Si se cerró el panel con un envío a medias, al volver a abrirlo se espera a su respuesta.
  useEffect(() => {
    let alive = true
    void pending?.then((result) => {
      if (alive) settle(result)
    })
    return () => {
      alive = false
    }
    // Solo al abrir: `settle` no usa nada que cambie entre pintados.
  }, [])

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    if (runTime === null || assisted || done || pending) return
    const clean = name.replace(/\s+/g, ' ').trim()
    if ([...clean].length < 2) {
      setProblem('name')
      return
    }
    setSending(true)
    setProblem(null)
    void submit(clean, runTime).then(settle)
  }

  // El tabulador no sale del panel mientras está abierto.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && e.target instanceof HTMLInputElement) {
      // Escribiendo, las teclas no llegan al juego: aquí Esc cierra el panel.
      e.stopPropagation()
      close()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const mine = sent?.entry ?? null
  const scores = board.status === 'ready' ? board.scores : []
  const isMine = (score: Score) => mine !== null && keyOf(score.name) === keyOf(mine.name)
  // Si la marca propia queda por debajo de las que se enseñan, se añade al final con su puesto.
  const below = mine !== null && sent?.rank != null && !scores.some(isMine) ? { rank: sent.rank, score: mine } : null

  const row = (score: Score, rank: number) => (
    <li key={`${rank}-${score.name}`} className={isMine(score) ? 'is-mine' : ''} aria-current={isMine(score) || undefined}>
      <span className="scores__rank">{rank}</span>
      <span className="scores__name">{score.name}</span>
      <span className="scores__time">{clock(score.time)}</span>
    </li>
  )

  return (
    <div
      className="scores"
      // Tocar fuera cierra, pero solo si el gesto empezó y acabó fuera (no al soltar un arrastre que salió del panel).
      onPointerDown={(e) => {
        pressedOutside.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (pressedOutside.current && e.target === e.currentTarget) close()
      }}
    >
      <section
        ref={panel}
        className="scores__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header>
          <div>
            <h2 id={titleId}>{t.title}</h2>
            <p>{t.lead}</p>
          </div>
          <button type="button" onClick={close} aria-label={t.close} title={t.close}>
            ×
          </button>
        </header>

        <div ref={list} className="scores__list" tabIndex={0} role="group" aria-label={t.list} aria-busy={board.status === 'loading'}>
          {board.status === 'loading' && (
            <p className="scores__note" role="status">
              {t.loading}
            </p>
          )}
          {board.status === 'error' && (
            <div className="scores__note" role="alert">
              <p>{t.loadError}</p>
              <button type="button" className="scores__button is-quiet" onClick={() => setAttempt((n) => n + 1)}>
                {t.retry}
              </button>
            </div>
          )}
          {board.status === 'ready' && scores.length === 0 && <p className="scores__note">{t.empty}</p>}
          {scores.length > 0 && (
            <ol>
              {scores.map((score, i) => row(score, i + 1))}
              {below && (
                <>
                  <li className="scores__gap" aria-hidden="true">
                    ···
                  </li>
                  {row(below.score, below.rank)}
                </>
              )}
            </ol>
          )}
        </div>

        <footer>
          {runTime === null ? (
            <p className="scores__info">{t.noRun}</p>
          ) : (
            <>
              <p className="scores__run">
                {t.yourTime} <b>{clock(runTime)}</b>
              </p>
              {assisted ? (
                <p className="scores__info is-warning">{t.assisted}</p>
              ) : done ? (
                <p className="scores__info is-done" role="status">
                  {done.rank === null || done.entry === null
                    ? t.sentOut
                    : done.entry.time < Math.round(runTime * 100) / 100
                      ? t.sentWorse(done.rank, clock(done.entry.time))
                      : t.sent(done.rank)}
                </p>
              ) : (
                <form onSubmit={send} noValidate>
                  <label>
                    <span>{t.name}</span>
                    <input
                      type="text"
                      name="nickname"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value)
                        setProblem(null)
                      }}
                      maxLength={NAME_MAX}
                      autoComplete="nickname"
                      autoCapitalize="words"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="send"
                      aria-invalid={problem === 'name'}
                      aria-describedby={hintId}
                    />
                  </label>
                  <button type="submit" className="scores__button" disabled={sending}>
                    {sending ? t.sending : t.submit}
                  </button>
                  <p id={hintId} className={problem ? 'scores__hint is-error' : 'scores__hint'} role={problem ? 'alert' : undefined}>
                    {problem ? t.errors[problem] : t.nameHint}
                  </p>
                </form>
              )}
            </>
          )}
        </footer>
      </section>
    </div>
  )
}

/** Se monta dentro de la capa de interfaz; solo se ve con el panel de récords abierto. */
export function Scores() {
  const open = useGame((s) => s.panel === 'scores')
  return open ? <ScoresPanel /> : null
}
