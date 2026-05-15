const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../../pages/DocenteCursos.jsx');
const outPath = path.join(__dirname, 'ModalRegistrarNotasAsignatura.jsx');
const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);

// 1-based line numbers from DocenteCursos.jsx (current file)
const LOGIC_LINE_START = 2314; // const cargarNotasCurso
const LOGIC_LINE_END = 3215; // };  end imprimirNotas
const MODAL_LINE_START = 5216; // <div className="modal-notas-overlay"
const MODAL_LINE_END = 5757; // </div> end overlay

const logic = lines.slice(LOGIC_LINE_START - 1, LOGIC_LINE_END).join('\n');
let modal = lines.slice(MODAL_LINE_START - 1, MODAL_LINE_END).join('\n');

let logicFixed = logic
  .replace(/if \(!cursoParaNotas \|\| !datosNotas\)/g, 'if (!asignaturaId || !datosNotas)')
  .replace(/\$\{cursoParaNotas\.id\}/g, '${asignaturaId}')
  .replace(/await cargarNotasCurso\(cursoParaNotas\.id\)/g, 'await cargarNotasCurso(asignaturaId)')
  .replace(
    /if \(cursoParaNotas\) \{\s*\n\s*await cargarNotasCurso\(cursoParaNotas\.id, nuevoCiclo\);\s*\n\s*\}/,
    'if (asignaturaId) {\n      await cargarNotasCurso(asignaturaId, nuevoCiclo);\n    }'
  );

// Tras guardar: opcional callback admin
logicFixed = logicFixed.replace(
  /(\/\/ Recargar notas\s*\n\s*await cargarNotasCurso\(asignaturaId\);)/,
  "$1\n\n      if (typeof onGuardado === 'function') {\n        onGuardado();\n      }"
);

// Cerrar modal handlers: quitar props de DocenteCursos
modal = modal.replace(
  /onClick=\{\(e\) => \{\s*if \(e\.target\.classList\.contains\('modal-notas-overlay'\)\) \{\s*setMostrarModalNotas\(false\);\s*\}\s*\}\}/,
  `onClick={(e) => {\n            if (e.target.classList.contains('modal-notas-overlay')) {\n              cerrarModal();\n            }\n          }}`
);

modal = modal.replace(
  /setMostrarModalNotas\(false\);\s*\n\s*setCursoParaNotas\(null\);\s*\n\s*setDatosNotas\(null\);\s*\n\s*setNotasEditadas\(\{\}\)/g,
  'cerrarModal()'
);

modal = modal.replace(/setMostrarModalNotas\(false\)/g, 'cerrarModal()');
modal = modal.replace(/setCursoParaNotas\(null\);\s*\n\s*/g, '');
modal = modal.replace(/setDatosNotas\(null\);\s*\n\s*setNotasEditadas\(\{\}\);\s*\n\s*/g, '');

const header = `import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { jsPDF } from 'jspdf';
import '../../pages/DocenteCursos.css';

/**
 * Misma ventana de "Registrar Notas" que DocenteCursos (API /docente/cursos/:id/notas).
 * Uso: Administrador en Académico → Asignaturas sin navegar a perfil docente.
 */
export default function ModalRegistrarNotasAsignatura({ open, asignaturaId, onClose, onGuardado }) {
  const [loadingNotas, setLoadingNotas] = useState(false);
  const [guardandoNotas, setGuardandoNotas] = useState(false);
  const [datosNotas, setDatosNotas] = useState(null);
  const [notasEditadas, setNotasEditadas] = useState({});
  const [cicloSeleccionadoNotas, setCicloSeleccionadoNotas] = useState(1);
  const [, setForceUpdate] = useState(0);

`;

const middle = `

  const cerrarModal = () => {
    setDatosNotas(null);
    setNotasEditadas({});
    setCicloSeleccionadoNotas(1);
    onClose();
  };

  useEffect(() => {
    if (!open || asignaturaId == null || String(asignaturaId).trim() === '') {
      return;
    }
    setCicloSeleccionadoNotas(1);
    cargarNotasCurso(asignaturaId, 1);
  }, [open, asignaturaId]);

  if (!open || asignaturaId == null || String(asignaturaId).trim() === '') {
    return null;
  }

  return createPortal(
    ${modal}
    ,
    document.body
  );
}
`;

const full = header + logicFixed + middle;

fs.writeFileSync(outPath, full);
console.log('OK', outPath, full.length);
