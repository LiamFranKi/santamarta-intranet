-- Ajuste del contexto visual del examen CNEB (ya creado con 100).
-- phpMyAdmin → vanguard_intranet → SQL → Continuar.

SET NAMES utf8mb4;

UPDATE herramientas_examenes
SET
  descripcion = 'Examen de nivel intermedio-alto para el equipo docente: dominio del CNEB y criterio para aplicarlo en el aula.',
  bloque_contenido = '<p>Tiempo referencial: <strong>90 minutos</strong>. Un intento. 20 preguntas: 15 de alternativa (autoevaluadas) y 5 de criterio (revisión manual).</p><p><strong>Parte 1 (preguntas 1 a 15).</strong> Marque la alternativa más coherente con el CNEB. No elija por costumbre de aula si contradice el currículo nacional.</p><p><strong>Parte 2 (preguntas 16 a 20).</strong> Escriba entre 12 y 20 líneas. Fundamente con categorías del CNEB (competencia, capacidades, estándar o enfoques) y un ejemplo de su propia aula. No se evalúa opinión desconectada del currículo.</p><p><strong>Referente.</strong> Currículo Nacional de la Educación Básica (MINEDU), RM N.° 281-2016-MINEDU y RM N.° 159-2017-MINEDU.</p>'
WHERE titulo = 'CNEB — Currículo Nacional de la Educación Básica (docentes)'
  AND colegio_id = 1;
