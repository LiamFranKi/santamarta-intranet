-- =============================================================================
-- Examen Herramientas / Exámenes: CNEB para docentes
-- Base: vanguard_intranet (phpMyAdmin → SQL → Continuar)
-- Fuente: Currículo Nacional de la Educación Básica (MINEDU),
--         RM N. 281-2016-MINEDU y RM N. 159-2017-MINEDU.
--
-- 15 alternativas (4 pt) + 5 de criterio / respuesta corta (8 pt) = 100 pt
-- Audiencia: DOCENTE. Estado inicial: BORRADOR (activar cuando esté listo).
-- Idempotente: si ya existe el título, no duplica el examen; reinserta
-- preguntas solo si aún no hay ninguna y no hay intentos.
-- =============================================================================

SET NAMES utf8mb4;

SET @titulo := 'CNEB — Currículo Nacional de la Educación Básica (docentes)';
SET @colegio_id := 1;

INSERT INTO herramientas_examenes (
  colegio_id,
  creador_usuario_id,
  titulo,
  descripcion,
  estado,
  modo,
  fecha_inicio,
  fecha_fin,
  mensaje_agradecimiento,
  intentos_max,
  mostrar_nota,
  escala_max,
  tiempo_minutos,
  tipo_puntaje,
  puntos_correcta,
  penalizar_incorrecta,
  penalizacion_incorrecta,
  orden_preguntas,
  preguntas_max,
  bloque_contenido,
  bloque_imagen_url,
  bloque_archivos_json
)
SELECT
  @colegio_id,
  NULL,
  @titulo,
  'Examen de nivel intermedio-alto dirigido al equipo docente. Evalúa dominio del CNEB (competencias, enfoques, evaluación formativa y diversificación) y el criterio profesional para aplicarlo en el aula. 15 preguntas de alternativa (autoevaluadas) y 5 de criterio (revisión manual).',
  'BORRADOR',
  'CALIFICADO',
  NULL,
  NULL,
  'Gracias por completar el examen de CNEB. Las preguntas de criterio serán revisadas por el equipo pedagógico. Los resultados se publicarán después de esa revisión.',
  1,
  'TRAS_REVISION',
  100.00,
  90,
  'INDIVIDUAL',
  NULL,
  'NO',
  0,
  'PREDETERMINADO',
  20,
  '<p><strong>Indicaciones</strong></p><ul><li>Tiempo referencial: 90 minutos. Un intento.</li><li>Preguntas 1 a 15: marque la alternativa más coherente con el CNEB (MINEDU).</li><li>Preguntas 16 a 20: responda con criterio profesional (12 a 20 líneas). Fundamente con categorías del CNEB y un ejemplo de su aula.</li><li>No se evalúa opinión libre desconectada del currículo: se espera precisión conceptual y viabilidad pedagógica.</li></ul><p>Referente: Currículo Nacional de la Educación Básica (RM N. 281-2016-MINEDU; modificación RM N. 159-2017-MINEDU), programas curriculares y enfoque formativo de la evaluación.</p>',
  NULL,
  NULL
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM herramientas_examenes
  WHERE colegio_id = @colegio_id AND titulo = @titulo
);

SET @eid := (
  SELECT id FROM herramientas_examenes
  WHERE colegio_id = @colegio_id AND titulo = @titulo
  ORDER BY id DESC LIMIT 1
);

INSERT IGNORE INTO herramientas_examenes_audiencias (examen_id, tipo)
VALUES (@eid, 'DOCENTE');

SET @n_preg := (SELECT COUNT(*) FROM herramientas_examenes_preguntas WHERE examen_id = @eid);
SET @n_int := (SELECT COUNT(*) FROM herramientas_examenes_intentos WHERE examen_id = @eid);

