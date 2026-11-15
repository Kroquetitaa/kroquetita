import { useCallback } from 'react'
import { useGame } from '../store'
import { world, type Block } from '../world/layout'
import { blenderAssembly } from '../world/blenderAssembly'
import { VoxelLogo } from './VoxelLogo'
import { companyLogoPosition } from '../world/branding'

/** The Blender towers keep the original portfolio's company identities. */
function CompanyEmblem({ block }: { block: Block }) {
  const { index, stage } = block
  const native = blenderAssembly.stages[index]
  const accent = useGame(s => s.accents[index])
  const setAccent = useCallback((color: string) => useGame.getState().setAccent(index, color), [index])
  const select = useCallback(() => {
    const game = useGame.getState()
    if (game.mode === 'intro') game.tour()
    game.setStage(index, true)
  }, [index])

  // Logos follow the authored native-size roof, independently of any game
  // controller dimensions. Leave the original front jump pad unobstructed.
  const scale = Math.min(.7, (native.size[0] - .5) / 1.7)
  return <group name={`CompanyLogo_${index}`} position={companyLogoPosition(index)} scale={scale}>
    <VoxelLogo url={stage.logo} crop={stage.logoCrop} color={accent} index={index}
      onAccent={setAccent} onSelect={select} />
  </group>
}

export function CareerBranding() {
  return <>{world.blocks.map(block => <CompanyEmblem key={block.index} block={block} />)}</>
}
