import { useEffect, useState } from 'react'
import {
  canShareFiles,
  CAPTION,
  filterOf,
  FILTERS,
  FOV_RANGE,
  FRAME,
  requestShot,
  resetPhoto,
  ROLL_RANGE,
  usePhoto,
} from '../game/photo'
import { useLang } from '../i18n'
import { useGame } from '../store'
import './photo.css'

const TEXT = {
  es: {
    title: 'Modo foto',
    fov: 'Campo de visión',
    roll: 'Horizonte',
    filter: 'Filtro',
    frame: 'Marco',
    shoot: 'Hacer foto',
    reset: 'Restablecer',
    settings: 'Ajustes',
    share: 'Compartir la última foto',
    exit: 'Salir del modo foto',
    saved: 'Foto guardada',
    drag: 'Arrastra para girar · rueda para acercar',
    move: 'moverte',
    lift: 'altura',
    space: 'Espacio',
    photo: 'foto',
  },
  en: {
    title: 'Photo mode',
    fov: 'Field of view',
    roll: 'Horizon',
    filter: 'Filter',
    frame: 'Frame',
    shoot: 'Take photo',
    reset: 'Reset',
    settings: 'Settings',
    share: 'Share the last photo',
    exit: 'Leave photo mode',
    saved: 'Photo saved',
    drag: 'Drag to orbit · scroll to zoom',
    move: 'move',
    lift: 'height',
    space: 'Space',
    photo: 'photo',
  },
}

const Icon = {
  settings: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
      <circle cx="16" cy="7" r="2.6" />
      <circle cx="8" cy="17" r="2.6" />
    </svg>
  ),
  reset: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 12a7 7 0 1 1-2.1-5" />
      <path d="M19 4v4h-4" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 12v7h14v-7" />
    </svg>
  ),
  exit: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
}

