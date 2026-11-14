import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import fontBold from '@fontsource/poppins/files/poppins-latin-600-normal.woff?url'
import {
  internLines,
  internName,
  josebaShouts,
  pochitaCoin,
  pochitaShouts,
  talkers,
  teamSpot,
  type Talker,
  type TalkerId,
} from '../data/folk'
import { body } from '../game/state'
import { currentLang, QUEST_TEXT, useLang } from '../i18n'
import { useGame } from '../store'
import { world } from '../world/layout'
import { Detail } from './Detail'
import { introProgress } from './intro'
import { createNeonMaterial } from './materials/shaders'
import { Bubble } from './Player'

/**
 * Gente nueva en la plaza: cuatro personajes con los que se puede hablar
 * (reclutadora, guía, QA y sysadmin) y un becario que te sigue haciendo
 * preguntas. Los diálogos se leen en la interfaz; aquí solo va el muñeco y
 * el aviso de «pulsa E» sobre su cabeza.
 */

const SKIN = new THREE.MeshStandardMaterial({ color: '#f1d9c5', roughness: 0.7 })
const INK = new THREE.MeshBasicMaterial({ color: '#14161b' })
const DARK = new THREE.MeshStandardMaterial({ color: '#1b1e26', roughness: 0.5, metalness: 0.5 })
const PAPER = new THREE.MeshStandardMaterial({ color: '#f3f4f7', roughness: 0.6 })
const STEEL = new THREE.MeshStandardMaterial({ color: '#8d95a3', roughness: 0.3, metalness: 0.9 })

/** Radio al que se puede empezar a hablar, y al que se corta la conversación */
const TALK_RANGE = 2.3
const LEAVE_RANGE = 3.6

type Kit = TalkerId | 'intern'

/** Aspecto de los compañeros del equipo: pelo, complemento y lo que llevan en la mano */
interface MateLook {
  hair: string
  style: 'short' | 'side' | 'tall'
  extra: 'none' | 'glasses' | 'headset' | 'cap'
  held: 'none' | 'tablet' | 'laptop' | 'mug'
}
const MATES: Partial<Record<Kit, MateLook>> = {
  alex: { hair: '#2a1b12', style: 'side', extra: 'none', held: 'tablet' },
  dani: { hair: '#6b4a2b', style: 'short', extra: 'glasses', held: 'laptop' },
  josete: { hair: '#1c1c22', style: 'tall', extra: 'none', held: 'mug' },
  cristian: { hair: '#3b2416', style: 'short', extra: 'headset', held: 'none' },
  pablo: { hair: '#8a5a2b', style: 'side', extra: 'cap', held: 'mug' },
}

/** Distancia de cada personaje al jugador: entre los que están al alcance, se habla con el más cercano */
const reach: Partial<Record<TalkerId, number>> = {}

/** ¿Hay algún obstáculo a ras de suelo en ese punto? */
function blocked(x: number, z: number, margin = 0.45) {
  for (const c of world.colliders) {
    if (c.min[1] > 0.6) continue
    if (x > c.min[0] - margin && x < c.max[0] + margin && z > c.min[2] - margin && z < c.max[2] + margin) return true
  }
  return false
}

interface PuppetParts {
  root: React.RefObject<THREE.Group | null>
  head: React.RefObject<THREE.Group | null>
  arms: React.RefObject<THREE.Group | null>
}

