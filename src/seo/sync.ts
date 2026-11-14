import type { Lang } from '../data/career'
import { cvHtml, jsonLdText, META, pathOf, urlOf } from './content'

/**
 * Mantiene la página coherente con el idioma elegido en la aplicación: la
 * dirección (`/` o `/en/`), el título, la descripción, los datos estructurados
 * y el currículum en texto que hay bajo el lienzo.
 */

/** Idioma que impone la dirección: `/en/` es la versión inglesa. */
export const langOfPath = (): Lang | null => {
  if (typeof location === 'undefined') return null
  return /^\/en(\/|$)/.test(location.pathname) ? 'en' : null
}

/** Los rastreadores no eligen idioma por su navegador: ven el de la dirección. */
export const isCrawler = () =>
  typeof navigator !== 'undefined' && /bot|crawl|spider|slurp|lighthouse|headless|preview|fetch/i.test(navigator.userAgent)

const set = (selector: string, attribute: string, value: string) =>
  document.querySelector(selector)?.setAttribute(attribute, value)

export function syncSeo(lang: Lang) {
  const meta = META[lang]
  const other: Lang = lang === 'es' ? 'en' : 'es'
  document.documentElement.lang = lang
  document.title = meta.title
  set('meta[name="description"]', 'content', meta.description)
  set('link[rel="canonical"]', 'href', urlOf(lang))
  set('meta[property="og:url"]', 'content', urlOf(lang))
  set('meta[property="og:title"]', 'content', meta.ogTitle)
  set('meta[property="og:description"]', 'content', meta.ogDescription)
  set('meta[property="og:image:alt"]', 'content', meta.ogAlt)
  set('meta[property="og:locale"]', 'content', meta.locale)
  set('meta[property="og:locale:alternate"]', 'content', META[other].locale)
  set('meta[name="twitter:title"]', 'content', meta.ogTitle)
  set('meta[name="twitter:description"]', 'content', meta.ogDescription)
  set('meta[name="twitter:image:alt"]', 'content', meta.ogAlt)

  const cv = document.getElementById('cv')
  if (cv && cv.lang !== lang) {
    const updated = cv.dataset.updated
    cv.innerHTML = cvHtml(lang, updated)
    cv.lang = lang
    const ld = document.getElementById('ld')
    if (ld) ld.textContent = jsonLdText(lang, updated)
  }

  // La dirección acompaña al idioma, para que el enlace que se comparta lo conserve.
  const path = pathOf(lang)
  const here = location.pathname
  if (here !== path && (here === '/' || /^\/en(\/|$)/.test(here))) {
    history.replaceState(history.state, '', path + location.search + location.hash)
  }
}
