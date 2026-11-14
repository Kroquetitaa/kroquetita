import type { Localized } from './career'

/**
 * Personajes con los que se puede hablar (tecla E, o tocando el aviso en el
 * móvil). Cada uno tiene varias conversaciones que van rotando; al acabar,
 * algunos hacen algo: abrir LinkedIn, cambiar el clima, empezar el recorrido…
 */

export type TalkerId = 'recruiter' | 'sysadmin' | 'qa' | 'guide' | 'joseba' | 'pochita'

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

/** Joseba: ingeniero de IA, friki y amigo, que no para de proponer ideas locas. */
talkers.push({
  id: 'joseba',
  name: { es: 'Joseba · AI Engineer', en: 'Joseba · AI Engineer' },
  color: '#2b2140',
  accent: '#3df2b0',
  position: [-1.8, 15],
  facing: -0.3,
  scripts: [
    {
      es: [
        '¡Sergio! Escucha: ¿y si entrenamos un modelo solo con actas de reuniones?',
        'Así aprende él solito a decir «lo vemos en otra call».',
        'Ya tengo el nombre: MeetingGPT. Va a ser enorme. O no.',
      ],
      en: [
        'Sergio! Listen: what if we train a model on nothing but meeting minutes?',
        'It would learn to say "let us take this offline" all by itself.',
        'I already have the name: MeetingGPT. It will be huge. Or not.',
      ],
    },
    {
      es: [
        '¿Y si le quitamos la gravedad a tu web? Por probar.',
        'Tranquilo, lo hago en producción, que es donde se ve bien.',
        'Mira, mira. Ya está. Ni un test. Limpio.',
      ],
      en: [
        'What if we remove gravity from your website? Just to see.',
        'Relax, I will do it in production, where it really shows.',
        'Look, look. Done. Not a single test. Clean.',
      ],
    },
    {
      es: [
        'Idea: agentes que gestionan a otros agentes que gestionan a otros agentes.',
        'Y arriba del todo, uno que solo pregunta «¿cómo vamos?».',
        'Lo he llamado «mando intermedio as a service».',
      ],
      en: [
        'Idea: agents that manage agents that manage other agents.',
        'And at the very top, one that only asks "how are we doing?".',
        'I call it "middle management as a service".',
      ],
    },
    {
      es: [
        '¿Y si desplegamos el LLM en una tostadora? Tiene chip, tiene wifi…',
        'Inferencia en el edge y tostadas en el edge. Dos pájaros de un tiro.',
        'Solo falla una cosa: alucina con la mantequilla.',
      ],
      en: [
        'What if we deploy the LLM on a toaster? It has a chip, it has wifi…',
        'Inference at the edge and toast at the edge. Two birds, one stone.',
        'Only one issue: it hallucinates butter.',
      ],
    },
    {
      es: [
        'Tengo un RAG que solo recupera memes. Recuperación aumentada por risas.',
        'Precisión del doce por ciento, pero la gente sale contenta.',
        'Lo siguiente: fine-tuning con los chistes de mi cuñado.',
      ],
      en: [
        'I built a RAG that only retrieves memes. Laughter-augmented generation.',
        'Twelve percent accuracy, but people leave happy.',
        'Next up: fine-tuning on my brother-in-law\'s jokes.',
      ],
    },
    {
      es: [
        'He montado un clúster con cuarenta Raspberry Pi y una Game Boy.',
        'La Game Boy hace de orquestador. Va lenta, pero tiene carisma.',
        'Si se cuelga, soplas el cartucho y listo.',
      ],
      en: [
        'I built a cluster out of forty Raspberry Pis and a Game Boy.',
        'The Game Boy is the orchestrator. Slow, but it has charisma.',
        'If it hangs, you blow on the cartridge and that is it.',
      ],
    },
    {
      es: [
        'Blockchain para decidir dónde comemos. Cada voto, un smart contract.',
        'Ayer comimos a las seis de la tarde por culpa de las comisiones.',
        'Pero quedó registrado para siempre. Eso no nos lo quita nadie.',
      ],
      en: [
        'Blockchain to decide where we have lunch. Every vote, a smart contract.',
        'Yesterday we ate at six in the evening because of the gas fees.',
        'But it is on record forever. Nobody can take that from us.',
      ],
    },
  ],
})

