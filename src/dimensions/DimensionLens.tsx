import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useLang } from '../i18n'
import type { DimensionCamera, DimensionRect, DimensionSessionState, NormalizedRect } from './protocol'
import { cropHostProjection } from './lensProjection'
import './lens.css'

const FULL = { x: 0, y: 0, width: 1, height: 1 }
const DISTRICTS = ['plaza', 'career', 'library', 'bugs', 'hangar', 'lab', 'factory', 'transport', 'brain_exterior']
const SECRET_ASSET = '/models/dimensions/underworld.glb'
const ORIGIN_ASSET = '/models/dimensions/origin.glb?v=nebula-04'
const SECRETS = [
  { id: 'core', point: [0, -1.3, -11.15], color: '#bc9bff', name: ['Las raíces del CORE', 'The roots of the CORE'], clue: ['Una idea nunca nace sola.', 'An idea never grows alone.'], text: ['Debajo del cerebro, una red de raíces conecta todo lo que has aprendido.', 'Under the brain, a network of roots connects everything you have learned.'] },
  { id: 'factory', point: [17, -1.5, 9], color: '#92efcb', name: ['La fábrica clandestina', 'The secret factory'], clue: ['Aquí se cocina algo.', 'Something is cooking here.'], text: ['Las respuestas se ensamblan con contexto, pequeñas decisiones y una cantidad sospechosa de croquetas.', 'Answers are assembled from context, little decisions and a suspicious quantity of croquettes.'] },
  { id: 'duck', point: [0, -.4, 1.8], color: '#ffd186', name: ['El verdadero director', 'The real director'], clue: ['Una señal sospechosa.', 'A suspicious signal.'], text: ['Sí. Era el pato. Siempre ha sido el pato.', 'Yes. It was the duck. It has always been the duck.'] },
] as const
const ORIGIN_SECRETS = [
  { id: 'seed', point: [0, 1, -11.15], color: '#ffaaa5', name: ['El primer impulso', 'The first impulse'], clue: ['Antes de la primera idea.', 'Before the first idea.'], text: ['Aquí empezó todo: una pequeña chispa y demasiadas preguntas.', 'Everything began here: a tiny spark and far too many questions.'] },
  { id: 'infinite', point: [17, -.4, 9], color: '#f5d39f', name: ['La croqueta infinita', 'The infinite croquette'], clue: ['Nada se crea. Se reboza.', 'Nothing is created. It is breaded.'], text: ['La fábrica tiene un origen cósmico. La receta sigue siendo un secreto.', 'The factory has cosmic origins. The recipe is still a secret.'] },
  { id: 'oracle', point: [0, .1, 1], color: '#c8a6ff', name: ['El oráculo del pato', 'The duck oracle'], clue: ['Alguien ya lo sabía.', 'Someone already knew.'], text: ['Antes del mapa, antes del CORE… ya había un pato esperando su momento.', 'Before the map, before the CORE… a duck was already waiting for its moment.'] },
] as const
type SecretId = typeof SECRETS[number]['id'] | typeof ORIGIN_SECRETS[number]['id']
type LensLayer = 1 | 2
const secretsFor = (layer: LensLayer) => layer === 2 ? ORIGIN_SECRETS : SECRETS
export type DimensionLensProps = { session: DimensionSessionState; onReturn?: () => void; preview?: boolean; onOpenNext?: () => void }

class LensBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