/** El muñeco: cuerpo y cabeza en la capa normal (dan sombra); el resto es detalle. */
function Puppet({ kit, color, accent, parts }: { kit: Kit; color: string; accent: string; parts: PuppetParts }) {
  const neon = useMemo(() => createNeonMaterial(accent, 1.5), [accent])
  const cloth = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.65 }), [color])
  const mate = MATES[kit]
  const hair = useMemo(() => (mate ? new THREE.MeshStandardMaterial({ color: mate.hair, roughness: 0.9 }) : null), [mate])
  return (
    <group ref={parts.root}>
      <mesh position-y={0.5} material={cloth} castShadow>
        <boxGeometry args={[0.42, 0.46, 0.28]} />
      </mesh>
      <group ref={parts.head} position-y={0.96}>
        <mesh material={SKIN} castShadow>
          <boxGeometry args={[0.44, 0.42, 0.4]} />
        </mesh>
        <Detail>
          {[-0.1, 0.1].map((x) => (
            <mesh key={x} position={[x, 0.03, 0.202]} material={INK}>
              <planeGeometry args={[0.06, 0.1]} />
            </mesh>
          ))}
          <mesh position={[0, -0.1, 0.202]} material={INK}>
            <planeGeometry args={[0.14, 0.025]} />
          </mesh>
          {/* Pelo, gorra o capucha, según el personaje */}
          {kit === 'recruiter' && (
            <>
              <mesh position={[0, 0.2, -0.02]}>
                <boxGeometry args={[0.48, 0.14, 0.46]} />
                <meshStandardMaterial color="#5a2d1a" roughness={0.8} />
              </mesh>
              <mesh position={[0, 0.1, 0]} material={DARK}>
                <boxGeometry args={[0.5, 0.05, 0.08]} />
              </mesh>
              <mesh position={[0.2, -0.08, 0.16]} material={DARK}>
                <boxGeometry args={[0.03, 0.03, 0.18]} />
              </mesh>
            </>
          )}
          {kit === 'guide' && (
            <>
              <mesh position={[0, 0.24, 0]} material={neon}>
                <boxGeometry args={[0.46, 0.1, 0.42]} />
              </mesh>
              <mesh position={[0, 0.2, 0.28]} material={neon}>
                <boxGeometry args={[0.4, 0.03, 0.18]} />
              </mesh>
            </>
          )}
          {kit === 'qa' && (
            <>
              <mesh position={[0, 0.22, -0.02]}>
                <boxGeometry args={[0.46, 0.08, 0.44]} />
                <meshStandardMaterial color="#22252e" roughness={0.8} />
              </mesh>
              {[-0.1, 0.1].map((x) => (
                <mesh key={x} position={[x, 0.03, 0.21]} material={neon}>
                  <ringGeometry args={[0.055, 0.075, 16]} />
                </mesh>
              ))}
            </>
          )}
          {kit === 'sysadmin' && (
            <>
              <mesh position={[0, 0.08, -0.04]} material={cloth}>
                <boxGeometry args={[0.5, 0.5, 0.4]} />
              </mesh>
              <mesh position={[0, -0.19, 0.19]}>
                <boxGeometry args={[0.3, 0.12, 0.04]} />
                <meshStandardMaterial color="#3a2a20" roughness={0.9} />
              </mesh>
            </>
          )}
          {kit === 'intern' && (
            <mesh position={[0, 0.22, -0.02]}>
              <boxGeometry args={[0.46, 0.1, 0.44]} />
              <meshStandardMaterial color="#c9862e" roughness={0.8} />
            </mesh>
          )}
          {kit === 'librarian' && (
            <>
              {/* Pelo canoso, gafas de media luna y bigote */}
              <mesh position={[0, 0.2, -0.04]}>
                <boxGeometry args={[0.48, 0.12, 0.44]} />
                <meshStandardMaterial color="#c9ccd3" roughness={0.9} />
              </mesh>
              {[-0.1, 0.1].map((x) => (
                <mesh key={x} position={[x, -0.01, 0.21]} material={neon}>
                  <ringGeometry args={[0.05, 0.068, 16, 1, Math.PI, Math.PI]} />
                </mesh>
              ))}
              <mesh position={[0, -0.14, 0.205]}>
                <boxGeometry args={[0.22, 0.05, 0.02]} />
                <meshStandardMaterial color="#c9ccd3" roughness={0.9} />
              </mesh>
            </>
          )}
          {kit === 'pochita' && (
            <>
              {/* Melena con coleta alta y un lazo */}
              <mesh position={[0, 0.2, -0.04]}>
                <boxGeometry args={[0.5, 0.16, 0.48]} />
                <meshStandardMaterial color="#3b2416" roughness={0.85} />
              </mesh>
              <mesh position={[0, -0.05, -0.23]}>
                <boxGeometry args={[0.46, 0.4, 0.08]} />
                <meshStandardMaterial color="#3b2416" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0.34, -0.2]} rotation-x={-0.5}>
                <boxGeometry args={[0.14, 0.3, 0.14]} />
                <meshStandardMaterial color="#3b2416" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0.3, -0.12]} material={neon}>
                <boxGeometry args={[0.24, 0.07, 0.06]} />
              </mesh>
              {/* Coloretes */}
              {[-0.15, 0.15].map((x) => (
                <mesh key={x} position={[x, -0.06, 0.203]}>
                  <planeGeometry args={[0.07, 0.045]} />
                  <meshBasicMaterial color="#ff8fb3" toneMapped={false} />
                </mesh>
              ))}
            </>
          )}
          {kit === 'joseba' && (
            <>
              {/* Pelo revuelto: un casco y tres mechones rebeldes */}
              <mesh position={[0, 0.23, -0.02]}>
                <boxGeometry args={[0.48, 0.12, 0.46]} />
                <meshStandardMaterial color="#2a1b12" roughness={0.9} />
              </mesh>
              {[
                [-0.14, 0.33, 0.06, 0.3],
                [0.02, 0.36, -0.06, -0.2],
                [0.15, 0.32, 0.02, 0.5],
              ].map(([x, y, z, tilt]) => (
                <mesh key={x} position={[x, y, z]} rotation-z={tilt}>
                  <boxGeometry args={[0.1, 0.14, 0.1]} />
                  <meshStandardMaterial color="#2a1b12" roughness={0.9} />
                </mesh>
              ))}
              {/* Gafas de pasta con cristales que brillan */}
              {[-0.1, 0.1].map((x) => (
                <group key={x} position={[x, 0.03, 0.208]}>
                  <mesh material={INK}>
                    <planeGeometry args={[0.17, 0.15]} />
                  </mesh>
                  <mesh position-z={0.002} material={neon}>
                    <planeGeometry args={[0.12, 0.1]} />
                  </mesh>
                </group>
              ))}
              <mesh position={[0, 0.03, 0.208]} material={INK}>
                <planeGeometry args={[0.06, 0.03]} />
              </mesh>
            </>
          )}
          {mate && hair && (
            <>
              {/* Pelo: corto, con flequillo de lado o con tupé */}
              <mesh position={[0, mate.style === 'tall' ? 0.25 : 0.22, -0.02]} material={hair}>
                <boxGeometry args={[0.48, mate.style === 'tall' ? 0.16 : 0.1, 0.46]} />
              </mesh>
              {mate.style === 'side' && (
                <mesh position={[0.12, 0.17, 0.19]} rotation-z={-0.25} material={hair}>
                  <boxGeometry args={[0.26, 0.08, 0.06]} />
                </mesh>
              )}
              {mate.style === 'tall' && (
                <mesh position={[0, 0.35, 0.1]} rotation-x={0.3} material={hair}>
                  <boxGeometry args={[0.3, 0.1, 0.2]} />
                </mesh>
              )}
              <mesh position={[0, 0.04, -0.215]} material={hair}>
                <boxGeometry args={[0.46, 0.3, 0.04]} />
              </mesh>
              {mate.extra === 'glasses' &&
                [-0.1, 0.1].map((x) => (
                  <mesh key={x} position={[x, 0.03, 0.21]} material={neon}>
                    <ringGeometry args={[0.055, 0.075, 4, 1, Math.PI / 4]} />
                  </mesh>
                ))}
              {mate.extra === 'headset' && (
                <>
                  <mesh position={[0, 0.3, 0]} material={DARK}>
                    <boxGeometry args={[0.52, 0.04, 0.08]} />
                  </mesh>
                  {[-0.25, 0.25].map((x) => (
                    <mesh key={x} position={[x, 0.04, 0]} material={neon}>
                      <boxGeometry args={[0.06, 0.2, 0.18]} />
                    </mesh>
                  ))}
                </>
              )}
              {mate.extra === 'cap' && (
                <>
                  <mesh position={[0, 0.25, 0]} material={cloth}>
                    <boxGeometry args={[0.5, 0.1, 0.46]} />
                  </mesh>
                  <mesh position={[0, 0.21, 0.3]} material={cloth}>
                    <boxGeometry args={[0.42, 0.03, 0.2]} />
                  </mesh>
                </>
              )}
            </>
          )}
        </Detail>
      </group>
      <Detail>
        {/* Piernas */}
        {[-0.11, 0.11].map((x) => (
          <mesh key={x} position={[x, 0.14, 0]} material={DARK}>
            <boxGeometry args={[0.15, 0.28, 0.2]} />
          </mesh>
        ))}
        {/* Brazos: se mueven al hablar */}
        <group ref={parts.arms} position-y={0.62}>
          {[-0.27, 0.27].map((x) => (
            <mesh key={x} position={[x, -0.1, 0.02]} material={cloth}>
              <boxGeometry args={[0.1, 0.34, 0.14]} />
            </mesh>
          ))}
          {/* Lo que lleva en la mano */}
          {kit === 'recruiter' && (
            <group position={[0.27, -0.22, 0.14]} rotation-x={-0.5}>
              <mesh material={DARK}>
                <boxGeometry args={[0.24, 0.3, 0.02]} />
              </mesh>
              <mesh position-z={0.012} material={neon}>
                <planeGeometry args={[0.2, 0.25]} />
              </mesh>
            </group>
          )}
          {kit === 'qa' && (
            <group position={[-0.27, -0.2, 0.14]} rotation-x={-0.6}>
              <mesh material={PAPER}>
                <boxGeometry args={[0.24, 0.32, 0.02]} />
              </mesh>
              {[0.08, 0, -0.08].map((y) => (
                <mesh key={y} position={[0, y, 0.012]} material={INK}>
                  <planeGeometry args={[0.16, 0.02]} />
                </mesh>
              ))}
            </group>
          )}
          {kit === 'sysadmin' && (
            <mesh position={[0.3, -0.2, 0.14]} material={PAPER}>
              <cylinderGeometry args={[0.06, 0.05, 0.12, 12]} />
            </mesh>
          )}
          {/* El bibliotecario abraza un libro */}
          {kit === 'librarian' && (
            <group position={[0, -0.14, 0.17]} rotation-x={-0.25}>
              <mesh>
                <boxGeometry args={[0.3, 0.38, 0.08]} />
                <meshStandardMaterial color="#8b1e2d" roughness={0.6} />
              </mesh>
              <mesh position-z={0.042} material={neon}>
                <planeGeometry args={[0.16, 0.04]} />
              </mesh>
            </group>
          )}
          {/* Pochita lleva pompones de animadora */}
          {kit === 'pochita' &&
            [-0.29, 0.29].map((x) => (
              <mesh key={x} position={[x, -0.3, 0.04]} material={neon}>
                <icosahedronGeometry args={[0.13, 0]} />
              </mesh>
            ))}
          {kit === 'joseba' && (
            <>
              <group position={[-0.02, -0.16, 0.2]} rotation-x={-0.9}>
                <mesh material={DARK}>
                  <boxGeometry args={[0.36, 0.26, 0.02]} />
                </mesh>
                <mesh position-z={-0.012} rotation-y={Math.PI} material={neon}>
                  <planeGeometry args={[0.1, 0.1]} />
                </mesh>
                {[
                  [-0.11, 0.07, '#ff4d8d'],
                  [0.1, -0.06, '#ffd60a'],
                  [0.11, 0.08, '#2f7bff'],
                ].map(([x, y, color]) => (
                  <mesh key={color} position={[x as number, y as number, -0.012]} rotation-y={Math.PI}>
                    <planeGeometry args={[0.07, 0.06]} />
                    <meshBasicMaterial color={color as string} toneMapped={false} />
                  </mesh>
                ))}
              </group>
              <mesh position={[0.3, -0.24, 0.12]}>
                <cylinderGeometry args={[0.045, 0.045, 0.16, 12]} />
                <meshStandardMaterial color="#19e6ff" emissive="#19e6ff" emissiveIntensity={0.6} roughness={0.3} />
              </mesh>
            </>
          )}
          {mate?.held === 'tablet' && (
            <group position={[0.27, -0.2, 0.14]} rotation-x={-0.55}>
              <mesh material={DARK}>
                <boxGeometry args={[0.22, 0.3, 0.02]} />
              </mesh>
              <mesh position-z={0.012} material={neon}>
                <planeGeometry args={[0.18, 0.25]} />
              </mesh>
            </group>
          )}
          {mate?.held === 'laptop' && (
            <group position={[0, -0.16, 0.2]} rotation-x={-0.9}>
              <mesh material={STEEL}>
                <boxGeometry args={[0.36, 0.26, 0.02]} />
              </mesh>
              <mesh position-z={-0.012} rotation-y={Math.PI} material={neon}>
                <planeGeometry args={[0.1, 0.1]} />
              </mesh>
            </group>
          )}
          {mate?.held === 'mug' && (
            <mesh position={[0.3, -0.22, 0.12]} material={PAPER}>
              <cylinderGeometry args={[0.06, 0.05, 0.12, 12]} />
            </mesh>
          )}
        </group>
        {/* Detalle luminoso en el pecho */}
        <mesh position={[0, 0.56, 0.142]} material={neon}>
          <planeGeometry args={[kit === 'intern' ? 0.1 : 0.2, kit === 'intern' ? 0.14 : 0.05]} />
        </mesh>
        {kit === 'intern' && (
          <mesh position={[0, 0.52, -0.2]}>
            <boxGeometry args={[0.34, 0.38, 0.14]} />
            <meshStandardMaterial color="#2f7bff" roughness={0.7} />
          </mesh>
        )}
        {kit === 'sysadmin' && (
          <group position={[-0.3, 0.42, 0.06]} rotation-z={0.2}>
            <mesh material={DARK}>
              <boxGeometry args={[0.04, 0.26, 0.34]} />
            </mesh>
            <mesh position-x={-0.022} rotation-y={-Math.PI / 2} material={neon}>
              <planeGeometry args={[0.28, 0.2]} />
            </mesh>
          </group>
        )}
      </Detail>
    </group>
  )
}

