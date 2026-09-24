import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Autocomplete, CircularProgress, MenuItem, TextField } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import api from '../../../services/api';
import Swal from 'sweetalert2';
import ReporteGeneralPanel from '../ReporteGeneralPanel';
import { descargarCurriculumConAviso } from '../../../utils/descargarCurriculumPersonal';

function etiquetaTipo(tipo) {
  const t = String(tipo || '').trim();
  if (!t) return t;
  return t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');
}

export default function ReporteCurriculumsPersonal() {
  const [tipos, setTipos] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState('');
  const [persona, setPersona] = useState(null);
  const [descargando, setDescargando] = useState(false);

  const cargarCatalogo = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/reportes/general/curriculums', {
        params: { solo_lista: 1 },
      });
      setTipos(data.tipos || []);
      setCatalogo(data.personal || []);
    } catch (e) {
      setTipos([]);
      setCatalogo([]);
      Swal.fire({
        icon: 'error',
        title: 'No se pudo cargar el personal',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarCatalogo();
  }, [cargarCatalogo]);

  const filtrados = useMemo(() => {
    if (!tipo) return catalogo;
    return catalogo.filter((p) => String(p.usuario_tipo || '').toUpperCase() === tipo);
  }, [catalogo, tipo]);

  useEffect(() => {
    if (!persona) return;
    if (!filtrados.some((p) => Number(p.id) === Number(persona.id))) {
      setPersona(null);
    }
  }, [filtrados, persona]);

  const descargar = async (modo) => {
    if (modo === 'uno' && !persona) {
      Swal.fire({
        icon: 'warning',
        title: 'Elija una persona',
        text: 'Seleccione al trabajador para descargar su currículum.',
      });
      return;
    }
    if (modo === 'todos' && filtrados.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Sin personal',
        text: 'No hay personal activo con ese filtro.',
      });
      return;
    }

    const params = {};
    if (tipo) params.tipo = tipo;
    if (modo === 'uno') params.personal_id = persona.id;

    setDescargando(true);
    await descargarCurriculumConAviso(
      '/admin/reportes/general/curriculums',
      params,
      modo === 'uno' ? 'Generando currículum…' : 'Generando currículums…'
    );
    setDescargando(false);
  };

  return (
    <ReporteGeneralPanel
      tone={2}
      icon="📄"
      title="Currículums del personal"
      description="PDF profesional con foto, contacto, estudios, idiomas, experiencia y documentos. Solo personal activo."
      compact
    >
      {loading ? (
        <div className="rg-alum-loading">
          <CircularProgress size={24} />
        </div>
      ) : (
        <div className="rg-filtros-toolbar rg-filtros-toolbar--fill rg-filtros-toolbar--card-duo">
          <TextField
            select
            size="small"
            label="Perfil"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="rg-alum-field rg-alum-field--orden-campo"
          >
            <MenuItem value="">Todo el personal</MenuItem>
            {tipos.map((t) => (
              <MenuItem key={t} value={t}>
                {etiquetaTipo(t)}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            size="small"
            options={filtrados}
            value={persona}
            onChange={(_, v) => setPersona(v)}
            getOptionLabel={(o) =>
              o ? `${o.nombre}${o.cargo ? ` · ${o.cargo}` : ''}` : ''
            }
            isOptionEqualToValue={(a, b) => Number(a.id) === Number(b.id)}
            className="rg-alum-field rg-cv-persona-field"
            sx={{ minWidth: 240, flex: '1.8 1 14rem' }}
            noOptionsText="Sin personal activo"
            renderInput={(params) => (
              <TextField {...params} label="Persona (opcional)" placeholder="Buscar trabajador" />
            )}
          />
          <div className="rg-filtros-toolbar__actions" style={{ flexWrap: 'wrap' }}>
            <button
              type="button"
              className="rg-alum-btn rg-alum-btn--primary"
              disabled={descargando || !persona}
              onClick={() => descargar('uno')}
            >
              <DownloadIcon fontSize="small" aria-hidden />
              Descargar CV
            </button>
            <button
              type="button"
              className="rg-alum-btn rg-alum-btn--secondary"
              disabled={descargando || filtrados.length === 0}
              onClick={() => descargar('todos')}
            >
              <DownloadIcon fontSize="small" aria-hidden />
              Descargar todos ({filtrados.length})
            </button>
          </div>
        </div>
      )}
    </ReporteGeneralPanel>
  );
}