/** The lens renders Kroquetita again; it never reads pixels outside this site. */
export function DimensionLens({ session, onReturn, preview = false, onOpenNext }: DimensionLensProps) {
  const es = useLang() === 'es', language = es ? 0 : 1
  const [previewLayer, setPreviewLayer] = useState<LensLayer>(1)
  const layer: LensLayer = preview ? previewLayer : session.layer === 2 ? 2 : 1
  const secrets = secretsFor(layer)
  const [found, setFound] = useState<SecretId[]>([])
  const [selected, select] = useState<SecretId | null>(null)
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0)
  useLayoutEffect(() => { setReady(false); setFailed(false); select(null) }, [layer])
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const returnAction = useRef(onReturn)
  returnAction.current = onReturn
  useEffect(() => {
    const previousTitle = document.title
    document.title = layer === 2
      ? es ? '03 · El origen · Kroquetita' : '03 · The origin · Kroquetita'
      : es ? '02 · El subsuelo · Kroquetita' : '02 · The underworld · Kroquetita'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !returnAction.current) return
      event.preventDefault()
      event.stopPropagation()
      returnAction.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.title = previousTitle
    }
  }, [es, layer])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update); return () => media.removeEventListener('change', update)
  }, [])
  const inBrain = session.camera?.place === 'brain'
  const active = !inBrain && (preview || session.overlap.active && !!session.camera)
  const mask = preview ? FULL : session.overlap.localNormalized
  const discovered = useCallback((id: SecretId) => {
    setFound(previous => previous.includes(id) ? previous : [...previous, id])
  }, [])
  const loaded = useCallback(() => setReady(true), [])
  const errored = useCallback(() => { setFailed(true); setReady(false) }, [])
  const retry = useCallback(() => {
    useGLTF.clear(SECRET_ASSET)
    useGLTF.clear(ORIGIN_ASSET)
    useGLTF.clear(CAST.map(actor => `/models/city/cast/${actor.name}.glb`))
    DISTRICTS.forEach(name => useGLTF.clear(`/models/city/${name}.glb`))
    setFailed(false); setReady(false); setAttempt(value => value + 1)
  }, [])
  const chosen = secrets.find(secret => secret.id === selected)
  const inset = `${mask.y * 100}% ${(1 - mask.x - mask.width) * 100}% ${(1 - mask.y - mask.height) * 100}% ${mask.x * 100}%`
  return <main className={`dimension-lens ${active ? 'is-revealing' : ''} ${preview ? 'is-preview' : ''} ${layer === 2 ? 'is-origin' : ''}`}>
    <div className="dimension-grid" aria-hidden="true" />
    {active && <div className="dimension-aperture" style={{ clipPath: `inset(${inset} round 18px)` }}>
      <Canvas key={`${layer}-${attempt}`} dpr={[1, 1.25]} camera={{ position: [25, 40, 45], near: .1, far: 300 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.3 }}
        aria-label={preview ? es ? 'Reverso de la ciudad: toca una señal para acercarte' : 'The reverse city: tap a signal to zoom in' : es ? 'Reverso de la ciudad, alineado con la otra ventana' : 'The reverse city, aligned with the other window'}>
        <LensBoundary onError={errored}>
          <LensWorld layer={layer} frame={session.camera} local={session.localRect} preview={preview} mask={mask} reducedMotion={reducedMotion} selected={selected} onDiscover={discovered} onReady={loaded} />
        </LensBoundary>
      </Canvas>
    </div>}
    {active && <div className="dimension-frame" aria-hidden="true" style={{ left: `${mask.x * 100}%`, top: `${mask.y * 100}%`, width: `${mask.width * 100}%`, height: `${mask.height * 100}%` }}><i /><i /><i /><i /></div>}
    <header className="dimension-header">
      <button className="dimension-return" onClick={onReturn}>↗ <span>{es ? 'Explorar esta ciudad' : 'Explore this city'}</span></button>
      <span className={`dimension-status ${active && ready ? 'is-live' : ''}`} role="status"><i />{failed ? es ? 'SEÑAL EN PAUSA' : 'SIGNAL PAUSED' : active ? ready ? es ? 'OTRA CAPA, MISMA CIUDAD' : 'ANOTHER LAYER, SAME CITY' : es ? 'REVELANDO EL REVERSO' : 'REVEALING THE REVERSE' : es ? 'VENTANA LENTE' : 'LENS WINDOW'}</span>
    </header>
    <div className="dimension-title"><span>KROQUETITA / {layer === 2 ? es ? 'EL ORIGEN' : 'THE ORIGIN' : es ? 'EL SUBSUELO' : 'THE UNDERWORLD'}</span><h1>{layer === 2 ? es ? 'Antes de la primera idea.' : 'Before the first idea.' : es ? 'Lo que no se veía.' : 'What you couldn’t see.'}</h1>
      {preview && <div className="dimension-tabs" role="tablist" aria-label={es ? 'Capas de la ciudad' : 'City layers'}>{([1, 2] as const).map(value => <button key={value} role="tab" aria-selected={layer === value} onClick={() => setPreviewLayer(value)}>{value === 1 ? es ? 'Subsuelo' : 'Underworld' : es ? 'Origen' : 'Origin'}</button>)}</div>}
    </div>
    {!active && <section className="dimension-invite">
      <div className="dimension-window-symbol" aria-hidden="true"><i /><b>✦</b></div>
      <h2>{inBrain ? es ? 'La ciudad guarda más secretos.' : 'The city has more secrets.' : layer === 2 ? es ? 'Superpón las tres ventanas.' : 'Overlap all three windows.' : es ? 'Pon esta ventana sobre la ciudad.' : 'Place this window over the city.'}</h2>
      <p>{inBrain ? es ? 'Vuelve al mapa en la ventana principal para seguir mirando su reverso.' : 'Return to the map in the main window to keep exploring its reverse.' : layer === 2 ? es ? 'Coloca esta ventana sobre la lente del subsuelo y el mapa. El origen aparece en la intersección de las tres.' : 'Place this window over the underworld lens and the map. The origin appears where all three overlap.' : es ? 'Muévela por encima del mapa de la otra ventana. El subsuelo aparecerá justo donde se crucen.' : 'Move it over the map in the other window. The underworld appears exactly where they overlap.'}</p>
      <span>{es ? 'Tres señales esperan al otro lado.' : 'Three signals await on the other side.'}</span>
    </section>}
    {active && (!ready || failed) && <div className="dimension-loading" role={failed ? 'alert' : 'status'}>
      <span aria-hidden="true">✦</span><strong>{failed ? es ? 'El reverso necesita otro intento.' : 'The reverse needs another try.' : es ? 'Siguiendo las raíces…' : 'Following the roots…'}</strong>
      {failed && <button onClick={retry}>{es ? 'Reintentar' : 'Try again'}</button>}
    </div>}
    <aside className="dimension-secrets" aria-label={es ? 'Secretos encontrados' : 'Discovered secrets'}>
      <div className="dimension-count"><span>{es ? 'SEÑALES' : 'SIGNALS'}</span><b>{secrets.filter(secret => found.includes(secret.id)).length}<small> / 3</small></b></div>
      {secrets.map((secret, index) => <button key={secret.id} className={`${found.includes(secret.id) ? 'is-found' : ''} ${selected === secret.id ? 'is-selected' : ''}`} style={{ '--secret-color': secret.color } as React.CSSProperties} onClick={() => select(selected === secret.id ? null : secret.id)} aria-pressed={selected === secret.id}>
        <span>{found.includes(secret.id) ? '✦' : `0${index + 1}`}</span><div><b>{found.includes(secret.id) ? secret.name[language] : secret.clue[language]}</b><small>{found.includes(secret.id) ? es ? 'DESCUBIERTO' : 'DISCOVERED' : es ? 'BUSCA SU BRILLO' : 'FIND ITS GLOW'}</small></div>
      </button>)}
      {preview && selected && <button className="dimension-next dimension-overview" onClick={() => select(null)} aria-label={es ? 'Volver a la vista general del reverso' : 'Return to the overview of the reverse city'}>{es ? 'Volver al mapa' : 'Back to the map'} <span>↙</span></button>}
      {layer === 1 && !preview && onOpenNext && <button className="dimension-next" onClick={onOpenNext}>{es ? 'Abrir tercera capa' : 'Open third layer'} <span>↗</span></button>}
    </aside>
    <footer className="dimension-footer">
      {chosen && found.includes(chosen.id) ? <div className="dimension-discovery" aria-live="polite"><span style={{ color: chosen.color }}>✦</span><p>{chosen.text[language]}</p></div> : <p className="dimension-hint">{preview ? es ? 'Toca una señal para acercarte.' : 'Tap a signal to zoom in.' : es ? 'Mueve la ventana. Sigue el brillo. Encuentra quién mueve los hilos.' : 'Move the window. Follow the glow. Find out who pulls the strings.'}</p>}
      <span className="dimension-coordinate">{active ? es ? 'ENCUADRE CONECTADO' : 'VIEW CONNECTED' : es ? 'ESPERANDO SOLAPE' : 'WAITING FOR OVERLAP'} <i /></span>
    </footer>
  </main>
}