/** Aviso sobre la cabeza: la tecla para hablar, o puntos suspensivos mientras habla. */
function Mark({ mode, accent }: { mode: 'off' | 'prompt' | 'talking'; accent: string }) {
  const group = useRef<THREE.Group>(null)
  const scale = useRef(0)
  const touch = useMemo(() => window.matchMedia('(pointer: coarse)').matches, [])
  useFrame(({ clock }, delta) => {
    const g = group.current
    if (!g) return
    scale.current += ((mode === 'off' ? 0 : 1) - scale.current) * (1 - Math.exp(-12 * delta))
    g.visible = scale.current > 0.02
    g.scale.setScalar(Math.max(0.001, scale.current))
    g.position.y = 1.62 + Math.sin(clock.elapsedTime * 3.2) * 0.04
  })
  return (
    <Billboard ref={group} position={[0, 1.62, 0]} visible={false}>
      <mesh renderOrder={20}>
        <circleGeometry args={[0.2, 24]} />
        <meshBasicMaterial color="#f3f4f7" toneMapped={false} depthTest={false} />
      </mesh>
      <mesh renderOrder={20} position-z={-0.001}>
        <circleGeometry args={[0.235, 24]} />
        <meshBasicMaterial color={accent} toneMapped={false} depthTest={false} />
      </mesh>
      <Text
        font={fontBold}
        fontSize={0.22}
        color="#14161b"
        anchorX="center"
        anchorY="middle"
        renderOrder={21}
        material-depthTest={false}
        material-toneMapped={false}
      >
        {mode === 'talking' ? '…' : touch ? '!' : 'E'}
      </Text>
    </Billboard>
  )
}

