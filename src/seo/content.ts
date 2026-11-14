import { disciplines, periodOf, profile, stages, type Lang, type Localized, type Stage } from '../data/career'
import { concepts } from '../data/concepts'
import { education } from '../data/education'

/**
 * SEO y GEO (que también te encuentren y te citen los asistentes de IA).
 *
 * La web es un lienzo 3D: sin esto, un buscador o un modelo que no ejecute
 * JavaScript solo vería una página vacía. De los mismos datos que dibujan la
 * escena sale aquí, en texto:
 *  - las etiquetas de la cabecera, por idioma (`/` en español, `/en/` en inglés);
 *  - los datos estructurados (schema.org) que describen a la persona y la web;
 *  - el currículum en HTML, que es además la alternativa accesible al lienzo;
 *  - `llms.txt`, `llms-full.txt`, `sitemap.xml` y `robots.txt`.
 *
 * No se incluyen los `highlights` de cada etapa: son frases de ejemplo y aquí
 * solo va lo que se puede afirmar tal cual (puesto, empresa, fechas, tecnologías).
 */

export const SITE = 'https://kroquetita.com'
export const LANGS: Lang[] = ['es', 'en']
export const pathOf = (lang: Lang) => (lang === 'en' ? '/en/' : '/')
export const urlOf = (lang: Lang) => SITE + pathOf(lang)

const headline = profile.headline.join(' ').replace(/\s+/g, ' ')
/** «Head of AI»: lo que va antes de la barra del titular */
const jobTitle = headline.split('/')[0].trim()
const linkedin = profile.links.find((link) => link.label === 'LinkedIn')?.href ?? profile.links[0]?.href
const intro = (lang: Lang) => profile.intro[lang].map((part) => (typeof part === 'string' ? part : part.strong)).join('')
/** Conocimientos, con «IA» traducido en la versión inglesa */
const skillsOf = (lang: Lang) => profile.skills.map((skill) => (lang === 'en' && skill === 'IA' ? 'AI' : skill))
const current = stages[stages.length - 1]
/** De la más reciente a la más antigua, como se lee un currículum */
const career = [...stages].reverse()
const studies = [...education].reverse()

