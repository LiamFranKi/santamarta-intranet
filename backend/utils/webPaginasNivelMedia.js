const NIVELES = ['inicial', 'primaria', 'secundaria'];
const SLOTS = {
  home: 'home_ruta',
  hero: 'hero_ruta',
  campus1: 'campus1_ruta',
  campus2: 'campus2_ruta',
  campus3: 'campus3_ruta',
};

const MEDIA_DEFAULTS = {
  inicial: {
    nivel: 'inicial',
    home_ruta: '/inicial.jpeg',
    hero_ruta: '/inicial.jpeg',
    campus1_titulo: 'Piscina patera temperada',
    campus1_texto: 'Natación desde inicial, con agua temperada y seguridad.',
    campus1_ruta: '/inicial.jpeg',
    campus2_titulo: 'Canchas de grass sintético',
    campus2_texto: 'Dos canchas profesionales (una techada) para el juego motor.',
    campus2_ruta: '/FONDOBANNER.jpg',
    campus3_titulo: 'Campus de 7 500 m²',
    campus3_texto: 'Infraestructura antisísmica, aulas amplias y libros COREFO incluidos.',
    campus3_ruta: '/primaria.jpeg',
  },
  primaria: {
    nivel: 'primaria',
    home_ruta: '/primaria.jpeg',
    hero_ruta: '/primaria.jpeg',
    campus1_titulo: 'Piscinas temperadas',
    campus1_texto: 'Semiolímpica y patera: natación como parte de la formación.',
    campus1_ruta: '/FONDOBANNER.jpg',
    campus2_titulo: '2 canchas sintéticas',
    campus2_texto: 'Deporte de alto nivel en un campus de más de 7 500 m².',
    campus2_ruta: '/primaria.jpeg',
    campus3_titulo: 'Lab de cómputo',
    campus3_texto: 'Tecnología, intranet y app para familias. Exámenes y tareas virtuales.',
    campus3_ruta: '/secundaria.jpeg',
  },
  secundaria: {
    nivel: 'secundaria',
    home_ruta: '/secundaria.jpeg',
    hero_ruta: '/secundaria.jpeg',
    campus1_titulo: 'Piscina semiolímpica',
    campus1_texto: 'Natación en instalaciones temperadas, nivel competencia y salud.',
    campus1_ruta: '/FONDOBANNER.jpg',
    campus2_titulo: 'Canchas profesionales',
    campus2_texto: 'Dos grass sintéticos (uno techado) para fútbol, vóley y más.',
    campus2_ruta: '/primaria.jpeg',
    campus3_titulo: 'Tecnología e intranet',
    campus3_texto: 'Tablets, libros digitales, exámenes en línea y app para la familia.',
    campus3_ruta: '/secundaria.jpeg',
  },
};

function isNivel(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return NIVELES.includes(s) ? s : null;
}

function isSlot(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return SLOTS[s] ? s : null;
}

function clip(s, max) {
  return String(s || '').trim().slice(0, max);
}

function mapRow(row, nivel) {
  const d = MEDIA_DEFAULTS[nivel];
  return {
    nivel,
    home_ruta: String(row?.home_ruta || d.home_ruta),
    hero_ruta: String(row?.hero_ruta || d.hero_ruta),
    campus1_titulo: String(row?.campus1_titulo || d.campus1_titulo),
    campus1_texto: String(row?.campus1_texto || d.campus1_texto),
    campus1_ruta: String(row?.campus1_ruta || d.campus1_ruta),
    campus2_titulo: String(row?.campus2_titulo || d.campus2_titulo),
    campus2_texto: String(row?.campus2_texto || d.campus2_texto),
    campus2_ruta: String(row?.campus2_ruta || d.campus2_ruta),
    campus3_titulo: String(row?.campus3_titulo || d.campus3_titulo),
    campus3_texto: String(row?.campus3_texto || d.campus3_texto),
    campus3_ruta: String(row?.campus3_ruta || d.campus3_ruta),
    updated_at: row?.updated_at || null,
  };
}

function esRutaSubida(ruta) {
  return String(ruta || '').startsWith('/niveles/');
}

