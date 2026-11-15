import { lazy, Suspense, useEffect } from 'react'
import { bindKeyboard } from './game/input'
import { useGame } from './store'
import { Overlay } from './ui/Overlay'
import { CityControls } from './ui/CityControls'

// El motor 3D pesa mucho más que el resto: se pide ya, pero en un paquete
// aparte, para que la portada (texto y botones) aparezca sin esperarlo.
const engine = import('./scene/Experience')
const Experience = lazy(() =>
  engine.then((module) => {
    useGame.getState().setProgress(0.45)
    return { default: module.Experience }
  }),
)

export default function App() {
  useEffect(() => bindKeyboard(() => useGame.getState().mode === 'play'), [])
  useEffect(() => useGame.getState().setProgress(0.08), [])
  const retro = useGame((s) => s.retro)

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