/** Tecnologías más repetidas a lo largo de la trayectoria */
const topStack = (() => {
  const count = new Map<string, number>()
  for (const stage of stages) for (const tech of stage.stack) count.set(tech, (count.get(tech) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([tech]) => tech)
})()

export const META: Localized<{
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  ogAlt: string
  locale: string
}> = {
  es: {
    title: `${profile.name} — ${jobTitle} | Portfolio 3D interactivo · ${profile.brand}`,
    description: `${profile.name}, ${jobTitle}: ${stages.length} etapas de frontend, móvil, datos, blockchain e inteligencia artificial en un portfolio 3D que se recorre jugando.`,
    ogTitle: `${profile.name} — ${jobTitle} · Portfolio interactivo en 3D`,
    ogDescription:
      'Más de cinco años de trayectoria convertidos en un mundo 3D que se puede recorrer y jugar. Frontend, móvil, datos, blockchain e IA.',
    ogAlt: `Escena 3D del portfolio: cajas de neón con la trayectoria de ${profile.name} y un cerebro luminoso encima`,
    locale: 'es_ES',
  },
  en: {
    title: `${profile.name} — ${jobTitle} | Interactive 3D portfolio · ${profile.brand}`,
    description: `${profile.name}, ${jobTitle}: ${stages.length} roles across frontend, mobile, data, blockchain and artificial intelligence in a 3D portfolio you explore by playing.`,
    ogTitle: `${profile.name} — ${jobTitle} · Interactive 3D portfolio`,
    ogDescription:
      'Over five years of career turned into a 3D world you can walk through and play. Frontend, mobile, data, blockchain and AI.',
    ogAlt: `3D scene of the portfolio: neon boxes with the career of ${profile.name} and a glowing brain above`,
    locale: 'en_GB',
  },
}

const T = {
  es: {
    other: 'English version',
    career: 'Trayectoria profesional',
    education: 'Formación',
    skills: 'Conocimientos',
    stack: 'Tecnologías',
    concepts: 'Conceptos de IA, explicados',
    about: 'Sobre esta web',
    faq: 'Preguntas frecuentes',
    contact: 'Contacto',
    at: 'en',
    ongoing: 'en curso',
    updated: 'Última actualización',
  },
  en: {
    other: 'Versión en español',
    career: 'Career',
    education: 'Education',
    skills: 'Skills',
    stack: 'Technologies',
    concepts: 'AI concepts, explained',
    about: 'About this site',
    faq: 'Frequently asked questions',
    contact: 'Contact',
    at: 'at',
    ongoing: 'in progress',
    updated: 'Last updated',
  },
}

const about: Localized<string[]> = {
  es: [
    `${profile.brand} es el portfolio de ${profile.name}: en vez de una página de currículum, un mundo 3D en el navegador. Cada etapa profesional es una caja de neón, más alta cuanto más reciente, con un mini-escenario animado de lo que se hacía allí.`,
    'Se puede ver como un recorrido guiado o jugar: un personaje salta de caja en caja hasta la cima, recoge monedas, habla con otros personajes, cumple encargos y se enfrenta a un jefe final. A la izquierda hay una biblioteca con la formación; delante, una sala de conceptos de inteligencia artificial con instalaciones interactivas; a la derecha, una sala donde romper tests, redes neuronales y código heredado.',
    'Está hecho con React, TypeScript, three.js y React Three Fiber, con física y música generativa propias, y funciona también en el móvil.',
  ],
  en: [
    `${profile.brand} is the portfolio of ${profile.name}: instead of a résumé page, a 3D world in the browser. Every role is a neon box, taller the more recent it is, topped with an animated miniature of the work done there.`,
    'You can watch it as a guided tour or play it: a character jumps from box to box up to the summit, collects coins, talks to other characters, runs errands for them and faces a final boss. On the left there is a library with the education; in front, a room of artificial-intelligence concepts with interactive installations; on the right, a room where you can break tests, neural networks and legacy code.',
    'It is built with React, TypeScript, three.js and React Three Fiber, with its own physics and generative music, and it works on mobile too.',
  ],
}

const list = (items: string[], lang: Lang) =>
  items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} ${lang === 'es' ? 'y' : 'and'} ${items[items.length - 1]}`

const roleLine = (stage: Stage, lang: Lang) => `${stage.role} ${T[lang].at} ${stage.title} (${periodOf(stage, lang)})`

/** Preguntas que alguien (o un asistente) haría sobre la persona, con respuesta directa. */
export function faq(lang: Lang): Array<{ q: string; a: string }> {
  const latest = studies[0]
  const es = lang === 'es'
  return [
    {
      q: es ? `¿Quién es ${profile.name}?` : `Who is ${profile.name}?`,
      a: es
        ? `${profile.name} es ${headline}. ${intro('es')} Su etapa más reciente: ${roleLine(current, 'es')}.`
        : `${profile.name} is ${headline}. ${intro('en')} Most recent role: ${roleLine(current, 'en')}.`,
    },
    {
      q: es ? `¿En qué empresas ha trabajado ${profile.name}?` : `Which companies has ${profile.name} worked at?`,
      a: es
        ? `De la más reciente a la más antigua: ${list(career.map((stage) => `${stage.title} (${stage.role})`), 'es')}.`
        : `From the most recent to the earliest: ${list(career.map((stage) => `${stage.title} (${stage.role})`), 'en')}.`,
    },
    {
      q: es ? `¿Con qué tecnologías trabaja ${profile.name}?` : `Which technologies does ${profile.name} work with?`,
      a: es
        ? `Sus áreas son ${list(skillsOf('es'), 'es')}. Las tecnologías que más se repiten en su trayectoria son ${list(topStack, 'es')}.`
        : `The main areas are ${list(skillsOf('en'), 'en')}. The technologies that come up most across the career are ${list(topStack, 'en')}.`,
    },
    {
      q: es ? `¿Qué formación tiene ${profile.name}?` : `What did ${profile.name} study?`,
      a: es
        ? `Lo más reciente es ${latest.title.es} en ${latest.school} (${latest.period.es}${latest.ongoing ? `, ${T.es.ongoing}` : ''}). Antes: ${list(studies.slice(1).map((study) => `${study.title.es} (${study.school})`), 'es')}.`
        : `The most recent is the ${latest.title.en} at ${latest.school} (${latest.period.en}${latest.ongoing ? `, ${T.en.ongoing}` : ''}). Before that: ${list(studies.slice(1).map((study) => `${study.title.en} (${study.school})`), 'en')}.`,
    },
    {
      q: es ? `¿Qué es ${profile.brand}?` : `What is ${profile.brand}?`,
      a: about[lang][0],
    },
    {
      q: es ? `¿Cómo se puede contactar con ${profile.name}?` : `How can I contact ${profile.name}?`,
      a: es ? `A través de LinkedIn: ${linkedin}` : `Through LinkedIn: ${linkedin}`,
    },
  ]
}

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * El currículum en HTML. Va fuera de la aplicación, en `<main id="cv">`: es lo
 * que leen los buscadores, los modelos y los lectores de pantalla.
 */
export function cvHtml(lang: Lang, updated?: string): string {
  const t = T[lang]
  const other: Lang = lang === 'es' ? 'en' : 'es'
  const roles = career
    .map(
      (stage) => `<li>
