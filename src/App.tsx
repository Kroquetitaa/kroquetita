import { lazy, memo, Suspense, useEffect, useState } from 'react'
import { bindKeyboard } from './game/input'
import { useGame } from './store'
import { Overlay } from './ui/Overlay'
import { CityControls } from './ui/CityControls'
import { usePortalLaunch } from './portal/launch'
import { parsePortalQuery } from './portal/protocol'
import { useDimensionSession } from './dimensions/session'
import { openNextDimension, useDimensionLaunch } from './dimensions/launch'
import { DimensionPresence } from './dimensions/DimensionPresence'
import type { DimensionCameraInput } from './dimensions/protocol'

// La ciudad y el experimento cargan por separado: el invitado solo pide su diorama.
const Experience = lazy(() =>
  import('./scene/Experience').then((module) => {
    useGame.getState().setProgress(0.45)
    return { default: module.Experience }
  }),
)
const PortalExperience = lazy(() => import('./portal/PortalExperience'))
const DimensionLens = lazy(() => import('./dimensions/DimensionLens').then(module => ({default:module.DimensionLens})))
const portalGuest = parsePortalQuery(window.location.search)

function PortalPreparing() {
  return <div style={{position:'fixed',inset:0,display:'grid',placeItems:'center',background:'#141526',color:'#f6e8d7',fontFamily:'Poppins,sans-serif'}}>Abriendo otra dimensión… ✦</div>
}

export default function App() {
  const portal = usePortalLaunch()
  const reverse = useDimensionLaunch()
  const dimensions = useDimensionSession(!portalGuest && !portal.active && !reverse.ignored)
  const [discovered, setDiscovered] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setDiscovered(true), 300)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => useGame.getState().setProgress(0.08), [])

  if (portalGuest) return <Suspense fallback={<PortalPreparing />}><PortalExperience role="guest" sessionId={portalGuest.sessionId} /></Suspense>
  if (portal.active) return <Suspense fallback={<PortalPreparing />}><PortalExperience key={`${portal.sessionId}:${portal.embedded}`} role="host" sessionId={portal.sessionId} embedded={portal.embedded} /></Suspense>
  if (dimensions.role === 'lens' || reverse.preview) return <Suspense fallback={<PortalPreparing />}>
    <DimensionLens session={dimensions} preview={reverse.preview} onReturn={reverse.leave} onOpenNext={openNextDimension} />
  </Suspense>
  if (!discovered) return <PortalPreparing />
  return <><CityApp sendCamera={dimensions.sendCamera} /><DimensionPresence role={dimensions.role} peerCount={dimensions.peerCount} limitReached={dimensions.limitReached} /></>
}

const CityApp = memo(function CityApp({sendCamera}:{sendCamera:(camera:DimensionCameraInput)=>void}) {
  const retro = useGame((s) => s.retro)
  useEffect(() => bindKeyboard(() => useGame.getState().mode === 'play'), [])
  return (
    <>
      <div className={retro ? 'stage is-retro' : 'stage'}>
        <Suspense fallback={null}>
          <Experience sendCamera={sendCamera} />
        </Suspense>
      </div>
      <Overlay />
      <CityControls />
    </>
  )
})
