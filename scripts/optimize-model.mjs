/**
 * Prepara para web el modelo 3D del PC (exportado de Meshy, ~73 MB):
 * reduce las texturas (color a 4K, el resto a 2K) y las pasa a WebP, cuantiza la geometría y la comprime
 * con Meshopt. El original no se guarda en el repositorio.
 *
 * Uso: node scripts/optimize-model.mjs <origen.glb> [destino.glb]
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import { statSync } from 'node:fs'

const [source, target = 'public/models/pc.glb'] = process.argv.slice(2)
if (!source) {
  console.error('Uso: node scripts/optimize-model.mjs <origen.glb> [destino.glb]')
  process.exit(1)
}

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const document = await io.read(source)
for (const texture of document.getRoot().listTextures()) {
  console.log('textura:', texture.getName(), texture.getMimeType(), texture.getSize()?.join('x'))
}

await document.transform(
  dedup(),
  prune(),
  weld(),
  // El color a 4K (es lo que se ve de cerca); relieve y rugosidad a 2K.
  // La calidad alta evita bandas en los degradados RGB.
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /baseColor/, resize: [4096, 4096], quality: 86 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(?!baseColor)/, resize: [2048, 2048], quality: 88 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
)

await io.write(target, document)
const mb = (path) => (statSync(path).size / 1024 / 1024).toFixed(2) + ' MB'
console.log(`${source} (${mb(source)}) -> ${target} (${mb(target)})`)
