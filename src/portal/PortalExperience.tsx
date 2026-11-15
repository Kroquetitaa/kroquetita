import { useCallback, useEffect, useRef, useState } from 'react'
import { useLang } from '../i18n'
import { clearPortalSceneAssets, PortalScene } from './PortalScene'
import { usePortalSession } from './session'
import { leavePortalGuest, usePortalLaunch } from './launch'
import type { PortalEdge } from './protocol'
import './portal.css'

function useMedia(query: string) {
  const [match, set] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query), update = () => set(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return match
}

function storyLine(time: number, connected: boolean, es: boolean) {
  if (time < 2) return es ? 'Todo parecía estar bajo control.' : 'Everything seemed to be under control.'
  if (time < 4) return es ? 'El pato acaba de llevarse el contexto.' : 'The duck just stole the context.'
  if (!connected && time < 28) return es ? 'Claude: «Me falta contexto para este salto».' : 'Claude: “I need more context for this jump.”'
  if (time < 9) return es ? '¡Ese pato tiene el contexto!' : 'That duck has the context!'
  if (time < 14) return es ? 'ChatGPT: «Tengo un plan. Seguid al pato».' : 'ChatGPT: “I have a plan. Follow the duck.”'
  if (time < 18) return es ? 'Otra dimensión. El mismo pato.' : 'Another dimension. The same duck.'
  if (time < 23) return es ? 'Mistral: «¿Y si todo esto podía haber sido un email?»' : 'Mistral: “Could this have been an email?”'
  if (time < 28) return es ? 'De vuelta a casa. Con una pequeña parada…' : 'Heading home. With one tiny detour…'
  if (time < 31) return es ? 'El contexto estaba en el café. Como siempre.' : 'The context was in the coffee. As always.'
  return es ? 'Caso resuelto. Más o menos. ☕' : 'Case closed. More or less. ☕'
}