function LensWorld({ layer, frame, local, preview, mask, reducedMotion, selected, onDiscover, onReady }: {
  layer: LensLayer;
  frame: DimensionCamera | null; local: DimensionRect; preview: boolean; mask: NormalizedRect; reducedMotion: boolean;
  selected: SecretId | null; onDiscover: (id: SecretId) => void; onReady: () => void;
}) {
  return <>
    <color attach="background" args={[layer === 2 ? '#211327' : '#10162a']} />
    {preview ? <PreviewCamera layer={layer} selected={selected} reducedMotion={reducedMotion} /> : <SynchronizedCamera frame={frame} local={local} preview={false} />}
    <ambientLight intensity={1.5} color="#c3c4ff" />
    <directionalLight position={[-18, 24, 16]} intensity={3.2} color={layer === 2 ? '#ffd1bd' : '#d9f9ef'} />
    <directionalLight position={[22, 10, -15]} intensity={2.2} color="#b693ff" />
    <Environment frames={1} resolution={128}>
      <Lightformer form="rect" intensity={4} position={[0, 12, 10]} scale={[30, 8, 1]} />
      <Lightformer form="rect" intensity={4} color="#b38aff" position={[-20, 5, 0]} scale={[5, 15, 1]} rotation-y={Math.PI / 2} />
      <Lightformer form="rect" intensity={3} color="#92efcb" position={[20, 5, 0]} scale={[5, 15, 1]} rotation-y={-Math.PI / 2} />
    </Environment>
    {DISTRICTS.map(name => <Suspense key={name} fallback={null}><GhostDistrict name={name} layer={layer} /></Suspense>)}
    <Suspense fallback={null}><Underworld layer={layer} reducedMotion={reducedMotion} onReady={onReady} /><SecretScanner layer={layer} mask={mask} onDiscover={onDiscover} /></Suspense>
    {layer === 1 && <Suspense fallback={null}><HiddenCast reducedMotion={reducedMotion} /></Suspense>}
    <SignalRings layer={layer} selected={selected} reducedMotion={reducedMotion} />
    <ScissoredRender mask={mask} />
  </>
}

