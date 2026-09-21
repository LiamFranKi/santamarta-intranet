import React, { useCallback, useState } from 'react';
import { MenuItem, TextField, CircularProgress } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import useReportesGeneralMeta, { aplicarDefaultsSedeAnio } from './useReportesGeneralMeta';
import ModalExamenesVirtuales from './ModalExamenesVirtuales';

const BIMESTRES = [
  { value: 1, label: 'BIMESTRE 1' },
  { value: 2, label: 'BIMESTRE 2' },
  { value: 3, label: 'BIMESTRE 3' },
  { value: 4, label: 'BIMESTRE 4' },
];

function gradosParaNivel(nivel) {
  if (!nivel) return [];
  const gminRaw = nivel.grado_minimo;
  const gmaxRaw = nivel.grado_maximo;
  const gmin = gminRaw !== undefined && gminRaw !== null && gminRaw !== '' ? Number(gminRaw) : NaN;
  const gmax = gmaxRaw !== undefined && gmaxRaw !== null && gmaxRaw !== '' ? Number(gmaxRaw) : NaN;
  if (Number.isFinite(gmin) && Number.isFinite(gmax) && gmax >= gmin) {
    return Array.from({ length: gmax - gmin + 1 }, (_, i) => gmin + i);
  }
  const name = String(nivel.nombre || '').toLowerCase();
  if (name.includes('inicial')) return [1, 2, 3, 4, 5];
  if (name.includes('primaria')) return [1, 2, 3, 4, 5, 6];
  if (name.includes('secundaria')) return [1, 2, 3, 4, 5];
  return [1, 2, 3, 4, 5, 6];
}

function etiquetaGradoOpcion(nivel, grado) {
  const n = String(nivel?.nombre || '').toLowerCase();
  if (n.includes('inicial')) return `${grado} Años`;
  return `${grado}°`;
}

function sedeSanMartinId(data) {
  const sedes = data?.sedes || [];
  const sm = sedes.find((s) => /san\s*mart[ií]n/i.test(String(s.nombre || '')));
  if (sm) return String(sm.id);
  if (data?.defaults?.sede_id != null) return String(data.defaults.sede_id);
  const idUno = sedes.find((s) => Number(s.id) === 1);
  if (idUno) return String(idUno.id);
  return sedes[0] ? String(sedes[0].id) : '';
}

