function partirMinutos(total) {
  const t = Math.max(20, parseInt(total, 10) || 60);
  if (t <= 45) {
    const ini = 8;
    const cie = 7;
    return { inicio: ini, desarrollo: t - ini - cie, cierre: cie };
  }
  if (t <= 60) {
    const ini = 10;
    const cie = 10;
    return { inicio: ini, desarrollo: t - ini - cie, cierre: cie };
  }
  const ini = 15;
  const cie = 15;
  return { inicio: ini, desarrollo: t - ini - cie, cierre: cie };
}

function armarBorrador({ titulo, proposito, competencia, desempenos, duracionMin, corteLabel }) {
  const mins = partirMinutos(duracionMin);
  const lista = (desempenos || []).map((d, i) => `${i + 1}. ${d}`).join('\n');
  const tema = String(titulo || 'la actividad').trim();
  const comp = String(competencia || 'la competencia elegida').trim();
  const prop = String(proposito || `Que los estudiantes desarrollen ${comp.toLowerCase()} a través de ${tema}.`).trim();

  return {
    proposito: prop,
    minutos: mins,
    momentos: {
      inicio: `Saludo y organización del grupo (${corteLabel || 'el aula'}).\nSaberes previos: ¿qué saben o recuerdan sobre «${tema}»?\nSe comunica el propósito: ${prop}\nSe acuerdan normas breves para el trabajo.`,
      desarrollo: `Se desarrolla «${tema}» en relación con: ${comp}.\n${lista ? `Desempeños a observar:\n${lista}\n` : ''}Actividades en situaciones reales o de juego. El docente observa, registra y retroalimenta sin adelantar la calificación.\nSe usa material concreto y participación de todos.`,
      cierre: `Metacognición: ¿qué hicimos? ¿qué aprendimos? ¿qué nos resultó fácil o difícil?\nSe recupera el propósito y se anticipa cómo se seguirá en la siguiente sesión.\nSe recogen evidencias para la lista de cotejo.`,
    },
    cotejo: (desempenos || []).map((texto) => `Observa: ${texto}`),
  };
}

module.exports = { partirMinutos, armarBorrador };