function Name({ text, accent }: { text: string; accent: string }) {
  return (
    <Billboard position={[0, 1.3, 0]}>
      <Text
        font={fontBold}
        fontSize={0.13}
        color={accent}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor="#03040a"
        material-toneMapped={false}
      >
        {text}
      </Text>
    </Billboard>
  )
}

/** Un personaje con el que se puede hablar. */
function TalkerNPC({ talker }: { talker: Talker }) {
  const lang = useLang()
  const mode = useGame((s) => (s.talk?.id === talker.id ? 'talking' : s.near === talker.id ? 'prompt' : 'off'))
  const root = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const arms = useRef<THREE.Group>(null)
  const holder = useRef<THREE.Group>(null)
  const turn = useRef(talker.facing)
  // Joseba suelta ideas a voces cuando pasas cerca; Pochita te anima (y celebra cada moneda).
  const shouts = useRef({ next: 6, line: 0, coins: 0 })
  const shouter = talker.id === 'joseba' || talker.id === 'pochita'
  const [bubble, setBubble] = useState({ text: '', shownAt: 0 })
  const [x, z] = talker.position

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    const game = useGame.getState()
    if (holder.current) holder.current.scale.setScalar(Math.max(0.001, introProgress(3 + x * 0.01, 0.8)))

    const dx = body.pos[0] - x
    const dz = body.pos[2] - z
    const dist = Math.hypot(dx, dz)
    const reachable = game.mode === 'play' && Math.abs(body.pos[1]) < 1.2
    // El más cercano dentro del radio es con quien se habla.
    reach[talker.id] = dist
    if (reachable && dist < TALK_RANGE) {
      const rival = game.near === null ? Infinity : (reach[game.near as TalkerId] ?? Infinity)
      // Si ya hay otro al alcance, solo se le quita el sitio estando claramente más cerca.
      if (game.near !== talker.id && !game.talk && dist < rival - 0.2) game.setNear(talker.id)
    } else if (game.near === talker.id) game.setNear(null)
    if (game.talk?.id === talker.id && (!reachable || dist > LEAVE_RANGE)) game.setTalk(null)
    if (shouter && game.mode === 'play' && !game.talk) {
      const cheer = talker.id === 'pochita'
      const coins = game.collected.length
      if (cheer && coins > shouts.current.coins && dist < 26) {
        const lines = pochitaCoin[currentLang()]
        setBubble({ text: lines[coins % lines.length], shownAt: performance.now() })
        shouts.current.next = t + 6
      } else if (reachable && dist < (cheer ? 11 : 8) && t > shouts.current.next) {
        const lines = (cheer ? pochitaShouts : josebaShouts)[currentLang()]
        setBubble({ text: lines[shouts.current.line % lines.length], shownAt: performance.now() })
        shouts.current.line++
        shouts.current.next = t + (cheer ? 5 : 8) + Math.random() * 6
      }
      shouts.current.coins = coins
    }

    // Se gira hacia el jugador cuando está cerca; si no, vuelve a su postura.
    const goal = reachable && dist < 6 ? Math.atan2(dx, dz) : talker.facing
    let diff = goal - turn.current
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    turn.current += diff * (1 - Math.exp(-5 * delta))
    const talking = game.talk?.id === talker.id
    if (root.current) {
      root.current.rotation.y = turn.current
      root.current.position.y = talking ? Math.abs(Math.sin(t * 7)) * 0.05 : Math.sin(t * 1.6 + x) * 0.015
    }
    if (head.current) head.current.rotation.z = talking ? Math.sin(t * 6) * 0.08 : Math.sin(t * 0.9 + x) * 0.04
    const cheering = talker.id === 'pochita' && reachable && dist < 11
    if (arms.current) {
      arms.current.rotation.x = cheering
        ? -2.4 + Math.sin(t * 9) * 0.45
        : talking
          ? Math.sin(t * 8) * 0.35
          : Math.sin(t * 1.4 + z) * 0.06
    }
    if (root.current && cheering && !talking) root.current.position.y = Math.abs(Math.sin(t * 6)) * 0.09
  })

  return (
    <group ref={holder} position={[x, 0, z]}>
      <group scale={0.9}>
        <Puppet kit={talker.id} color={talker.color} accent={talker.accent} parts={{ root, head, arms }} />
      </group>
      <Detail>
        <Name text={talker.name[lang]} accent={talker.accent} />
        <Mark mode={mode} accent={talker.accent} />
        {talker.id === 'guide' && <Flag accent={talker.accent} />}
        {talker.id === 'recruiter' && <Banner accent={talker.accent} />}
      </Detail>
      {shouter && (
        <group position-y={0.45} scale={1.15}>
          <Bubble text={bubble.text} shownAt={bubble.shownAt} />
        </group>
      )}
    </group>
  )
}

