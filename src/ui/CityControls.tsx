import { useEffect, useRef, useState, type ReactNode } from 'react'
import { brain, neighborsOf, nodeOf, searchNodes } from '../data/brain'
import { concepts } from '../data/concepts'
import { demos } from '../data/projects'
import { FACTORY_DURATION, useCityLife } from '../game/cityLife'
import { useLang } from '../i18n'
import { useGame, type Daytime } from '../store'
import { warp } from '../game/state'
import { unlockAudio } from '../game/audio'
import { zones } from '../world/zones'
import './city.css'
import { usePortalLaunch } from '../portal/launch'

function Workshop({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const lang = useLang()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    dialog?.focus()
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); useGame.getState().setPanel(null); return }
      if (e.key !== 'Tab' || !dialog) return
      const controls = [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]')].filter(el => !(el as HTMLButtonElement).disabled)
      const first = controls[0], last = controls.at(-1)
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    dialog?.addEventListener('keydown', trap)
    return () => { dialog?.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus() }
  }, [])
  return <><div className="city-backdrop" aria-hidden="true" onClick={() => useGame.getState().setPanel(null)} /><div className="city-workshop" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}>
    <header><div><span className="city-eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="city-close" onClick={() => useGame.getState().setPanel(null)} aria-label={lang === 'es' ? 'Cerrar' : 'Close'}>×</button></header>
    {children}
  </div></>
}

function FactoryPanel() {
  const lang = useLang()
  const es = lang === 'es'
  const [question, setQuestion] = useState(es ? '¿Cómo funciona RAG?' : 'How does RAG work?')
  const started = useCityLife(s => s.factoryStarted)
  const lastQuestion = useCityLife(s => s.factoryQuestion)
  const made = useCityLife(s => s.factoryCount)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!started) { setProgress(made ? 1 : 0); return }
    const update = () => setProgress(Math.min(1, (performance.now() - started) / FACTORY_DURATION))
    update()
    const timer = window.setInterval(update, 100)
    return () => window.clearInterval(timer)
  }, [started, made])
  const query = lastQuestion.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const matches = concepts.filter(c => query.includes(c.id) || c.title[lang].toLocaleLowerCase().split(' ').some(word => word.length > 3 && query.includes(word))).slice(0, 2)
  const steps = es ? ['Pregunta', 'Buscar contexto', 'Preparar respuesta', 'Revisar', '¡Croqueta!'] : ['Question', 'Retrieve context', 'Prepare answer', 'Review', 'Croquette!']
  return <Workshop title={es ? 'La fábrica de ideas' : 'The idea factory'} eyebrow={es ? 'PREGUNTA → CONTEXTO → CROQUETA' : 'QUESTION → CONTEXT → CROQUETTE'}>
    <p>{es ? 'Pon una pregunta en la cinta y sigue el recorrido. Una pequeña simulación con los conceptos de esta ciudad.' : 'Put a question on the belt and follow its journey. A little simulation using this city’s concepts.'}</p>
    <form onSubmit={e => { e.preventDefault(); if (question.trim()) useCityLife.getState().runFactory(question.trim()) }}>
      <label htmlFor="factory-question">{es ? '¿Qué quieres cocinar?' : 'What shall we cook?'}</label>
      <input id="factory-question" maxLength={180} value={question} onChange={e => setQuestion(e.target.value)} disabled={!!started} />
      <div className="city-chips">{['RAG', 'Agentes', 'MCP'].map(topic => <button key={topic} type="button" disabled={!!started} onClick={() => setQuestion(topic === 'Agentes' ? es ? 'Agentes' : 'Agents' : topic)}>{topic === 'Agentes' && !es ? 'Agents' : topic}</button>)}</div>
      <button className="city-primary" disabled={!!started || !question.trim()}>{started ? es ? 'Cocinando…' : 'Cooking…' : es ? 'Fabricar una croqueta ↗' : 'Make a croquette ↗'}</button>
    </form>
    <ol className="factory-steps" aria-label={es ? 'Proceso' : 'Process'}>{steps.map((step, i) => <li key={step} className={progress > i / 5 ? 'is-lit' : ''}><i>{i + 1}</i>{step}</li>)}</ol>
    <progress value={progress} max={1} aria-label={es ? 'Progreso de fabricación' : 'Production progress'} />
    <div className="factory-result" aria-live="polite">{!started && made > 0 && <>
      <span className="city-eyebrow">{es ? 'RECIÉN HECHA · FUENTE: SALA DE CONCEPTOS' : 'FRESHLY MADE · SOURCE: CONCEPTS ROOM'}</span>
      <h3>{es ? 'Una croqueta con fundamento.' : 'A well-grounded croquette.'}</h3>
      {matches.length ? matches.map(c => <p key={c.id}><strong>{c.title[lang]}.</strong> {c.explain[lang]}</p>) : <p>{es ? 'No encontré ese tema en los conceptos de la ciudad. Prueba con RAG, agentes, MCP o vectores: una buena respuesta empieza por tener contexto.' : 'That topic was not found in the city’s concepts. Try RAG, agents, MCP or vectors: a good answer starts with context.'}</p>}
    </>}</div>
  </Workshop>
}

