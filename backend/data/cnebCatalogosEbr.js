/**
 * Catálogo CNEB — Primaria y Secundaria (áreas + competencias + capacidades).
 * Los desempeños por grado se cargan después desde el programa curricular de cada nivel.
 * Fuente: Currículo Nacional de la Educación Básica (MINEDU).
 */

function C(codigo, nombre, capacidades, estandar) {
  return { codigo, nombre, capacidades, estandar_ciclo: estandar || '', desempenos: {} };
}

const FUENTE_EBR = 'Currículo Nacional de la Educación Básica — MINEDU';

const CATALOGO_PRIMARIA = [
  {
    codigo: 'PS',
    nombre: 'Personal Social',
    tipo: 'curricular',
    orden: 10,
    descripcion: 'Identidad, convivencia, historia, espacio y economía en el ciclo III–V.',
    competencias: [
      C('PS-IDENTIDAD', 'Construye su identidad', ['Se valora a sí mismo', 'Autorregula sus emociones', 'Reflexiona y argumenta éticamente', 'Vive su sexualidad de manera integral y responsable']),
      C('PS-CONVIVE', 'Convive y participa democráticamente en la búsqueda del bien común', ['Interactúa con todas las personas', 'Construye normas y asume acuerdos y leyes', 'Maneja conflictos de manera constructiva', 'Delibera sobre asuntos públicos', 'Participa en acciones que promueven el bienestar común']),
      C('PS-HISTORIA', 'Construye interpretaciones históricas', ['Interpreta críticamente fuentes diversas', 'Comprende el tiempo histórico', 'Elabora explicaciones sobre procesos históricos']),
      C('PS-ESPACIO', 'Gestiona responsablemente el espacio y el ambiente', ['Comprende las relaciones entre los elementos naturales y sociales', 'Maneja fuentes de información para comprender el espacio geográfico', 'Genera acciones para conservar el ambiente local y global']),
      C('PS-ECONOMIA', 'Gestiona responsablemente los recursos económicos', ['Comprende las relaciones entre los elementos del sistema económico y financiero', 'Toma decisiones económicas y financieras']),
    ],
  },
  {
    codigo: 'EF',
    nombre: 'Educación Física',
    tipo: 'curricular',
    orden: 20,
    descripcion: 'Motricidad, vida saludable e interacción sociomotriz.',
    competencias: [
      C('EF-MOTRICIDAD', 'Se desenvuelve de manera autónoma a través de su motricidad', ['Comprende su cuerpo', 'Se expresa corporalmente']),
      C('EF-SALUD', 'Asume una vida saludable', ['Comprende las relaciones entre la actividad física, alimentación, postura e higiene', 'Incorpora prácticas que mejoran su calidad de vida']),
      C('EF-SOCIO', 'Interactúa a través de sus habilidades sociomotrices', ['Se relaciona utilizando sus habilidades sociomotrices', 'Crea y aplica estrategias y tácticas de juego']),
    ],
  },
  {
    codigo: 'ARTE',
    nombre: 'Arte y Cultura',
    tipo: 'curricular',
    orden: 25,
    descripcion: 'Apreciación crítica y creación en los lenguajes artísticos.',
    competencias: [
      C('ARTE-APRECIA', 'Aprecia de manera crítica manifestaciones artístico-culturales', ['Percibe manifestaciones artístico-culturales', 'Contextualiza las manifestaciones artístico-culturales', 'Reflexiona creativa y críticamente']),
      C('ARTE-CREA', 'Crea proyectos desde los lenguajes artísticos', ['Explora y experimenta los lenguajes del arte', 'Aplica procesos creativos', 'Evalúa y comunica sus procesos y proyectos']),
    ],
  },
  {
    codigo: 'COM',
    nombre: 'Comunicación',
    tipo: 'curricular',
    orden: 30,
    descripcion: 'Oralidad, lectura y escritura en lengua materna.',
    competencias: [
      C('COM-ORAL', 'Se comunica oralmente en su lengua materna', ['Obtiene información del texto oral', 'Infiere e interpreta información del texto oral', 'Adecúa, organiza y desarrolla las ideas de forma coherente y cohesionada', 'Utiliza recursos no verbales y paraverbales de forma estratégica', 'Interactúa estratégicamente con distintos interlocutores', 'Reflexiona y evalúa la forma, el contenido y el contexto del texto oral']),
      C('COM-LEE', 'Lee diversos tipos de textos escritos en su lengua materna', ['Obtiene información del texto escrito', 'Infiere e interpreta información del texto', 'Reflexiona y evalúa la forma, el contenido y el contexto del texto']),
      C('COM-ESCRIBE', 'Escribe diversos tipos de textos en su lengua materna', ['Adecúa el texto a la situación comunicativa', 'Organiza y desarrolla las ideas de forma coherente y cohesionada', 'Utiliza convenciones del lenguaje escrito de forma pertinente', 'Reflexiona y evalúa la forma, el contenido y el contexto del texto escrito']),
    ],
  },
  {
    codigo: 'ING',
    nombre: 'Inglés como lengua extranjera',
    tipo: 'curricular',
    orden: 35,
    descripcion: 'Comunicación oral, lectura y escritura en inglés.',
    competencias: [
      C('ING-ORAL', 'Se comunica oralmente en inglés como lengua extranjera', ['Obtiene información de textos orales', 'Infiere e interpreta información de textos orales', 'Adecúa, organiza y desarrolla las ideas de forma coherente y cohesionada', 'Utiliza recursos no verbales y paraverbales de forma estratégica', 'Interactúa estratégicamente con distintos interlocutores', 'Reflexiona y evalúa la forma, el contenido y el contexto del texto oral']),
      C('ING-LEE', 'Lee diversos tipos de textos escritos en inglés como lengua extranjera', ['Obtiene información del texto escrito', 'Infiere e interpreta información del texto', 'Reflexiona y evalúa la forma, el contenido y el contexto del texto']),
      C('ING-ESCRIBE', 'Escribe diversos tipos de textos en inglés como lengua extranjera', ['Adecúa el texto a la situación comunicativa', 'Organiza y desarrolla las ideas de forma coherente y cohesionada', 'Utiliza convenciones del lenguaje escrito de forma pertinente', 'Reflexiona y evalúa la forma, el contenido y el contexto del texto escrito']),
    ],
  },
  {
    codigo: 'MAT',
    nombre: 'Matemática',
    tipo: 'curricular',
    orden: 40,
    descripcion: 'Cantidad, regularidad, datos y forma.',
    competencias: [
      C('MAT-CANTIDAD', 'Resuelve problemas de cantidad', ['Traduce cantidades a expresiones numéricas', 'Comunica su comprensión sobre los números y las operaciones', 'Usa estrategias y procedimientos de estimación y cálculo', 'Argumenta afirmaciones sobre las relaciones numéricas y las operaciones']),
      C('MAT-REGULARIDAD', 'Resuelve problemas de regularidad, equivalencia y cambio', ['Traduce datos y condiciones a expresiones algebraicas y gráficas', 'Comunica su comprensión sobre las relaciones algebraicas', 'Usa estrategias y procedimientos para encontrar equivalencias y reglas generales', 'Argumenta afirmaciones sobre relaciones de cambio y equivalencia']),
      C('MAT-DATOS', 'Resuelve problemas de gestión de datos e incertidumbre', ['Representa datos con gráficos y medidas estadísticas o probabilísticas', 'Comunica su comprensión de los conceptos estadísticos y probabilísticos', 'Usa estrategias y procedimientos para recopilar y procesar datos', 'Sustenta conclusiones o decisiones con base en la información obtenida']),
      C('MAT-FORMA', 'Resuelve problemas de forma, movimiento y localización', ['Modela objetos con formas geométricas y sus transformaciones', 'Comunica su comprensión sobre las formas y relaciones geométricas', 'Usa estrategias y procedimientos para orientarse en el espacio', 'Argumenta afirmaciones sobre relaciones geométricas']),
    ],
  },
  {
    codigo: 'CYT',
    nombre: 'Ciencia y Tecnología',
    tipo: 'curricular',
    orden: 50,
    descripcion: 'Indagación, explicación del mundo físico y soluciones tecnológicas.',
    competencias: [
      C('CYT-INDAGA', 'Indaga mediante métodos científicos para construir sus conocimientos', ['Problematiza situaciones para hacer indagación', 'Diseña estrategias para hacer indagación', 'Genera y registra datos e información', 'Analiza datos e información', 'Evalúa y comunica el proceso y resultados de su indagación']),
      C('CYT-EXPLICA', 'Explica el mundo físico basándose en conocimientos sobre los seres vivos, materia y energía, biodiversidad, Tierra y universo', ['Comprende y usa conocimientos sobre los seres vivos, materia y energía, biodiversidad, Tierra y universo', 'Evalúa las implicancias del saber y de la actividad científica y tecnológica']),
      C('CYT-DISENA', 'Diseña y construye soluciones tecnológicas para resolver problemas de su entorno', ['Determina una alternativa de solución tecnológica', 'Diseña la alternativa de solución tecnológica', 'Implementa y valida la alternativa de solución tecnológica', 'Evalúa y comunica el funcionamiento y los impactos de su alternativa de solución tecnológica']),
    ],
  },
  {
    codigo: 'REL',
    nombre: 'Educación Religiosa',
    tipo: 'religion',
    orden: 60,
    descripcion: 'Identidad religiosa, según el PCI de la IE.',
    competencias: [
      C('REL-IDENTIDAD', 'Construye su identidad como persona humana, amada por Dios, digna, libre y trascendente, comprendiendo la doctrina de su propia religión, abierto al diálogo con las que le son cercanas', ['Conoce a Dios y asume su identidad religiosa y espiritual como persona digna, libre y trascendente', 'Cultiva y valora las manifestaciones religiosas de su entorno argumentando su fe de manera comprensible y respetuosa']),
    ],
  },
  {
    codigo: 'TIC',
    nombre: 'Se desenvuelve en entornos virtuales',
    tipo: 'transversal',
    orden: 80,
    descripcion: 'Competencia transversal a las áreas.',
    competencias: [
      C('TIC-ENTORNOS', 'Se desenvuelve en los entornos virtuales generados por las TIC', ['Personaliza entornos virtuales', 'Gestiona información del entorno virtual', 'Interactúa en entornos virtuales', 'Crea objetos virtuales en diversos formatos']),
    ],
  },
  {
    codigo: 'AUTO',
    nombre: 'Gestiona su aprendizaje de manera autónoma',
    tipo: 'transversal',
    orden: 90,
    descripcion: 'Competencia transversal a las áreas.',
    competencias: [
      C('AUTO-APRENDIZAJE', 'Gestiona su aprendizaje de manera autónoma', ['Define metas de aprendizaje', 'Organiza acciones estratégicas para alcanzar sus metas de aprendizaje', 'Monitorea y ajusta su desempeño durante el proceso de aprendizaje']),
    ],
  },
];

