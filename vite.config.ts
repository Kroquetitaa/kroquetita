import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { devApi } from './dev/api'
import type { Lang } from './src/data/career'
import { cvHtml, headHtml, llmsFullTxt, llmsTxt, robotsTxt, sitemapXml } from './src/seo/content'

/**
 * SEO y GEO: rellena la cabecera y el currículum en texto de `index.html` a
 * partir de los datos, genera la versión inglesa en `/en/` y escribe
 * `robots.txt`, `sitemap.xml`, `llms.txt` y `llms-full.txt`.
 */
function seo(): Plugin {
  const updated = new Date().toISOString().slice(0, 10)
  const head = (lang: Lang) => `<!--seo:head:start-->${headHtml(lang, updated)}<!--seo:head:end-->`
  const body = (lang: Lang) =>
    `<!--seo:body:start--><main id="cv" lang="${lang}" data-updated="${updated}">\n${cvHtml(lang, updated)}\n</main><!--seo:body:end-->`
  const fill = (html: string, lang: Lang) =>
    html
      .replace(/<html lang="[a-z]+">/, `<html lang="${lang}">`)
      .replace(/<!--seo:head-->|<!--seo:head:start-->[\s\S]*?<!--seo:head:end-->/, () => head(lang))
      .replace(/<!--seo:body-->|<!--seo:body:start-->[\s\S]*?<!--seo:body:end-->/, () => body(lang))
  const files: Record<string, () => string> = {
    'robots.txt': robotsTxt,
    'sitemap.xml': () => sitemapXml(updated),
    'llms.txt': llmsTxt,
    'llms-full.txt': () => llmsFullTxt(updated),
  }

  return {
    name: 'kroquetita-seo',
    enforce: 'post',
    transformIndexHtml: {
      order: 'pre',
      // En desarrollo, `/en/` sirve ya la versión inglesa.
      handler: (html, ctx) => fill(html, /^\/en(\/|$|\?)/.test(ctx.originalUrl ?? '') ? 'en' : 'es'),
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req as { url?: string }).url ?? ''
        const make = files[url.split('?')[0].slice(1)]
        if (!make) return next()
        res.setHeader('Content-Type', url.includes('.xml') ? 'application/xml' : 'text/plain; charset=utf-8')
        res.end(make())
      })
    },
    generateBundle(_, bundle) {
      for (const [fileName, make] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source: make() })
      const index = bundle['index.html']
      if (index?.type === 'asset') {
        this.emitFile({ type: 'asset', fileName: 'en/index.html', source: fill(String(index.source), 'en') })
      }
    },
  }
}

export default defineConfig({
  // `devApi` atiende /api/* en desarrollo con un almacén en memoria; en la web publicada lo hacen las funciones de Netlify.
  plugins: [react(), seo(), devApi()],
  server: { port: 5173, strictPort: true },
})