/** Pochita: te anima sin parar, con ideas y con «¡eres un crack!». */
talkers.push({
  id: 'pochita',
  name: { es: 'Pochita', en: 'Pochita' },
  color: '#ff5fa2',
  accent: '#ffd60a',
  position: [14.6, 12.2],
  facing: -0.5,
  scripts: [
    {
      es: [
        '¡Sergio! ¿Has visto todo lo que has montado? ¡Eres un crack!',
        'Una idea: ponle tu cara a las monedas. Ah, que ya lo has hecho. ¡Crack doble!',
        'Venga, a por la cima, que tú puedes con todo.',
      ],
      en: [
        'Sergio! Have you seen everything you have built? You rock!',
        'An idea: put your face on the coins. Oh, you already did. Double rock!',
        'Come on, off to the summit. You can handle anything.',
      ],
    },
    {
      es: [
        '¿Head of AI? Se te queda corto. Yo te pondría Head of Todo.',
        'Idea: celébralo. Cada commit, una fiesta pequeñita.',
        '¡Vamos, máquina!',
      ],
      en: [
        'Head of AI? That sells you short. I would make you Head of Everything.',
        'Idea: celebrate it. Every commit, a tiny party.',
        'Go get them, champ!',
      ],
    },
    {
      es: [
        'Hoy tienes cara de arreglar bugs sin mirar.',
        'Idea: cuando dudes, acuérdate de que ya has hecho cosas más difíciles.',
        'Eres un crack y lo sabes. Bueno, ahora lo sabes.',
      ],
      en: [
        'Today you look like someone who fixes bugs without even looking.',
        'Idea: when in doubt, remember you have already done harder things.',
        'You rock and you know it. Well, now you know it.',
      ],
    },
    {
      es: [
        '¡Qué web más bonita! ¿La has hecho tú? Claro que la has hecho tú.',
        'Idea: enséñasela a todo el mundo. A tu abuela también.',
        'Estoy orgullosísima. ¡A tope!',
      ],
      en: [
        'What a beautiful website! Did you make it? Of course you made it.',
        'Idea: show it to everyone. Your grandma too.',
        'I could not be prouder. Full speed ahead!',
      ],
    },
    {
      es: [
        'Si el bug gigante te da miedo, piensa que él te tiene más miedo a ti.',
        'Tres saltos y a casa. Lo tienes hecho.',
        '¡Dale, crack!',
      ],
      en: [
        'If the giant bug scares you, remember it is more scared of you.',
        'Three jumps and home. You have got this.',
        'Go for it, champ!',
      ],
    },
  ],
})

/** Lo que te grita Pochita cuando pasas cerca */
export const pochitaShouts: Localized<string[]> = {
  es: ['¡Eres un crack!', '¡Tú puedes!', '¡Vamos, máquina!', '¡Qué salto!', '¡Así se hace!', '¡Ole tú!', '¡A por todas!'],
  en: ['You rock!', 'You can do it!', 'Go, champ!', 'What a jump!', 'That is how it is done!', 'Go you!', 'Go get them!'],
}
/** …y cada vez que coges una moneda */
export const pochitaCoin: Localized<string[]> = {
  es: ['¡Otra moneda! ¡Crack!', '¡Toma ya!', '¡Imparable!', '¡Esa es mi gente!'],
  en: ['Another coin! Legend!', 'Yes!', 'Unstoppable!', 'That is my champ!'],
}

/** Lo que grita Joseba cuando pasas cerca, antes de que le hables */
export const josebaShouts: Localized<string[]> = {
  es: [
    '¡Tengo otra idea!',
    '¿Y si…? No, espera. ¿Y si…?',
    'Esto con un agente se arregla.',
    '¿Lo metemos en un vector store?',
    'Un LLM más y ya está.',
    'Necesitamos más GPUs. Siempre.',
    '¡Sergio! ¡Ven, que te cuento!',
  ],
  en: [
    'I have another idea!',
    'What if…? No, wait. What if…?',
    'An agent would fix this.',
    'Shall we put it in a vector store?',
    'One more LLM and we are done.',
    'We need more GPUs. Always.',
    'Sergio! Come here, listen to this!',
  ],
}

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