/** Banderín del guía, clavado a su lado. */
function Flag({ accent }: { accent: string }) {
  const neon = useMemo(() => createNeonMaterial(accent, 1.4), [accent])
  const cloth = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (cloth.current) cloth.current.rotation.y = Math.sin(clock.elapsedTime * 2.4) * 0.35
  })
  return (
    <group position={[0.55, 0, -0.1]}>
      <mesh position-y={0.8} material={STEEL}>
        <cylinderGeometry args={[0.018, 0.018, 1.6, 8]} />
      </mesh>
      <mesh ref={cloth} position={[0.18, 1.45, 0]} material={neon}>
        <planeGeometry args={[0.36, 0.22]} />
      </mesh>
    </group>
  )
}

/** Cartel enrollable de la reclutadora. */
function Banner({ accent }: { accent: string }) {
  const neon = useMemo(() => createNeonMaterial(accent, 1.3), [accent])
  return (
    <group position={[-0.75, 0, -0.15]} rotation-y={0.35}>
      <mesh position-y={0.75} material={DARK}>
        <boxGeometry args={[0.62, 1.5, 0.03]} />
      </mesh>
      <mesh position={[0, 1.5, 0]} material={neon}>
        <boxGeometry args={[0.66, 0.03, 0.05]} />
      </mesh>
      <Text
        font={fontBold}
        fontSize={0.15}
        position={[0, 1.2, 0.02]}
        color={[2.6, 2.1, 0.5]}
        anchorX="center"
        anchorY="middle"
        material-toneMapped={false}
      >
        HIRING
      </Text>
      <Text
        font={fontBold}
        fontSize={0.085}
        lineHeight={1.5}
        position={[0, 0.72, 0.02]}
        color="#e6e9ef"
        anchorX="center"
        anchorY="middle"
        textAlign="center"
        material-toneMapped={false}
      >
        {'Head of AI\nTech Lead\nFull stack'}
      </Text>
    </group>
  )
}