/** Independent preview navigation; the desktop lens keeps its exact host projection. */
function PreviewCamera({ layer, selected, reducedMotion }: { layer: LensLayer; selected: SecretId | null; reducedMotion: boolean }) {
  const { set, size } = useThree()
  const camera = useMemo(() => new THREE.PerspectiveCamera(42, 1, .1, 350), [])
  const movement = useMemo(() => ({ target: new THREE.Vector3(), position: new THREE.Vector3(), look: new THREE.Vector3(), started: false }), [])
  const secret = secretsFor(layer).find(item => item.id === selected)
  useLayoutEffect(() => {
    ;(camera as THREE.Camera & { manual?: boolean }).manual = true
    set({ camera })
  }, [camera, set])
  useLayoutEffect(() => {
    camera.aspect = size.width / size.height
    // Put the subject above center, between the title and the bottom signal cards.
    camera.setViewOffset(size.width, size.height, 0, size.height * (size.width <= 760 ? .065 : 0), size.width, size.height)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  useFrame((_, delta) => {
    const radius = secret ? secret.id === 'factory' ? 6.5 : secret.id === 'infinite' ? 5.2 : 4.3 : 33
    const distance = Math.max(secret ? 17 : 75, radius / (Math.tan(THREE.MathUtils.degToRad(21)) * camera.aspect))
    if (secret) movement.target.fromArray(secret.point)
    else movement.target.set(0, -1, -4)
    movement.position.set(distance * .16, distance * .61, distance * .78).add(movement.target)
    const blend = reducedMotion || !movement.started ? 1 : 1 - Math.exp(-4.5 * Math.min(delta, .1))
    camera.position.lerp(movement.position, blend)
    movement.look.lerp(movement.target, blend)
    camera.lookAt(movement.look)
    camera.updateMatrixWorld(true)
    movement.started = true
  }, -100)
  return null
}

function SynchronizedCamera({ frame, local, preview }: { frame: DimensionCamera | null; local: DimensionRect; preview: boolean }) {
  const { set, size } = useThree()
  const perspective = useMemo(() => new THREE.PerspectiveCamera(), [])
  const orthographic = useMemo(() => new THREE.OrthographicCamera(), [])
  const fallback = useMemo(() => new THREE.PerspectiveCamera(42, 1, .1, 350), [])
  const camera = frame?.type === 'orthographic' ? orthographic : perspective
  useLayoutEffect(() => {
    ;(camera as THREE.Camera & { manual?: boolean }).manual = true
    camera.matrixAutoUpdate = false; camera.matrixWorldAutoUpdate = false
    set({ camera })
  }, [camera, set])
  useFrame(() => {
    if (frame) {
      camera.near = frame.near; camera.far = frame.far
      camera.matrixWorld.fromArray(frame.matrixWorld)
      camera.matrix.copy(camera.matrixWorld)
      camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale)
      cropHostProjection(frame.projectionMatrix, preview ? local : frame.rect, local, camera.projectionMatrix)
    } else {
      fallback.aspect = size.width / size.height
      const distance = Math.max(75, 33 / (Math.tan(THREE.MathUtils.degToRad(21)) * fallback.aspect))
      fallback.position.set(distance * .16, distance * .61, distance * .78 - 4)
      fallback.lookAt(0, -1, -4); fallback.updateProjectionMatrix(); fallback.updateMatrixWorld(true)
      camera.matrixWorld.copy(fallback.matrixWorld); camera.matrix.copy(fallback.matrix)
      camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale)
      camera.projectionMatrix.copy(fallback.projectionMatrix)
    }
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  }, -100)
  return null
}

