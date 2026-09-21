-- Reemplaza las FAQs anteriores por el contenido 2026 (Web / Inicial / Primaria / Secundaria).
-- Requiere 088 (pagina_nivel) y 102 (pagina_destinos). phpMyAdmin → SQL → Continuar.
-- No repetir: borra todas las preguntas actuales.

SET NAMES utf8mb4;

UPDATE `web_faq_categorias`
SET `activo` = 0
WHERE `codigo` IN ('costos-y-pagos', 'comunicacion-con-padres', 'otros');

UPDATE `web_faq_categorias`
SET `activo` = 1
WHERE `codigo` IN (
  'admision-y-matricula',
  'horarios-y-calendario',
  'academico-y-pedagogico',
  'servicios-y-actividades'
);

SET @cat_admision := (SELECT id FROM web_faq_categorias WHERE codigo = 'admision-y-matricula' LIMIT 1);
SET @cat_horarios := (SELECT id FROM web_faq_categorias WHERE codigo = 'horarios-y-calendario' LIMIT 1);
SET @cat_academico := (SELECT id FROM web_faq_categorias WHERE codigo = 'academico-y-pedagogico' LIMIT 1);
SET @cat_servicios := (SELECT id FROM web_faq_categorias WHERE codigo = 'servicios-y-actividades' LIMIT 1);

DELETE FROM `web_faqs`;

INSERT INTO `web_faqs`
  (`categoria_id`, `pregunta`, `respuesta`, `orden`, `activo`, `pagina_nivel`, `pagina_destinos`)
