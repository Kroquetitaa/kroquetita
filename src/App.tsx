import { useEffect } from 'react'
import { bindKeyboard } from './game/input'
import { Experience } from './scene/Experience'
import { useGame } from './store'
import { Overlay } from './ui/Overlay'

export default function App() {
  useEffect(() => bindKeyboard(() => useGame.getState().mode === 'play'), [])

  return (
    <>
      <div className="stage">
        <Experience />
      </div>
      <Overlay />
    </>
  )
}
