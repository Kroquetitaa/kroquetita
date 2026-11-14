/**
 * Contenido del portfolio. Edita este archivo para cambiar textos,
 * enlaces y etapas: la escena 3D se genera a partir de estos datos.
 */

export interface Stage {
  /** Empresa: título grande en la cara del bloque */
  title: string
  /** Puesto */
  role: string
  /** Rango de fechas */
  period: string
  /** Duración en meses: de ella sale la altura del bloque */
  months?: number
  /** Color de acento (bordes, línea guía y luz) */
  color: string
  /**
   * Rótulo corto de la etapa (se muestra en la ficha lateral).
   */
  part?: string
  /** Logo en /public/logos; se convierte en un emblema 3D de vóxeles */
  logo?: string
  /** Recorte [x0, y0, x1, y1] en fracciones (0..1) para usar solo el símbolo */
  logoCrop?: [number, number, number, number]
}

export const profile = {
  /** Marca de la cabecera: «brand by name» */
  brand: 'Kroquetita',
  name: 'Sergio Fuentes',
  headline: ['Head of AI /', 'VP of AI and Software Engineering'],
  intro: [
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
  ] as Array<string | { strong: string }>,
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
export const stages: Stage[] = [
  {
    title: 'Plexus Tech',
    role: 'FullStack Developer',
    period: 'Mar 2021 — Jun 2021',
    months: 4,
    color: '#19e6ff',
    part: 'EL ARRANQUE',
    logo: '/logos/plexus.png',
  },
  {
    title: 'Dedeeit',
    role: 'Frontend Developer',
    period: 'Jun 2021 — Ene 2022',
    months: 8,
    color: '#3df2b0',
    part: 'LAS BASES',
    logo: '/logos/dedeeit.jpg',
    logoCrop: [0, 0.14, 1, 0.55],
  },
  {
    title: 'Emiral',
    role: 'FullStack Developer',
    period: 'Ene 2022 — Jul 2022',
    months: 7,
    color: '#ffd60a',
    part: 'COGIENDO RITMO',
    logo: '/logos/emiral.png',
  },
  {
    title: 'Sectorea IT',
    role: 'Mobile Software Engineer',
    period: 'Oct 2022 — May 2023',
    months: 8,
    color: '#2f7bff',
    part: 'APPS MÓVILES',
    logo: '/logos/sectorea.png',
  },
  {
    title: 'Pepper Spain',
    role: 'Mobile Software Engineer',
    period: 'Oct 2022 — Sep 2023',
    months: 12,
    color: '#ff4d6d',
    part: 'APPS MÓVILES',
    logo: '/logos/pepper.svg',
  },
  {
    title: 'Packar',
    role: 'Tech Lead',
    period: 'Sep 2022 — Abr 2024',
    months: 20,
    color: '#ff9f1c',
    part: 'PRIMER EQUIPO A CARGO',
    logo: '/logos/packar.png',
    logoCrop: [0.06, 0.34, 0.36, 0.67],
  },
  {
    title: 'Tyris Software',
    role: 'Frontend Developer',
    period: 'Abr 2024 — Abr 2026',
    months: 25,
    color: '#8b5cf6',
    part: 'FRONTEND',
    logo: '/logos/tyris.png',
  },
  {
    title: 'Sportian',
    role: 'Tech Lead',
    period: 'Abr 2024 — Abr 2026',
    months: 25,
    color: '#22d3ee',
    part: 'LIDERAZGO',
    logo: '/logos/sportian.webp',
  },
  {
    title: 'Izertis',
    role: 'Blockchain and AI Engineer',
    period: '2026',
    months: 6,
    color: '#e8454f',
    part: 'BLOCKCHAIN E IA',
    logo: '/logos/izertis.jpg',
  },
  {
    title: 'Santander',
    role: 'Data Solutions Architecture Senior Associate',
    period: '2026',
    months: 6,
    color: '#ec0000',
    part: 'DATOS A ESCALA',
    logo: '/logos/santander.png',
  },
  {
    title: 'TheAIBusiness',
    role: 'Tech Lead AI Engineer',
    period: '2026 — Hoy',
    color: '#ff6a2b',
    part: 'INTELIGENCIA ARTIFICIAL',
    logo: '/logos/theaibusiness.png',
  },
]