-- ---------------------------------------------------------------------------
-- Preguntas (solo si el examen aún no tiene ítems y no hay intentos)
-- Clave alternativas (índice 0-based): 1,2,0,2,3, 1,0,2,1,0, 2,1,3,2,0
-- ---------------------------------------------------------------------------

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 1,
  '<p>El CNEB, aprobado por RM N. 281-2016-MINEDU y precisado por RM N. 159-2017-MINEDU, se define principalmente como:</p>',
  'ALTERNATIVAS',
  '{"opciones":["Un listado de contenidos por grado que el docente debe cubrir en orden cronológico.","El marco curricular nacional que establece el Perfil de egreso, las competencias y su progresión, los enfoques transversales y orientaciones para la evaluación formativa y la diversificación.","Un programa de capacitación docente independiente de los programas curriculares de cada nivel.","Un reglamento de calificación numérica de 0 a 20, de uso obligatorio en todas las instituciones educativas privadas."],"correcta":1}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 2,
  '<p>Según el CNEB, <strong>ser competente</strong> implica principalmente:</p>',
  'ALTERNATIVAS',
  '{"opciones":["Demostrar por separado cada capacidad de un área, aunque no se combinen ante un reto real.","Memorizar los estándares del ciclo y recitarlos en la evaluación bimestral.","Combinar un conjunto de capacidades para lograr un propósito en una situación determinada, actuando de manera pertinente y con sentido ético.","Cubrir todos los desempeños del programa curricular como una lista de cotejo exhaustiva."],"correcta":2}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 3,
  '<p>En el CNEB, las <strong>capacidades</strong> se definen como:</p>',
  'ALTERNATIVAS',
  '{"opciones":["Recursos para actuar de manera competente: conocimientos, habilidades y actitudes que el estudiante utiliza para afrontar una situación.","Los niveles de logro AD, A, B y C que se registran en el SIAGIE.","Únicamente los contenidos conceptuales de cada área curricular.","Las horas de libre disponibilidad del plan de estudios de la institución educativa."],"correcta":0}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 4,
  '<p>¿Cuál es la distinción más precisa entre <strong>estándares de aprendizaje</strong> y <strong>desempeños</strong> en el CNEB?</p>',
  'ALTERNATIVAS',
  '{"opciones":["Los estándares se formulan por grado y los desempeños por ciclo.","Los desempeños reemplazan a las competencias en el informe de progreso.","Los estándares describen la progresión holística de la competencia por ciclo; los desempeños ilustran actuaciones observables por grado o edad y no son exhaustivos.","Ambos son sinónimos: se usan indistintamente al planificar y al calificar."],"correcta":2}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 5,
  '<p>¿Cuál de los siguientes <strong>NO</strong> es un enfoque transversal del CNEB?</p>',
  'ALTERNATIVAS',
  '{"opciones":["Enfoque de derechos.","Enfoque intercultural.","Enfoque de orientación al bien común.","Enfoque por objetivos conductuales de contenidos disciplinares."],"correcta":3}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 6,
  '<p>El <strong>enfoque de derechos</strong>, según el CNEB, parte de reconocer a los estudiantes como:</p>',
  'ALTERNATIVAS',
  '{"opciones":["Objetos de cuidado cuya participación se reserva a los adultos responsables.","Sujetos de derechos y ciudadanos con deberes, no como objetos de cuidado.","Destinatarios pasivos de las normas institucionales hasta que alcancen el estándar.","Usuarios del servicio educativo únicamente cuando la familia lo autoriza."],"correcta":1}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 7,
  '<p>Las dos competencias <strong>transversales a las áreas</strong> en el CNEB son:</p>',
  'ALTERNATIVAS',
  '{"opciones":["Se desenvuelve en los entornos virtuales generados por las TIC y Gestiona su aprendizaje de manera autónoma.","Construye su identidad y Convive y participa democráticamente en la búsqueda del bien común.","Indaga mediante métodos científicos y Gestiona proyectos de emprendimiento económico o social.","Lee diversos tipos de textos escritos y Escribe diversos tipos de textos en su lengua materna."],"correcta":0}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 8,
  '<p>Desde el <strong>enfoque formativo</strong> del CNEB, ¿qué se evalúa principalmente?</p>',
  'ALTERNATIVAS',
  '{"opciones":["La memorización de contenidos aislados y la distinción entre quienes aprueban y desaprueban.","El promedio aritmético de pruebas escritas, sin necesidad de evidencias de desempeño.","Las competencias: niveles cada vez más complejos de uso pertinente y combinado de las capacidades, tomando como referente los estándares de aprendizaje.","Solo la conducta y la asistencia, porque las competencias no admiten calificación."],"correcta":2}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 9,
  '<p>En la escala literal del CNEB, el nivel <strong>B (En proceso)</strong> significa que el estudiante:</p>',
  'ALTERNATIVAS',
  '{"opciones":["Evidencia un nivel superior a lo esperado respecto a la competencia (logro destacado).","Está próximo al nivel esperado respecto a la competencia y requiere acompañamiento durante un tiempo razonable para lograrlo.","Evidencia el nivel esperado con manejo satisfactorio en todas las tareas y en el tiempo programado.","Muestra un progreso mínimo y necesita mayor tiempo de intervención docente (equivalente a C)."],"correcta":1}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 10,
  '<p>El CNEB señala que contar con estándares de aprendizaje:</p>',
  'ALTERNATIVAS',
  '{"opciones":["No equivale a estandarizar ni uniformar procesos pedagógicos: estos deben ser variados para que cada grupo y cada estudiante pueda alcanzar los niveles esperados.","Obliga a usar los mismos métodos, tiempos y materiales en todas las aulas del país.","Reemplaza la necesidad de diversificar el currículo a nivel de institución educativa.","Impide diseñar situaciones significativas distintas a los ejemplos de los programas curriculares."],"correcta":0}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 11,
  '<p>Una <strong>situación significativa</strong>, según las orientaciones pedagógicas del CNEB, se caracteriza sobre todo por:</p>',
  'ALTERNATIVAS',
  '{"opciones":["Ser un ejercicio de repetición de definiciones para memorizar el contenido de la unidad.","Ser una prueba estandarizada nacional aplicada al cierre del periodo.","Ser un desafío con sentido para el estudiante, articulado a sus saberes previos, retador pero alcanzable, que permite poner en juego y combinar capacidades.","Ser una lista de indicadores de conducta desconectados del contexto de los estudiantes."],"correcta":2}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 12,
  '<p>Respecto a la <strong>diversificación curricular</strong> a nivel de institución educativa, el CNEB establece que:</p>',
  'ALTERNATIVAS',
  '{"opciones":["El PCI puede omitir competencias nacionales si el colegio es privado o de jornada completa.","Las instituciones educativas deben desarrollar todas las competencias que demanda el CNEB; la diversificación las sitúa en el contexto de sus estudiantes y aporta valor agregado.","El PEI reemplaza al CNEB y permite definir competencias propias sin referente nacional.","Solo la UGEL puede planificar sesiones; el docente no diversifica ni contextualiza."],"correcta":1}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 13,
  '<p>El CNEB se aplica en:</p>',
  'ALTERNATIVAS',
  '{"opciones":["Únicamente Educación Básica Regular (Inicial, Primaria y Secundaria).","Solo instituciones educativas públicas.","Educación superior universitaria y técnico-productiva.","Las tres modalidades de la Educación Básica: EBR, EBA y EBE."],"correcta":3}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 14,
  '<p>Una docente de Matemática aplica al cierre de cada sesión un cuestionario de diez ejercicios de cálculo mecánico, promedia las notas y con ese promedio asigna A o B a la competencia <em>Resuelve problemas de cantidad</em>, sin analizar cómo el estudiante traduce cantidades, comunica su comprensión, usa estrategias ni argumenta. La crítica más coherente con el CNEB es:</p>',
  'ALTERNATIVAS',
  '{"opciones":["Es correcta, porque esa competencia se reduce a la rapidez y exactitud del cálculo.","Es coherente, porque el promedio de pruebas equivale al estándar del ciclo.","No es coherente: evaluar una competencia exige evidencias de la combinación de sus capacidades ante situaciones, no el promedio de contenidos aislados.","Es válida siempre que el cuestionario coincida con el formato de evaluaciones nacionales."],"correcta":2}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 15,
  '<p>Sobre la <strong>retroalimentación</strong> en evaluación formativa, el CNEB sostiene que es eficaz cuando:</p>',
  'ALTERNATIVAS',
  '{"opciones":["Describe logros y progresos respecto al nivel esperado, identifica errores recurrentes y ofrece orientaciones específicas para mejorar, permitiendo además ajustar la enseñanza.","Se limita a elogios o críticas sin sustento (por ejemplo: «muy bien» o «debes esforzarte»).","Se entrega una sola vez al final del año, junto con el informe de progreso.","Consiste en repetir la misma prueba hasta que todos los estudiantes obtengan AD."],"correcta":0}',
  4.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 16,
  '<p><strong>Criterio 1 — De contenidos aislados a competencia.</strong></p><p>Un colega planifica su unidad como lista de temas («fracciones», «el agua», «la independencia») y evalúa con pruebas de recuerdo. Usted debe ayudarlo a rediseñar <em>una</em> sesión de <strong>su propia área y grado</strong>.</p><p>En 12 a 20 líneas: (1) nombre la competencia y al menos dos capacidades que movilizará; (2) plantee una situación significativa pertinente a su aula; (3) indique qué evidencia recogerá y con qué criterio la valorará respecto al estándar del ciclo. No describa teoría general: sitúe la respuesta en su práctica.</p>',
  'RESPUESTA_CORTA',
  '{}',
  8.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 17,
  '<p><strong>Criterio 2 — Enfoques transversales en la vida escolar.</strong></p><p>Los enfoques transversales no son un recitado al inicio de la sesión: se traducen en valores y actitudes observables de docentes y estudiantes.</p><p>Elija <strong>un</strong> enfoque (derechos, inclusión o atención a la diversidad, interculturalidad, igualdad de género, ambiental, orientación al bien común o búsqueda de la excelencia). En 12 a 20 líneas: (1) explique con precisión qué implica ese enfoque según el CNEB; (2) describa dos prácticas concretas que usted ya aplica o aplicará en su aula o en la IE; (3) indique cómo se daría cuenta, con evidencias, de que el enfoque está impregnando la competencia que enseña y no quedó como discurso.</p>',
  'RESPUESTA_CORTA',
  '{}',
  8.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 18,
  '<p><strong>Criterio 3 — Evaluación formativa y nivel B reiterado.</strong></p><p>Un estudiante de su aula obtiene <strong>B</strong> en una competencia en dos periodos consecutivos. Hay presión por «subirle la nota» promedio o por bajar la exigencia «para que no se desanime».</p><p>En 12 a 20 líneas, argumente qué haría usted de manera coherente con el CNEB y la evaluación formativa: (1) qué evidencias adicionales recogería y por qué no basta un solo instrumento; (2) cómo retroalimentaría al estudiante y a la familia (conclusión descriptiva, no adjetivo suelto); (3) qué ajustes haría en la enseñanza <em>sin bajar el estándar del ciclo</em>. Distinga con claridad B (en proceso) de C (en inicio) y de A (logro esperado).</p>',
  'RESPUESTA_CORTA',
  '{}',
  8.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 19,
  '<p><strong>Criterio 4 — Del CNEB al aula: niveles de concreción.</strong></p><p>Explique, con un ejemplo de <strong>su grado y área</strong>, cómo se relacionan en la práctica: CNEB (marco nacional), Programa curricular del nivel, PCI / propuesta pedagógica de la IE y su planificación de aula (unidad o sesión).</p><p>En 12 a 20 líneas responda: ¿qué no se puede omitir al diversificar? ¿qué sí se contextualiza (situaciones, materiales, énfasis, organización del tiempo)? Evite definiciones copiadas; muestre el tránsito de un aprendizaje nacional hasta una decisión concreta de su próxima semana de clases.</p>',
  'RESPUESTA_CORTA',
  '{}',
  8.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