<h3>${esc(stage.role)} — ${esc(stage.title)}</h3>
<p>${esc(periodOf(stage, lang))} · ${esc(disciplines[stage.discipline].label[lang])}: ${esc(disciplines[stage.discipline].tagline[lang])}</p>
${stage.summary ? `<p>${esc(stage.summary[lang])}</p>` : ''}
<p>${t.stack}: ${esc(stage.stack.join(', '))}.</p>
</li>`,
    )
    .join('\n')
  const degrees = studies
    .map(
      (study) =>
        `<li><strong>${esc(study.title[lang])}</strong> — ${esc(study.school)} (${esc(study.period[lang])}${study.ongoing ? `, ${t.ongoing}` : ''})</li>`,
    )
    .join('\n')
  const glossary = concepts
    .map((concept) => `<dt>${esc(concept.title[lang])}</dt>\n<dd>${esc(concept.explain[lang])}</dd>`)
    .join('\n')
  const questions = faq(lang)
    .map(({ q, a }) => `<dt>${esc(q)}</dt>\n<dd>${esc(a)}</dd>`)
    .join('\n')
  return `<header>
<p>${esc(profile.brand)}</p>
<h1>${esc(profile.name)} — ${esc(headline)}</h1>
<p>${esc(intro(lang))}</p>
<p><a href="${linkedin}" rel="me noopener">LinkedIn</a> · <a href="${pathOf(other)}" hreflang="${other}" lang="${other}">${t.other}</a></p>
</header>
<section>
<h2>${t.career}</h2>
<ol reversed>
${roles}
</ol>
</section>
<section>
<h2>${t.education}</h2>
<ul>
${degrees}
</ul>
</section>
<section>
<h2>${t.skills}</h2>
<p>${esc(skillsOf(lang).join(', '))}.</p>
</section>
<section>
<h2>${t.concepts}</h2>
<dl>
${glossary}
</dl>
</section>
<section>
<h2>${t.about}</h2>
${about[lang].map((paragraph) => `<p>${esc(paragraph)}</p>`).join('\n')}
</section>
<section>
<h2>${t.faq}</h2>
<dl>
${questions}
</dl>
</section>
<footer>
<p>${t.contact}: <a href="${linkedin}" rel="me noopener">${esc(linkedin ?? '')}</a></p>
${updated ? `<p>${t.updated}: <time datetime="${updated}">${updated}</time></p>` : ''}
</footer>`
}

/** Datos estructurados de schema.org: la persona, la web, la página y sus preguntas. */
export function jsonLd(lang: Lang, updated?: string) {
  const person = `${SITE}/#person`
  const schools = [...new Set(education.map((study) => study.school))]
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': person,
        name: profile.name,
        jobTitle,
        description: `${headline}. ${intro(lang)}`,
        url: `${SITE}/`,
        image: `${SITE}/avatar.png`,
        sameAs: profile.links.map((link) => link.href),
        worksFor: { '@type': 'Organization', name: current.title },
        alumniOf: schools.map((name) => ({ '@type': 'EducationalOrganization', name })),
        hasCredential: education
          .filter((study) => !study.ongoing)
          .map((study) => ({
            '@type': 'EducationalOccupationalCredential',
            name: study.title[lang],
            recognizedBy: { '@type': 'EducationalOrganization', name: study.school },
          })),
        knowsAbout: [...new Set([...skillsOf(lang), ...concepts.map((concept) => concept.title[lang]), ...topStack])],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        url: `${SITE}/`,
        name: profile.brand,
        alternateName: `${profile.brand} by ${profile.name}`,
        description: META[lang].description,
        inLanguage: LANGS,
        author: { '@id': person },
        publisher: { '@id': person },
      },
      {
        '@type': 'ProfilePage',
        '@id': `${urlOf(lang)}#page`,
        url: urlOf(lang),
        name: META[lang].title,
        description: META[lang].description,
        inLanguage: lang,
        isPartOf: { '@id': `${SITE}/#website` },
        about: { '@id': person },
        mainEntity: { '@id': person },
        primaryImageOfPage: { '@type': 'ImageObject', url: `${SITE}/og.jpg`, width: 1200, height: 630 },
        ...(updated ? { dateModified: updated } : {}),
      },
      {
        '@type': 'FAQPage',
        '@id': `${urlOf(lang)}#faq`,
        inLanguage: lang,
        mainEntity: faq(lang).map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  }
}

