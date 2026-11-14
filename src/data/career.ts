/**
 * Contenido del portfolio. Edita este archivo para cambiar textos,
 * enlaces y etapas: la escena 3D se genera a partir de estos datos.
 */

export type Lang = 'es' | 'en'

/** Texto en los dos idiomas de la web */
export interface Localized<T = string> {
  es: T
  en: T
}

/** Disciplina de la etapa: decide el mini-escenario que lleva la caja encima */
export type Discipline = 'fullstack' | 'frontend' | 'mobile' | 'lead' | 'blockchain' | 'data' | 'ai'

export interface Stage {
  /** Empresa: título grande en la cara del bloque */
  title: string
  /** Puesto */
  role: string
  /** Primer mes, como 'AAAA-MM' */
  start: string
  /** Último mes (incluido), como 'AAAA-MM'. Sin él, la etapa sigue en curso */
  end?: string
  /** Mostrar solo los años (fechas aún sin concretar) */
  yearOnly?: boolean
  /** Color de acento (bordes, línea guía y luz) */
  color: string
  /** Rótulo corto de la etapa (se muestra en la ficha lateral) */
  part?: Localized
  /** Disciplina: elige el mini-escenario animado de la caja */
  discipline: Discipline
  /** Tecnologías: salen como etiquetas al abrirse la caja */
  stack: string[]
  /** Dos o tres logros (frases cortas); salen en la ficha lateral */
  highlights?: Localized<string[]>
  /** Logo en /public/logos; se convierte en un emblema 3D de vóxeles */
  logo?: string
  /** Recorte [x0, y0, x1, y1] en fracciones (0..1) para usar solo el símbolo */
  logoCrop?: [number, number, number, number]
}

/** Nombre y lema de cada disciplina */
export const disciplines: Record<Discipline, { label: Localized; tagline: Localized }> = {
  fullstack: {
    label: { es: 'Full stack', en: 'Full stack' },
    tagline: { es: 'Frontend y backend', en: 'Frontend and backend' },
  },
  frontend: {
    label: { es: 'Frontend', en: 'Frontend' },
    tagline: { es: 'Interfaces web', en: 'Web interfaces' },
  },
  mobile: {
    label: { es: 'Móvil', en: 'Mobile' },
    tagline: { es: 'Aplicaciones móviles', en: 'Mobile apps' },
  },
  lead: {
    label: { es: 'Liderazgo', en: 'Leadership' },
    tagline: { es: 'Liderazgo técnico', en: 'Technical leadership' },
  },
  blockchain: {
    label: { es: 'Blockchain', en: 'Blockchain' },
    tagline: { es: 'Blockchain e IA', en: 'Blockchain and AI' },
  },
  data: {
    label: { es: 'Datos', en: 'Data' },
    tagline: { es: 'Arquitectura de datos', en: 'Data architecture' },
  },
  ai: {
    label: { es: 'IA', en: 'AI' },
    tagline: { es: 'Ingeniería de IA', en: 'AI engineering' },
  },
}

type Rich = Array<string | { strong: string }>

