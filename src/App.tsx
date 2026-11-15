import { lazy, Suspense, useEffect } from 'react'
import { bindKeyboard } from './game/input'
import { useGame } from './store'
import { Overlay } from './ui/Overlay'
import { CityControls } from './ui/CityControls'
import { usePortalLaunch } from './portal/launch'
import { parsePortalQuery } from './portal/protocol'

// La ciudad y el experimento cargan por separado: el invitado solo pide su diorama.
const Experience = lazy(() =>
  import('./scene/Experience').then((module) => {
    useGame.getState().setProgress(0.45)
    return { default: module.Experience }
  }),
)
const PortalExperience = lazy(() => import('./portal/PortalExperience'))
const portalGuest = parsePortalQuery(window.location.search)

function PortalPreparing() {
  return <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center',background:'#141526',color:'#f6e8d7',fontFamily:'Poppins,sans-serif'}}>Abriendo otra dimensión… ✦</div>
}

export default function App() {
  const portal = usePortalLaunch()
  useEffect(() => {
    if (portalGuest || portal.active) return
    return bindKeyboard(() => useGame.getState().mode === 'play')
  }, [portal.active])
  useEffect(() => useGame.getState().setProgress(0.08), [])
  const retro = useGame((s) => s.retro)

  if (portalGuest) return <Suspense fallback={<PortalPreparing />}><PortalExperience role="guest" sessionId={portalGuest.sessionId} /></Suspense>
  if (portal.active) return <Suspense fallback={<PortalPreparing />}><PortalExperience key={`${portal.sessionId}:${portal.embedded}`} role="host" sessionId={portal.sessionId} embedded={portal.embedded} /></Suspense>

  return (
    <>
      <div className={retro ? 'stage is-retro' : 'stage'}>
        <Suspense fallback={null}>
          <Experience />
        </Suspense>
      </div>
      <Overlay />
      <CityControls />
    </>
  )
}