/** JSON listo para ir dentro de un `<script>`: sin nada que pueda cerrar la etiqueta. */
export const jsonLdText = (lang: Lang, updated?: string) => JSON.stringify(jsonLd(lang, updated)).replace(/</g, '\\u003c')

/** Todo lo que va en `<head>` y depende del idioma. */
export function headHtml(lang: Lang, updated?: string): string {
  const meta = META[lang]
  const other: Lang = lang === 'es' ? 'en' : 'es'
  return `<title>${esc(meta.title)}</title>
    <meta name="description" content="${esc(meta.description)}" />
    <meta name="author" content="${esc(profile.name)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <link rel="canonical" href="${urlOf(lang)}" />
    <link rel="alternate" hreflang="es" href="${urlOf('es')}" />
    <link rel="alternate" hreflang="en" href="${urlOf('en')}" />
    <link rel="alternate" hreflang="x-default" href="${urlOf('es')}" />
    <link rel="alternate" type="text/markdown" href="/llms-full.txt" title="CV (Markdown)" />
    <link rel="me" href="${linkedin}" />
    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="${esc(profile.brand)}" />
    <meta property="og:url" content="${urlOf(lang)}" />
    <meta property="og:title" content="${esc(meta.ogTitle)}" />
    <meta property="og:description" content="${esc(meta.ogDescription)}" />
    <meta property="og:image" content="${SITE}/og.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(meta.ogAlt)}" />
    <meta property="og:locale" content="${meta.locale}" />
    <meta property="og:locale:alternate" content="${META[other].locale}" />
    <meta property="profile:first_name" content="${esc(profile.name.split(' ')[0])}" />
    <meta property="profile:last_name" content="${esc(profile.name.split(' ').slice(1).join(' '))}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(meta.ogTitle)}" />
    <meta name="twitter:description" content="${esc(meta.ogDescription)}" />
    <meta name="twitter:image" content="${SITE}/og.jpg" />
    <meta name="twitter:image:alt" content="${esc(meta.ogAlt)}" />
    <script type="application/ld+json" id="ld">${jsonLdText(lang, updated)}</script>`
}

