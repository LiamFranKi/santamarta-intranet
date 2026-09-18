import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import Swal from 'sweetalert2';

export default function AdminCnebPrompt({ apiBase = '/admin/cneb' }) {
  const [prompt, setPrompt] = useState('');
  const [guardado, setGuardado] = useState('');
  const [oficial, setOficial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`${apiBase}/prompt`);
        if (!alive) return;
        setPrompt(data.prompt || '');
        setGuardado(data.prompt || '');
        setOficial(data.prompt_default || data.prompt || '');
      } catch (e) {
        if (alive) {
          Swal.fire({
            icon: 'error',
            title: 'No se pudo leer el prompt',
            text: e.response?.data?.error || e.message,
          });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiBase]);

  const guardar = async () => {
    setSaving(true);
    try {
      await api.put(`${apiBase}/prompt`, { prompt });
      setGuardado(prompt);
      await Swal.fire({
        icon: 'success',
        title: 'Prompt guardado',
        text: 'La IA usará este texto. Debe conservar las variables {{nivel}}, {{competencia}}, {{desempenos}} y {{duracion}}.',
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo guardar',
        text: e.response?.data?.error || e.message,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="cneb-muted">Cargando prompt…</p>;

  return (
    <section className="cneb-panel">
      <div className="cneb-map-toolbar">
        <div>
          <h2>Prompt de la sesión (Gemini)</h2>
          <p>
            El colegio edita este texto. La IA no inventa competencias: solo usa el catálogo que
            usted eligió en la sesión. Si el tema viene vacío, propone uno. Redacta la ficha del
            estudiante y formatea inicio, desarrollo y cierre con negritas y listas.
          </p>
        </div>
        <div className="cneb-map-actions">
          <button type="button" className="cneb-btn ghost" onClick={() => setPrompt(guardado)}>
            Recargar guardado
          </button>
          <button type="button" className="cneb-btn ghost" onClick={() => setPrompt(oficial)}>
            Plantilla original
          </button>
          <button type="button" className="cneb-btn primary" onClick={guardar} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar prompt'}
          </button>
        </div>
      </div>
      <textarea
        className="cneb-prompt"
        rows={22}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        spellCheck={false}
      />
      <p className="cneb-muted">
        Variables: {'{{nivel}}'} {'{{corte_label}}'} {'{{duracion}}'} {'{{area}}'} {'{{competencia}}'}{' '}
        {'{{capacidades}}'} {'{{desempenos}}'} {'{{titulo}}'} {'{{proposito}}'} {'{{apoyos_aula}}'}.
        {'{{apoyos_aula}}'} trae DUA del grupo y, si hay PIAR publicado, los apoyos (sin diagnóstico).
        Si el prompt guardado no la incluye, el servidor la añade igual. Si ya guardó un prompt
        antiguo, pulse «Plantilla original» para incluir título vacío, ficha e inclusión.
      </p>
    </section>
  );
}