function ScissoredRender({ mask }: { mask: NormalizedRect }) {
  useFrame(({ gl, scene, camera, size }) => {
    gl.setScissorTest(false); gl.clear()
    gl.setScissor(mask.x * size.width, (1 - mask.y - mask.height) * size.height, mask.width * size.width, mask.height * size.height)
    gl.setScissorTest(true); gl.render(scene, camera); gl.setScissorTest(false)
  }, 1)
  return null
}

function GhostDistrict({ name, layer }: { name: string; layer: LensLayer }) {
  const gltf = useGLTF(`/models/city/${name}.glb`)
  const ghost = useMemo(() => {
    const scene = gltf.scene.clone(true)
    const material = new THREE.MeshBasicMaterial({ color: layer === 2 ? '#dcc0e7' : '#aab8df', transparent: true, opacity: layer === 2 ? .035 : .065, depthWrite: false, depthTest: false })
    const geometries: THREE.BufferGeometry[] = []
    scene.updateMatrixWorld(true)
    scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return
      node.castShadow = false; node.receiveShadow = false; node.renderOrder = 8; node.material = material
      node.raycast = () => undefined
      const geometry = node.geometry as THREE.BufferGeometry, positions = geometry.attributes.position, indices = geometry.index
      if (!positions || !indices) return
      // Remove native ground triangles even when batching mixed them with walls.
      const worldY = new Float32Array(positions.count), vertex = new THREE.Vector3()
      for (let i = 0; i < positions.count; i++) worldY[i] = vertex.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).y
      const keep: number[] = []
      for (let i = 0; i < indices.count; i += 3) {
        const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2)
        const low = Math.min(worldY[a], worldY[b], worldY[c]), high = Math.max(worldY[a], worldY[b], worldY[c])
        if (low > -.65 && high < .09) continue
        keep.push(a, b, c)
      }
      if (keep.length !== indices.count) { const copy = geometry.clone(); copy.setIndex(keep); node.geometry = copy; geometries.push(copy) }
    })
    return { scene, material, geometries }
  }, [gltf.scene, layer])
  useEffect(() => () => { ghost.material.dispose(); ghost.geometries.forEach(geometry => geometry.dispose()) }, [ghost])
  return <primitive object={ghost.scene} dispose={null} />
}

function Underworld({ layer, reducedMotion, onReady }: { layer: LensLayer; reducedMotion: boolean; onReady: () => void }) {
  const gltf = useGLTF(layer === 2 ? ORIGIN_ASSET : SECRET_ASSET)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const ready = useRef(onReady); ready.current = onReady
  useEffect(() => { ready.current() }, [])
  const rigs = useMemo(() => (layer === 2 ? ['OriginSeed', 'OriginRing', 'CroquetteOrbit', 'OracleEgg'] : ['NeuralCore', 'Ring', 'Conveyor', 'BobDuck']).map(name => {
    const node = scene.getObjectByName(name)
    return node ? { node, position: node.position.clone(), rotation: node.rotation.clone() } : null
  }), [scene, layer])
  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime
    rigs.forEach((rig, index) => {
      if (!rig) return
      if (index === 0) rig.node.rotation.y = rig.rotation.y + Math.sin(t * .6) * .09
      if (index === 1) rig.node.rotation.y = rig.rotation.y + t * .18
      if (index === 2) {
        if (layer === 2) rig.node.rotation.y = rig.rotation.y + t * .16
        else rig.node.children.forEach((child, i) => { if (/^Item_/.test(child.name)) child.position.x = -4.2 + ((t * .65 + i * 1.4) % 8.4) })
      }
      if (index === 3) { rig.node.position.y = rig.position.y + Math.sin(t * 1.3) * .10; rig.node.rotation.z = rig.rotation.z + Math.sin(t * .7) * .035 }
    })
  })
  return <primitive object={scene} dispose={null} />
}