const CATALOGO_SECUNDARIA = [
  {
    codigo: 'DPCC',
    nombre: 'Desarrollo Personal, Ciudadanía y Cívica',
    tipo: 'curricular',
    orden: 10,
    descripcion: 'Identidad y convivencia democrática en secundaria.',
    competencias: [
      C('PS-IDENTIDAD', 'Construye su identidad', ['Se valora a sí mismo', 'Autorregula sus emociones', 'Reflexiona y argumenta éticamente', 'Vive su sexualidad de manera integral y responsable']),
      C('PS-CONVIVE', 'Convive y participa democráticamente en la búsqueda del bien común', ['Interactúa con todas las personas', 'Construye normas y asume acuerdos y leyes', 'Maneja conflictos de manera constructiva', 'Delibera sobre asuntos públicos', 'Participa en acciones que promueven el bienestar común']),
    ],
  },
  {
    codigo: 'CS',
    nombre: 'Ciencias Sociales',
    tipo: 'curricular',
    orden: 12,
    descripcion: 'Historia, espacio y economía.',
    competencias: [
      C('PS-HISTORIA', 'Construye interpretaciones históricas', ['Interpreta críticamente fuentes diversas', 'Comprende el tiempo histórico', 'Elabora explicaciones sobre procesos históricos']),
      C('PS-ESPACIO', 'Gestiona responsablemente el espacio y el ambiente', ['Comprende las relaciones entre los elementos naturales y sociales', 'Maneja fuentes de información para comprender el espacio geográfico', 'Genera acciones para conservar el ambiente local y global']),
      C('PS-ECONOMIA', 'Gestiona responsablemente los recursos económicos', ['Comprende las relaciones entre los elementos del sistema económico y financiero', 'Toma decisiones económicas y financieras']),
    ],
  },
  {
    codigo: 'EF',
    nombre: 'Educación Física',
    tipo: 'curricular',
    orden: 20,
    competencias: [
      C('EF-MOTRICIDAD', 'Se desenvuelve de manera autónoma a través de su motricidad', ['Comprende su cuerpo', 'Se expresa corporalmente']),
      C('EF-SALUD', 'Asume una vida saludable', ['Comprende las relaciones entre la actividad física, alimentación, postura e higiene', 'Incorpora prácticas que mejoran su calidad de vida']),
      C('EF-SOCIO', 'Interactúa a través de sus habilidades sociomotrices', ['Se relaciona utilizando sus habilidades sociomotrices', 'Crea y aplica estrategias y tácticas de juego']),
    ],
  },
  {
    codigo: 'ARTE',
    nombre: 'Arte y Cultura',
    tipo: 'curricular',
    orden: 25,
    competencias: [
      C('ARTE-APRECIA', 'Aprecia de manera crítica manifestaciones artístico-culturales', ['Percibe manifestaciones artístico-culturales', 'Contextualiza las manifestaciones artístico-culturales', 'Reflexiona creativa y críticamente']),
      C('ARTE-CREA', 'Crea proyectos desde los lenguajes artísticos', ['Explora y experimenta los lenguajes del arte', 'Aplica procesos creativos', 'Evalúa y comunica sus procesos y proyectos']),
    ],
  },
  {
    codigo: 'COM',
    nombre: 'Comunicación',
    tipo: 'curricular',
    orden: 30,
    competencias: [
      C('COM-ORAL', 'Se comunica oralmente en su lengua materna', ['Obtiene información del texto oral', 'Infiere e interpreta información del texto oral', 'Adecúa, organiza y desarrolla las ideas de forma coherente y cohesionada', 'Utiliza recursos no verbales y paraverbales de forma estratégica', 'Interactúa estratégicamente con distintos interlocutores', 'Reflexiona y evalúa la forma, el contenido y el contexto del texto oral']),
      C('COM-LEE', 'Lee diversos tipos de textos escritos en su lengua materna', ['Obtiene información del texto escrito', 'Infiere e interpreta información del texto', 'Reflexiona y evalúa la forma, el contenido y el contexto del texto']),
      C('COM-ESCRIBE', 'Escribe diversos tipos de textos en su lengua materna', ['Adecúa el texto a la situación comunicativa', 'Organiza y desarrolla las ideas de forma coherente y cohesionada', 'Utiliza convenciones del lenguaje escrito de forma pertinente', 'Reflexiona y evalúa la forma, el contenido y el contexto del texto escrito']),
    ],
  },
  {
    codigo: 'ING',
    nombre: 'Inglés como lengua extranjera',
    tipo: 'curricular',
    orden: 35,
    competencias: [
      C('ING-ORAL', 'Se comunica oralmente en inglés como lengua extranjera', ['Obtiene información de textos orales', 'Infiere e interpreta información de textos orales', 'Adecúa, organiza y desarrolla las ideas de forma coherente y cohesionada', 'Utiliza recursos no verbales y paraverbales de forma estratégica', 'Interactúa estratégicamente con distintos interlocutores', 'Reflexiona y evalúa la forma, el contenido y el contexto del texto oral']),
      C('ING-LEE', 'Lee diversos tipos de textos escritos en inglés como lengua extranjera', ['Obtiene información del texto escrito', 'Infiere e interpreta información del texto', 'Reflexiona y evalúa la forma, el contenido y el contexto del texto']),
      C('ING-ESCRIBE', 'Escribe diversos tipos de textos en inglés como lengua extranjera', ['Adecúa el texto a la situación comunicativa', 'Organiza y desarrolla las ideas de forma coherente y cohesionada', 'Utiliza convenciones del lenguaje escrito de forma pertinente', 'Reflexiona y evalúa la forma, el contenido y el contexto del texto escrito']),
    ],
  },
  {
    codigo: 'MAT',
    nombre: 'Matemática',
    tipo: 'curricular',
    orden: 40,
    competencias: [
      C('MAT-CANTIDAD', 'Resuelve problemas de cantidad', ['Traduce cantidades a expresiones numéricas', 'Comunica su comprensión sobre los números y las operaciones', 'Usa estrategias y procedimientos de estimación y cálculo', 'Argumenta afirmaciones sobre las relaciones numéricas y las operaciones']),
      C('MAT-REGULARIDAD', 'Resuelve problemas de regularidad, equivalencia y cambio', ['Traduce datos y condiciones a expresiones algebraicas y gráficas', 'Comunica su comprensión sobre las relaciones algebraicas', 'Usa estrategias y procedimientos para encontrar equivalencias y reglas generales', 'Argumenta afirmaciones sobre relaciones de cambio y equivalencia']),
      C('MAT-DATOS', 'Resuelve problemas de gestión de datos e incertidumbre', ['Representa datos con gráficos y medidas estadísticas o probabilísticas', 'Comunica su comprensión de los conceptos estadísticos y probabilísticos', 'Usa estrategias y procedimientos para recopilar y procesar datos', 'Sustenta conclusiones o decisiones con base en la información obtenida']),
      C('MAT-FORMA', 'Resuelve problemas de forma, movimiento y localización', ['Modela objetos con formas geométricas y sus transformaciones', 'Comunica su comprensión sobre las formas y relaciones geométricas', 'Usa estrategias y procedimientos para orientarse en el espacio', 'Argumenta afirmaciones sobre relaciones geométricas']),
    ],
  },
  {
    codigo: 'CYT',
    nombre: 'Ciencia y Tecnología',
    tipo: 'curricular',
    orden: 50,
    competencias: [
      C('CYT-INDAGA', 'Indaga mediante métodos científicos para construir sus conocimientos', ['Problematiza situaciones para hacer indagación', 'Diseña estrategias para hacer indagación', 'Genera y registra datos e información', 'Analiza datos e información', 'Evalúa y comunica el proceso y resultados de su indagación']),
      C('CYT-EXPLICA', 'Explica el mundo físico basándose en conocimientos sobre los seres vivos, materia y energía, biodiversidad, Tierra y universo', ['Comprende y usa conocimientos sobre los seres vivos, materia y energía, biodiversidad, Tierra y universo', 'Evalúa las implicancias del saber y de la actividad científica y tecnológica']),
      C('CYT-DISENA', 'Diseña y construye soluciones tecnológicas para resolver problemas de su entorno', ['Determina una alternativa de solución tecnológica', 'Diseña la alternativa de solución tecnológica', 'Implementa y valida la alternativa de solución tecnológica', 'Evalúa y comunica el funcionamiento y los impactos de su alternativa de solución tecnológica']),
    ],
  },
  {
    codigo: 'EPT',
    nombre: 'Educación para el Trabajo',
    tipo: 'curricular',
    orden: 55,
    descripcion: 'Emprendimiento económico o social.',
    competencias: [
      C('EPT-EMPRENDE', 'Gestiona proyectos de emprendimiento económico o social', ['Crea propuestas de valor', 'Aplica habilidades técnicas', 'Trabaja cooperativamente para lograr objetivos y metas', 'Evalúa los resultados del proyecto de emprendimiento']),
    ],
  },
  {
    codigo: 'REL',
    nombre: 'Educación Religiosa',
    tipo: 'religion',
    orden: 60,
    competencias: [
      C('REL-IDENTIDAD', 'Construye su identidad como persona humana, amada por Dios, digna, libre y trascendente, comprendiendo la doctrina de su propia religión, abierto al diálogo con las que le son cercanas', ['Conoce a Dios y asume su identidad religiosa y espiritual como persona digna, libre y trascendente', 'Cultiva y valora las manifestaciones religiosas de su entorno argumentando su fe de manera comprensible y respetuosa']),
    ],
  },
  {
    codigo: 'TIC',
    nombre: 'Se desenvuelve en entornos virtuales',
    tipo: 'transversal',
    orden: 80,
    competencias: [
      C('TIC-ENTORNOS', 'Se desenvuelve en los entornos virtuales generados por las TIC', ['Personaliza entornos virtuales', 'Gestiona información del entorno virtual', 'Interactúa en entornos virtuales', 'Crea objetos virtuales en diversos formatos']),
    ],
  },
  {
    codigo: 'AUTO',
    nombre: 'Gestiona su aprendizaje de manera autónoma',
    tipo: 'transversal',
    orden: 90,
    competencias: [
      C('AUTO-APRENDIZAJE', 'Gestiona su aprendizaje de manera autónoma', ['Define metas de aprendizaje', 'Organiza acciones estratégicas para alcanzar sus metas de aprendizaje', 'Monitorea y ajusta su desempeño durante el proceso de aprendizaje']),
    ],
  },
];

module.exports = { CATALOGO_PRIMARIA, CATALOGO_SECUNDARIA, FUENTE_EBR };