export const profile = {
  /** Marca de la cabecera: «brand by name» */
  brand: 'Kroquetita',
  name: 'Sergio Fuentes',
  headline: ['Head of AI /', 'VP of AI and Software Engineering'],
  intro: {
    es: [
      'Más de 5 años construyendo producto: ',
      { strong: 'frontend' },
      ', ',
      { strong: 'aplicaciones móviles' },
      ', ',
      { strong: 'backend' },
      ', ',
      { strong: 'arquitectura de datos' },
      ', ',
      { strong: 'blockchain' },
      ' e ',
      { strong: 'ingeniería de IA' },
      '.',
    ],
    en: [
      'Over 5 years building product: ',
      { strong: 'frontend' },
      ', ',
      { strong: 'mobile apps' },
      ', ',
      { strong: 'backend' },
      ', ',
      { strong: 'data architecture' },
      ', ',
      { strong: 'blockchain' },
      ' and ',
      { strong: 'AI engineering' },
      '.',
    ],
  } as Localized<Rich>,
  links: [{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/sergiofuentes566/' }],
  /** Conocimientos: son los nodos con etiqueta del cerebro que flota sobre la escena */
  skills: [
    'IA',
    'LLM',
    'NLP',
    'Data Science',
    'Python',
    'Node',
    'React',
    'React Native',
    'Next.js',
    'Three.js',
    'Blockchain',
    'Swift',
  ],
  /** Imagen que se graba en las monedas */
  coinImage: '/avatar.png',
}

// De la más antigua a la más reciente. La última es la etapa actual: la torre más alta.
// `stack` es provisional (sale de la lista de conocimientos) y faltan los `highlights`.
export const stages: Stage[] = [
  {
    title: 'Plexus Tech',
    role: 'FullStack Developer',
    start: '2021-03',
    end: '2021-06',
    color: '#19e6ff',
    part: { es: 'EL ARRANQUE', en: 'THE START' },
    discipline: 'fullstack',
    stack: ['React', 'Node'],
    logo: '/logos/plexus.png',
  },
  {
    title: 'Dedeeit',
    role: 'Frontend Developer',
    start: '2021-06',
    end: '2022-01',
    color: '#3df2b0',
    part: { es: 'LAS BASES', en: 'THE FOUNDATIONS' },
    discipline: 'frontend',
    stack: ['React', 'Next.js'],
    logo: '/logos/dedeeit.jpg',
    logoCrop: [0, 0.14, 1, 0.55],
  },
  {
    title: 'Emiral',
    role: 'FullStack Developer',
    start: '2022-01',
    end: '2022-07',
    color: '#ffd60a',
    part: { es: 'COGIENDO RITMO', en: 'PICKING UP PACE' },
    discipline: 'fullstack',
    stack: ['React', 'Node'],
    logo: '/logos/emiral.png',
  },
  {
    title: 'Sectorea IT',
    role: 'Mobile Software Engineer',
    start: '2022-10',
    end: '2023-05',
    color: '#2f7bff',
    part: { es: 'APPS MÓVILES', en: 'MOBILE APPS' },
    discipline: 'mobile',
    stack: ['React Native', 'Swift'],
    logo: '/logos/sectorea.png',
  },
  {
    title: 'Pepper Spain',
    role: 'Mobile Software Engineer',
    start: '2022-10',
    end: '2023-09',
    color: '#ff4d6d',
    part: { es: 'APPS MÓVILES', en: 'MOBILE APPS' },
    discipline: 'mobile',
    stack: ['React Native', 'Swift'],
    logo: '/logos/pepper.svg',
  },
  {
    title: 'Packar',
    role: 'Tech Lead',
    start: '2022-09',
    end: '2024-04',
    color: '#ff9f1c',
    part: { es: 'PRIMER EQUIPO A CARGO', en: 'FIRST TEAM TO LEAD' },
    discipline: 'lead',
    stack: ['React Native', 'Node'],
    logo: '/logos/packar.png',
    logoCrop: [0.06, 0.34, 0.36, 0.67],
  },
  {
    title: 'Tyris Software',
    role: 'Frontend Developer & Mobile Software Engineer',
    start: '2024-04',
    end: '2026-04',
    color: '#8b5cf6',
    part: { es: 'FRONTEND Y MÓVIL', en: 'FRONTEND AND MOBILE' },
    discipline: 'frontend',
    stack: ['React', 'Next.js', 'React Native'],
    logo: '/logos/tyris.png',
  },
  {
    title: 'Sportian',
    role: 'Tech Lead',
    start: '2024-04',
    end: '2026-04',
    color: '#22d3ee',
    part: { es: 'LIDERAZGO', en: 'LEADERSHIP' },
    discipline: 'lead',
    stack: ['React', 'Node'],
    logo: '/logos/sportian.webp',
  },
  {
    title: 'Izertis',
    role: 'Blockchain and AI Engineer',
    start: '2024-01',
    end: '2026-01',
    yearOnly: true,
    color: '#e8454f',
    part: { es: 'BLOCKCHAIN E IA', en: 'BLOCKCHAIN AND AI' },
    discipline: 'blockchain',
    stack: ['Blockchain', 'Python', 'LLM'],
    logo: '/logos/izertis.jpg',
  },
  {
    // Fechas provisionales
    title: 'Santander',
    role: 'Data Solutions Architecture Senior Associate',
    start: '2026-01',
    end: '2026-06',
    yearOnly: true,
    color: '#ec0000',
    part: { es: 'DATOS A ESCALA', en: 'DATA AT SCALE' },
    discipline: 'data',
    stack: ['Python', 'Data Science'],
    logo: '/logos/santander.png',
  },
  {
    // Fecha de inicio provisional
    title: 'TheAIBusiness',
    role: 'Tech Lead AI Engineer',
    start: '2026-06',
    yearOnly: true,
    color: '#ff6a2b',
    part: { es: 'INTELIGENCIA ARTIFICIAL', en: 'ARTIFICIAL INTELLIGENCE' },
    discipline: 'ai',
    stack: ['IA', 'LLM', 'NLP', 'Python'],
    logo: '/logos/theaibusiness.png',
  },
]

/** 'AAAA-MM' → meses desde el año 0 (para restar fechas) */
export const monthIndex = (date: string) => {
  const [year, month] = date.split('-').map(Number)
  return year * 12 + (month - 1)
}

const today = new Date()
/** Mes actual, en la misma escala que `monthIndex` */
export const NOW = today.getFullYear() * 12 + today.getMonth()

/** Duración de una etapa en meses (las fechas son inclusivas) */
export const monthsOf = (stage: Stage) =>
  Math.max(1, (stage.end ? monthIndex(stage.end) : NOW) - monthIndex(stage.start) + 1)

const MONTHS: Localized<string[]> = {
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

/** «Mar 2021 — Jun 2021», «2024 — 2026», «2026 — Hoy»… */
export function periodOf(stage: Stage, lang: Lang) {
  const label = (date: string) => {
    const [year, month] = date.split('-').map(Number)
    return stage.yearOnly ? String(year) : `${MONTHS[lang][month - 1]} ${year}`
  }
  const from = label(stage.start)
  const to = stage.end ? label(stage.end) : lang === 'es' ? 'Hoy' : 'Today'
  return from === to ? from : `${from} — ${to}`
}

/** «8 meses», «1 año y 8 meses», «En curso»… */
export function durationOf(stage: Stage, lang: Lang) {
  if (!stage.end) return lang === 'es' ? 'En curso' : 'Ongoing'
  const months = monthsOf(stage)
  const years = Math.floor(months / 12)
  const rest = months % 12
  const es = [
    years ? `${years} ${years === 1 ? 'año' : 'años'}` : '',
    rest ? `${rest} ${rest === 1 ? 'mes' : 'meses'}` : '',
  ].filter(Boolean)
  const en = [
    years ? `${years} ${years === 1 ? 'year' : 'years'}` : '',
    rest ? `${rest} ${rest === 1 ? 'month' : 'months'}` : '',
  ].filter(Boolean)
  return lang === 'es' ? es.join(' y ') : en.join(' ')
}

/** Logros de una etapa para la ficha lateral (ninguno si aún no se han escrito) */
export const linesOf = (stage: Stage, lang: Lang) => stage.highlights?.[lang]?.slice(0, 3) ?? []
