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
    titulo: tema === 'la actividad' ? '' : tema,
    proposito: prop,
    minutos: mins,
    momentos: {
      inicio: `Motivación: se presenta «${tema}» con un juego, canción o pregunta disparadora (${corteLabel || 'el aula'}).\nSaberes previos: ¿qué saben o recuerdan sobre «${tema}»?\nProblematización: ¿qué pasaría si…? Se abre el conflicto cognitivo.\nSe comunica el propósito: ${prop}\nSe acuerdan normas breves para el trabajo.`,
      desarrollo: `Se desarrolla «${tema}» en relación con: ${comp}.\n${lista ? `Desempeños a observar:\n${lista}\n` : ''}Actividades en situaciones reales o de juego. Materiales concretos. El docente observa, registra y retroalimenta sin adelantar la calificación.\nParticipan todos; se recogen evidencias (dibujo, foto, ficha, oralidad).`,
      cierre: `Metacognición: ¿qué hicimos? ¿qué aprendimos? ¿qué nos resultó fácil o difícil?\nSe recupera el propósito y se anticipa cómo se seguirá en la siguiente sesión.\nSe recogen evidencias para la lista de cotejo y se guarda la ficha.`,
    },
    cotejo: (desempenos || []).map((texto) => `Observa: ${texto}`),
    ficha: `Ficha de trabajo — ${tema}\nNombre: ____________________    Fecha: __________\n\n1. Dibuja o escribe lo que hicimos hoy sobre «${tema}».\n2. ¿Qué aprendiste?\n3. ¿Qué te resultó fácil o difícil?\n${lista ? `\nPara el docente (cotejo):\n${lista}` : ''}`,
  };
}

module.exports = { partirMinutos, armarBorrador };