async function leerMedia(queryFn) {
  try {
    const rows = await queryFn(
      `SELECT nivel, home_ruta, hero_ruta,
              campus1_titulo, campus1_texto, campus1_ruta,
              campus2_titulo, campus2_texto, campus2_ruta,
              campus3_titulo, campus3_texto, campus3_ruta,
              updated_at
       FROM web_paginas_nivel_media`
    );
    const byNivel = {};
    for (const n of NIVELES) {
      const row = (rows || []).find((r) => String(r.nivel) === n);
      byNivel[n] = mapRow(row, n);
    }
    return { media: byNivel, source: 'mysql' };
  } catch (e) {
    if (e && (e.code === 'ER_BAD_FIELD_ERROR' || String(e.message || '').includes('home_ruta'))) {
      try {
        const rows = await queryFn(
          `SELECT nivel, hero_ruta,
                  campus1_titulo, campus1_texto, campus1_ruta,
                  campus2_titulo, campus2_texto, campus2_ruta,
                  campus3_titulo, campus3_texto, campus3_ruta,
                  updated_at
           FROM web_paginas_nivel_media`
        );
        const byNivel = {};
        for (const n of NIVELES) {
          const row = (rows || []).find((r) => String(r.nivel) === n);
          byNivel[n] = mapRow({ ...row, home_ruta: row?.hero_ruta }, n);
        }
        return { media: byNivel, source: 'mysql', necesita_migracion_home: true };
      } catch (inner) {
        e = inner;
      }
    }
    if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146)) {
      return {
        media: {
          inicial: { ...MEDIA_DEFAULTS.inicial },
          primaria: { ...MEDIA_DEFAULTS.primaria },
          secundaria: { ...MEDIA_DEFAULTS.secundaria },
        },
        source: 'sin_tabla',
        necesita_migracion_media: true,
      };
    }
    throw e;
  }
}

async function guardarTextosMedia(executeFn, queryFn, nivel, body) {
  const n = isNivel(nivel);
  if (!n) throw Object.assign(new Error('Nivel inválido'), { status: 400 });
  const d = MEDIA_DEFAULTS[n];
  const data = {
    campus1_titulo: clip(body.campus1_titulo, 80) || d.campus1_titulo,
    campus1_texto: clip(body.campus1_texto, 220) || d.campus1_texto,
    campus2_titulo: clip(body.campus2_titulo, 80) || d.campus2_titulo,
    campus2_texto: clip(body.campus2_texto, 220) || d.campus2_texto,
    campus3_titulo: clip(body.campus3_titulo, 80) || d.campus3_titulo,
    campus3_texto: clip(body.campus3_texto, 220) || d.campus3_texto,
  };
  await executeFn(
    `INSERT INTO web_paginas_nivel_media
       (nivel, home_ruta, hero_ruta, campus1_titulo, campus1_texto, campus1_ruta,
        campus2_titulo, campus2_texto, campus2_ruta,
        campus3_titulo, campus3_texto, campus3_ruta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       campus1_titulo = VALUES(campus1_titulo),
       campus1_texto = VALUES(campus1_texto),
       campus2_titulo = VALUES(campus2_titulo),
       campus2_texto = VALUES(campus2_texto),
       campus3_titulo = VALUES(campus3_titulo),
       campus3_texto = VALUES(campus3_texto)`,
    [
      n,
      d.home_ruta,
      d.hero_ruta,
      data.campus1_titulo,
      data.campus1_texto,
      d.campus1_ruta,
      data.campus2_titulo,
      data.campus2_texto,
      d.campus2_ruta,
      data.campus3_titulo,
      data.campus3_texto,
      d.campus3_ruta,
    ]
  );
  const all = await leerMedia(queryFn);
  return all.media[n];
}

async function guardarRutaSlot(executeFn, queryFn, { nivel, slot, ruta, removeOld }) {
  const n = isNivel(nivel);
  const s = isSlot(slot);
  if (!n || !s) throw Object.assign(new Error('Nivel o slot inválido'), { status: 400 });
  const col = SLOTS[s];
  const current = await leerMedia(queryFn);
  if (current.necesita_migracion_media) {
    throw Object.assign(new Error('Falta ejecutar la migración 088 (web_paginas_nivel_media).'), {
      status: 503,
      payload: current,
    });
  }
  const prev = current.media[n];
  const d = MEDIA_DEFAULTS[n];
  await executeFn(
    `INSERT INTO web_paginas_nivel_media
       (nivel, home_ruta, hero_ruta, campus1_titulo, campus1_texto, campus1_ruta,
        campus2_titulo, campus2_texto, campus2_ruta,
        campus3_titulo, campus3_texto, campus3_ruta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE ${col} = VALUES(${col})`,
    [
      n,
      s === 'home' ? ruta : prev.home_ruta || d.home_ruta,
      s === 'hero' ? ruta : prev.hero_ruta || d.hero_ruta,
      prev.campus1_titulo,
      prev.campus1_texto,
      s === 'campus1' ? ruta : prev.campus1_ruta || d.campus1_ruta,
      prev.campus2_titulo,
      prev.campus2_texto,
      s === 'campus2' ? ruta : prev.campus2_ruta || d.campus2_ruta,
      prev.campus3_titulo,
      prev.campus3_texto,
      s === 'campus3' ? ruta : prev.campus3_ruta || d.campus3_ruta,
    ]
  );
  const oldRuta = prev[col];
  if (removeOld && esRutaSubida(oldRuta) && oldRuta !== ruta) {
    removeOld(oldRuta);
  }
  const all = await leerMedia(queryFn);
  return all.media[n];
}

module.exports = {
  NIVELES,
  SLOTS,
  MEDIA_DEFAULTS,
  isNivel,
  isSlot,
  esRutaSubida,
  leerMedia,
  guardarTextosMedia,
  guardarRutaSlot,
};