const HOME: [number, number] = [-25.5, 8.4]

/**
 * El becario: si pasas cerca te sigue a todas partes (por el suelo) y va
 * soltando preguntas. Si subes a las cajas, se queda esperando abajo.
 */
function Intern() {
  const lang = useLang()
  const root = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const arms = useRef<THREE.Group>(null)
  const holder = useRef<THREE.Group>(null)
  const state = useRef({ x: HOME[0], z: HOME[1], heading: 0.6, step: 0, nextLine: 0, line: 0, following: false })
  const [bubble, setBubble] = useState({ text: '', shownAt: 0 })

  useFrame(({ clock }, delta) => {
    const s = state.current
    const t = clock.elapsedTime
    const dt = Math.min(delta, 1 / 20)
    const game = useGame.getState()
    const playing = game.mode === 'play'
    const onFloor = body.pos[1] < 0.6
    const dx = body.pos[0] - s.x
    const dz = body.pos[2] - s.z
    const dist = Math.hypot(dx, dz)

    // Empieza a seguirte al pasar cerca y lo deja si te alejas mucho o subes.
    if (playing && onFloor && dist < 5 && !s.following) {
      s.following = true
      // La primera vez que se te pega, te pide un café.
      if (game.quests.intern === 'idle') {
        game.startQuest('intern')
        setBubble({ text: QUEST_TEXT.intern.offer[currentLang()], shownAt: performance.now() })
        s.nextLine = t + 9
      }
    }
    if (game.quests.intern === 'active' && playing && dist < 1.9 && performance.now() < game.boostUntil) {
      game.completeQuest('intern')
      setBubble({ text: QUEST_TEXT.intern.thanks[currentLang()], shownAt: performance.now() })
      s.nextLine = t + 9
    }
    if (!playing || dist > 16) s.following = false
    const chasing = s.following && onFloor

    // Destino: a un paso por detrás del jugador, o de vuelta a su sitio.
    const tx = chasing ? body.pos[0] : HOME[0]
    const tz = chasing ? body.pos[2] : HOME[1]
    const gx = tx - s.x
    const gz = tz - s.z
    const gap = Math.hypot(gx, gz)
    const keep = chasing ? 1.5 : 0.3
    let moving = false
    if (gap > keep && (chasing || !s.following)) {
      const speed = chasing ? Math.min(3.4, 1.6 + gap * 0.5) : 1.4
      const nx = s.x + (gx / gap) * speed * dt
      const nz = s.z + (gz / gap) * speed * dt
      // Si hay algo delante, prueba a deslizarse por cada eje.
      if (!blocked(nx, nz)) {
        s.x = nx
        s.z = nz
        moving = true
      } else if (!blocked(nx, s.z)) {
        s.x = nx
        moving = true
      } else if (!blocked(s.x, nz)) {
        s.z = nz
        moving = true
      }
    }
    const face = Math.atan2(chasing || moving ? gx : dx, chasing || moving ? gz : dz)
    let turn = face - s.heading
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    s.heading += turn * (1 - Math.exp(-8 * dt))
    if (moving) s.step += dt * 11

    if (holder.current) {
      holder.current.position.set(s.x, 0, s.z)
      holder.current.scale.setScalar(Math.max(0.001, introProgress(3.2, 0.8)) * 0.74)
    }
    if (root.current) {
      root.current.rotation.y = s.heading
      root.current.position.y = moving ? Math.abs(Math.sin(s.step)) * 0.07 : Math.sin(t * 1.8) * 0.015
    }
    if (head.current) head.current.rotation.z = Math.sin(t * 1.3) * 0.06
    if (arms.current) arms.current.rotation.x = moving ? Math.sin(s.step) * 0.6 : 0

    // Mientras te sigue de cerca, pregunta cosas cada poco.
    if (chasing && dist < 4.5 && t > s.nextLine) {
      const lines = internLines[currentLang()]
      setBubble({ text: lines[s.line % lines.length], shownAt: performance.now() })
      s.line++
      s.nextLine = t + 7 + Math.random() * 5
    }
  })

  return (
    <group ref={holder} position={[HOME[0], 0, HOME[1]]}>
      <Puppet kit="intern" color="#e8eaf0" accent="#ff9f1c" parts={{ root, head, arms }} />
      <Detail>
        <Name text={internName[lang]} accent="#ff9f1c" />
      </Detail>
      <group scale={1.3}>
        <Bubble text={bubble.text} shownAt={bubble.shownAt} />
      </group>
    </group>
  )
}

