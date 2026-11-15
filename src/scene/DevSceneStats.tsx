import { useEffect, useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useGame } from '../store'

/** Opt-in visible diagnostics for local scene verification: ?inspect=1. Never shipped in production. */
export function DevSceneStats() {
  const gl = useThree(s => s.gl)
  const timer = useRef({ seconds: 0, frames: 0, calls: 0, triangles: 0 })
  const [stats, setStats] = useState('Midiendo…')
  const hits = useGame(s => s.smashCount)
  useEffect(() => { gl.info.autoReset = false; return () => { gl.info.autoReset = true } }, [gl])
  useFrame((_, dt) => {
    const s=timer.current
    s.seconds+=dt; s.frames++; s.calls+=gl.info.render.calls; s.triangles+=Number.isFinite(gl.info.render.triangles) ? gl.info.render.triangles : 0
    if(s.seconds>=2) {
      setStats(`${Math.round(s.frames/s.seconds)} FPS · DPR ${gl.getPixelRatio().toFixed(2)} · ${Math.round(s.calls/s.frames)} draws (todos los pases)`)
      s.seconds=0;s.frames=0;s.calls=0;s.triangles=0
    }
    gl.info.reset()
  }, -100)
  return <Html fullscreen calculatePosition={(_, __, size) => [size.width/2,size.height/2]} style={{pointerEvents:'none'}}><output style={{position:'absolute',top:78,right:24,zIndex:100,background:'#101323',color:'#baf3cb',font:'11px monospace',padding:10,borderRadius:8}}>{stats} · {hits} impactos</output></Html>
}