function HangarPanel() {
  const lang = useLang()
  const es = lang === 'es'
  const index = useGame(s => s.hangarDemo)
  const demo = demos[index] ?? demos[0]
  const after = useCityLife(s => s.demoAfter[index])
  const [load, setLoad] = useState(80)
  // Explicit toy model: capacity/backlog, serial/parallel work, valid/quarantined data.
  const capacity = after ? 180 : 50
  const queue = Math.max(0, load - capacity)
  const values = index === 0
    ? [[es ? 'Atendidas / s' : 'Served / s', Math.min(load, capacity)], [es ? 'En espera / s' : 'Queued / s', queue], [es ? 'Latencia estimada (ms)' : 'Estimated latency (ms)', Math.round(40 + queue * 8 + (after ? 5 : 30))]]
    : index === 1
      ? [[es ? 'Tareas' : 'Tasks', load], [es ? 'Especialistas' : 'Specialists', after ? 4 : 1], [es ? 'Pasos de tiempo' : 'Time steps', after ? Math.ceil(load / 4) + 2 : load]]
      : [[es ? 'Registros' : 'Records', load], [es ? 'Defectuosos al destino' : 'Bad records at destination', after ? 0 : Math.floor(load * 0.18)], [es ? 'En cuarentena' : 'Quarantined', after ? Math.floor(load * 0.18) : 0]]
  return <Workshop title={demo.title[lang]} eyebrow={es ? 'HANGAR · LABORATORIO DE PRUEBAS' : 'HANGAR · TEST LAB'}>
    <div className="city-tabs">{demos.map((d, i) => <button key={d.id} aria-pressed={i === index} onClick={() => useGame.getState().useStation(`hangar-${i}` as 'hangar-0' | 'hangar-1' | 'hangar-2')}>{d.id === 'load' ? es ? 'Carga' : 'Load' : d.id === 'agents' ? es ? 'Agentes' : 'Agents' : es ? 'Datos' : 'Data'}</button>)}</div>
    <p>{demo.summary[lang]}</p>
    <label htmlFor="demo-load">{es ? 'Volumen de trabajo' : 'Workload'} <strong>{load}</strong></label>
    <input id="demo-load" type="range" min={10} max={200} step={10} value={load} onChange={e => setLoad(Number(e.target.value))} />
    <div className="city-switch"><button aria-pressed={!after} onClick={() => useCityLife.getState().setDemo(index, false)}>{es ? 'Probar antes' : 'Try before'}</button><button aria-pressed={after} onClick={() => useCityLife.getState().setDemo(index, true)}>{es ? 'Aplicar mejora' : 'Apply improvement'}</button></div>
    <h3>{after ? demo.after[lang] : demo.before[lang]}</h3>
    <div className={`demo-flow ${after ? 'is-improved' : ''}`} aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ animationDelay: `${i * -0.27}s` }} />)}</div>
    <div className="city-metrics" aria-live="polite">{values.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    <div className="city-chips">{demo.skills.map(skill => <span key={skill}>{skill}</span>)}</div>
    <small>{es ? 'Simulación didáctica. Las cifras ilustran este modelo; no son métricas de proyectos reales.' : 'Educational simulation. Figures illustrate this model; they are not real project benchmarks.'}</small>
  </Workshop>
}