VALUES
(@cat_admision, '¿Cómo puedo iniciar el proceso de admisión o traslado de mi hijo(a)?', 'Puedes iniciar el proceso de manera virtual o presencial. El proceso comprende el registro del postulante, una entrevista personalizada, una evaluación formativa de acuerdo con el nivel escolar y, finalmente, la confirmación con las indicaciones para realizar la matrícula.', 1, 1, 'web', JSON_ARRAY('web')),
(@cat_admision, '¿Qué requisitos y documentos necesito para postular?', 'Los requisitos y documentos pueden variar según el nivel, grado y condición del postulante. Nuestro equipo de Admisión te brindará la relación correspondiente y te acompañará durante todo el proceso.', 2, 1, 'web', JSON_ARRAY('web')),
(@cat_admision, '¿Puedo solicitar el traslado de mi hijo durante el año escolar?', 'Sí. Los traslados durante el año escolar son posibles y están sujetos a la disponibilidad de vacantes. Una vez aprobado el traslado, la familia deberá cumplir con los requisitos y condiciones establecidos para los estudiantes nuevos.', 3, 1, 'web', JSON_ARRAY('web')),
(@cat_admision, '¿Cómo puedo consultar si hay vacantes disponibles?', 'Puedes consultar la disponibilidad de vacantes comunicándote con nuestro equipo de Admisión. También puedes registrar tus datos y el grado de interés para recibir orientación sobre el proceso.', 4, 1, 'web', JSON_ARRAY('web')),
(@cat_admision, '¿Cómo puedo agendar una visita o solicitar más información?', 'Puedes solicitar una visita guiada desde nuestra página web o comunicarte con nuestro equipo de Admisión. Estaremos encantados de mostrarte nuestras instalaciones, resolver tus dudas y brindarte información sobre nuestra propuesta educativa.', 5, 1, 'web', JSON_ARRAY('web')),
(@cat_admision, '¿Desde qué edad reciben a los niños en el nivel Inicial?', 'Recibimos niños desde los 3 años, cumplidos hasta el 31 de marzo del año de ingreso. Nuestro nivel Inicial comprende las edades de 3, 4 y 5 años.', 1, 1, 'inicial', JSON_ARRAY('inicial')),
(@cat_horarios, '¿Cuál es el horario de clases y cuántos estudiantes hay por aula?', 'El horario de Inicial es de 7:20 a. m. a 1:30 p. m. La capacidad máxima es de 25 estudiantes por salón y trabajamos con una proporción de 1 maestra por cada 10 estudiantes, favoreciendo un acompañamiento cercano y especializado.', 2, 1, 'inicial', JSON_ARRAY('inicial')),
(@cat_academico, '¿Cómo acompañan a los niños durante su proceso de adaptación al colegio?', 'Promovemos un acompañamiento cercano y respetuoso, con maestras especializadas y espacios que favorecen la socialización, autonomía y seguridad de cada niño. A través del juego y las experiencias cotidianas, buscamos que se integren progresivamente y construyan vínculos positivos con sus compañeros y docentes.', 3, 1, 'inicial', JSON_ARRAY('inicial')),
(@cat_academico, '¿Cuál es la metodología de enseñanza que aplican en el nivel Inicial?', 'Trabajamos con el enfoque STEAM, integrando ciencia, tecnología, ingeniería, arte y matemáticas mediante el juego, la exploración y la investigación. Buscamos estimular la curiosidad, creatividad, autonomía, pensamiento crítico y trabajo en equipo desde los primeros años.', 4, 1, 'inicial', JSON_ARRAY('inicial')),
(@cat_servicios, '¿Los niños de Inicial cuentan con espacios exclusivos según su edad?', 'El nivel Inicial dispone de espacios diseñados para favorecer el aprendizaje y desarrollo de los más pequeños, como aulas de sectores, espacios vivenciales y piscina patera temperada. Además, el campus cuenta con amplias áreas para actividades deportivas, psicomotrices y recreativas.', 5, 1, 'inicial', JSON_ARRAY('inicial')),
(@cat_academico, '¿Enseñan inglés desde Inicial?', 'Sí. En Vanguard Schools la formación en inglés comienza desde Inicial mediante una propuesta de inmersión que busca que los niños se familiaricen con el idioma desde sus primeros años y desarrollen progresivamente sus habilidades comunicativas.', 6, 1, 'inicial', JSON_ARRAY('inicial')),
(@cat_academico, '¿Cuál es la metodología de enseñanza para el nivel Primaria?', 'En Primaria trabajamos mediante proyectos y Aula Invertida (Flipped Classroom). Los estudiantes revisan contenidos teóricos y utilizan recursos digitales, mientras que en clase desarrollan actividades prácticas, debates, proyectos y experiencias que fortalecen su pensamiento crítico y autonomía.', 1, 1, 'primaria', JSON_ARRAY('primaria')),
(@cat_horarios, '¿Cuál es el horario de clases en Primaria y cuántos estudiantes hay por aula?', 'El horario de Primaria es de 7:20 a. m. a 2:00 p. m., con una capacidad máxima de 30 estudiantes por salón.', 2, 1, 'primaria', JSON_ARRAY('primaria')),
(@cat_academico, '¿Cómo se desarrolla la enseñanza del inglés en Primaria?', 'Trabajamos un inglés intensivo y vivencial, orientado a que los estudiantes desarrollen sus habilidades comunicativas y utilicen el idioma con seguridad y naturalidad. Nuestra propuesta de inglés también contempla la preparación progresiva para acreditaciones internacionales.', 3, 1, 'primaria', JSON_ARRAY('primaria')),
(@cat_academico, '¿Cómo se utilizan las herramientas tecnológicas dentro del aula?', 'La tecnología forma parte del proceso de aprendizaje. Contamos con pizarras interactivas en las aulas, tablets desde 4.º de Primaria, libros digitales e interactivos, tareas y evaluaciones en línea, además de laboratorio de cómputo y recursos tecnológicos que complementan las experiencias de aprendizaje.', 4, 1, 'primaria', JSON_ARRAY('primaria')),
(@cat_academico, '¿Cuántas horas de inglés llevan en el nivel Primaria?', 'Vanguard Schools desarrolla un programa de inglés intensivo y vivencial, con experiencias orientadas al desarrollo progresivo de las competencias comunicativas de los estudiantes.', 5, 1, 'primaria', JSON_ARRAY('primaria')),
(@cat_academico, '¿Los estudiantes realizan proyectos, exposiciones o actividades prácticas?', 'Sí. Nuestra metodología promueve un aprendizaje activo mediante proyectos, actividades prácticas y debates, permitiendo que los estudiantes apliquen lo aprendido, desarrollen pensamiento crítico, fortalezcan su comunicación y participen activamente en la construcción de sus conocimientos.', 6, 1, 'primaria', JSON_ARRAY('primaria')),
(@cat_academico, '¿Qué metodología de enseñanza se aplica en Secundaria?', 'En Secundaria aplicamos el modelo de Aula Invertida, donde los estudiantes revisan contenidos teóricos con apoyo de recursos digitales y aprovechan las clases para desarrollar actividades prácticas, debates y proyectos. Esta metodología busca fortalecer la autonomía, el pensamiento crítico y la participación activa.', 1, 1, 'secundaria', JSON_ARRAY('secundaria')),
(@cat_horarios, '¿Cuál es el horario de clases y cuántos estudiantes hay por aula?', 'El horario de Secundaria es de 7:20 a. m. a 3:00 p. m., con una capacidad máxima de 36 estudiantes por salón.', 2, 1, 'secundaria', JSON_ARRAY('secundaria')),
(@cat_academico, '¿El colegio brinda orientación vocacional y tiene convenios con universidades o institutos?', 'Sí brindamos orientación vocacional como parte del Proyecto de Vida de nuestros estudiantes, complementada con psicología escolar y charlas vocacionales que los ayudan a tomar decisiones informadas sobre su futuro académico y profesional.', 3, 1, 'secundaria', JSON_ARRAY('secundaria')),
(@cat_academico, '¿Qué nivel de inglés alcanzan los estudiantes al finalizar la Secundaria?', 'Nuestro programa busca que los estudiantes desarrollen un dominio comunicativo del inglés y los prepara para acceder a acreditaciones internacionales. Vanguard Schools cuenta además con un programa de inglés certificado por Cambridge Assessment English, que incluye metodología comunicativa y preparación para exámenes Cambridge.', 4, 1, 'secundaria', JSON_ARRAY('secundaria')),
(@cat_servicios, '¿Qué acompañamiento psicológico y socioemocional reciben los adolescentes?', 'El acompañamiento psicológico forma parte de nuestra propuesta integral en Secundaria. A través del Proyecto de Vida, la orientación vocacional y la psicología escolar, buscamos acompañar a nuestros estudiantes en su desarrollo personal, social y en la toma responsable de decisiones para su futuro.', 5, 1, 'secundaria', JSON_ARRAY('secundaria')),
(@cat_academico, '¿Qué herramientas tecnológicas utilizan los estudiantes durante sus clases?', 'Los estudiantes integran diferentes herramientas tecnológicas en su aprendizaje, como tablets, pizarras interactivas, libros digitales, evaluaciones y tareas en línea, además de recursos de robótica y programación en un laboratorio equipado para desarrollar el pensamiento computacional.', 6, 1, 'secundaria', JSON_ARRAY('secundaria'));
