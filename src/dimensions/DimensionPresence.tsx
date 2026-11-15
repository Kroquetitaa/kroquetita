import { useEffect, useRef } from 'react'
import type { DimensionRole } from './protocol'
import { windowMotion } from './windowMotion'
import { useLang } from '../i18n'
import './presence.css'

export function DimensionPresence({ role, peerCount, limitReached = false }: { role: DimensionRole; peerCount: number; limitReached?: boolean }) {
  const es = useLang() === 'es'
  const motion = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (role !== 'host') return
    const original = document.title
    document.title = es ? '01 · La ciudad · Kroquetita' : '01 · The city · Kroquetita'
    return () => { document.title = original }
  }, [role, es])
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (motion.current) motion.current.dataset.active = String(windowMotion.strength > .055)
    }, 100)
    return () => window.clearInterval(timer)
  }, [])
  return <>
    {(role === 'host' && peerCount > 0 || limitReached) && <aside className="dimension-presence" role="status">
      <i aria-hidden="true" />
      <div><strong>{limitReached ? es ? 'LAS TRES CAPAS YA ESTÁN ABIERTAS' : 'ALL THREE LAYERS ARE OPEN' : peerCount > 1 ? es ? 'TRES CAPAS CONECTADAS' : 'THREE CONNECTED LAYERS' : es ? 'EL REVERSO ESTÁ CONECTADO' : 'THE OTHER SIDE IS CONNECTED'}</strong>
        <span>{limitReached ? es ? 'Cierra una para conectar esta ventana.' : 'Close one to connect this window.' : peerCount > 1 ? es ? 'Superpón las tres para revelar el origen.' : 'Overlap all three to reveal the origin.' : es ? 'Mueve la otra ventana sobre esta ciudad.' : 'Move the other window over this city.'}</span></div>
      <span className="dimension-presence-orbits" aria-hidden="true">◉</span>
    </aside>}
    <div ref={motion} className="dimension-motion-feedback" data-active="false" aria-hidden="true">
      <span>〰</span>{es ? '¡Sujetad las croquetas!' : 'Hold on to your croquettes!'}
    </div>
  </>
}
