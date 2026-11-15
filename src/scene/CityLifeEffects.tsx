import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { lab } from '../world/lab'
import { blenderGeometry } from '../world/blenderGeometry'
import { blenderAssembly } from '../world/blenderAssembly'
import { useCityLife } from '../game/cityLife'
import { useGame, type Smashable } from '../store'
import { atmosphere } from './atmosphere'

/** Two instanced draws: live concept signals and little toy fragments from the break room. */
export function CityLifeEffects() {
  const tokens=useRef<THREE.InstancedMesh>(null), fragments=useRef<THREE.InstancedMesh>(null)
  const scratch=useMemo(()=>({dummy:new THREE.Object3D(),color:new THREE.Color()}),[])
  useFrame(({clock})=>{
    const game=useGame.getState()
    if(game.place!=='city') return
    const t=atmosphere.reducedMotion?0:clock.elapsedTime
    const {dummy,color}=scratch
    lab.exhibits.forEach((e,i)=>{
      const active=game.concept===i
      const height = (blenderAssembly.exhibits.find(source => source.id === e.id)?.bounds.max[1] ?? 1.3) + .12
      for(let j=0;j<8;j++) {
        const u=(t*(active?.5:.13)+j/8)%1, a=u*Math.PI*2
        let x=Math.cos(a)*e.base[0]*.24,z=Math.sin(a)*e.base[1]*.28,y=height+Math.sin(a*2)*.12
        if(e.id==='rag'||e.id==='agents'||e.id==='mcp'||e.id==='multiagent') { x=(u-.5)*e.base[0]*.75;z=e.base[1]*.22;y=height+Math.sin(u*Math.PI)*.2 }
        if(e.id==='descent') {x=(u-.5)*e.base[0]*.7;z=Math.sin(a)*.2;y=height-u*.5}
        if(e.id==='vectors'||e.id==='diffusion') {x*=1-u;z*=1-u;y=height+Math.cos(a)*.2}
        dummy.position.set(e.position[0]+x,y,e.position[1]+z)
        dummy.rotation.set(a,a*.4,0);dummy.scale.setScalar(active?.055:.03);dummy.updateMatrix()
        tokens.current?.setMatrixAt(i*8+j,dummy.matrix)
        tokens.current?.setColorAt(i*8+j,color.set(active?'#ffba6b':i%2?'#d8beff':'#5ce4e2').multiplyScalar(1.5))
      }
    })
    if(tokens.current) {tokens.current.instanceMatrix.needsUpdate=true;if(tokens.current.instanceColor) tokens.current.instanceColor.needsUpdate=true}
    const impacts=useCityLife.getState().impacts
    blenderGeometry.breakables.forEach((target,i)=>{
      const at=impacts[target.id as Smashable], age=at===undefined?10:(performance.now()-at)/1000
      const visible=age<1.25&&!atmosphere.reducedMotion
      for(let j=0;j<12;j++) {
        const a=j/12*Math.PI*2, speed=.8+(j%3)*.35
        dummy.position.set(target.position[0]+Math.cos(a)*age*speed, Math.max(.07,target.max[1]+age*(1+j%4)-4*age*age),target.position[2]+Math.sin(a)*age*speed)
        dummy.rotation.set(age*(j+2),a,age*3);dummy.scale.setScalar(visible?.12*Math.max(0,1-age/1.25):0);dummy.updateMatrix()
        fragments.current?.setMatrixAt(i*12+j,dummy.matrix)
      }
    })
    if(fragments.current) fragments.current.instanceMatrix.needsUpdate=true
  })
  return <>
    <instancedMesh ref={tokens} args={[undefined,undefined,lab.exhibits.length*8]} frustumCulled={false}><octahedronGeometry args={[1]} /><meshBasicMaterial toneMapped={false} /></instancedMesh>
    <instancedMesh ref={fragments} args={[undefined,undefined,blenderGeometry.breakables.length*12]} frustumCulled={false}><boxGeometry /><meshStandardMaterial color="#ffb653" roughness={.4} metalness={.15} /></instancedMesh>
  </>
}