/**
 * `llms.txt`: el resumen que piden los asistentes de IA (formato de llmstxt.org).
 * En inglés, que es como mejor lo leen, con los nombres propios tal cual.
 */
export function llmsTxt(): string {
  return `# ${profile.brand} — ${profile.name}

> ${profile.name} is ${headline}. ${intro('en')} ${profile.brand} (${SITE}) is the interactive 3D portfolio of ${profile.name}: a browser game in which every role of that career is a neon box you can climb.

Key facts:

- Name: ${profile.name}
- Title: ${headline}
- Most recent role: ${roleLine(current, 'en')}
- Career: ${stages.length} roles since ${stages[0].start.slice(0, 4)}, across full stack, frontend, mobile, technical leadership, blockchain, data and AI
- Areas: ${skillsOf('en').join(', ')}
- Education: ${studies[0].title.en}, ${studies[0].school} (${studies[0].period.en}${studies[0].ongoing ? ', in progress' : ''})
- Contact: ${linkedin}
- Languages of the site: Spanish (${urlOf('es')}) and English (${urlOf('en')})

## Pages

- [Portfolio (Spanish)](${urlOf('es')}): the 3D experience, with the full CV as text
- [Portfolio (English)](${urlOf('en')}): the same in English
- [Full CV in Markdown](${SITE}/llms-full.txt): every role with dates and technologies, education, and the AI concepts explained on the site

## Contact

- [LinkedIn](${linkedin}): the way to reach ${profile.name}
`
}

/** `llms-full.txt`: el currículum completo en Markdown. */
export function llmsFullTxt(updated?: string): string {
  const lang: Lang = 'en'
  const roles = career
    .map(
      (stage) => `### ${stage.role} — ${stage.title}

- Period: ${periodOf(stage, lang)}
- Discipline: ${disciplines[stage.discipline].label[lang]} (${disciplines[stage.discipline].tagline[lang]})
- Technologies: ${stage.stack.join(', ')}
${stage.summary ? `\n${stage.summary[lang]}\n` : ''}`,
    )
    .join('\n')
  return `# ${profile.name} — ${headline}

> ${intro(lang)}

- Website: ${SITE}/
- Contact: ${linkedin}
${updated ? `- Last updated: ${updated}\n` : ''}
## Career

${roles}
## Education

${studies.map((study) => `- ${study.title[lang]} — ${study.school} (${study.period[lang]}${study.ongoing ? ', in progress' : ''})`).join('\n')}

## Skills

${skillsOf(lang).join(', ')}.

Most used technologies across the career: ${topStack.join(', ')}.

## AI concepts explained on the site

${concepts.map((concept) => `- **${concept.title[lang]}**: ${concept.explain[lang]}`).join('\n')}

## About the site

${about[lang].join('\n\n')}

## Frequently asked questions

${faq(lang)
  .map(({ q, a }) => `**${q}**\n\n${a}`)
  .join('\n\n')}
`
}

export function sitemapXml(updated: string): string {
  const entry = (lang: Lang) => `  <url>
    <loc>${urlOf(lang)}</loc>
    <lastmod>${updated}</lastmod>
${LANGS.map((alt) => `    <xhtml:link rel="alternate" hreflang="${alt}" href="${urlOf(alt)}" />`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${urlOf('es')}" />
  </url>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.map(entry).join('\n')}
</urlset>
`
}

/** Rastreadores de buscadores con IA y de asistentes: se les da paso de forma explícita. */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Amazonbot',
  'meta-externalagent',
  'MistralAI-User',
  'DuckAssistBot',
  'CCBot',
]

export function robotsTxt(): string {
  return `# ${profile.brand} — ${SITE}
# Todo el sitio es público: buscadores y asistentes de IA son bienvenidos.

User-agent: *
Allow: /

${AI_CRAWLERS.map((agent) => `User-agent: ${agent}`).join('\n')}
Allow: /

Sitemap: ${SITE}/sitemap.xml
`
}