const CAST = [
  { name: 'Claude', at: [3, -3.30, -7.8] }, { name: 'ChatGPT', at: [13.5, -3.30, 12.5] },
  { name: 'Gemini', at: [19.2, -3.30, 12.5] }, { name: 'Qwen3', at: [-17, -3.30, -11.2] },
  { name: 'Mistral', at: [-20, -3.30, 12] }, { name: 'duck', at: [2.7, -3.10, 4.1] },
] as const
function HiddenCast({ reducedMotion }: { reducedMotion: boolean }) {
  const assets = useGLTF(CAST.map(actor => `/models/city/cast/${actor.name}.glb`))
  return <>{CAST.map((actor, index) => <SecretActor key={actor.name} source={assets[index].scene} at={actor.at} index={index} reducedMotion={reducedMotion} />)}</>
}
function SecretActor({ source, at, index, reducedMotion }: { source: THREE.Group; at: readonly number[]; index: number; reducedMotion: boolean }) {
  const root = useRef<THREE.Group>(null)
  const scene = useMemo(() => source.clone(true), [source])
  const joints = useMemo(() => ['Head', 'Arm_L', 'Arm_R', 'Leg_L', 'Leg_R'].map(name => scene.getObjectByName(name)), [scene])
  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : clock.elapsedTime, phase = t * 1.1 + index
    if (root.current) { root.current.position.set(at[0] + Math.sin(phase) * .3, at[1], at[2] + Math.cos(phase) * .2); root.current.rotation.y = Math.cos(phase) * .6 }
    const stride = reducedMotion ? 0 : Math.sin(t * 5 + index) * .2
    if (joints[0]) joints[0].rotation.z = stride * .2
    if (joints[1]) joints[1].rotation.x = -.5 + stride
    if (joints[2]) joints[2].rotation.x = -.5 - stride
    if (joints[3]) joints[3].rotation.x = stride
    if (joints[4]) joints[4].rotation.x = -stride
  })
  return <group ref={root}><primitive object={scene} dispose={null} /></group>
}

function SecretScanner({ layer, mask, onDiscover }: { layer: LensLayer; mask: NormalizedRect; onDiscover: (id: SecretId) => void }) {
  const checked = useRef(0), discovered = useRef(new Set<SecretId>())
  const point = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, clock }) => {
    if (clock.elapsedTime - checked.current < .2) return
    checked.current = clock.elapsedTime
    secretsFor(layer).forEach(secret => {
      if (discovered.current.has(secret.id)) return
      point.fromArray(secret.point).project(camera)
      const x = (point.x + 1) / 2, y = (1 - point.y) / 2
      if (point.z > -1 && point.z < 1 && x > mask.x && x < mask.x + mask.width && y > mask.y && y < mask.y + mask.height) {
        discovered.current.add(secret.id); onDiscover(secret.id)
      }
    })
  })
  return null
}

function SignalRings({ layer, selected, reducedMotion }: { layer: LensLayer; selected: SecretId | null; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    group.current?.children.forEach((child, i) => {
      const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 1.4 + i) * .07
      child.scale.setScalar(pulse * (selected === secretsFor(layer)[i].id ? 1.35 : 1))
    })
  })
  return <group ref={group}>{secretsFor(layer).map(secret => <group key={secret.id} position={[secret.point[0], secret.point[1] + .3, secret.point[2]]}>
    <mesh rotation-x={-Math.PI / 2}><torusGeometry args={[1.65, .035, 6, 48]} /><meshBasicMaterial color={secret.color} transparent opacity={.65} toneMapped={false} depthWrite={false} /></mesh>
    <pointLight color={secret.color} intensity={5} distance={8} decay={2} />
  </group>)}</group>
}
