import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import BirthdayWidget from '../../components/BirthdayWidget';
import api from '../../services/api';
import Swal from 'sweetalert2';
import './Dashboard.css';
import './AdminEstadisticas.css';
import AdminUsuariosEquipo from './AdminUsuariosEquipo';
import AdminUsuariosEquipoTabla from './AdminUsuariosEquipoTabla';
import AdminUsuariosAlumnos from './AdminUsuariosAlumnos';
import AdminUsuariosAlumnosTabla from './AdminUsuariosAlumnosTabla';
import AdminUsuariosApoderados from './AdminUsuariosApoderados';
import AdminConfiguracion from './AdminConfiguracion';
import AdminConfigCumpleanos from './AdminConfigCumpleanos';
import AdminMatriculasInscripcion from './AdminMatriculasInscripcion';
import AdminAcademico from './AdminAcademico';
import AdminPsicologiaLista from './AdminPsicologiaLista';
import AdminPsicologiaExpediente from './AdminPsicologiaExpediente';

const coloresPasteles = [
  'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',   // Verde menta
  'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',   // Azul cielo
  'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',   // Naranja suave
  'linear-gradient(135deg, #fce4ec 0%, #f8bbd9 100%)',   // Rosa pastel
  'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',   // Lavanda
  'linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%)',   // Cyan pastel
  'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',   // Ámbar suave
  'linear-gradient(135deg, #efebe9 0%, #d7ccc8 100%)',   // Marrón claro
];

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [kpis, setKpis] = useState(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [errorKpis, setErrorKpis] = useState(null);

  useEffect(() => {
    api.get('/admin/dashboard').then(res => {
      setStats(res.data);
    }).catch(() => setStats(null)).finally(() => setLoadingStats(false));
  }, []);

  // Cargar KPIs de pagos/pensiones para el cuadro por concepto
  useEffect(() => {
    api.get('/admin/estadisticas/kpis')
      .then((res) => setKpis(res.data))
      .catch((err) => setErrorKpis(err.response?.data?.error || 'Error al cargar estadísticas por concepto'))
      .finally(() => setLoadingKpis(false));
  }, []);

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const routeParams = useParams();

  // Mapeo de rutas a títulos y descripciones
  const routeInfo = {
    '/admin/matriculas': {
      title: '📋 Gestión de Matrículas',
      description: 'Administra las matrículas de los alumnos',
      icon: '📋'
    },
    '/admin/usuarios/equipo': {
      title: '👥 Personal',
      description: 'Personal del colegio (docentes, administración, etc.) y tipo de usuario',
      icon: '👥'
    },
    '/admin/usuarios/alumnos': {
      title: '👨‍🎓 Alumnos',
      description: 'Gestiona los alumnos del sistema',
      icon: '👨‍🎓'
    },
    '/admin/usuarios/apoderados': {
      title: '👨‍👩‍👧‍👦 Apoderados',
      description: 'Gestiona los apoderados de los alumnos',
      icon: '👨‍👩‍👧‍👦'
    },
    '/admin/academico/niveles': {
      title: '🎓 Niveles Académicos',
      description: 'Gestiona los niveles académicos (Inicial, Primaria, Secundaria)',
      icon: '🎓'
    },
    '/admin/academico/grados': {
      title: '📚 Grados',
      description: 'Gestiona los grados académicos',
      icon: '📚'
    },
    '/admin/academico/cursos': {
      title: '📖 Cursos',
      description: 'Gestiona los cursos del sistema',
      icon: '📖'
    },
    '/admin/academico/asignaturas': {
      title: '📝 Asignaturas',
      description: 'Gestiona las asignaturas por grupo',
      icon: '📝'
    },
    '/admin/academico/areas': {
      title: '📊 Áreas',
      description: 'Gestiona las áreas académicas',
      icon: '📊'
    },
    '/admin/avatares': {
      title: '🎮 Gamificación',
      description: 'Avatares por bimestre y género con sus accesorios',
      icon: '🎮'
    },
    '/admin/notificaciones': {
      title: '🔔 Notificaciones',
      description: 'Gestiona las notificaciones del sistema',
      icon: '🔔'
    },
    '/admin/comunicaciones/notificaciones': {
      title: '🔔 Notificaciones',
      description: 'Gestiona las notificaciones del sistema',
      icon: '🔔'
    },
    '/admin/comunicaciones/publicaciones': {
      title: '📢 Publicaciones',
      description: 'Gestiona las publicaciones del colegio',
      icon: '📢'
    },
    '/admin/comunicaciones/conexiones': {
      title: '🔗 Conexiones familiares',
      description: 'Gestiona las conexiones entre familias y el colegio',
      icon: '🔗'
    },
    '/admin/comunicaciones/incidencias': {
      title: '⚠️ Incidencias',
      description: 'Registro y seguimiento de incidencias',
      icon: '⚠️'
    },
    '/admin/comunicaciones/actividades': {
      title: '📅 Actividades',
      description: 'Gestiona las actividades escolares',
      icon: '📅'
    },
    '/admin/comunicaciones/comunicados': {
      title: '📣 Comunicados',
      description: 'Gestiona los comunicados oficiales',
      icon: '📣'
    },
    '/admin/herramientas/examenes': {
      title: '📝 Exámenes personal',
      description: 'Herramientas de exámenes y evaluaciones',
      icon: '📝'
    },
    '/admin/herramientas/encuestas': {
      title: '📋 Encuestas',
      description: 'Crea y gestiona encuestas',
      icon: '📋'
    },
    '/admin/herramientas/vocabularios': {
      title: '📖 Vocabularios',
      description: 'Gestiona vocabularios y glosarios',
      icon: '📖'
    },
    '/admin/herramientas/supervision': {
      title: '🎯 Supervisión',
      description: 'Instrumentos de rúbrica, supervisores y registro por docente',
      icon: '🎯'
    },
    '/admin/vanguarcito': {
      title: '🌟 Vanguarcito',
      description: 'Gestiona el módulo Vanguarcito',
      icon: '🌟'
    },
    '/admin/reportes/asistencias': {
      title: '📊 Reportes de Asistencias',
      description: 'Genera reportes de asistencias',
      icon: '📊'
    },
    '/admin/reportes/notas': {
      title: '📊 Reportes de Notas',
      description: 'Genera reportes de notas y calificaciones',
      icon: '📊'
    },
    '/admin/reportes/estadisticas': {
      title: '📈 Estadísticas',
      description: 'Visualiza estadísticas generales del sistema',
      icon: '📈'
    },
    '/admin/config': {
      title: '⚙️ Configuración general',
      description: 'Datos del colegio, recaudo, notas y archivos',
      icon: '⚙️'
    },
    '/admin/config/cumpleanos': {
      title: '🎂 Cumpleaños',
      description: 'Plantillas de felicitaciones automáticas del colegio',
      icon: '🎂'
    },
    '/admin/auditoria': {
      title: '🧾 Auditoría',
      description: 'Visualiza los logs de auditoría del sistema',
      icon: '🧾'
    },
    '/admin/psicologia': {
      title: '🧠 Psicología',
      description: 'Búsqueda de alumnos y expediente (atenciones, derivaciones, actas, PIAR)',
      icon: '🧠'
    }
  };
  
  const currentRouteInfo =
    routeInfo[location.pathname] ||
    (location.pathname.startsWith('/admin/psicologia/alumno')
      ? {
          title: '🧠 Expediente psicológico',
          description: 'Atenciones, derivación, reuniones con familias y PIAR',
          icon: '🧠'
        }
      : {
          title: '📊 Dashboard',
          description: 'Aquí tienes un resumen de tu sistema educativo',
          icon: '📊'
        });

  // Si es una ruta específica de admin (pero NO el dashboard principal), mostrar contenido específico (placeholder)
  const isAdminRoute = location.pathname.startsWith('/admin/') && location.pathname !== '/admin/dashboard';
  
  if (isAdminRoute) {
    if (location.pathname === '/admin/usuarios/equipo') {
      const VistaEquipo =
        searchParams.get('vista') === 'tabla' ? AdminUsuariosEquipoTabla : AdminUsuariosEquipo;
      return (
        <DashboardLayout>
          <div className="dashboard-container">
            <VistaEquipo />
          </div>
        </DashboardLayout>
      );
    }
    if (location.pathname === '/admin/usuarios/alumnos') {
      const VistaAlumnos =
        searchParams.get('vista') === 'tabla' ? AdminUsuariosAlumnosTabla : AdminUsuariosAlumnos;
      return (
        <DashboardLayout>
          <div className="dashboard-container">
            <VistaAlumnos />
          </div>
        </DashboardLayout>
      );
    }
    if (location.pathname === '/admin/usuarios/apoderados') {
      return (
        <DashboardLayout>
          <div className="dashboard-container">
            <AdminUsuariosApoderados />
          </div>
        </DashboardLayout>
      );
    }
    if (location.pathname === '/admin/config') {
      return (
        <DashboardLayout>
          <div className="dashboard-container">
            <AdminConfiguracion />
          </div>
        </DashboardLayout>
      );
    }
    if (location.pathname === '/admin/config/cumpleanos') {
      return (
        <DashboardLayout>
          <div className="dashboard-container">
            <AdminConfigCumpleanos />
          </div>
        </DashboardLayout>
      );
    }
    if (location.pathname === '/admin/matriculas') {
      return (
        <DashboardLayout>
          <div className="dashboard-container">
            <AdminMatriculasInscripcion />
          </div>
        </DashboardLayout>
      );
    }
    if (location.pathname === '/admin/psicologia') {
      return (
        <DashboardLayout>
          <div className="dashboard-container">
            <AdminPsicologiaLista />
          </div>
        </DashboardLayout>
      );
    }
    if (location.pathname.startsWith('/admin/psicologia/alumno/')) {
      const alumnoId = parseInt(routeParams?.alumnoId, 10);
      if (!Number.isFinite(alumnoId)) {
        return (
          <DashboardLayout>
            <div className="dashboard-container">
              <p>Alumno no válido.</p>
            </div>
          </DashboardLayout>
        );
      }
      return (
        <DashboardLayout>
          <div className="dashboard-container">
            <AdminPsicologiaExpediente alumnoId={alumnoId} />
          </div>
        </DashboardLayout>
      );
    }
    if (location.pathname.startsWith('/admin/academico/')) {
      return (
        <DashboardLayout>
          <div className="dashboard-container">
            <AdminAcademico />
          </div>
        </DashboardLayout>
      );
    }

    return (
      <DashboardLayout>
        <div className="dashboard-container">
          <div className="dashboard-welcome">
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
              {currentRouteInfo.icon} {currentRouteInfo.title}
            </h1>
            <p style={{ fontSize: '1.1rem', color: '#6b7280' }}>
              {currentRouteInfo.description}
            </p>
          </div>

          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '3rem',
            marginTop: '2rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚧</div>
            <h2 style={{ color: '#374151', marginBottom: '1rem' }}>
              Módulo en Desarrollo
            </h2>
            <p style={{ color: '#6b7280', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
              Esta funcionalidad está siendo desarrollada. Pronto estará disponible para su uso.
            </p>
            <button
              onClick={() => navigate(user?.tipo === 'PROMOTORIA' ? '/promotoria/dashboard' : '/admin/dashboard')}
              style={{
                marginTop: '2rem',
                padding: '0.75rem 2rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.target.style.transform = 'scale(1.05)'; }}
              onMouseLeave={(e) => { e.target.style.transform = 'scale(1)'; }}
            >
              Volver al Dashboard Principal
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const handleVerDeudas = async (row) => {
    const moneda = kpis?.moneda || stats?.moneda || 'S/';
    const anio = kpis?.anio || stats?.anio_activo || new Date().getFullYear();

    const fmtM = (n) =>
      n == null || n === '' ? '—' : `${moneda} ${parseFloat(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    Swal.fire({ title: 'Cargando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    try {
      const { data } = await api.get('/admin/estadisticas/deudas-por-aula', {
        params: { tipo: row.tipo, anio }
      });
      Swal.close();

      const aulas = (data.aulas || []).slice();
      const titulo = `Saldo por aula — ${data.concepto || row.concepto} (${data.anio || anio})`;

      if (aulas.length === 0) {
        Swal.fire({
          title: titulo,
          html: '<p style="color:#6b7280">No hay datos por aula para este concepto.</p>',
          confirmButtonText: 'Cerrar',
          width: 520,
        });
        return;
      }

      const totalDeuda = aulas.reduce((s, a) => s + (parseFloat(a.deuda_total) || 0), 0);
      const totalPagado = aulas.reduce((s, a) => s + (parseFloat(a.pagado) || 0), 0);
      const totalSaldo = aulas.reduce((s, a) => s + (parseFloat(a.saldo) || 0), 0);
      const conceptoNombre = data.concepto || row.concepto || '';
      const anioResp = data.anio || anio;

      const filasTabla = aulas.map(
        (a, i) => {
          const par = i % 2 === 0;
          const rowBg = par ? 'background:linear-gradient(135deg,#faf8fc 0%,#f5f0fa 100%)' : 'background:linear-gradient(135deg,#f5f0fa 0%,#efe8f5 100%)';
          const aulaEsc = (a.aula || '').replace(/"/g, '&quot;');
          return `<tr style="${rowBg}">
          <td style="text-align:center;padding:12px 14px;border-bottom:1px solid #e8e0e8">${a.aula}</td>
          <td style="text-align:center;padding:12px 14px;border-bottom:1px solid #e8e0e8;font-variant-numeric:tabular-nums">${fmtM(a.deuda_total)}</td>
          <td style="text-align:center;padding:12px 14px;border-bottom:1px solid #e8e0e8;font-variant-numeric:tabular-nums">${fmtM(a.pagado)}</td>
          <td style="text-align:center;padding:12px 14px;border-bottom:1px solid #e8e0e8;font-weight:700;color:#c43e00;font-variant-numeric:tabular-nums">${fmtM(a.saldo)}</td>
          <td class="admin-modal-deudas-ver-col"><button type="button" class="admin-modal-ver-detalle-btn" data-grupo-id="${a.grupo_id}" data-aula="${aulaEsc}" data-tipo="${row.tipo}" data-anio="${anioResp}" data-concepto="${(conceptoNombre).replace(/"/g, '&quot;')}" title="Ver Detalle" aria-label="Ver Detalle">👁️</button></td>
        </tr>`;
        }
      ).join('');

      const notaAula =
        '<p class="admin-estadisticas-modal-hint">Cada fila suma el saldo de los alumnos del aula (tarifa menos monto pagado, sin saldo negativo). El total del pie coincide con el detalle por alumno.</p>';

      const tablaHtml = `
        ${notaAula}
        <div class="admin-modal-deudas-tabla-wrap">
        <table class="admin-modal-deudas-tabla">
          <thead>
            <tr>
              <th>Aula</th>
              <th>Tarifa</th>
              <th>Pagado</th>
              <th>Saldo pendiente</th>
              <th class="admin-modal-deudas-ver-col">Ver</th>
            </tr>
          </thead>
          <tbody>
            ${filasTabla}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>${fmtM(totalDeuda)}</td>
              <td>${fmtM(totalPagado)}</td>
              <td class="admin-modal-deudas-saldo-total">${fmtM(totalSaldo)}</td>
              <td class="admin-modal-deudas-ver-col"></td>
            </tr>
          </tfoot>
        </table>
        </div>
      `;

      const cardsAulasHtml = aulas.map((a, i) => {
        const aulaEsc = (a.aula || '').replace(/"/g, '&quot;');
        const color = coloresPasteles[i % coloresPasteles.length];
        return `
        <div class="admin-modal-aula-card" style="background:${color}">
          <div class="admin-modal-aula-card-header">
            <span class="admin-modal-aula-card-title">${a.aula}</span>
            <button type="button" class="admin-modal-ver-detalle-btn" data-grupo-id="${a.grupo_id}" data-aula="${aulaEsc}" data-tipo="${row.tipo}" data-anio="${anioResp}" data-concepto="${(conceptoNombre).replace(/"/g, '&quot;')}" title="Ver Detalle" aria-label="Ver Detalle">👁️</button>
          </div>
          <div class="admin-modal-aula-card-body">
            <div class="admin-modal-aula-card-row"><span class="admin-modal-aula-card-label">Tarifa</span><span class="admin-modal-aula-card-value">${fmtM(a.deuda_total)}</span></div>
            <div class="admin-modal-aula-card-row"><span class="admin-modal-aula-card-label">Pagado</span><span class="admin-modal-aula-card-value admin-modal-aula-card-pagado">${fmtM(a.pagado)}</span></div>
            <div class="admin-modal-aula-card-row"><span class="admin-modal-aula-card-label">Saldo pendiente</span><span class="admin-modal-aula-card-value admin-modal-aula-card-saldo">${fmtM(a.saldo)}</span></div>
          </div>
        </div>`;
      }).join('');

      const primeraCapaHtml = `<div class="admin-modal-deudas-body" data-tipo="${row.tipo}" data-anio="${anioResp}" data-concepto="${(conceptoNombre).replace(/"/g, '&quot;')}"><div class="admin-modal-deudas-desktop-table">${tablaHtml}</div><div class="admin-modal-deudas-aula-cards">${cardsAulasHtml}</div></div>`;

      const abrirModalSaldoPorAula = () => {
        Swal.fire({
          title: titulo,
          html: primeraCapaHtml,
          width: '92%',
          padding: 0,
          showCloseButton: true,
          showConfirmButton: false,
          customClass: { popup: 'admin-modal-deudas-aula', htmlContainer: 'admin-modal-deudas-html' },
          didOpen: (container) => {
            container.querySelectorAll('.admin-modal-ver-detalle-btn').forEach((btn) => {
              btn.addEventListener('click', async () => {
                const grupoId = btn.getAttribute('data-grupo-id');
                const aula = btn.getAttribute('data-aula') || '';
                const tipo = btn.getAttribute('data-tipo');
                const anioVal = btn.getAttribute('data-anio');
                const concepto = btn.getAttribute('data-concepto') || '';
                if (!grupoId) return;
                Swal.fire({ title: 'Cargando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                try {
                  const { data: res } = await api.get('/admin/estadisticas/deudas-por-aula/alumnos', {
                    params: { tipo, anio: anioVal, grupo_id: grupoId }
                  });
                  Swal.close();
                  const alumnos = res.alumnos || [];
                  const monedaAl = res.moneda || moneda;
                  const fmtAl = (n) => n == null || n === '' ? '—' : `${monedaAl} ${parseFloat(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  const filasAl = alumnos.map((al, idx) => {
                    const par = idx % 2 === 0;
                    const bg = par ? 'background:linear-gradient(135deg,#faf8fc 0%,#f5f0fa 100%)' : 'background:linear-gradient(135deg,#f5f0fa 0%,#efe8f5 100%)';
                    return `<tr style="${bg}"><td style="text-align:center;padding:10px 14px;border-bottom:1px solid #e8e0e8">${al.nombre || '—'}</td><td style="text-align:center;padding:10px 14px;border-bottom:1px solid #e8e0e8;font-variant-numeric:tabular-nums">${fmtAl(al.deuda_total)}</td><td style="text-align:center;padding:10px 14px;border-bottom:1px solid #e8e0e8;font-variant-numeric:tabular-nums">${fmtAl(al.pagado)}</td><td style="text-align:center;padding:10px 14px;border-bottom:1px solid #e8e0e8;font-weight:700;color:#c43e00;font-variant-numeric:tabular-nums">${fmtAl(al.saldo)}</td></tr>`;
                  }).join('');
                  const totalD = alumnos.reduce((s, al) => s + (parseFloat(al.deuda_total) || 0), 0);
                  const totalP = alumnos.reduce((s, al) => s + (parseFloat(al.pagado) || 0), 0);
                  const totalS = alumnos.reduce((s, al) => s + (parseFloat(al.saldo) || 0), 0);
                  const diffNeto = totalD - totalP;
                  const notaPie =
                    Math.abs(diffNeto - totalS) > 0.009
                      ? `<p class="admin-estadisticas-modal-hint admin-modal-deudas-nota-pie">La columna <strong>Saldo pendiente</strong> es la suma fila a fila (mínimo 0). Puede diferir de (Tarifa − Pagado) en ${fmtAl(Math.abs(diffNeto - totalS))} si hubo abonos por encima del monto tarifario en el mismo concepto.</p>`
                      : '';
                  const tablaAl = `
                  <div class="admin-modal-deudas-alumno-desktop-table">
                  <div class="admin-modal-deudas-tabla-wrap">
                  <table class="admin-modal-deudas-tabla admin-modal-deudas-tabla-centrada">
                    <thead><tr><th>Alumno</th><th>Tarifa</th><th>Pagado</th><th>Saldo pendiente</th></tr></thead>
                    <tbody>${filasAl}</tbody>
                    <tfoot><tr style="background:linear-gradient(135deg,#d4c8e8 0%,#c4b0dc 100%);font-weight:700"><td style="text-align:center">Total</td><td style="text-align:center">${fmtAl(totalD)}</td><td style="text-align:center">${fmtAl(totalP)}</td><td class="admin-modal-deudas-saldo-total" style="text-align:center">${fmtAl(totalS)}</td></tr></tfoot>
                  </table>
                  </div>
                  ${notaPie}
                  </div>`;
                  const cardsAlumnosHtml = alumnos.map((al, i) => {
                    const color = coloresPasteles[i % coloresPasteles.length];
                    const nombreEsc = (al.nombre || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    return `
                    <div class="admin-modal-alumno-card" style="background:${color}">
                      <div class="admin-modal-alumno-card-header">
                        <span class="admin-modal-alumno-card-title">${nombreEsc}</span>
                      </div>
                      <div class="admin-modal-alumno-card-body">
                        <div class="admin-modal-alumno-card-row"><span class="admin-modal-alumno-card-label">Tarifa</span><span class="admin-modal-alumno-card-value">${fmtAl(al.deuda_total)}</span></div>
                        <div class="admin-modal-alumno-card-row"><span class="admin-modal-alumno-card-label">Pagado</span><span class="admin-modal-alumno-card-value admin-modal-alumno-card-pagado">${fmtAl(al.pagado)}</span></div>
                        <div class="admin-modal-alumno-card-row"><span class="admin-modal-alumno-card-label">Saldo pendiente</span><span class="admin-modal-alumno-card-value admin-modal-alumno-card-saldo">${fmtAl(al.saldo)}</span></div>
                      </div>
                    </div>`;
                  }).join('');
                  const htmlAlumnos = `<div class="admin-modal-deudas-body"><div class="admin-modal-volver-wrap"><button type="button" class="admin-modal-volver-btn" title="Volver">← Volver</button></div>${tablaAl}<div class="admin-modal-deudas-alumno-cards">${cardsAlumnosHtml}</div></div>`;
                  Swal.fire({
                    title: `Alumnos - ${aula.replace(/&quot;/g, '"')} (${concepto})`,
                    html: htmlAlumnos,
                    width: '92%',
                    padding: 0,
                    showCloseButton: true,
                    showConfirmButton: false,
                    customClass: { popup: 'admin-modal-deudas-aula admin-modal-deudas-alumnos', htmlContainer: 'admin-modal-deudas-html' },
                    didOpen: (c) => {
                      c.querySelector('.admin-modal-volver-btn')?.addEventListener('click', () => {
                        Swal.close();
                        setTimeout(() => abrirModalSaldoPorAula(), 10);
                      });
                    },
                  });
                } catch (e) {
                  Swal.fire({ icon: 'error', title: 'Error', text: e.response?.data?.error || 'No se pudo cargar el detalle de alumnos.', confirmButtonText: 'Cerrar' });
                }
              });
            });
          },
        });
      };

      abrirModalSaldoPorAula();
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.error || 'No se pudo cargar el detalle por aula.',
        confirmButtonText: 'Cerrar',
      });
    }
  };

  const fmt = (n) => (n == null || n === '' ? '—' : typeof n === 'number' ? n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : String(n));
  const fmtMonto = (n, moneda = stats?.moneda || 'S/') => (n == null || n === '' ? '—' : `${moneda} ${parseFloat(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const anio = stats?.anio_activo ?? '—';
  const cards = [
    { key: 'grados', title: 'Total Grados', icon: '📚', value: loadingStats ? '—' : fmt(stats?.total_grados), color: coloresPasteles[0] },
    { key: 'trabajadores', title: 'Total Trabajadores', icon: '👥', value: loadingStats ? '—' : fmt(stats?.total_trabajadores), color: coloresPasteles[1] },
    { key: 'alumnos', title: 'Total Alumnos', icon: '👨‍🎓', value: loadingStats ? '—' : fmt(stats?.total_alumnos), color: coloresPasteles[2] },
    { key: 'apoderados', title: 'Total Apoderados', icon: '👨‍👩‍👧‍👦', value: loadingStats ? '—' : fmt(stats?.total_apoderados), color: coloresPasteles[3] },
    {
      key: 'presupuesto',
      title: `Presupuesto Anual (${anio})`,
      subtitle: 'Suma de tarifas (matrícula + pensiones)',
      icon: '📋',
      value: loadingStats ? '—' : (stats?.presupuesto_anual != null ? fmtMonto(stats.presupuesto_anual) : '—'),
      color: coloresPasteles[4],
    },
    {
      key: 'ingresos',
      title: `Total Ingresos (${anio})`,
      subtitle: 'Suma de montos tarifarios (sin mora)',
      icon: '💰',
      value: loadingStats ? '—' : fmtMonto(stats?.total_ingresos),
      color: coloresPasteles[5],
    },
    {
      key: 'deuda',
      title: `Total Deuda (${anio})`,
      subtitle: 'Presupuesto − ingresos (solo monto)',
      icon: '⚠️',
      value: loadingStats ? '—' : fmtMonto(stats?.total_deuda),
      color: coloresPasteles[6],
    },
    {
      key: 'deudas_ant',
      title: 'Deudas Anteriores',
      subtitle: 'Años previos (tarifa vs monto)',
      icon: '📜',
      value: loadingStats ? '—' : fmtMonto(stats?.deudas_anteriores),
      color: coloresPasteles[7],
    },
  ];

  return (
    <DashboardLayout>
      <BirthdayWidget comunicadoAbierto={false} />
      <div className="dashboard-container">
        <div className="admin-stats-grid">
          {cards.map((card) => (
            <div key={card.key} className="admin-stat-card" style={{ background: card.color }}>
              <div className="admin-stat-icon">{card.icon}</div>
              <div className="admin-stat-content">
                <h3 className="admin-stat-title">{card.title}</h3>
                {card.subtitle && <span className="admin-stat-subtitle">{card.subtitle}</span>}
                <div className="admin-stat-value">{card.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Cuadro de Estadísticas por Matrícula y Meses (pagos/pensiones) */}
        {(user?.tipo === 'ADMINISTRADOR' || user?.tipo === 'PROMOTORIA') && (
          <div className="admin-estadisticas-content" style={{ marginTop: '0.75rem' }}>
            {errorKpis && (
              <div className="admin-estadisticas-error">
                {errorKpis}
              </div>
            )}
            {loadingKpis ? (
              <p className="admin-estadisticas-placeholder">Cargando estadísticas por concepto...</p>
            ) : (
              <>
                {kpis && Array.isArray(kpis.conceptos) && kpis.conceptos.length > 0 ? (
                  <div className="admin-estadisticas-table-wrapper">
                    <h2 className="admin-estadisticas-subtitle">Estadísticas de pagos (matrícula y pensiones)</h2>
                    <p className="admin-estadisticas-lead">
                      Tarifa: monto esperado del concepto. Pagado: solo monto tarifario (sin mora). Saldo pendiente: suma por alumno
                      del faltante respecto a la tarifa (mínimo 0 por alumno).
                    </p>

                    {/* Solo móvil: cards por concepto */}
                    <div className="admin-estadisticas-mobile-cards">
                      {kpis.conceptos.map((row, index) => (
                        <div
                          key={row.tipo}
                          className="admin-estadisticas-concept-card"
                          style={{ background: coloresPasteles[index % coloresPasteles.length] }}
                        >
                          <div className="admin-estadisticas-concept-card-header">
                            <span className="admin-estadisticas-concept-card-title">{row.concepto}</span>
                            <button
                              type="button"
                              className="admin-estadisticas-concept-card-btn"
                              onClick={() => handleVerDeudas(row)}
                              title="Ver Deudas"
                              aria-label="Ver Deudas"
                            >
                              👁️
                            </button>
                          </div>
                          <div className="admin-estadisticas-concept-card-body">
                            <div className="admin-estadisticas-concept-card-row">
                              <span className="admin-estadisticas-concept-card-label">Tarifa total</span>
                              <span className="admin-estadisticas-concept-card-value">{fmtMonto(row.total_pagar, kpis.moneda)}</span>
                            </div>
                            <div className="admin-estadisticas-concept-card-row">
                              <span className="admin-estadisticas-concept-card-label">Pagado</span>
                              <span className="admin-estadisticas-concept-card-value admin-estadisticas-concept-card-pagado">{fmtMonto(row.pagado, kpis.moneda)}</span>
                            </div>
                            <div className="admin-estadisticas-concept-card-row">
                              <span className="admin-estadisticas-concept-card-label">Saldo pendiente</span>
                              <span className="admin-estadisticas-concept-card-value admin-estadisticas-concept-card-saldo">{fmtMonto(row.deuda, kpis.moneda)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Solo escritorio: tabla + gráfico */}
                    <div className="admin-estadisticas-desktop">
                    <div className="admin-estadisticas-table-card">
                      <table className="admin-estadisticas-table">
                        <thead>
                          <tr>
                            <th>Concepto</th>
                            <th>Tarifa total</th>
                            <th>Pagado</th>
                            <th>Saldo pendiente</th>
                            <th className="admin-estadisticas-deudas-col">Ver</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kpis.conceptos.map((row) => (
                            <tr key={row.tipo}>
                              <td>{row.concepto}</td>
                              <td>{fmtMonto(row.total_pagar, kpis.moneda)}</td>
                              <td>{fmtMonto(row.pagado, kpis.moneda)}</td>
                              <td>{fmtMonto(row.deuda, kpis.moneda)}</td>
                              <td className="admin-estadisticas-deudas-col">
                                <button
                                  className="admin-estadisticas-deudas-btn"
                                  type="button"
                                  onClick={() => handleVerDeudas(row)}
                                  title="Ver Deudas"
                                  aria-label="Ver Deudas"
                                >
                                  👁️
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td><strong>Total</strong></td>
                            <td>{fmtMonto(kpis.conceptos.reduce((s, r) => s + (parseFloat(r.total_pagar) || 0), 0), kpis.moneda)}</td>
                            <td>{fmtMonto(kpis.conceptos.reduce((s, r) => s + (parseFloat(r.pagado) || 0), 0), kpis.moneda)}</td>
                            <td>{fmtMonto(kpis.conceptos.reduce((s, r) => s + (parseFloat(r.deuda) || 0), 0), kpis.moneda)}</td>
                            <td className="admin-estadisticas-deudas-col"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Gráfico Pagado vs saldo pendiente por concepto */}
                    <div className="admin-estadisticas-chart-card">
                      <h3 className="admin-estadisticas-chart-title">Pagado vs saldo pendiente por concepto</h3>
                      <div className="admin-estadisticas-chart-legend">
                        <span className="admin-estadisticas-chart-legend-item admin-estadisticas-legend-pagado">Pagado</span>
                        <span className="admin-estadisticas-chart-legend-item admin-estadisticas-legend-deuda">Saldo pendiente</span>
                      </div>
                      <div className="admin-estadisticas-chart-wrapper">
                        {(() => {
                          const conceptos = kpis.conceptos;
                          const maxVal = Math.max(
                            ...conceptos.flatMap(r => [parseFloat(r.pagado) || 0, parseFloat(r.deuda) || 0]),
                            1
                          );
                          const step = maxVal <= 0 ? 1 : Math.ceil(maxVal / 5 / 10000) * 10000;
                          const yMax = Math.ceil(maxVal / step) * step || 1;
                          return (
                            <>
                              <div className="admin-estadisticas-chart-y-axis">
                                {[yMax, yMax * 0.8, yMax * 0.6, yMax * 0.4, yMax * 0.2, 0].map((v, i) => (
                                  <div key={i} className="admin-estadisticas-chart-y-tick">
                                    {v.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                                  </div>
                                ))}
                              </div>
                              <div className="admin-estadisticas-chart-bars-container">
                                {conceptos.map((row) => {
                                  const pagado = parseFloat(row.pagado) || 0;
                                  const deuda = parseFloat(row.deuda) || 0;
                                  const pctPagado = yMax > 0 ? (pagado / yMax) * 100 : 0;
                                  const pctDeuda = yMax > 0 ? (deuda / yMax) * 100 : 0;
                                  return (
                                    <div key={row.tipo} className="admin-estadisticas-chart-group">
                                      <div className="admin-estadisticas-chart-bars">
                                        <div
                                          className="admin-estadisticas-bar admin-estadisticas-bar-pagado"
                                          style={{ height: `${Math.max(pctPagado, 0.5)}%` }}
                                          title={`${row.concepto}: Pagado ${pagado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`}
                                        />
                                        <div
                                          className="admin-estadisticas-bar admin-estadisticas-bar-deuda"
                                          style={{ height: `${Math.max(pctDeuda, 0.5)}%` }}
                                          title={`${row.concepto}: Saldo pendiente ${deuda.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`}
                                        />
                                      </div>
                                      <div className="admin-estadisticas-chart-x-label">{row.concepto}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    </div>
                  </div>
                ) : (
                  <p className="admin-estadisticas-placeholder">No hay datos de estadísticas por concepto disponibles.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default Dashboard;

