import { useEffect, useState, type CSSProperties } from 'react'
import { useLang, useUI } from '../i18n'
import { useGame } from '../store'
import '../game/loading'
import './loading-city.css'

const actors = ['Claude', 'ChatGPT', 'Gemini', 'Qwen3', 'Mistral']
const phrases = {
  es: ['¡Ese pato tiene el contexto!', 'No es un bug. Es un pato.', '¡Espera, aún estoy pensando!', 'Procesando… cuac.', 'La IA corre. El pato compila.'],
  en: ['That duck has the context!', 'It is not a bug. It is a duck.', 'Wait! I am still thinking!', 'Processing… quack.', 'The AI runs. The duck compiles.'],
}
const phases = [.45, .65, .85, 1]

export function LoadingCity() {
  const lang = useLang(), t = useUI()
  const progress = useGame(s => s.progress)
  const [line, setLine] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setLine(n => (n + 1) % phrases.es.length), 1300)
    return () => clearInterval(timer)
  }, [])
  const index = Math.max(0, phases.findIndex(cap => progress < cap))
  return <section className="loading-city" aria-label={lang === 'es' ? 'Cargando Kroquetita' : 'Loading Kroquetita'} aria-busy="true">
    <div className="loading-city-orbit" aria-hidden="true" />
    <div className="loading-city-brand">KROQUETITA<span>UN PEQUEÑO MUNDO. MUCHAS HISTORIAS.</span></div>
    <div className="loading-city-content">
      <p className="loading-city-eyebrow">{lang === 'es' ? 'MIENTRAS LA CIUDAD DESPIERTA' : 'WHILE THE CITY WAKES UP'}</p>
      <h1>{lang === 'es' ? <>Un momento.<br />Se nos escapa el pato.</> : <>One moment.<br />The duck is getting away.</>}</h1>
      <div className="loading-city-stage" aria-hidden="true">
        <div className="loading-city-trail"><i /><i /><i /></div>
        <div className="loading-city-chase">
          {actors.map((name, i) => <div className={`loading-city-runner runner-${i}`} key={name} style={{ '--runner': i } as CSSProperties}>
            <div className="loading-city-walk" style={{ backgroundImage: `url('/images/loading/${name}-walk.webp')` }} />
            <span className="runner-name">{name}</span>
            {i === line && <span className="loading-city-bubble">{phrases[lang][line]}</span>}
          </div>)}
          <div className="loading-city-duck"><span>{lang === 'es' ? '¡CUAC!' : 'QUACK!'}</span><div className="loading-city-walk" style={{ backgroundImage: "url('/images/loading/duck-walk.webp')" }} /></div>
          <i className="loading-city-dust dust-one" /><i className="loading-city-dust dust-two" />
        </div>
      </div>
      <p className="loading-city-quote">{lang === 'es' ? 'Dicen que lo tienen todo bajo control.' : 'They say they have everything under control.'}</p>
      <div className="loading-city-progress" role="progressbar" aria-label={lang === 'es' ? 'Preparando la ciudad' : 'Preparing the city'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="loading-city-caption"><span>{t.loading[Math.min(index, t.loading.length - 1)]}</span><b>{Math.round(progress * 100)}%</b></div>
      <p className="loading-city-tip">{lang === 'es' ? 'Explora, salta y descubre quién vive en cada rincón.' : 'Explore, jump, and discover who lives around every corner.'}</p>
    </div>
    <span className="loading-city-signature">{lang === 'es' ? 'HECHO CON CÓDIGO, CAFÉ Y ALGUNA CROQUETA.' : 'MADE WITH CODE, COFFEE AND A FEW CROQUETTES.'}</span>
  </section>
}

