/**
 * Contenido del portfolio. Edita este archivo para cambiar textos,
 * enlaces y etapas: la escena 3D se genera a partir de estos datos.
 */

export interface Stage {
  /** Empresa: título grande en la cara del monolito */
  title: string
  /** Puesto */
  role: string
  /** Rango de fechas */
  period: string
  /** Color de acento (neón, halo y luz) */
  color: string
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
  /** Imagen que se graba en las monedas */
  coinImage: '/avatar.png',
}

// De la más antigua a la más reciente: la escalera sube en este orden.
export const stages: Stage[] = [
  {
    title: 'Plexus Tech',
    role: 'Desarrollador de software',
    period: 'Mar 2021 — Jun 2021',
    color: '#19e6ff',
    logo: '/logos/plexus.png',
  },
  {
    title: 'Dedeeit',
    role: 'Desarrollador Front-end',
    period: 'Jun 2021 — Ene 2022',
    color: '#3df2b0',
    logo: '/logos/dedeeit.jpg',
    logoCrop: [0, 0.14, 1, 0.55],
  },
  {
    title: 'Emiral',
    role: 'Desarrollador Full Stack',
    period: 'Ene 2022 — Jul 2022',
    color: '#ffd60a',
    logo: '/logos/emiral.png',
  },
  {
    title: 'Sectorea IT',
    role: 'Desarrollador Front-end',
    period: 'Oct 2022 — May 2023',
    color: '#2f7bff',
    logo: '/logos/sectorea.png',
  },
  {
    title: 'Pepper Spain',
    role: 'Desarrollador Front-end',
    period: 'Oct 2022 — Sep 2023',
    color: '#ff4d6d',
    logo: '/logos/pepper.svg',
  },
  {
    title: 'Packar',
    role: 'Frontend Lead',
    period: 'Sep 2022 — Abr 2024',
    color: '#ff9f1c',
    logo: '/logos/packar.png',
    logoCrop: [0.06, 0.34, 0.36, 0.67],
  },
  {
    title: 'Tyris Software',
    role: 'Senior Frontend Developer',
    period: 'Abr 2024 — Abr 2026',
    color: '#8b5cf6',
    logo: '/logos/tyris.png',
  },
  {
    title: 'Sportian',
    role: 'Lead Frontend Developer',
    period: 'Abr 2024 — Abr 2026',
    color: '#22d3ee',
    logo: '/logos/sportian.webp',
  },
  {
    title: 'Santander',
    role: 'Data Solutions Architecture Senior Associate',
    period: '2026',
    color: '#ec0000',
    logo: '/logos/santander.png',
  },
  {
    title: 'TheAIBusiness',
    role: 'Tech Lead AI Engineer',
    period: '2026 — Hoy',
    color: '#ff6a2b',
    logo: '/logos/theaibusiness.png',
  },
]
