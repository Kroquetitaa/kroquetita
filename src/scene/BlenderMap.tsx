import { useFrame } from '@react-three/fiber'
import { Html, Text } from '@react-three/drei'
import font from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import { CityModel } from './CityModel'
import { Zone } from './Zone'
import { areaOf, trainStation } from '../world/zones'
import { blenderGeometry } from '../world/blenderGeometry'
import { world } from '../world/layout'
import { lab } from '../world/lab'
import { body, shake } from '../game/state'
import { isWorldClick } from '../game/worldClick'
import { concepts } from '../data/concepts'
import { useGame, type Smashable } from '../store'
import { sfx } from '../game/audio'
import { useLang } from '../i18n'
import { useCityLife } from '../game/cityLife'
import { CityLifeEffects } from './CityLifeEffects'
import { CareerBranding } from './CareerBranding'
import { CoreSignals } from './CoreSignals'
import { usePortalLaunch } from '../portal/launch'

/** The complete Blender assembly, exported in its original world coordinates. */
export function BlenderMap() {
  const lang = useLang()
  const showPortal = useCityLife(s => s.introDistrict === 'career')
  const playing = useGame(s => s.mode === 'play' && s.place === 'city' && !s.panel)
  useFrame(() => {
    const game = useGame.getState()
    if (game.mode !== 'play' || game.place !== 'city' || game.panel) return
    const [x, y, z] = body.pos
    const study = body.grounded ? world.props.campus.books.findIndex(b => Math.abs(y - b.center[1] - b.size[1] / 2) < .22 && Math.abs(x-b.center[0]) < b.size[0]/2 && Math.abs(z-b.center[2]) < b.size[2]/2) : -1
    game.setStudy(study < 0 ? null : study)
    if (study === world.props.campus.books.length - 1) game.unlock('graduate')
    const exhibit = y < .7 ? lab.exhibits.find(e => Math.abs(x-e.pad.center[0]) < e.pad.size[0]/2 + .3 && Math.abs(z-e.pad.center[2]) < e.pad.size[2]/2 + .3) : undefined
    game.setConcept(exhibit ? concepts.findIndex(c => c.id === exhibit.id) : null)
    const nearTrain = y < .6 && Math.hypot(x-trainStation.pad[0],z-trainStation.pad[1]) < trainStation.reach
    if (nearTrain) game.setStation('train')
    else if (game.station === 'train') game.setStation(null)
    for (const target of blenderGeometry.breakables) {
      const hit = useCityLife.getState().impacts[target.id as Smashable]
      if (hit && performance.now()-hit < 3200) continue
      const touching = x > target.min[0] - .42 && x < target.max[0] + .42 && z > target.min[2] - .42 && z < target.max[2] + .42
      if (touching && ((y < 1.2 && body.speed > .5) || (body.vel[1] < -1 && y < target.max[1] + .2))) {
        useCityLife.getState().hitExhibit(target.id as Smashable); shake.value = .16; sfx.squash()
        if (body.vel[1] < -1) { body.vel[1] = 5; body.grounded = false }
      }
    }
  })
  const actions = [
    { hook: 'Hook_Map', title: lang === 'es' ? 'MAPA' : 'MAP', action: () => useGame.getState().setPanel('map') },
    { hook: 'Hook_Photo', title: lang === 'es' ? 'FOTO' : 'PHOTO', action: () => useGame.getState().setPanel('photo') },
    { hook: 'Hook_TimeMachine', title: lang === 'es' ? 'TRAYECTORIA' : 'CAREER', action: () => useGame.getState().tour() },
    { hook: 'Hook_Training', title: lang === 'es' ? 'ENTRENAR' : 'TRAIN', action: () => useGame.getState().useStation('train') },
  ] as const
  return <>
    <CityModel name="career" />
    <CareerBranding />
    <CoreSignals />
    {(showPortal || playing) && <Html center position={[world.core[0] + 2, world.core[1] - 1.25, world.core[2]]} distanceFactor={16}>
      <button className="core-portal-button" onClick={() => usePortalLaunch.getState().launch()}>✦ {lang === 'es' ? 'Abrir otra dimensión' : 'Open another dimension'}</button>
    </Html>}
    <CityModel name="plaza" />
    <Zone area={areaOf('library')}><CityModel name="library" /></Zone>
    <Zone area={areaOf('arcade')}><CityModel name="bugs" /></Zone>
    <Zone area={areaOf('lab')}><CityModel name="lab" /></Zone>
    <CityModel name="transport" />
    <CityModel name="brain_exterior" />
    <CityLifeEffects />
    {actions.map(({hook,title,action}) => {
      const at = blenderGeometry.hooks[hook]
      return <group key={hook} position={[at[0], at[1]+.35, at[2]+.15]} onClick={e => { if (!isWorldClick(e)) return; e.stopPropagation(); action() }}>
        <Text font={font} fontSize={.16} color="#b8efff" outlineColor="#121527" outlineWidth={.018}>{title} ↗</Text>
        <mesh><sphereGeometry args={[.55,8,6]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
      </group>
    })}
    {lab.exhibits.map(e => <mesh key={e.id} position={e.pad.center} rotation-x={-Math.PI/2}>
      <ringGeometry args={[.38, .42, 24]} /><meshBasicMaterial color="#49e4ef" transparent opacity={.7} />
    </mesh>)}
  </>
}
