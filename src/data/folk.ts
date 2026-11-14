import type { Localized } from './career'

/**
 * Personajes con los que se puede hablar (tecla E, o tocando el aviso en el
 * móvil). Cada uno tiene varias conversaciones que van rotando; al acabar,
 * algunos hacen algo: abrir LinkedIn, cambiar el clima, empezar el recorrido…
 */

export type TalkerId = 'recruiter' | 'sysadmin' | 'qa' | 'guide'

export interface Talker {
  id: TalkerId
  name: Localized
  /** Color de la ropa y del detalle luminoso */
  color: string
  accent: string
  /** Dónde está (x, z) y hacia dónde mira en reposo */
  position: [number, number]
  facing: number
  /** Conversaciones: se dicen en orden, una cada vez que se habla con él */
  scripts: Array<Localized<string[]>>
}

export const talkers: Talker[] = [
  {
    id: 'recruiter',
    name: { es: 'Reclutadora', en: 'Recruiter' },
    color: '#ff4d8d',
    accent: '#ffd60a',
    position: [-18, 12.2],
    facing: 0.5,
    scripts: [
      {
        es: [
          '¡Hola! Busco a alguien que lidere equipos de IA.',
          'Que sepa de frontend, móvil, datos y blockchain. Un unicornio, vamos.',
          'Ah, ¿que es el dueño de esta web? Qué casualidad.',
          'Te abro su LinkedIn. Dile que vas de mi parte.',
        ],
        en: [
          'Hi! I am looking for someone to lead AI teams.',
          'Who also knows frontend, mobile, data and blockchain. A unicorn, basically.',
          'Oh, he owns this website? What a coincidence.',
          'Let me open his LinkedIn. Tell him I sent you.',
        ],
      },
      {
        es: ['¿Otra vez tú? El LinkedIn sigue en el mismo sitio.', 'Te lo abro de nuevo, que no se diga.'],
        en: ['You again? His LinkedIn has not moved.', 'I will open it again. Never say I do not try.'],
      },
    ],
  },
  {
    id: 'guide',
    name: { es: 'Guía', en: 'Guide' },
    color: '#3df2b0',
    accent: '#19e6ff',
    position: [-14.5, 9.8],
    facing: 0.3,
    scripts: [
      {
        es: [
          '¡Bienvenido al tour de la trayectoria! Más de cinco años en once cajas.',
          'Empezamos en 2021 y acabamos en la torre más alta.',
          'No hace falta saltar: la cámara la llevo yo. ¿Vamos?',
        ],
        en: [
          'Welcome to the career tour! Over five years in eleven boxes.',
          'We start in 2021 and finish at the tallest tower.',
          'No jumping required: I carry the camera. Shall we?',
        ],
      },
      {
        es: ['¿Repetimos? Las cajas no se han movido de sitio.', 'Venga, otra vuelta. Esta invita la casa.'],
        en: ['Again? The boxes have not moved.', 'Fine, one more lap. This one is on the house.'],
      },
    ],
  },
  {
    id: 'qa',
    name: { es: 'QA', en: 'QA' },
    color: '#8b5cf6',
    accent: '#ff9f1c',
    position: [-20, -4.6],
    facing: 0.9,
    scripts: [
      {
        es: [
          'Soy de QA. Si pasa los tests, es que no los he escrito yo.',
          'Una pista: hay un código clásico. Arriba, arriba, abajo, abajo…',
          '…izquierda, derecha, izquierda, derecha, B, A. Yo no te he dicho nada.',
        ],
        en: [
          'I am QA. If it passes the tests, I did not write them.',
          'A hint: there is a classic code. Up, up, down, down…',
          '…left, right, left, right, B, A. You did not hear it from me.',
        ],
      },
      {
        es: [
          'He abierto un bug: «el usuario puede ser feliz».',
          'Otra pista: pulsa T y escribe sudo hire sergio.',
          'En producción no lo he probado. Yo nunca pruebo en producción. Bueno…',
        ],
        en: [
          'I filed a bug: "the user is able to be happy".',
          'Another hint: press T and type sudo hire sergio.',
          'I have not tested it in production. I never test in production. Well…',
        ],
      },
      {
        es: [
          '¿Ves la cinta? Uno de cada ocho paquetes no pasa. Ese test es mío.',
          'Última pista: salta encima de los bichos. Con cinco te dan una medalla.',
          'Y no pulses el botón rojo. Es broma: púlsalo.',
        ],
        en: [
          'See the belt? One in eight packages fails. That test is mine.',
          'Last hint: jump on the bugs. Five of them earn you a medal.',
          'And do not press the red button. Kidding: press it.',
        ],
      },
    ],
  },
  {
    id: 'sysadmin',
    name: { es: 'Sysadmin', en: 'Sysadmin' },
    color: '#2f7bff',
    accent: '#3df2b0',
    position: [23.6, -4.4],
    facing: -0.6,
    scripts: [
      {
        es: [
          'Sysadmin. Si todo funciona, no me ves. Si no funciona, tampoco.',
          'Cuatrocientos días sin caídas. El servidor, digo. Yo llevo dos cafés.',
          'Tengo permisos de root en todo. Hasta en el clima.',
          'Mira, te lo cambio. Si alguien pregunta, ha sido el DNS.',
        ],
        en: [
          'Sysadmin. If everything works, you never see me. If it does not, same.',
          'Four hundred days of uptime. The server, I mean. I am two coffees in.',
          'I have root on everything. Even the weather.',
          'Watch, I will change it. If anyone asks, it was DNS.',
        ],
      },
      {
        es: ['¿No te gusta el tiempo que hace? A mí tampoco los lunes.', 'Cambiando… Siempre es el DNS.'],
        en: ['Not a fan of the weather? Me neither, on Mondays.', 'Changing it… It is always DNS.'],
      },
    ],
  },
]

/** Lo que va soltando el becario mientras te sigue */
export const internLines: Localized<string[]> = {
  es: [
    '¿Esto se sube a producción directamente?',
    '¿Qué es un merge conflict? Pregunto por un amigo.',
    'He borrado node_modules. ¿Era importante?',
    '¿Puedo hacer push en viernes?',
    '¿Cuándo me dan permisos de admin?',
    'He arreglado un bug. Bueno, lo he comentado.',
    '¿Tú también empezaste así?',
  ],
  en: [
    'Does this go straight to production?',
    'What is a merge conflict? Asking for a friend.',
    'I deleted node_modules. Was that important?',
    'Can I push on a Friday?',
    'When do I get admin rights?',
    'I fixed a bug. Well, I commented it out.',
    'Did you start like this too?',
  ],
}

export const internName: Localized = { es: 'Becario', en: 'Intern' }
