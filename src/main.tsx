import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/poppins/latin-300.css'
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import './styles.css'
import App from './App'
import { setupInstall } from './game/install'
import { startTracking } from './net/track'
import { useGame } from './store'

// Con la aplicación en marcha, el currículum en texto queda solo para lectores de pantalla.
document.documentElement.classList.add('app')

setupInstall()
startTracking(useGame.getState().lang)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
