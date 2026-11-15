import { useEffect, useRef, useState } from 'react'
import { useLang } from '../i18n'
import { useGame, type CameraMode } from '../store'
import './camera.css'

const views: { id: CameraMode; es: string; en: string; hint: { es: string; en: string } }[] = [
  { id: 'chase', es: 'Cercana', en: 'Close', hint: { es: 'Sigue tus pasos', en: 'Follow your steps' } },
  { id: 'wide', es: 'Isométrica', en: 'Isometric', hint: { es: 'Tu mundo en maqueta', en: 'A miniature world' } },
  { id: 'aerial', es: 'Aérea', en: 'Overhead', hint: { es: 'Todo desde arriba', en: 'A view from above' } },
  { id: 'free', es: 'Libre · 360°', en: 'Free · 360°', hint: { es: 'Gira, acerca y explora', en: 'Orbit, zoom, explore' } },
]

function ViewIcon({ view }: { view: CameraMode }) {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    {view === 'chase' ? <><rect x="5" y="9" width="22" height="16" rx="5" /><path d="M11 9l2-3h6l2 3" /><circle cx="16" cy="17" r="4" /></>
      : view === 'wide' ? <><path d="M16 4L28 11 16 18 4 11 16 4ZM4 11v12l12 7 12-7V11M16 18v12" /></>
      : view === 'aerial' ? <><rect x="5" y="5" width="8" height="8" rx="2" /><rect x="19" y="5" width="8" height="8" rx="2" /><rect x="5" y="19" width="8" height="8" rx="2" /><rect x="19" y="19" width="8" height="8" rx="2" /><path d="M16 12v8M12 16h8" /></>
      : <><circle cx="16" cy="16" r="5" /><ellipse cx="16" cy="16" rx="14" ry="8" transform="rotate(-30 16 16)" /><path d="M25 5l3 1-1 4" /></>}
  </svg>
}

export function CameraViews() {
  const lang = useLang()
  const camera = useGame(s => s.camera)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
    const closeOutside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])
  const title = lang === 'es' ? 'Perspectiva de cámara' : 'Camera perspective'
  return <div ref={root} className="camera-views" onKeyDown={e => {
    if (!open && e.key !== ' ' && e.key !== 'Enter') return
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); trigger.current?.focus() }
  }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}>
    <button ref={trigger} type="button" className="camera-view-trigger" aria-label={title}
      aria-expanded={open} aria-controls="camera-view-options" aria-haspopup="dialog" onClick={() => setOpen(!open)}>
      <ViewIcon view={camera} /><span>{views.find(view => view.id === camera)?.[lang]}</span>
      <kbd>C</kbd>
      <span className="camera-view-chevron" aria-hidden="true">⌃</span>
    </button>
    {open && <div id="camera-view-options" className="camera-view-options" role="dialog" aria-label={title}>
      <div className="camera-view-heading"><span>{lang === 'es' ? 'ELIGE TU MIRADA' : 'CHOOSE YOUR VIEW'}</span><kbd>C</kbd></div>
      <div className="camera-view-grid">{views.map(view => <button key={view.id} type="button"
        className="camera-view-choice" aria-pressed={view.id === camera} onClick={() => {
          useGame.getState().setCamera(view.id); setOpen(false); trigger.current?.focus()
        }}><ViewIcon view={view.id} /><strong>{view[lang]}</strong><small>{view.hint[lang]}</small>
        {view.id === camera && <span className="camera-view-check" aria-hidden="true">✓</span>}
      </button>)}</div>
    </div>}
    {camera === 'free' && !open && <span className="camera-views-help" role="status">
      {lang === 'es' ? 'Arrastra para girar · rueda para acercar' : 'Drag to orbit · scroll to zoom'}
    </span>}
  </div>
}