/** Tras un clic de ratón o de dedo el foco se suelta: así Espacio y las flechas vuelven a ser de la cámara. */
const release = (e: React.MouseEvent) => {
  if (e.detail > 0 && document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

function Panel() {
  const lang = useLang()
  const t = TEXT[lang]
  const fov = usePhoto((s) => s.fov)
  const baseFov = usePhoto((s) => s.baseFov)
  const roll = usePhoto((s) => s.roll)
  const filter = usePhoto((s) => s.filter)
  const frame = usePhoto((s) => s.frame)
  const shots = usePhoto((s) => s.shots)
  const saving = usePhoto((s) => s.saving)
  const last = usePhoto((s) => s.last)
  const { setFov, setRoll, setFilter, toggleFrame } = usePhoto.getState()
  // Los ajustes se pueden plegar para ver el encuadre entero.
  const [open, setOpen] = useState(true)
  const [sharing] = useState(canShareFiles)
  const [saved, setSaved] = useState(false)

  // Si se venía de escribir (el terminal), el teclado pasa a ser de la cámara.
  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, [])

  // Aviso breve cuando la foto ya está descargada.
  useEffect(() => {
    if (!last) return
    setSaved(true)
    const timer = window.setTimeout(() => setSaved(false), 2600)
    return () => window.clearTimeout(timer)
  }, [last])

  const share = () => {
    const file = usePhoto.getState().last
    if (!file) return
    // Si se cancela el menú de compartir no hay nada que hacer.
    void navigator.share({ files: [file], title: CAPTION }).catch(() => {})
  }

  const wash = filterOf(filter).wash
  const frameVars = {
    '--photo-side': FRAME.side * 100,
    '--photo-foot': FRAME.foot * 100,
    '--photo-text': FRAME.foot * FRAME.text * 100,
    '--photo-spacing': `${FRAME.spacing}em`,
    '--photo-paper': FRAME.paper,
    '--photo-ink': FRAME.ink,
  } as React.CSSProperties

  return (
    <div className="photo">
      {/* Lo que se verá en la foto además de la escena: el velo del filtro y el marco */}
      {wash && <i className="photo__wash" style={{ background: wash }} aria-hidden="true" />}
      {frame && (
        <div className="photo__frame" style={frameVars} aria-hidden="true">
          <i />
          <span>{CAPTION}</span>
        </div>
      )}

      <div className="pill photo__hint">
        <span>{t.drag}</span>
        <kbd>WASD</kbd>
        <span>{t.move}</span>
        <kbd>Q E</kbd>
        <span>{t.lift}</span>
        <kbd>{t.space}</kbd>
        <span>{t.photo}</span>
      </div>

      <section className="photo__panel" aria-label={t.title} onClick={release}>
        {saved && (
          <p className="photo__saved" role="status">
            {t.saved}
          </p>
        )}

        {open && (
          <div className="photo__settings" id="photo-settings">
            <label className="photo__slider">
              <span>
                {t.fov} <b>{Math.round(fov)}°</b>
              </span>
              <input
                type="range"
                min={FOV_RANGE.min}
                max={FOV_RANGE.max}
                step={1}
                value={fov}
                onChange={(e) => setFov(Number(e.target.value))}
                onDoubleClick={() => setFov(baseFov)}
                onPointerUp={(e) => e.currentTarget.blur()}
              />
            </label>
            <label className="photo__slider">
              <span>
                {t.roll} <b>{roll > 0 ? `+${roll}` : roll}°</b>
              </span>
              <input
                type="range"
                min={ROLL_RANGE.min}
                max={ROLL_RANGE.max}
                step={1}
                value={roll}
                onChange={(e) => setRoll(Number(e.target.value))}
                onDoubleClick={() => setRoll(0)}
                onPointerUp={(e) => e.currentTarget.blur()}
              />
            </label>
            <div className="photo__looks">
              <button
                type="button"
                className={`photo__chip photo__chip--frame ${frame ? 'is-on' : ''}`}
                aria-pressed={frame}
                onClick={toggleFrame}
              >
                <i aria-hidden="true" />
                {t.frame}
              </button>
              <div className="photo__filters" role="group" aria-label={t.filter}>
                {FILTERS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`photo__chip ${filter === option.id ? 'is-on' : ''}`}
                    aria-pressed={filter === option.id}
                    onClick={() => setFilter(option.id)}
                  >
                    {option.name[lang]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="photo__actions">
          <div>
            <button
              type="button"
              className={`photo__btn ${open ? 'is-on' : ''}`}
              onClick={() => setOpen((value) => !value)}
              title={t.settings}
              aria-label={t.settings}
              aria-expanded={open}
              aria-controls="photo-settings"
            >
              {Icon.settings}
            </button>
            <button type="button" className="photo__btn" onClick={resetPhoto} title={`${t.reset} (R)`} aria-label={t.reset}>
              {Icon.reset}
            </button>
          </div>
          <button
            type="button"
            className="photo__shoot"
            onClick={requestShot}
            disabled={saving}
            title={t.shoot}
            aria-label={t.shoot}
          />
          <div>
            {sharing && (
              <button
                type="button"
                className="photo__btn"
                onClick={share}
                disabled={!last}
                title={t.share}
                aria-label={t.share}
              >
                {Icon.share}
              </button>
            )}
            <button
              type="button"
              className="photo__btn"
              onClick={() => useGame.getState().setPanel(null)}
              title={`${t.exit} (Esc)`}
              aria-label={t.exit}
            >
              {Icon.exit}
            </button>
          </div>
        </div>
      </section>

      {/* Destello del obturador: uno por foto */}
      {shots > 0 && <i className="photo__flash" key={shots} aria-hidden="true" />}
    </div>
  )
}

/** Interfaz del modo foto: ajustes del encuadre, disparo y salida. Va dentro de `.overlay`. */
export function PhotoPanel() {
  const active = useGame((s) => s.panel === 'photo')
  return active ? <Panel /> : null
}
