/**
 * Grupo académico (año/sede/nivel/grado/sección/turno) y costo personalizado — compartido por inscripción y edición de matrícula.
 */
async function ensureGrupoConn(conn, { colegio_id, anio, nivel_id, grado, seccion, turno_id, sede_id }) {
  const sec = String(seccion || '').trim().toUpperCase();
  if (!sec) {
    const err = new Error('Indique la sección (letra del grupo)');
    err.status = 400;
    throw err;
  }
  const an = parseInt(anio, 10);
  const nid = parseInt(nivel_id, 10);
  const gr = parseInt(grado, 10);
  const tid = parseInt(turno_id, 10);
  const sid = parseInt(sede_id, 10);
  if (!Number.isFinite(an) || !Number.isFinite(nid) || !Number.isFinite(gr) || !Number.isFinite(tid)) {
    const err = new Error('Nivel, grado, año y turno son obligatorios');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(sid) || sid <= 0) {
    const err = new Error('Indique la sede (campus) del grupo');
    err.status = 400;
    throw err;
  }

  const [ex] = await conn.execute(
    `SELECT id FROM grupos WHERE colegio_id = ? AND anio = ? AND nivel_id = ? AND grado = ? AND UPPER(TRIM(seccion)) = ? AND turno_id = ? AND sede_id = ? LIMIT 1`,
    [colegio_id, an, nid, gr, sec, tid, sid]
  );
  if (ex.length) return ex[0].id;

  const [nv] = await conn.execute('SELECT id FROM niveles WHERE id = ? AND colegio_id = ? LIMIT 1', [nid, colegio_id]);
  if (!nv.length) {
    const err = new Error('El nivel seleccionado no es válido para este colegio');
    err.status = 400;
    throw err;
  }
  const [tn] = await conn.execute('SELECT id FROM turnos WHERE id = ? LIMIT 1', [tid]);
  if (!tn.length) {
    const err = new Error('El turno seleccionado no es válido');
    err.status = 400;
    throw err;
  }
  const [sd] = await conn.execute('SELECT id FROM sedes WHERE id = ? AND colegio_id = ? LIMIT 1', [sid, colegio_id]);
  if (!sd.length) {
    const err = new Error('La sede seleccionada no es válida para este colegio');
    err.status = 400;
    throw err;
  }

  const vals = [colegio_id, an, nid, gr, sec, tid, sid];
  try {
    const [ins] = await conn.execute(
      `INSERT INTO grupos (colegio_id, anio, nivel_id, grado, seccion, turno_id, tutor_id, sede_id) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      vals
    );
    return ins.insertId;
  } catch (e1) {
    try {
      const [ins2] = await conn.execute(
        `INSERT INTO grupos (colegio_id, anio, nivel_id, grado, seccion, turno_id, tutor_id, sede_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        vals
      );
      return ins2.insertId;
    } catch (e2) {
      const [ex2] = await conn.execute(
        `SELECT id FROM grupos WHERE colegio_id = ? AND anio = ? AND nivel_id = ? AND grado = ? AND UPPER(TRIM(seccion)) = ? AND turno_id = ? AND sede_id = ? LIMIT 1`,
        [colegio_id, an, nid, gr, sec, tid, sid]
      );
      if (ex2.length) return ex2[0].id;
      console.error('ensureGrupoConn INSERT', e1, e2);
      const err = new Error(
        e2.message || e1.message || 'No se pudo crear el grupo. Verifique los datos o cree el aula desde administración de grupos.'
      );
      err.status = 400;
      throw err;
    }
  }
}

async function insertCostoPersonalizado(conn, { colegio_id, descripcion, matricula, pension, agenda }) {
  const desc = String(descripcion || 'Costo Personalizado').slice(0, 255);
  const mat = Number(matricula);
  const pen = Number(pension);
  const ag = agenda != null && agenda !== '' ? Number(agenda) : 0;
  try {
    const [r] = await conn.execute(
      `INSERT INTO costos (colegio_id, descripcion, matricula, pension, agenda, tipo) VALUES (?, ?, ?, ?, ?, 'PERSONAL')`,
      [colegio_id, desc, mat, pen, Number.isFinite(ag) ? ag : 0]
    );
    return r.insertId;
  } catch (e) {
    const [r2] = await conn.execute(
      `INSERT INTO costos (colegio_id, descripcion, matricula, pension, tipo) VALUES (?, ?, ?, ?, 'PERSONAL')`,
      [colegio_id, desc, mat, pen]
    );
    return r2.insertId;
  }
}

module.exports = {
  ensureGrupoConn,
  insertCostoPersonalizado,
};