/** Vigila el encargo del sysadmin: que te subas encima del servidor de PROD. */
function QuestWatch() {
  useFrame(() => {
    const game = useGame.getState()
    if (game.mode !== 'play' || game.quests.sysadmin !== 'active' || !body.grounded) return
    const { center, size } = world.props.server
    const top = center[1] + size[1] / 2
    if (
      Math.abs(body.pos[1] - top) < 0.15 &&
      Math.abs(body.pos[0] - center[0]) < size[0] / 2 &&
      Math.abs(body.pos[2] - center[2]) < size[2] / 2
    ) {
      game.completeQuest('sysadmin')
    }
  })
  return null
}

/** Rótulo del corrillo del equipo: va pintado en el suelo, delante de ellos, para no taparlos. */
function TeamSign() {
  const lang = useLang()
  const neon = useMemo(() => createNeonMaterial('#3df2b0', 1.6), [])
  const holder = useRef<THREE.Group>(null)
  useFrame(() => {
    if (holder.current) holder.current.scale.setScalar(Math.max(0.001, introProgress(3.2, 0.8)))
  })
  return (
    <group ref={holder} position={[teamSpot[0], 0.03, teamSpot[1]]}>
      <Detail>
        {[-0.62, 0.62].map((z) => (
          <mesh key={z} position={[0, 0, z]} rotation-x={-Math.PI / 2} material={neon}>
            <planeGeometry args={[6.4, 0.05]} />
          </mesh>
        ))}
        <Text
          rotation-x={-Math.PI / 2}
          font={fontBold}
          fontSize={0.72}
          letterSpacing={0.14}
          color="#bdfde6"
          anchorX="center"
          anchorY="middle"
          material-toneMapped={false}
        >
          {lang === 'es' ? 'EL EQUIPO' : 'THE TEAM'}
        </Text>
      </Detail>
    </group>
  )
}

export function Folk() {
  return (
    <>
      <QuestWatch />
      <TeamSign />
      {talkers.map((talker) => (
        <TalkerNPC key={talker.id} talker={talker} />
      ))}
      <Intern />
    </>
  )
}