export default function PortalExperience({ role, sessionId, embedded = false }: { role: 'host' | 'guest'; sessionId: string; embedded?: boolean }) {
  const es = useLang() === 'es'
  const compact = useMedia('(max-width: 760px)')
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)')
  const { snapshot, status, topology, restart, close, setReady, error } = usePortalSession(role, sessionId, embedded)
  const blocked = usePortalLaunch(s => s.blocked)
  const ready = useRef(new Set<string>())
  const sceneFailed = useRef(false)
  const [sceneReady, sceneIsReady] = useState(false)
  const [sceneError, setSceneError] = useState(false)
  const [sceneAttempt, setSceneAttempt] = useState(0)
  const [joined, setJoined] = useState(true)
  const isHost = role === 'host'
  const onReady = useCallback((side: string) => {
    if (sceneFailed.current) return
    ready.current.add(side)
    if (!embedded || ready.current.size === 2) sceneIsReady(true)
  }, [embedded])
  useEffect(() => setReady(sceneReady && (!embedded || joined)), [sceneReady, embedded, joined, setReady])
  const dayReady = useCallback(() => onReady('day'), [onReady])
  const nightReady = useCallback(() => onReady('night'), [onReady])
  const onSceneError = useCallback(() => {
    sceneFailed.current = true
    ready.current.clear()
    sceneIsReady(false)
    setSceneError(true)
    setReady(false)
  }, [setReady])
  const retryScene = useCallback(() => {
    clearPortalSceneAssets()
    ready.current.clear()
    sceneFailed.current = false
    sceneIsReady(false)
    setSceneError(false)
    setSceneAttempt(attempt => attempt + 1)
    restart()
  }, [restart])
  const leave = useCallback(() => {
    close()
    if (isHost) usePortalLaunch.getState().leave()
    else leavePortalGuest()
  }, [close, isHost])
  useEffect(() => {
    const oldTitle = document.title
    document.title = es ? isHost ? 'El pato se ha llevado el contexto · Kroquetita' : 'La otra dimensión · Kroquetita' : 'The duck stole the context · Kroquetita'
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); leave() } }
    window.addEventListener('keydown', escape)
    return () => { document.title = oldTitle; window.removeEventListener('keydown', escape) }
  }, [es, isHost, leave])
  const connected = snapshot.connected && (!embedded || joined)
  const edge = topology.edge ?? (isHost ? 'right' : 'left')
  const splitEdge: PortalEdge = compact ? 'bottom' : 'right'
  const inverse: Record<PortalEdge, PortalEdge> = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' }
  const complete = snapshot.elapsed >= 32
  const statusText = sceneError ? es ? 'PORTAL EN PAUSA' : 'PORTAL PAUSED'
    : complete ? es ? 'CONTEXTO RECUPERADO' : 'CONTEXT RECOVERED'
    : !sceneReady ? es ? 'PREPARANDO EL SALTO' : 'PREPARING THE LEAP'
    : connected ? es ? 'PORTALES CONECTADOS' : 'PORTALS CONNECTED'
    : embedded ? es ? 'PORTALES SEPARADOS' : 'PORTALS DISCONNECTED'
    : status === 'closed' || status === 'disconnected' ? es ? 'ESPERANDO A LA OTRA VENTANA' : 'WAITING FOR THE OTHER WINDOW'
    : es ? 'ACERCA LAS DOS VENTANAS' : 'BRING THE WINDOWS TOGETHER'
  return <main className={`portal-experience ${embedded ? 'is-embedded' : ''} ${compact ? 'is-compact' : ''}`} data-portal-role={role}>
    <header className="portal-header">
      <button className="portal-back" onClick={leave} aria-label={es ? 'Volver a la ciudad' : 'Back to city'}>← <span>KROQUETITA</span></button>
      <div className={`portal-connection ${connected && !sceneError ? 'is-connected' : ''}`} role="status"><i />{statusText}</div>
      <span className="portal-edition">{es ? 'EXPERIMENTO 01' : 'EXPERIMENT 01'}<b>ENTRE DIMENSIONES</b></span>
    </header>
    <div className="portal-intro"><div className="portal-title-card"><span>{es ? 'UNA PERSECUCIÓN QUE NO CABE EN UNA VENTANA' : 'A CHASE TOO BIG FOR ONE WINDOW'}</span><h1>{isHost ? es ? 'El pato se ha llevado el contexto.' : 'The duck stole the context.' : es ? 'Bienvenido al otro lado.' : 'Welcome to the other side.'}</h1></div></div>
    <div className="portal-worlds">
      <section className={`portal-world ${isHost ? 'is-day' : 'is-night'}`} aria-label={isHost ? es ? 'Plaza de día' : 'Day plaza' : es ? 'Distrito nocturno' : 'Night district'}>
        <span className="portal-world-label">{isHost ? '01 / THE CORE' : '02 / LA OTRA DIMENSIÓN'}<b>{isHost ? '☀' : '☾'}</b></span>
        <PortalScene key={`primary-${sceneAttempt}`} side={isHost ? 'day' : 'night'} time={snapshot.elapsed} connected={connected} edge={embedded ? splitEdge : edge} anchor={embedded ? .5 : topology.anchor} stretch={embedded ? 0 : topology.stretch} reducedMotion={reducedMotion} onReady={isHost ? dayReady : nightReady} onError={onSceneError} />
      </section>
      {embedded && <>
        <button className={`portal-seam ${joined ? 'is-joined' : ''}`} aria-pressed={joined} onClick={() => setJoined(!joined)}>{joined ? '⇄' : '⋯'}<span>{joined ? es ? 'Separar portales' : 'Disconnect portals' : es ? 'Conectar portales' : 'Connect portals'}</span></button>
        <section className="portal-world is-night" aria-label={es ? 'Distrito nocturno' : 'Night district'}>
          <span className="portal-world-label">02 / LA OTRA DIMENSIÓN <b>☾</b></span>
          <PortalScene key={`night-${sceneAttempt}`} side="night" time={snapshot.elapsed} connected={connected} edge={inverse[splitEdge]} anchor={.5} reducedMotion={reducedMotion} onReady={nightReady} onError={onSceneError} />
        </section>
      </>}
      {!sceneReady && <div className={`portal-preparing ${sceneError ? 'has-error' : ''}`} role={sceneError ? 'alert' : 'status'}>
        <span aria-hidden="true">{sceneError ? '↻' : '✦'}</span>
        {sceneError ? <>
          <strong>{es ? 'El portal no ha terminado de cargar.' : 'The portal could not finish loading.'}</strong>
          <p>{es ? 'La aventura está en pausa. Puedes volver a intentarlo.' : 'The adventure is paused. You can try again.'}</p>
          <button onClick={retryScene}>{es ? 'Cargar de nuevo' : 'Try loading again'}</button>
        </> : es ? 'Preparando los dos lados del portal…' : 'Preparing both sides of the portal…'}
      </div>}
    </div>
    <footer className="portal-footer">
      <div className="portal-dialogue"><span className="portal-duck-mark" aria-hidden="true">🦆</span><p>{storyLine(snapshot.elapsed, connected, es)}</p></div>
      <div className="portal-timeline" role="progressbar" aria-label={es ? 'Progreso de la aventura' : 'Adventure progress'} aria-valuemin={0} aria-valuemax={32} aria-valuenow={Math.min(32, Math.floor(snapshot.elapsed))}><i style={{transform:`scaleX(${snapshot.elapsed / 32})`}} /></div>
      <div className="portal-bottom"><p>{embedded ? blocked ? es ? 'Tu navegador no abrió otra ventana. La aventura sigue aquí.' : 'Your browser did not open another window. The adventure continues here.' : es ? 'Dos mundos, una pantalla. Toca la unión para separarlos.' : 'Two worlds, one screen. Tap the connection to separate them.' : isHost ? es ? 'Mueve la otra ventana junto a un borde de esta. Sepáralas y observa qué ocurre.' : 'Move the other window next to an edge of this one. Separate them and see what happens.' : es ? 'Coloca esta ventana junto a la principal para completar el portal.' : 'Place this window beside the first one to complete the portal.'}</p>
        <div className="portal-actions">
          {isHost && !embedded && <button onClick={() => usePortalLaunch.getState().reopen()}>{es ? 'Ver otra ventana ↗' : 'Show other window ↗'}</button>}
          {isHost && !embedded && <button onClick={() => usePortalLaunch.getState().embed()}>{es ? 'Jugar en una pantalla' : 'Play on one screen'}</button>}
          {isHost && <button className={complete ? 'is-primary' : ''} onClick={() => { setJoined(true); restart() }}>{es ? 'Otra vez ↻' : 'Again ↻'}</button>}
          {complete && <button onClick={leave}>{es ? 'Volver a la ciudad →' : 'Back to the city →'}</button>}
        </div>
      </div>
      {error && <p className="portal-error">{es ? 'La conexión está esperando. Puedes seguir en una pantalla.' : 'The connection is waiting. You can continue on one screen.'}</p>}
    </footer>
  </main>
}