INSERT INTO herramientas_examenes_preguntas
  (examen_id, orden, texto, tipo, opciones_json, puntos, solo_informativo, calificar_manualmente, obligatoria)
SELECT @eid, 20,
  '<p><strong>Criterio 5 — Inclusión con altas expectativas.</strong></p><p>El enfoque inclusivo del CNEB sostiene el derecho a oportunidades y a resultados de aprendizaje de igual calidad, y a la vez reconoce que quienes parten con mayores desventajas requieren atención más pertinente. No se trata de disminuir las expectativas del estándar.</p><p>Describa un caso real o verosímil de su aula (ritmos distintos, barreras, lengua, discapacidad, talento u otra diversidad). En 12 a 20 líneas: (1) qué competencia y estándar del ciclo siguen siendo el referente; (2) qué adecuaciones de acceso, de proceso o de evidencia usaría (sin reemplazar la competencia por tareas irrelevantes); (3) cómo se aseguraría de no confundir «flexibilizar el camino» con «bajar el listón». Fundamente con el CNEB, no solo con buena voluntad.</p>',
  'RESPUESTA_CORTA',
  '{}',
  8.00, 0, 0, 1
FROM DUAL WHERE @n_preg = 0 AND @n_int = 0;

-- Clave de alternativas (para revisión interna; no se muestra al docente):
--  1 B  2 C  3 A  4 C  5 D
--  6 B  7 A  8 C  9 B 10 A
-- 11 C 12 B 13 D 14 C 15 A
-- Preguntas 16-20: revisión manual (rúbrica implícita en el enunciado).
