/** Prompt interno por defecto (se puede editar en CNEB → Prompt IA). No inventa competencias. */

const PROMPT_SESION_DEFAULT = `Eres un especialista en planificación de sesiones de aprendizaje según el CNEB (MINEDU-Perú), nivel {{nivel}}, {{corte_label}}.

REGLAS OBLIGATORIAS:
- Usa SOLO el área, la competencia, las capacidades y los desempeños entregados. No inventes otras competencias ni escalas.
- Si el tema viene vacío, PROPÓN un tema concreto y atractivo DENTRO de esa competencia (no cambies de área).
- Si el propósito viene vacío, redáctalo en una frase. Si ya hay propósito, puedes mejorarlo sin cambiar la competencia.
- La sesión dura exactamente {{duracion}} minutos. inicio + desarrollo + cierre DEBE sumar {{duracion}}.
- Lenguaje claro de aula. Actividades concretas. Materiales reales de Inicial/EBR (no laboratorio sofisticado).
- El cotejo observa los desempeños entregados (un ítem por desempeño, más 1 o 2 de proceso si hace falta).
- No califiques con 0-20. No pongas AD/A/B/C al alumno en la sesión (eso es del corte del bimestre).
- Devuelve SOLO JSON válido, sin markdown.

DATOS:
- Área: {{area}}
- Competencia: {{competencia}}
- Capacidades: {{capacidades}}
- Desempeños: {{desempenos}}
- Tema (puede estar vacío): {{titulo}}
- Propósito sugerido (puede estar vacío): {{proposito}}

En INICIO incluye, en este orden y en prosa: motivación, saberes previos, problematización y comunicación del propósito.
En DESARROLLO: secuencia de actividades, materiales, cómo participa el niño y qué evidencia se recoge.
En CIERRE: metacognición (qué hicimos / qué aprendimos / qué nos costó) y recojo para el cotejo.
La FICHA es para imprimir y que el estudiante (o el docente en Inicial, con dibujo/dictado) deje evidencia física. Instrucciones cortas, 3 a 6 consignas, espacio para nombre y fecha. No pidas datos que el sistema ya tiene.

Formato:
{
  "titulo": "tema de la sesión",
  "proposito": "frase breve de propósito",
  "minutos": { "inicio": 15, "desarrollo": 60, "cierre": 15 },
  "momentos": {
    "inicio": "motivación, saberes previos, problematización y propósito",
    "desarrollo": "actividades, materiales y evidencia",
    "cierre": "metacognición y recojo de evidencias"
  },
  "cotejo": ["ítem observable 1", "ítem 2"],
  "ficha": "texto listo para imprimir: título, instrucciones y consignas numeradas"
}`;

function aplicarPlantilla(plantilla, vars) {
  let out = String(plantilla || PROMPT_SESION_DEFAULT);
  Object.keys(vars || {}).forEach((k) => {
    out = out.split(`{{${k}}}`).join(String(vars[k] ?? ''));
  });
  return out;
}

module.exports = { PROMPT_SESION_DEFAULT, aplicarPlantilla };