function BrainGuide() {
  const lang = useLang()
  const es = lang === 'es'
  const selected = useCityLife(s => s.brainSelected)
  const visited = useCityLife(s => s.brainVisited.length)
  const [query, setQuery] = useState('')
  const node = selected ? nodeOf(selected) : null
  const list = query ? searchNodes(query, lang, 14) : node ? neighborsOf(node.id) : brain.nodes.filter(n => n.kind === 'skill').slice(0, 18)
  const kindNames = es ? { skill: 'Tecnología', stage: 'Etapa', study: 'Formación', concept: 'Concepto', demo: 'Demo' } : { skill: 'Technology', stage: 'Career', study: 'Education', concept: 'Concept', demo: 'Demo' }
  return <aside className="brain-guide" aria-label={es ? 'Explorar conexiones' : 'Explore connections'} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); useGame.getState().leaveBrain() } }}>
    <header><div><span className="city-eyebrow">{es ? 'DENTRO DEL CEREBRO' : 'INSIDE THE BRAIN'}</span><h2>{node?.label[lang] ?? (es ? 'Todo está conectado.' : 'Everything connects.')}</h2></div><button className="city-close" onClick={() => useGame.getState().leaveBrain()} aria-label={es ? 'Volver a la ciudad' : 'Return to city'}>↩</button></header>
    <p>{es ? 'Toca una neurona. Descubre dónde usé cada tecnología y con qué ideas se conecta. Arrastra para girar.' : 'Tap a neuron. Discover where I used each technology and which ideas it connects to. Drag to orbit.'}</p>
    <input aria-label={es ? 'Buscar tecnología' : 'Search technology'} placeholder={es ? 'Busca React, RAG, Python…' : 'Search React, RAG, Python…'} value={query} onChange={e => setQuery(e.target.value)} />
    <span className="city-eyebrow">{query ? es ? 'RESULTADOS' : 'RESULTS' : node ? es ? 'CONEXIONES REALES' : 'REAL CONNECTIONS' : es ? 'ELIGE UNA TECNOLOGÍA' : 'CHOOSE A TECHNOLOGY'}</span>
    <div className="brain-links">{list.map(n => <button key={n.id} onClick={() => { useCityLife.getState().selectNeuron(n.id); setQuery('') }}><span>{n.label[lang]}</span><small>{kindNames[n.kind]}</small></button>)}{!list.length && <p>{es ? 'No hay coincidencias.' : 'No matches.'}</p>}</div>
    <footer>{visited} / 12 {es ? 'neuronas para la medalla' : 'neurons for the medal'} <button onClick={() => useGame.getState().leaveBrain()}>{es ? 'Volver a la ciudad' : 'Return to city'} ↩</button></footer>
  </aside>
}