export default function ReporteExamenesVirtuales() {
  const [anio, setAnio] = useState('');
  const [bimestre, setBimestre] = useState('1');
  const [sedeId, setSedeId] = useState('');
  const [nivelId, setNivelId] = useState('');
  const [grado, setGrado] = useState('');
  const [docenteId, setDocenteId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const onDefaults = useCallback((data) => {
    aplicarDefaultsSedeAnio(data, { setAnio });
    setSedeId(sedeSanMartinId(data));
    setBimestre('1');
  }, []);

  const { meta, loading } = useReportesGeneralMeta(onDefaults);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalData, setModalData] = useState(null);

  const nivelActual = (meta?.niveles || []).find((n) => String(n.id) === String(nivelId));
  const gradosOpciones = nivelActual ? gradosParaNivel(nivelActual) : [];

  const onNivelChange = (id) => {
    setNivelId(id);
    setGrado('');
  };

  const armarParams = () => {
    const anioN = parseInt(anio, 10);
    const params = { anio: anioN };
    if (bimestre) params.bimestre = bimestre;
    if (sedeId) params.sede_id = sedeId;
    if (nivelId) params.nivel_id = nivelId;
    if (grado) params.grado = grado;
    if (docenteId) params.docente_id = docenteId;
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    return params;
  };

  const verReporte = async () => {
    const anioN = parseInt(anio, 10);
    if (!Number.isFinite(anioN)) {
      Swal.fire({ icon: 'warning', title: 'Año requerido', text: 'Indique un año válido.' });
      return;
    }
    if (bimestre) {
      const bimN = parseInt(bimestre, 10);
      if (!Number.isFinite(bimN) || bimN < 1 || bimN > 4) {
        Swal.fire({ icon: 'warning', title: 'Bimestre', text: 'Seleccione un bimestre válido o Todos.' });
        return;
      }
    }
    if (desde && hasta && desde > hasta) {
      Swal.fire({
        icon: 'warning',
        title: 'Rango inválido',
        text: 'La fecha «desde» no puede ser posterior a «hasta».',
      });
      return;
    }

    setModalOpen(true);
    setModalLoading(true);
    setModalData(null);
    try {
      const { data } = await api.get('/admin/reportes/general/examenes-virtuales', { params: armarParams() });
      setModalData(data);
    } catch (e) {
      setModalOpen(false);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo cargar',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setModalLoading(false);
    }
  };

  const aniosOpciones = meta?.anio_activo
    ? [meta.anio_activo, meta.anio_activo - 1, meta.anio_activo - 2].filter((y) => y > 2000)
    : [new Date().getFullYear()];

  return (
    <>
      <ReporteGeneralPanel
        tone={2}
        icon="📝"
        title="Exámenes virtuales"
        description="Exámenes en línea del aula virtual del bimestre, agrupados por grupo, asignatura y docente. Nivel, grado y docente son opcionales. Si indica fechas, incluye los programados o rendidos en ese rango."
        compact
      >
        <div className="rg-filtros-toolbar rg-filtros-toolbar--examenes">
          {loading ? (
            <div className="rg-alum-loading">
              <CircularProgress size={22} />
              <span>Cargando filtros…</span>
            </div>
          ) : (
            <>
              <TextField
                select
                size="small"
                label="Año"
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
                className="rg-alum-field rg-alum-field--anio"
              >
                {aniosOpciones.map((y) => (
                  <MenuItem key={y} value={String(y)}>
                    {y}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Bimestre"
                value={bimestre}
                onChange={(e) => setBimestre(e.target.value)}
                className="rg-alum-field rg-alum-field--bimestre"
              >
                <MenuItem value="">Todos</MenuItem>
                {BIMESTRES.map((b) => (
                  <MenuItem key={b.value} value={String(b.value)}>
                    {b.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Nivel"
                value={nivelId}
                onChange={(e) => onNivelChange(e.target.value)}
                className="rg-alum-field rg-alum-field--nivel"
              >
                <MenuItem value="">Todos</MenuItem>
                {(meta?.niveles || []).map((n) => (
                  <MenuItem key={n.id} value={String(n.id)}>
                    {n.nombre}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Grado"
                value={grado}
                onChange={(e) => setGrado(e.target.value)}
                className="rg-alum-field rg-alum-field--grado"
                disabled={!nivelId || gradosOpciones.length === 0}
              >
                <MenuItem value="">Todos</MenuItem>
                {gradosOpciones.map((g) => (
                  <MenuItem key={g} value={String(g)}>
                    {etiquetaGradoOpcion(nivelActual, g)}
                  </MenuItem>
                ))}
              </TextField>
              {(meta?.docentes || []).length > 0 && (
                <TextField
                  select
                  size="small"
                  label="Docente"
                  value={docenteId}
                  onChange={(e) => setDocenteId(e.target.value)}
                  className="rg-alum-field rg-alum-field--docente"
                >
                  <MenuItem value="">Todos</MenuItem>
                  {(meta.docentes || []).map((d) => (
                    <MenuItem key={d.id} value={String(d.id)}>
                      {d.nombre}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <div className="rg-exam-filtros-fechas">
                <TextField
                  size="small"
                  type="date"
                  label="Desde"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  className="rg-alum-field rg-alum-field--fecha"
                />
                <TextField
                  size="small"
                  type="date"
                  label="Hasta"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  className="rg-alum-field rg-alum-field--fecha"
                />
                <div className="rg-filtros-toolbar__actions">
                  <button type="button" className="rg-alum-btn rg-alum-btn--primary" onClick={verReporte}>
                    <VisibilityIcon fontSize="small" aria-hidden />
                    Ver Reporte
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </ReporteGeneralPanel>

      <ModalExamenesVirtuales
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        data={modalData}
        anio={anio}
        bimestre={bimestre}
        sedeId={sedeId}
        nivelId={nivelId}
        grado={grado}
        docenteId={docenteId}
        desde={desde}
        hasta={hasta}
      />
    </>
  );
}
