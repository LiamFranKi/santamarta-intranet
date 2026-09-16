/**
 * Catálogo CNEB — Educación Inicial ciclo II (3, 4 y 5 años).
 * Fuente: Programa curricular de Educación Inicial (MINEDU).
 * No genera IA. Se siembra en tablas cneb_*.
 */
const FUENTE =
  'Programa curricular de Educación Inicial — MINEDU (ciclo II, 3 a 5 años)';

function C(codigo, nombre, capacidades, estandar, desempenos) {
  return { codigo, nombre, capacidades, estandar_ciclo: estandar, desempenos };
}

const CATALOGO_INICIAL = [
  {
    codigo: 'PS',
    nombre: 'Personal Social',
    tipo: 'curricular',
    orden: 10,
    descripcion: 'Identidad, convivencia y participación en el aula y la familia.',
    competencias: [
      C(
        'PS-IDENTIDAD',
        'Construye su identidad',
        ['Se valora a sí mismo', 'Autorregula sus emociones'],
        'Construye su identidad al tomar conciencia de los aspectos que lo hacen único. Se identifica en algunas de sus características físicas, cualidades, intereses, gustos y preferencias. Se siente miembro de su familia y del grupo de aula. Practica hábitos saludables reconociendo que son importantes para él. Actúa de manera autónoma y es capaz de tomar decisiones, desde sus posibilidades y considerando a los demás. Expresa sus emociones e identifica el motivo que las originan. Busca y acepta la compañía de un adulto significativo ante situaciones que lo hacen sentir vulnerable, inseguro, con ira, triste o alegre.',
        {
          3: [
            'Reconoce sus necesidades, sensaciones, intereses y preferencias; las diferencia de las de los otros a través de palabras, acciones, gestos o movimientos.',
            'Se reconoce como miembro de su familia y grupo de aula. Identifica a los integrantes de ambos grupos.',
            'Toma la iniciativa para realizar actividades cotidianas y juegos desde sus intereses. Realiza acciones de cuidado personal, hábitos de alimentación e higiene.',
            'Expresa sus emociones; utiliza para ello gestos, movimientos corporales y palabras. Identifica sus emociones y las que observa en los demás cuando el adulto las nombra.',
            'Busca la compañía y consuelo del adulto en situaciones en las que lo necesita para sentirse seguro. Tolera algunos tiempos de espera anticipados por el adulto.',
          ],
          4: [
            'Reconoce sus intereses, preferencias y características; las diferencia de las de los otros a través de palabras o acciones, dentro de su familia o grupo de aula.',
            'Se reconoce como miembro de su familia y grupo de aula. Comparte hechos importantes de su historia familiar.',
            'Toma la iniciativa para realizar acciones de cuidado personal, de alimentación e higiene de manera autónoma. Explica la importancia de estos hábitos para su salud.',
            'Expresa sus emociones; utiliza palabras, gestos y movimientos corporales. Reconoce las emociones en los demás, y muestra su simpatía o trata de ayudar.',
            'Busca la compañía y consuelo del adulto en situaciones en las que lo necesita para sentirse seguro o contenido. Da razón de lo que le sucedió.',
          ],
          5: [
            'Reconoce sus intereses, preferencias, características físicas y cualidades; las diferencia de las de los otros a través de palabras o acciones.',
            'Participa de diferentes acciones de juego o de la vida cotidiana asumiendo distintos roles, sin hacer distinciones de género.',
            'Se reconoce como parte de su familia, grupo de aula e IE. Comparte hechos y momentos importantes de su historia familiar.',
            'Toma la iniciativa para realizar acciones de cuidado personal, de manera autónoma, y da razón sobre las decisiones que toma.',
            'Expresa sus emociones; utiliza palabras, gestos y movimientos corporales e identifica las causas que las originan. Reconoce las emociones de los demás.',
            'Busca la compañía y consuelo del adulto en situaciones en que lo requiere. Utiliza la palabra para expresar y explicar lo que le sucede. Reconoce los límites establecidos para su seguridad.',
          ],
        }
      ),
      C(
        'PS-CONVIVE',
        'Convive y participa democráticamente en la búsqueda del bien común',
        [
          'Interactúa con todas las personas',
          'Construye normas, y asume acuerdos y leyes',
          'Participa en acciones que promueven el bienestar común',
        ],
        'Convive y participa democráticamente cuando interactúa de manera respetuosa con sus compañeros desde su propia iniciativa, cumple con sus deberes y se interesa por conocer más sobre las diferentes costumbres y características de las personas de su entorno inmediato. Participa y propone acuerdos y normas de convivencia para el bien común. Realiza acciones con otros para el buen uso de los espacios, materiales y recursos comunes.',
        {
          3: [
            'Se relaciona con adultos y niños de su entorno en diferentes actividades del aula y juega en pequeños grupos.',
            'Participa en actividades grupales poniendo en práctica las normas de convivencia y los límites que conoce.',
            'Colabora en el cuidado del uso de recursos, materiales y espacios compartidos.',
          ],
          4: [
            'Se relaciona con adultos de su entorno, juega con otros niños y se integra en actividades grupales del aula. Propone ideas de juego y las normas del mismo.',
            'Realiza actividades cotidianas con sus compañeros y se interesa por conocer sus costumbres, así como los lugares de los que proceden.',
            'Participa en la construcción colectiva de acuerdos y normas, basados en el respeto y el bienestar de todos, en situaciones que lo afectan o incomodan.',
            'Colabora en actividades colectivas orientadas al cuidado de los recursos, materiales y espacios compartidos.',
          ],
          5: [
            'Se relaciona con adultos de su entorno, juega con otros niños y se integra en actividades grupales. Propone ideas de juego y se pone de acuerdo con el grupo para elegir un juego y las reglas.',
            'Comparte las costumbres de su familia y muestra interés por conocer las de las familias de sus compañeros.',
            'Participa en la construcción colectiva de acuerdos y normas basadas en el respeto y el bienestar de todos, considerando las situaciones que afectan al grupo.',
            'Asume responsabilidades en su aula para colaborar con el orden, limpieza y bienestar de todos.',
            'Propone y colabora en actividades colectivas —en el aula e IE— orientadas al cuidado de recursos, materiales y espacios compartidos.',
          ],
        }
      ),
    ],
  },
  {
    codigo: 'REL',
    nombre: 'Educación Religiosa',
    tipo: 'religion',
    orden: 15,
    descripcion: 'Identidad religiosa y espiritual, según el PCI de la IE.',
    competencias: [
      C(
        'REL-IDENTIDAD',
        'Construye su identidad, como persona humana, amada por Dios, digna, libre y trascendente, comprendiendo la doctrina de su propia religión, abierto al diálogo con las que le son cercanas',
        [
          'Conoce a Dios y asume su identidad religiosa y espiritual como persona digna, libre y trascendente',
          'Cultiva y valora las manifestaciones religiosas de su entorno argumentando su fe de manera comprensible y respetuosa',
        ],
        'Expresa con gestos y palabras el amor y el cuidado que recibe de su familia y de las personas de su entorno, y lo relaciona con el amor de Dios. Participa en prácticas religiosas propias de su familia y comunidad con respeto y alegría. Muestra actitudes de cuidado hacia las personas y la naturaleza como parte de lo creado.',
        {
          3: [
            'Expresa cariño y confianza hacia las personas que lo cuidan y lo relaciona, con ayuda del adulto, con el amor de Dios.',
            'Participa en gestos, canciones o momentos de su familia o aula vinculados a su fe, con respeto.',
            'Muestra cuidado hacia plantas, animales o compañeros cuando el adulto se lo propone.',
          ],
          4: [
            'Comenta hechos de su vida familiar en los que se siente querido y los vincula con el amor de Dios.',
            'Reconoce algunas manifestaciones religiosas de su entorno (gestos, fiestas, símbolos) y participa con respeto.',
            'Propone acciones sencillas de solidaridad o cuidado hacia los demás y la naturaleza.',
          ],
          5: [
            'Explica con sus palabras por qué se siente amado y cuidado, y lo relaciona con Dios y su familia.',
            'Participa con iniciativa en prácticas religiosas de su comunidad y respeta las de sus compañeros.',
            'Propone y realiza acciones de generosidad, respeto y cuidado de lo creado.',
          ],
        }
      ),
    ],
  },
  {
    codigo: 'PSI',
    nombre: 'Psicomotriz',
    tipo: 'curricular',
    orden: 20,
    descripcion: 'Cuerpo, movimiento, equilibrio y expresión corporal.',
    competencias: [
      C(
        'PSI-MOTRICIDAD',
        'Se desenvuelve de manera autónoma a través de su motricidad',
        ['Comprende su cuerpo', 'Se expresa corporalmente'],
        'Se desenvuelve de manera autónoma a través de su motricidad cuando explora y descubre su lado dominante y sus posibilidades de movimiento por propia iniciativa en situaciones cotidianas. Realiza acciones motrices básicas en las que coordina movimientos para desplazarse con seguridad y utiliza objetos con precisión, orientándose y regulando sus acciones en relación a estos, a las personas, el espacio y el tiempo. Expresa corporalmente sus sensaciones, emociones y sentimientos a través del tono, gesto, posturas, ritmo y movimiento en situaciones de juego.',
        {
          3: [
            'Explora desplazamientos y juegos (correr, saltar, trepar, rodar, lanzar) regulando fuerza y velocidad con cierto control de su equilibrio.',
            'Realiza acciones de coordinación óculo-manual y óculo-podal según los objetos y materiales que emplea en el juego.',
            'Reconoce partes de su cuerpo al relacionarlas con sus acciones y nombra algunas de manera espontánea.',
          ],
          4: [
            'Realiza acciones y juegos de manera autónoma —correr, saltar, trepar, rodar, deslizarse, girar, patear y lanzar— explorando su cuerpo en relación al espacio, la superficie y los objetos, con cierto control de su equilibrio.',
            'Realiza acciones de coordinación óculo-manual y óculo-podal acorde con sus intereses y las características de los materiales.',
            'Reconoce sus sensaciones corporales (respiración, sudoración) y representa su cuerpo a su manera, haciendo evidentes cabeza, brazos, piernas y algunos elementos del rostro.',
          ],
          5: [
            'Combina habilidades motrices básicas (correr, saltar, trepar, volteretas) mostrando predominio y mayor control de un lado de su cuerpo.',
            'Realiza movimientos de coordinación óculo-manual y óculo-podal que requieren mayor precisión, ajustándose a límites espaciales y a las características de los objetos.',
            'Reconoce cambios en el estado de su cuerpo y representa la figura humana incorporando más detalles y características propias (cabello, vestimenta, etc.).',
          ],
        }
      ),
    ],
  },
  {
    codigo: 'COM',
    nombre: 'Comunicación',
    tipo: 'curricular',
    orden: 30,
    descripcion: 'Oralidad, iniciación a la lectura y la escritura, y lenguajes artísticos.',
    competencias: [
      C(
        'COM-ORAL',
        'Se comunica oralmente en su lengua materna',
        [
          'Obtiene información del texto oral',
          'Infiere e interpreta información del texto oral',
          'Adecúa, organiza y desarrolla el texto de forma coherente y cohesionada',
          'Utiliza recursos no verbales y paraverbales de forma estratégica',
          'Interactúa estratégicamente con distintos interlocutores',
          'Reflexiona y evalúa la forma, el contenido y contexto del texto oral',
        ],
        'Se comunica oralmente mediante diversos tipos de textos; identifica información explícita; realiza inferencias sencillas e interpreta recursos no verbales y paraverbales. Opina sobre lo que más o menos le gustó. Se expresa espontáneamente a partir de sus conocimientos previos, con el propósito de interactuar con interlocutores conocidos. Desarrolla sus ideas manteniéndose por lo general en el tema; utiliza vocabulario de uso frecuente y una pronunciación entendible, se apoya en gestos y lenguaje corporal. En un intercambio, generalmente participa y responde de forma pertinente.',
        {
          3: [
            'Expresa necesidades, emociones e intereses al interactuar con personas de su entorno. Utiliza palabras de uso frecuente, gestos y diversos volúmenes de voz.',
            'Participa en conversaciones o escucha cuentos y relatos de la tradición oral. Formula preguntas o responde a lo que le preguntan.',
            'Recupera información explícita de un texto oral (nombres, hechos). Sigue indicaciones orales o vuelve a contar lo que más le gustó.',
            'Deduce características de personas, personajes, animales y objetos en anécdotas, cuentos y rimas.',
            'Comenta lo que le gusta o le disgusta de hechos o situaciones de la vida cotidiana.',
          ],
          4: [
            'Expresa necesidades, emociones, intereses y experiencias. Ajusta gestos y volumen de voz según su interlocutor y propósito (informar, pedir, convencer, agradecer).',
            'Participa en conversaciones o escucha cuentos, leyendas y adivinanzas. Formula preguntas sobre lo que le interesa o no ha comprendido.',
            'Recupera información explícita: menciona hechos, personas y personajes; vuelve a contar con sus palabras.',
            'Deduce relaciones de causa-efecto y características de personajes en relatos orales.',
            'Comenta lo que le gusta o disgusta a partir de sus experiencias y del contexto.',
          ],
          5: [
            'Desarrolla sus ideas en torno a un tema (aunque en ocasiones puede salirse de este) combinando palabras y recursos no verbales de forma más estratégica.',
            'Espera su turno para hablar, escucha a su interlocutor, pregunta y responde con la intención de obtener información.',
            'Recupera y organiza información de textos orales más extensos y vuelve a contar sucesos con mayor detalle.',
            'Opina sobre el contenido del texto y da razones sencillas de lo que más o menos le gustó.',
          ],
        }
      ),
      C(
        'COM-LEE',
        'Lee diversos tipos de textos escritos en su lengua materna',
        [
          'Obtiene información del texto escrito',
          'Infiere e interpreta información del texto escrito',
          'Reflexiona y evalúa la forma, el contenido y contexto del texto escrito',
        ],
        'Lee diversos tipos de textos de estructura simple en variados soportes (libros, láminas, carteles). Identifica que hay una relación entre lo que se lee y las imágenes, y que las marcas escritas tienen un significado. Obtiene información explícita con ayuda de las ilustraciones. Opina sobre lo que más le gusta o le disgusta de personas, personajes y hechos.',
        {
          3: [
            'Explora diversos tipos de textos de su entorno (cuentos, carteles, etiquetas) y comenta, a su manera, de qué tratan con apoyo de las imágenes.',
            'Identifica que los textos comunican algo y diferencia el dibujo de las marcas escritas.',
            'Dice qué le gusta o no de un cuento o lámina a partir de lo que observa.',
          ],
          4: [
            'Identifica información explícita que se encuentra en lugares evidentes del texto (título, imágenes, nombres) con apoyo del docente o de las ilustraciones.',
            'Deduce de qué se trata un texto a partir de las imágenes y de algunos indicios escritos.',
            'Opina sobre hechos y personajes de textos que lee o le leen, relacionándolos con su experiencia.',
          ],
          5: [
            'Obtiene información explícita de textos de estructura simple y la relaciona con las ilustraciones.',
            'Infiere el tema o el propósito del texto a partir de indicios verbales y no verbales.',
            'Opina sobre el contenido del texto y explica, con sus palabras, qué le gustó o no y por qué.',
          ],
        }
      ),
      C(
        'COM-ESCRIBE',
        'Escribe diversos tipos de textos en su lengua materna',
        [
          'Adecúa el texto a la situación comunicativa',
          'Organiza y desarrolla las ideas de forma coherente y cohesionada',
          'Utiliza convenciones del lenguaje escrito de forma pertinente',
          'Reflexiona y evalúa la forma, el contenido y contexto del texto escrito',
        ],
        'Escribe textos diversos de su interés (listas, carteles, notas, cuentos) por propia iniciativa, diferenciando el dibujo de las marcas escritas. Considera el propósito y el destinatario de manera intuitiva. Desarrolla sus ideas en torno a un tema, aunque puede salirse de este. Utiliza marcas escritas no convencionales o algunas letras conocidas, y comenta lo que quiso comunicar.',
        {
          3: [
            'Produce marcas escritas o dibujos para comunicar algo que le interesa (su nombre, una lista, un recado) y explica de qué se trata.',
            'Diferencia, con ayuda, el dibujo de las marcas que “dicen algo”.',
            'Comenta lo que quiso escribir y para quién era.',
          ],
          4: [
            'Escribe por propia iniciativa textos sencillos (listas, carteles, notas) combinando dibujos y marcas escritas, y da cuenta del propósito.',
            'Utiliza algunas letras o su nombre para identificar lo que produjo.',
            'Revisa con el docente si se entiende lo que quiso comunicar.',
          ],
          5: [
            'Produce textos de su interés considerando para quién escribe y qué quiere decir.',
            'Organiza sus ideas en torno a un tema y usa letras conocidas, su nombre u otras marcas más próximas a la escritura convencional.',
            'Comenta y ajusta su escrito cuando el destinatario no comprende lo que quiso decir.',
          ],
        }
      ),
      C(
        'COM-ARTE',
        'Crea proyectos desde los lenguajes artísticos',
        [
          'Explora y experimenta los lenguajes del arte',
          'Aplica procesos creativos',
          'Evalúa y comunica sus procesos y proyectos',
        ],
        'Crea proyectos artísticos explorando diversos lenguajes (plástico-visual, corporal, sonoro, dramático). Experimenta de manera autónoma con materiales, técnicas y movimientos. Representa ideas, sentimientos y experiencias de su entorno y de su imaginación, y comparte lo que hizo y cómo se sintió.',
        {
          3: [
            'Explora materiales, sonidos, movimientos y roles de juego para expresarse.',
            'Produce trazos, modelados, canciones o acciones dramáticas desde su interés.',
            'Muestra o nombra lo que hizo y cómo se sintió.',
          ],
          4: [
            'Combina materiales y lenguajes (dibujo, canto, movimiento, juego dramático) para representar una idea o experiencia.',
            'Toma decisiones sencillas sobre colores, formas o personajes.',
            'Comenta a sus compañeros qué quiso expresar con su producción.',
          ],
          5: [
            'Planifica de manera sencilla un proyecto (qué va a hacer, con qué materiales) y lo lleva a cabo.',
            'Ajusta su producción cuando quiere lograr un efecto (más color, otro personaje, otro ritmo).',
            'Presenta su trabajo y explica el proceso y lo que siente o piensa sobre él.',
          ],
        }
      ),
    ],
  },
  {
    codigo: 'MAT',
    nombre: 'Matemática',
    tipo: 'curricular',
    orden: 40,
    descripcion: 'Cantidad, forma, movimiento y localización en situaciones cotidianas.',
    competencias: [
      C(
        'MAT-CANTIDAD',
        'Resuelve problemas de cantidad',
        [
          'Traduce cantidades a expresiones numéricas',
          'Comunica su comprensión sobre los números y las operaciones',
          'Usa estrategias y procedimientos de estimación y cálculo',
        ],
        'Resuelve problemas referidos a relacionar objetos de su entorno según sus características perceptuales; agrupar, ordenar hasta el quinto lugar, seriar hasta 5 objetos, comparar cantidades y pesos, agregar y quitar hasta 5 elementos, realizando representaciones con su cuerpo, material concreto o dibujos. Expresa la cantidad de hasta 10 objetos, usando estrategias como el conteo. Usa cuantificadores “muchos”, “pocos”, “ninguno”, y expresiones “más que”, “menos que”. Expresa el peso “pesa más”, “pesa menos” y el tiempo con nociones como “antes o después”, “ayer”, “hoy” o “mañana”.',
        {
          3: [
            'Establece relaciones entre objetos según características perceptuales al comparar y agrupar los que le sirven para algún fin, dejando algunos sueltos.',
            'Usa expresiones sobre cantidad, peso y tiempo: “muchos”, “pocos”, “pesa mucho”, “pesa poco”, “un ratito”.',
            'Utiliza el conteo espontáneo en situaciones cotidianas, aunque el orden de la serie numérica aún no sea convencional.',
          ],
          4: [
            'Agrupa objetos según un criterio perceptual y realiza seriaciones por tamaño de hasta tres objetos.',
            'Establece correspondencia uno a uno en situaciones cotidianas.',
            'Usa expresiones “muchos”, “pocos”, “pesa mucho”, “antes” o “después”.',
            'Utiliza el conteo hasta 5 con material concreto o su cuerpo.',
            'Utiliza ordinales “primero”, “segundo” y “tercero”.',
          ],
          5: [
            'Agrupa objetos y dice el criterio que usó. Realiza seriaciones por tamaño, longitud y grosor hasta con cinco objetos.',
            'Establece correspondencia uno a uno y anticipa cuántos elementos necesitará.',
            'Usa “muchos”, “pocos”, “ninguno”, “más que”, “menos que”, “pesa más”, “ayer”, “hoy”, “mañana”.',
            'Utiliza el conteo hasta 10 y ordinales hasta “quinto”.',
            'Utiliza el conteo para juntar, agregar o quitar hasta cinco objetos.',
          ],
        }
      ),
      C(
        'MAT-FORMA',
        'Resuelve problemas de forma, movimiento y localización',
        [
          'Modela objetos con formas geométricas y sus transformaciones',
          'Comunica su comprensión sobre las formas y relaciones geométricas',
          'Usa estrategias y procedimientos para orientarse en el espacio',
        ],
        'Resuelve problemas al relacionar los objetos del entorno con formas geométricas y describiendo desplazamientos. Expresa la ubicación de personas y objetos usando “encima”, “debajo”, “adelante”, “atrás”, “dentro”, “fuera”, “cerca” y “lejos”. Describe recorridos y desplazamientos. Establece relaciones de medida al comparar longitudes de modo perceptual (“más largo”, “más corto”).',
        {
          3: [
            'Explora y relaciona objetos de su entorno con formas que percibe (redondo, con puntas) en el juego y la construcción.',
            'Se desplaza y ubica objetos usando nociones básicas: dentro, fuera, encima, debajo.',
            'Comunica de manera espontánea si algo está cerca o lejos de él.',
          ],
          4: [
            'Establece relaciones entre las formas de los objetos y algunas formas geométricas que percibe.',
            'Se ubica y ubica objetos usando “arriba”, “abajo”, “dentro”, “fuera”, “adelante”, “atrás”.',
            'Compara longitudes de manera perceptual (“más largo”, “más corto”) en situaciones de juego.',
          ],
          5: [
            'Relaciona objetos con formas geométricas y las usa al construir o representar.',
            'Describe desplazamientos y ubicaciones con mayor precisión (hacia un lado, al lado de, cerca, lejos).',
            'Compara y ordena objetos por longitud y comunica sus conclusiones con material concreto o dibujos.',
          ],
        }
      ),
    ],
  },
  {
    codigo: 'CYT',
    nombre: 'Ciencia y Tecnología',
    tipo: 'curricular',
    orden: 50,
    descripcion: 'Exploración del entorno, seres vivos, objetos y fenómenos.',
    competencias: [
      C(
        'CYT-INDAGA',
        'Indaga mediante métodos científicos para construir sus conocimientos',
        [
          'Problematiza situaciones para hacer indagación',
          'Diseña estrategias para hacer indagación',
          'Genera y registra datos o información',
          'Analiza datos e información',
          'Evalúa y comunica el proceso y resultado de su indagación',
        ],
        'Explora los objetos, el espacio y hechos que acontecen en su entorno, hace preguntas con base en su curiosidad, propone posibles respuestas, obtiene información al observar, manipular y describir; compara aspectos del objeto o fenómeno para comprobar la respuesta y expresa en forma oral o gráfica lo que hizo y aprendió.',
        {
          3: [
            'Hace preguntas que expresan su curiosidad sobre objetos, seres vivos, hechos o fenómenos de su ambiente.',
            'Obtiene información sobre las características de los objetos y materiales que explora a través de sus sentidos. Usa algunas herramientas (lupa, recipientes).',
            'Comunica los descubrimientos que hace cuando explora, con gestos, movimientos o de forma oral.',
          ],
          4: [
            'Hace preguntas y, al responder, da a conocer lo que sabe. Propone acciones y el uso de materiales para buscar información.',
            'Obtiene información al observar y explorar; registra con dibujos, fotos o modelados.',
            'Compara su respuesta inicial con la información obtenida después.',
            'Comunica las acciones que realizó y comparte sus resultados.',
          ],
          5: [
            'Formula preguntas y posibles respuestas, y propone un procedimiento sencillo para comprobarlas.',
            'Registra de forma más ordenada lo que observa y compara para llegar a una conclusión.',
            'Explica a otros lo que hizo, lo que aprendió y las dificultades de su exploración.',
          ],
        }
      ),
    ],
  },
  {
    codigo: 'TIC',
    nombre: 'Se desenvuelve en entornos virtuales',
    tipo: 'transversal',
    orden: 80,
    descripcion: 'Competencia transversal a las áreas (TIC).',
    competencias: [
      C(
        'TIC-ENTORNOS',
        'Se desenvuelve en los entornos virtuales generados por las TIC',
        [
          'Personaliza entornos virtuales',
          'Gestiona información del entorno virtual',
          'Interactúa en entornos virtuales',
          'Crea objetos virtuales en diversos formatos',
        ],
        'Se desenvuelve en los entornos virtuales cuando navega, con acompañamiento, en entornos de su interés, realiza actividades y juegos interactivos, y elabora representaciones simples de su entorno con aplicaciones. Sigue indicaciones y cuida los dispositivos que utiliza.',
        {
          3: [
            'Explora, con el adulto, imágenes, sonidos o juegos digitales de su interés.',
            'Sigue indicaciones sencillas para usar un dispositivo o aplicación.',
          ],
          4: [
            'Navega en un entorno conocido (juego, álbum de fotos, cuento digital) con acompañamiento.',
            'Elabora una producción simple (dibujo digital, audio) y la muestra.',
          ],
          5: [
            'Elige un entorno virtual de su interés, realiza una actividad y comenta lo que hizo.',
            'Cuida el dispositivo y respeta turnos de uso. Distingue, con ayuda, situaciones de cuidado en internet.',
          ],
        }
      ),
    ],
  },
  {
    codigo: 'AUTO',
    nombre: 'Gestiona su aprendizaje de manera autónoma',
    tipo: 'transversal',
    orden: 90,
    descripcion: 'Competencia transversal a las áreas.',
    competencias: [
      C(
        'AUTO-APRENDIZAJE',
        'Gestiona su aprendizaje de manera autónoma',
        [
          'Define metas de aprendizaje',
          'Organiza acciones estratégicas para alcanzar sus metas',
          'Monitorea y ajusta su desempeño durante el proceso de aprendizaje',
        ],
        'Gestiona su aprendizaje al darse cuenta de lo que pudo lograr en el juego o la actividad, qué le gustó, qué se le dificultó y qué podría intentar de otra manera, con el acompañamiento del adulto. Organiza de forma sencilla materiales y tiempos cortos para realizar lo que se propone.',
        {
          3: [
            'Elige una actividad o material de su interés y se mantiene en ella un tiempo breve.',
            'Acepta la ayuda del adulto cuando se le dificulta y vuelve a intentar.',
          ],
          4: [
            'Dice qué quiere hacer y busca los materiales que necesita.',
            'Comenta, con ayuda, qué logró y qué le costó después de la actividad.',
          ],
          5: [
            'Se propone una meta sencilla (“voy a terminar mi construcción”) y organiza pasos o materiales.',
            'Revisa si lo logró y sugiere qué haría distinto la próxima vez.',
          ],
        }
      ),
    ],
  },
];

module.exports = { CATALOGO_INICIAL, FUENTE };