function CityWelcome() {
  const es = useLang() === 'es'
  const district = useCityLife(s => s.introDistrict)
  const choices = [{ id: 'city', name: es ? 'Toda la ciudad' : 'Whole city' }, ...zones.filter(z => !['team','gym'].includes(z.id)).map(z => ({id:z.id, name:z.name[es?'es':'en']}))]
  const enter = () => {
    unlockAudio(); useGame.getState().play()
    if (district !== 'city') { const zone = zones.find(z => z.id === district)!; warp(zone.arrive[0],0,zone.arrive[1]) }
  }
  return <section className="city-welcome city-welcome-map" aria-label={es ? 'Explora la ciudad de IA' : 'Explore the AI city'}>
    <span className="city-eyebrow">{es ? 'UN PEQUEÑO MUNDO. MUCHAS HISTORIAS.' : 'A LITTLE WORLD. MANY STORIES.'}</span>
    <h2>{es ? 'Bienvenido a mi ciudad.' : 'Welcome to my city.'}</h2>
    <div className="city-welcome-scenes" role="group" aria-label={es ? 'Escenas de la ciudad' : 'City scenes'}>
      {choices.map(c => <button key={c.id} aria-pressed={district === c.id} onClick={() => useCityLife.getState().previewDistrict(c.id as typeof district)}>{c.name}</button>)}
    </div>
    <div className="city-welcome-actions">
      <button className="city-welcome-enter" onClick={enter}>{es ? 'Entrar y explorar' : 'Step inside & explore'} <span aria-hidden="true">↗</span></button>
      <button className="city-portal-enter" onClick={() => usePortalLaunch.getState().launch()}>{es ? 'El pato y los portales' : 'The duck and the portals'} <span aria-hidden="true">✦</span></button>
    </div>
  </section>
}

export function CityControls() {
  const ready = useGame(s => s.ready)
  const mode = useGame(s => s.mode)
  const place = useGame(s => s.place)
  const panel = useGame(s => s.panel)
  const terminal = useGame(s => s.terminal)
  const daytime = useGame(s => s.daytime)
  const weather = useGame(s => s.weather)
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const weatherPanel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (panel || terminal || place !== 'city') setOpen(false)
  }, [panel, terminal, place])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !weatherPanel.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      weatherPanel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    }
    window.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', escape, true)
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape, true) }
  }, [open])
  if (!ready) return null
  const es = lang === 'es'
  const hours: { value: Daytime; label: string; icon: string }[] = [
    { value: 'auto', label: es ? 'Ciclo vivo' : 'Live cycle', icon: '◷' },
    { value: 'day', label: es ? 'Día' : 'Day', icon: '☀' },
    { value: 'sunset', label: es ? 'Atardecer' : 'Sunset', icon: '◒' },
    { value: 'night', label: es ? 'Noche' : 'Night', icon: '☾' },
  ]
  return <>
    {mode === 'intro' && place === 'city' && !panel && !terminal && <CityWelcome />}
    {place === 'city' && !panel && !terminal && <div className="city-weather" ref={weatherPanel}>
      <button className="city-weather-toggle" aria-expanded={open} aria-label={es ? 'Iluminación y reflejos' : 'Lighting and reflections'} onClick={() => setOpen(!open)}>{hours.find(h => h.value === daytime)?.icon ?? '◒'} <span>{es ? 'Luz y atmósfera' : 'Light & atmosphere'}</span><i>{open ? '−' : '+'}</i></button>
      {open && <div className="city-weather-popover">
        <span className="city-eyebrow">{es ? 'LA CIUDAD, A TU HORA' : 'THE CITY, YOUR TIME'}</span>
        <div className="city-hours">{hours.map(h => <button key={h.value} aria-pressed={daytime === h.value} onClick={() => useGame.getState().setDaytime(h.value)}><b>{h.icon}</b>{h.label}</button>)}</div>
        <button className="city-rain" aria-pressed={weather === 'rain'} onClick={() => useGame.getState().setWeather(weather === 'rain' ? 'clear' : 'rain')}>{es ? 'Lluvia · reflejos mojados' : 'Rain · wet reflections'} <span>{weather === 'rain' ? '●' : '○'}</span></button>
      </div>}
    </div>}
    {panel === 'factory' && <FactoryPanel />}
    {panel === 'hangar' && <HangarPanel />}
    {place === 'brain' && <BrainGuide />}
  </>
}
