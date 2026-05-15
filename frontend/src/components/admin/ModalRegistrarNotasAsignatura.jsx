import React, { useState, useEffect } from 'react';
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

  const cargarNotasCurso = async (cursoId, ciclo = null) => {
    try {
      setLoadingNotas(true);
      const cicloACargar = ciclo !== null ? ciclo : cicloSeleccionadoNotas;
      const response = await api.get(`/docente/cursos/${cursoId}/notas`, {
        params: { ciclo: cicloACargar }
      });
      
      setDatosNotas(response.data);
      
      // DEBUG: Ver estructura de datos recibidos
      console.log('📊 [CARGAR NOTAS] Datos recibidos:', response.data);
      if (response.data.alumnos && response.data.alumnos.length > 0) {
        console.log('📊 [CARGAR NOTAS] Primer alumno:', response.data.alumnos[0]);
        console.log('📊 [CARGAR NOTAS] notas_detalladas del primer alumno:', response.data.alumnos[0].notas_detalladas);
      }
      
      // Inicializar notasEditadas con los datos recibidos
      const notasIniciales = {};
      response.data.alumnos.forEach(alumno => {
        notasIniciales[alumno.matricula_id] = {};
        response.data.criterios.forEach(criterio => {
          notasIniciales[alumno.matricula_id][criterio.id] = {};
          
          if (criterio.indicadores && criterio.indicadores.length > 0) {
            criterio.indicadores.forEach(indicador => {
              // La estructura de notas_detalladas es: { [criterio_id]: { [indicador_id]: [notas...] } }
              const notasIndicador = alumno.notas_detalladas?.[criterio.id]?.[indicador.id];
              
              // DEBUG: Ver qué hay en notasIndicador
              if (notasIndicador !== undefined && notasIndicador !== null) {
                console.log(`📊 [CARGAR NOTAS] Alumno ${alumno.matricula_id}, Criterio ${criterio.id}, Indicador ${indicador.id}:`, notasIndicador, 'Tipo:', typeof notasIndicador, 'Es Array:', Array.isArray(notasIndicador));
              }
              
              // Asegurar que notasIndicador sea un array
              let notasArray = [];
              if (Array.isArray(notasIndicador)) {
                // Si es un array, convertir cada elemento a string
                notasArray = notasIndicador.map(nota => {
                  if (nota === null || nota === undefined || nota === '') {
                    return '';
                  }
                  if (typeof nota === 'object') {
                    console.warn('Nota es un objeto inesperado:', nota);
                    return '';
                  }
                  return String(nota);
                });
              } else if (notasIndicador !== null && notasIndicador !== undefined) {
                if (typeof notasIndicador === 'object') {
                  // Si es un objeto, puede ser un array asociativo deserializado de PHP
                  // Intentar convertirlo a array verificando si tiene claves numéricas
                  const claves = Object.keys(notasIndicador);
                  const tieneClavesNumericas = claves.every(clave => /^\d+$/.test(clave));
                  
                  if (tieneClavesNumericas && claves.length > 0) {
                    // Es un objeto con claves numéricas (array asociativo de PHP)
                    // Convertir a array ordenado por índice
                    const maxIndex = Math.max(...claves.map(Number));
                    notasArray = [];
                    for (let i = 0; i <= maxIndex; i++) {
                      const valor = notasIndicador[i];
                      if (valor === null || valor === undefined || valor === '') {
                        notasArray.push('');
                      } else if (typeof valor === 'object') {
                        notasArray.push('');
                      } else {
                        notasArray.push(String(valor));
                      }
                    }
                  } else {
                    // Es un objeto pero no tiene estructura de array, usar array vacío
                    console.warn('notasIndicador es objeto pero no tiene claves numéricas:', notasIndicador);
                    notasArray = [];
                  }
                } else {
                  // Si es un valor primitivo, convertirlo a array con un elemento
                  notasArray = [String(notasIndicador)];
                }
              }
              // Inicializar con el array (puede estar vacío)
              notasIniciales[alumno.matricula_id][criterio.id][indicador.id] = [...notasArray];
            });
          }
        });
        
        // Agregar exámenes mensuales si aplica
        if (response.data.curso.examen_mensual && alumno.examenes_mensuales) {
          notasIniciales[alumno.matricula_id].examen_mensual = { ...alumno.examenes_mensuales };
        }
      });
      
      setNotasEditadas(notasIniciales);
    } catch (error) {
      console.error('Error cargando notas del curso:', error);
      Swal.fire('Error', 'No se pudo cargar las notas del curso', 'error');
      setDatosNotas(null);
    } finally {
      setLoadingNotas(false);
    }
  };

  // Cambiar ciclo y recargar notas
  const cambiarCicloNotas = async (nuevoCiclo) => {
    setCicloSeleccionadoNotas(nuevoCiclo);
    if (asignaturaId) {
      await cargarNotasCurso(asignaturaId, nuevoCiclo);
    }
  };

  // Actualizar nota en el estado local
  const actualizarNota = (matriculaId, criterioId, indicadorId, indice, valor) => {
    setNotasEditadas(prev => {
      const nuevo = { ...prev };
      if (!nuevo[matriculaId]) nuevo[matriculaId] = {};
      if (!nuevo[matriculaId][criterioId]) nuevo[matriculaId][criterioId] = {};
      if (!nuevo[matriculaId][criterioId][indicadorId]) {
        nuevo[matriculaId][criterioId][indicadorId] = [];
      }
      
      const notasIndicador = [...(nuevo[matriculaId][criterioId][indicadorId] || [])];
      while (notasIndicador.length <= indice) {
        notasIndicador.push('');
      }
      notasIndicador[indice] = valor;
      nuevo[matriculaId][criterioId][indicadorId] = notasIndicador;
      
      return nuevo;
    });
    // Forzar re-render para actualizar promedios
    setForceUpdate(prev => prev + 1);
  };

  // Helpers para Cualitativa (letras): convertir letra<->número usando rangos
  const esCualitativa = datosNotas?.curso?.nivel?.tipo_calificacion === 0 ||
    (datosNotas?.curso?.nivel_nombre || '').toUpperCase().includes('INICIAL');
  const rangosLetras = datosNotas?.rangos_letras_primaria || [];

  // Puntaje mayor por letra para promediar: AD=20, A=19, B=18, C=17
  const PUNTAJES_LETRAS = { AD: 20, A: 19, B: 18, C: 17 };
  const letraANumero = (letra) => {
    if (!letra || typeof letra !== 'string') return null;
    const letraNorm = String(letra).trim().toUpperCase();
    if (PUNTAJES_LETRAS[letraNorm] !== undefined) return PUNTAJES_LETRAS[letraNorm];
    for (const r of rangosLetras) {
      if ((r.letra || '').toUpperCase() === letraNorm && r.rango) {
        const [min, max] = r.rango.split('-').map(Number);
        if (!isNaN(min) && !isNaN(max)) return Math.max(min, max);
      }
    }
    return null;
  };

  const numeroALetra = (num) => {
    if (num === null || num === undefined || isNaN(num)) return null;
    const n = parseFloat(num);
    const rounded = Math.round(n);
    if (rounded >= 20) return 'AD';
    if (rounded >= 19) return 'A';
    if (rounded >= 18) return 'B';
    if (rounded >= 17) return 'C';
    for (const r of rangosLetras) {
      if (!r.rango) continue;
      const [min, max] = r.rango.split('-').map(Number);
      if (!isNaN(min) && !isNaN(max) && n >= min && n <= max) return r.letra || null;
    }
    return null;
  };

  const esLetraValida = (val) => {
    if (!val || typeof val !== 'string') return false;
    const letraNorm = String(val).trim().toUpperCase();
    if (letraNorm === '') return true;
    return rangosLetras.some(r => (r.letra || '').toUpperCase() === letraNorm);
  };

  // Solo permite A, B, C, AD para inputs cualitativos (INICIAL)
  const esEntradaValidaCualitativa = (val) => {
    if (val === '') return true;
    const v = String(val).toUpperCase();
    return v === 'A' || v === 'B' || v === 'C' || v === 'AD';
  };

  /** Solo dígitos, máx. 2 caracteres: permite escribir 11 sin bloquear en el primer "1". */
  const sanearEntradaCuantitativaNotasModal = (val) =>
    String(val ?? '').replace(/\D/g, '').slice(0, 2);

  /** Al salir del campo: redondea, limita al rango del nivel y reporta inválidos / fuera de rango. */
  const aplicarCuantitativaAlSalirNotasModal = (raw) => {
    const min = Number(datosNotas?.curso?.nivel?.nota_minima ?? 0);
    const max = Number(datosNotas?.curso?.nivel?.nota_maxima ?? 20);
    const t = String(raw ?? '').trim();
    if (!t) return { texto: '', tipo: null, min, max };
    const n = parseFloat(t);
    if (!Number.isFinite(n)) return { texto: '', tipo: 'invalido', min, max };
    const r = Math.round(n);
    if (r < min || r > max) {
      const clamped = Math.min(max, Math.max(min, r));
      return { texto: String(clamped), tipo: 'fuera', min, max, intentado: r };
    }
    return { texto: String(r), tipo: null, min, max };
  };

  // Calcular promedio de un indicador (usa notasEditadas si existe; si no, datos originales)
  const calcularPromedioIndicador = (matriculaId, criterioId, indicadorId) => {
    let notas = notasEditadas[matriculaId]?.[criterioId]?.[indicadorId];
    if (notas === undefined) {
      const alumno = datosNotas?.alumnos?.find(a => a.matricula_id === matriculaId);
      notas = alumno?.notas_detalladas?.[criterioId]?.[indicadorId];
    }
    if (!Array.isArray(notas)) notas = [];
    if (esCualitativa && rangosLetras.length > 0) {
      const numeros = notas.map(n => letraANumero(n)).filter(x => x !== null);
      if (numeros.length === 0) return null;
      const prom = numeros.reduce((s, x) => s + x, 0) / numeros.length;
      return numeroALetra(prom);
    }
    const notasValidas = notas
      .map(n => parseFloat(n))
      .filter(n => !isNaN(n) && n !== null && n !== '');
    if (notasValidas.length === 0) return null;
    return Math.round(notasValidas.reduce((sum, n) => sum + n, 0) / notasValidas.length);
  };

  // Calcular promedio de un criterio
  const calcularPromedioCriterio = (matriculaId, criterioId) => {
    const criterio = datosNotas?.criterios?.find(c => c.id === criterioId);
    if (!criterio) return null;

    if (criterio.indicadores && criterio.indicadores.length > 0) {
      const promediosIndicadores = criterio.indicadores
        .map(indicador => calcularPromedioIndicador(matriculaId, criterioId, indicador.id))
        .filter(p => p !== null);
      
      if (promediosIndicadores.length === 0) return null;
      
      if (esCualitativa && rangosLetras.length > 0) {
        const numeros = promediosIndicadores.map(p => letraANumero(p)).filter(x => x !== null);
        if (numeros.length === 0) return null;
        const prom = numeros.reduce((s, x) => s + x, 0) / numeros.length;
        return numeroALetra(prom);
      }
      return Math.round(
        promediosIndicadores.reduce((sum, p) => sum + p, 0) / promediosIndicadores.length
      );
    } else {
      if (notasEditadas[matriculaId]?.[criterioId] && 'directa' in notasEditadas[matriculaId][criterioId]) {
        const notaDirecta = notasEditadas[matriculaId][criterioId].directa;
        if (notaDirecta && notaDirecta !== '') {
          if (esCualitativa) return notaDirecta.trim().toUpperCase();
          const nota = parseFloat(notaDirecta);
          return !isNaN(nota) ? Math.round(nota) : null;
        }
        return null;
      }
      const alumno = datosNotas?.alumnos?.find(a => a.matricula_id === matriculaId);
      if (alumno?.notas_criterios?.[criterioId]) {
        if (esCualitativa) return String(alumno.notas_criterios[criterioId]).trim().toUpperCase();
        const nota = parseFloat(alumno.notas_criterios[criterioId]);
        return !isNaN(nota) ? Math.round(nota) : null;
      }
    }
    
    return null;
  };

  // Calcular promedio final del curso usando los pesos de los criterios
  const calcularPromedioFinal = (matriculaId) => {
    if (!datosNotas || !datosNotas.criterios) return null;

    const tipoCalificacionFinal = datosNotas.curso?.nivel?.tipo_calificacion_final || 0;
    
    if (tipoCalificacionFinal === 1) {
      // Porcentual: todos los criterios (y examen mensual) cuentan con su peso; sin nota = 0 en esa parte.
      if (!esCualitativa) {
        let sumaPonderada = 0;
        datosNotas.criterios.forEach((criterio) => {
          const peso = parseFloat(criterio.peso) || 0;
          if (peso <= 0) return;
          const promedioCriterio = calcularPromedioCriterio(matriculaId, criterio.id);
          let notaN = 0;
          if (promedioCriterio !== null && promedioCriterio !== undefined && promedioCriterio !== '') {
            const n = typeof promedioCriterio === 'number' ? promedioCriterio : parseFloat(promedioCriterio);
            if (!isNaN(n)) notaN = n;
          }
          sumaPonderada += (notaN * peso) / 100;
        });

        if (datosNotas.curso.examen_mensual) {
          const pesoExamen = parseFloat(datosNotas.curso.peso_examen_mensual) || 0;
          if (pesoExamen > 0) {
            let examen1;
            let examen2;
            if (notasEditadas[matriculaId]?.examen_mensual?.hasOwnProperty('1')) {
              examen1 = parseFloat(notasEditadas[matriculaId].examen_mensual[1] || 0);
            } else {
              examen1 = parseFloat(
                datosNotas.alumnos.find((a) => a.matricula_id === matriculaId)?.examenes_mensuales?.[1] || 0
              );
            }
            if (notasEditadas[matriculaId]?.examen_mensual?.hasOwnProperty('2')) {
              examen2 = parseFloat(notasEditadas[matriculaId].examen_mensual[2] || 0);
            } else {
              examen2 = parseFloat(
                datosNotas.alumnos.find((a) => a.matricula_id === matriculaId)?.examenes_mensuales?.[2] || 0
              );
            }
            let promEx = 0;
            if (!isNaN(examen1) && !isNaN(examen2) && examen1 > 0 && examen2 > 0) {
              promEx = Math.round((examen1 + examen2) / 2);
            }
            sumaPonderada += (promEx * pesoExamen) / 100;
          }
        }

        const pesoCriterios = datosNotas.criterios.reduce((s, c) => s + (parseFloat(c.peso) || 0), 0);
        const pesoEx = datosNotas.curso.examen_mensual
          ? parseFloat(datosNotas.curso.peso_examen_mensual) || 0
          : 0;
        if (pesoCriterios + pesoEx > 0) {
          return Math.round(sumaPonderada);
        }
        return null;
      }

      // INICIAL / cualitativa con tipo final porcentual: comportamiento anterior (solo criterios con dato)
      let sumaPonderada = 0;
      let sumaPesos = 0;

      datosNotas.criterios.forEach((criterio) => {
        const promedioCriterio = calcularPromedioCriterio(matriculaId, criterio.id);
        const peso = parseFloat(criterio.peso) || 0;

        if (promedioCriterio !== null && peso > 0) {
          sumaPonderada += (promedioCriterio * peso) / 100;
          sumaPesos += peso;
        }
      });

      if (datosNotas.curso.examen_mensual) {
        let examen1;
        let examen2;
        if (notasEditadas[matriculaId]?.examen_mensual?.hasOwnProperty('1')) {
          examen1 = parseFloat(notasEditadas[matriculaId].examen_mensual[1] || 0);
        } else {
          examen1 = parseFloat(
            datosNotas.alumnos.find((a) => a.matricula_id === matriculaId)?.examenes_mensuales?.[1] || 0
          );
        }
        if (notasEditadas[matriculaId]?.examen_mensual?.hasOwnProperty('2')) {
          examen2 = parseFloat(notasEditadas[matriculaId].examen_mensual[2] || 0);
        } else {
          examen2 = parseFloat(
            datosNotas.alumnos.find((a) => a.matricula_id === matriculaId)?.examenes_mensuales?.[2] || 0
          );
        }

        if (!isNaN(examen1) && !isNaN(examen2) && examen1 > 0 && examen2 > 0) {
          const promedioExamen = Math.round((examen1 + examen2) / 2);
          const pesoExamen = datosNotas.curso.peso_examen_mensual || 0;

          if (pesoExamen > 0) {
            sumaPonderada += (promedioExamen * pesoExamen) / 100;
            sumaPesos += pesoExamen;
          }
        }
      }

      if (sumaPesos > 0) {
        if (Math.abs(sumaPesos - 100) < 0.01) {
          return Math.round(sumaPonderada);
        }
        return Math.round((sumaPonderada / sumaPesos) * 100);
      }
    } else {
      // Promedio simple
      const promediosCriterios = datosNotas.criterios
        .map(criterio => calcularPromedioCriterio(matriculaId, criterio.id))
        .filter(p => p !== null);

      if (promediosCriterios.length > 0) {
        if (esCualitativa && rangosLetras.length > 0) {
          const numeros = promediosCriterios.map(p => typeof p === 'string' ? letraANumero(p) : p).filter(x => x !== null);
          if (numeros.length > 0) {
            const prom = numeros.reduce((s, x) => s + x, 0) / numeros.length;
            return numeroALetra(prom);
          }
        }
        let suma = promediosCriterios.reduce((sum, p) => sum + (typeof p === 'number' ? p : parseFloat(p) || 0), 0);
        let count = promediosCriterios.length;

        // Agregar examen mensual si aplica
        if (datosNotas.curso.examen_mensual) {
          // Si hay notas editadas para examen mensual, usar solo esas (incluso si están vacías)
          let examen1, examen2;
          if (notasEditadas[matriculaId]?.examen_mensual?.hasOwnProperty('1')) {
            examen1 = parseFloat(notasEditadas[matriculaId].examen_mensual[1] || 0);
          } else {
            examen1 = parseFloat(datosNotas.alumnos.find(a => a.matricula_id === matriculaId)?.examenes_mensuales?.[1] || 0);
          }
          if (notasEditadas[matriculaId]?.examen_mensual?.hasOwnProperty('2')) {
            examen2 = parseFloat(notasEditadas[matriculaId].examen_mensual[2] || 0);
          } else {
            examen2 = parseFloat(datosNotas.alumnos.find(a => a.matricula_id === matriculaId)?.examenes_mensuales?.[2] || 0);
          }
          
          if (!isNaN(examen1) && !isNaN(examen2) && examen1 > 0 && examen2 > 0) {
            const promedioExamen = Math.round((examen1 + examen2) / 2);
            suma += promedioExamen;
            count += 1;
          }
        }

        return Math.round(suma / count);
      }
    }

    return null;
  };

  const guardarNotas = async () => {
    if (!asignaturaId || !datosNotas) {
      Swal.fire('Error', 'No se ha seleccionado una asignatura', 'error');
      return;
    }

    if (guardandoNotas) {
      return;
    }

    setGuardandoNotas(true);

    try {
      await api.post(
        `/docente/cursos/${asignaturaId}/notas`,
        {
          ciclo: cicloSeleccionadoNotas,
          notas: notasEditadas,
        },
        {
          timeout: 120000,
        },
      );

      Swal.fire({
        title: '¡Guardado!',
        text: 'Las notas se han guardado correctamente',
        icon: 'success',
        confirmButtonText: 'Aceptar',
      });

      await cargarNotasCurso(asignaturaId);
      if (typeof onGuardado === 'function') {
        onGuardado();
      }
    } catch (error) {
      console.error('Error guardando notas:', error);
      Swal.fire('Error', error.response?.data?.error || 'Error al guardar las notas', 'error');
    } finally {
      setGuardandoNotas(false);
    }
  };

  // Imprimir notas en PDF
  const imprimirNotas = () => {
    if (!datosNotas || !datosNotas.alumnos || datosNotas.alumnos.length === 0) {
      Swal.fire({
        title: 'Sin datos',
        text: 'No hay notas para imprimir',
        icon: 'info',
        zIndex: 100001
      });
      return;
    }

    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape para tabla ancha
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - (margin * 2);
    let yPosition = margin;

    // Colores
    const colorHeader = [245, 249, 242]; // #f5f9f2 (verde claro del header)
    const colorBorder = [221, 221, 221]; // #ddd (gris claro)
    const colorText = [51, 51, 51]; // #333
    const colorBlue = [52, 152, 219]; // #3498db (azul para promedios)
    const colorBlueBar = [52, 152, 219]; // #3498db (azul de la barra)
    const colorName = [41, 128, 185]; // #2980b9 (azul para nombres)
    const colorBelowMin = [231, 76, 60]; // #e74c3c (rojo para notas bajas)
    const colorBelowMinBg = [253, 233, 217]; // #fde9d9 (fondo rojo claro)

    // ========== TÍTULO ==========
    const titulo = `${datosNotas.curso.curso_nombre.toUpperCase()} - ${datosNotas.curso.grado}° ${datosNotas.curso.seccion} - ${datosNotas.curso.nivel_nombre.toUpperCase()} - BIMESTRE ${cicloSeleccionadoNotas}`;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colorText);
    doc.text(titulo, margin, yPosition);
    yPosition += 8;

    // ========== BARRA AZUL INFORMATIVA ==========
    doc.setFillColor(...colorBlueBar);
    doc.rect(margin, yPosition, contentWidth, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Ingrese notas de: ${datosNotas.curso.nivel.nota_minima} - ${datosNotas.curso.nivel.nota_maxima}.`, margin + contentWidth / 2, yPosition + 4.5, { align: 'center' });
    yPosition += 10;

    // ========== CALCULAR ANCHOS DE COLUMNAS ==========
    // Calcular el número máximo de cuadros por criterio
    const calcularAnchoCriterio = (criterio) => {
      if (!criterio.indicadores || criterio.indicadores.length === 0) {
        return 12; // Ancho mínimo para nota directa
      }
      // Sumar todos los cuadros de todos los indicadores + espacio para promedio
      const totalCuadros = criterio.indicadores.reduce((sum, ind) => sum + (ind.cuadros || 1), 0);
      // Cada cuadro necesita ~4mm + 1mm de espacio + 6mm para el promedio
      return Math.max(12, (totalCuadros * 4) + totalCuadros + 6);
    };

    const colN = 8; // Ancho columna N°
    const colNombre = 45; // Ancho columna Nombre (reducido para dar más espacio a criterios)
    const colProm = 15; // Ancho columna PROM
    
    // Calcular ancho total de criterios
    let anchoTotalCriterios = 0;
    const anchosCriterios = datosNotas.criterios.map(criterio => {
      const ancho = calcularAnchoCriterio(criterio);
      anchoTotalCriterios += ancho;
      return { criterio, ancho };
    });
    
    // Ancho para examen mensual (si aplica)
    let anchoExamenMensual = 0;
    if (datosNotas.curso.examen_mensual) {
      anchoExamenMensual = 20; // 2 exámenes + promedio
      anchoTotalCriterios += anchoExamenMensual;
    }
    
    // Ancho disponible para criterios
    const anchoDisponible = contentWidth - colN - colNombre - colProm;
    
    // Si los criterios calculados son más anchos que el disponible, escalar proporcionalmente
    let factorEscala = 1;
    if (anchoTotalCriterios > anchoDisponible) {
      factorEscala = anchoDisponible / anchoTotalCriterios;
    }
    
    // Aplicar factor de escala y ajustar para que ocupe todo el espacio
    let anchoTotalAjustado = 0;
    anchosCriterios.forEach(item => {
      item.ancho = Math.max(12, item.ancho * factorEscala);
      anchoTotalAjustado += item.ancho;
    });
    if (datosNotas.curso.examen_mensual) {
      anchoExamenMensual = Math.max(15, anchoExamenMensual * factorEscala);
      anchoTotalAjustado += anchoExamenMensual;
    }
    
    // Ajustar para ocupar todo el espacio disponible
    const diferencia = anchoDisponible - anchoTotalAjustado;
    if (diferencia > 0 && anchosCriterios.length > 0) {
      const ajustePorCriterio = diferencia / (anchosCriterios.length + (datosNotas.curso.examen_mensual ? 1 : 0));
      anchosCriterios.forEach(item => {
        item.ancho += ajustePorCriterio;
      });
      if (datosNotas.curso.examen_mensual) {
        anchoExamenMensual += ajustePorCriterio;
      }
    }

    // Fila 1: N° y NOMBRE
    doc.setFillColor(...colorHeader);
    doc.rect(margin, yPosition, colN, 12, 'F');
    doc.rect(margin + colN, yPosition, colNombre, 12, 'F');
    
    // Fila 1: Criterios (con nombre arriba, porcentaje abajo)
    let xPos = margin + colN + colNombre;
    anchosCriterios.forEach(item => {
      doc.setFillColor(...colorHeader);
      doc.rect(xPos, yPosition, item.ancho, 12, 'F');
      xPos += item.ancho;
    });
    
    // Fila 1: Examen Mensual (si aplica)
    if (datosNotas.curso.examen_mensual) {
      doc.setFillColor(...colorHeader);
      doc.rect(xPos, yPosition, anchoExamenMensual, 12, 'F');
      xPos += anchoExamenMensual;
    }
    
    // Fila 1: PROM
    doc.setFillColor(...colorHeader);
    doc.rect(xPos, yPosition, colProm, 12, 'F');

    // Bordes
    doc.setDrawColor(...colorBorder);
    doc.setLineWidth(0.5);
    doc.rect(margin, yPosition, contentWidth, 12);

    // Texto encabezados
    doc.setTextColor(...colorText);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('N°', margin + colN / 2, yPosition + 4, { align: 'center' });
    doc.text('APELLIDOS Y NOMBRES', margin + colN + colNombre / 2, yPosition + 4, { align: 'center' });

    // Criterios - INICIAL: abrev sin porcentaje; No-INICIAL: nombre completo + porcentaje
    xPos = margin + colN + colNombre;
    anchosCriterios.forEach(item => {
      const abrev = (item.criterio.abreviatura || '').trim() || (item.criterio.descripcion || '').substring(0, 25).trim();
      const textoCriterio = esCualitativa ? (abrev || item.criterio.descripcion) : item.criterio.descripcion;
      const mostrarPeso = !esCualitativa && item.criterio.peso != null && item.criterio.peso > 0;
      const nombreCriterio = doc.splitTextToSize(String(textoCriterio).toUpperCase(), item.ancho - 2);
      doc.text(nombreCriterio[0] || String(textoCriterio).toUpperCase(), xPos + item.ancho / 2, yPosition + 3.5, { align: 'center' });
      if (mostrarPeso) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`(${item.criterio.peso}%)`, xPos + item.ancho / 2, yPosition + 8, { align: 'center' });
      }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      xPos += item.ancho;
    });

    // Examen Mensual (si aplica) - INICIAL: EM sin %; No-INICIAL: EXAMEN MENSUAL (X%)
    if (datosNotas.curso.examen_mensual) {
      const textoEM = esCualitativa ? 'EM' : `EXAMEN MENSUAL (${datosNotas.curso.peso_examen_mensual}%)`;
      const nombreExamen = doc.splitTextToSize(textoEM, anchoExamenMensual - 2);
      doc.text(nombreExamen[0] || textoEM, xPos + anchoExamenMensual / 2, yPosition + 4, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      xPos += anchoExamenMensual;
    }

    // PROM
    doc.text('PROM.', xPos + colProm / 2, yPosition + 4, { align: 'center' });

    // Líneas divisorias verticales
    doc.setLineWidth(0.2);
    let xDiv = margin + colN;
    doc.line(xDiv, yPosition, xDiv, yPosition + 12);
    xDiv += colNombre;
    doc.line(xDiv, yPosition, xDiv, yPosition + 12);
    anchosCriterios.forEach(item => {
      xDiv += item.ancho;
      doc.line(xDiv, yPosition, xDiv, yPosition + 12);
    });
    if (datosNotas.curso.examen_mensual) {
      xDiv += anchoExamenMensual;
      doc.line(xDiv, yPosition, xDiv, yPosition + 12);
    }

    yPosition += 12;

    // ========== DATOS DE ALUMNOS ==========
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const alturaFila = 8;

    datosNotas.alumnos.forEach((alumno, index) => {
      // Verificar si necesitamos nueva página
      if (yPosition + alturaFila > pageHeight - 15) {
        doc.addPage();
        yPosition = margin;
        
        // Repetir encabezados
        doc.setFillColor(...colorHeader);
        doc.rect(margin, yPosition, colN, 12, 'F');
        doc.rect(margin + colN, yPosition, colNombre, 12, 'F');
        xPos = margin + colN + colNombre;
        anchosCriterios.forEach(item => {
          doc.rect(xPos, yPosition, item.ancho, 12, 'F');
          xPos += item.ancho;
        });
        if (datosNotas.curso.examen_mensual) {
          doc.rect(xPos, yPosition, anchoExamenMensual, 12, 'F');
          xPos += anchoExamenMensual;
        }
        doc.rect(xPos, yPosition, colProm, 12, 'F');
        
        doc.setDrawColor(...colorBorder);
        doc.rect(margin, yPosition, contentWidth, 12);
        
        doc.setTextColor(...colorText);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('N°', margin + colN / 2, yPosition + 4, { align: 'center' });
        doc.text('APELLIDOS Y NOMBRES', margin + colN + colNombre / 2, yPosition + 4, { align: 'center' });
        xPos = margin + colN + colNombre;
        anchosCriterios.forEach(item => {
          const abrev = (item.criterio.abreviatura || '').trim() || (item.criterio.descripcion || '').substring(0, 25).trim();
          const textoCriterio = esCualitativa ? (abrev || item.criterio.descripcion) : item.criterio.descripcion;
          const mostrarPeso = !esCualitativa && item.criterio.peso != null && item.criterio.peso > 0;
          const nombreCriterio = doc.splitTextToSize(String(textoCriterio).toUpperCase(), item.ancho - 2);
          doc.text(nombreCriterio[0] || String(textoCriterio).toUpperCase(), xPos + item.ancho / 2, yPosition + 3.5, { align: 'center' });
          if (mostrarPeso) {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`(${item.criterio.peso}%)`, xPos + item.ancho / 2, yPosition + 8, { align: 'center' });
          }
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          xPos += item.ancho;
        });
        if (datosNotas.curso.examen_mensual) {
          const textoEM = esCualitativa ? 'EM' : `EXAMEN MENSUAL (${datosNotas.curso.peso_examen_mensual}%)`;
          const nombreExamen = doc.splitTextToSize(textoEM, anchoExamenMensual - 2);
          doc.text(nombreExamen[0] || textoEM, xPos + anchoExamenMensual / 2, yPosition + 4, { align: 'center' });
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          xPos += anchoExamenMensual;
        }
        doc.text('PROM.', xPos + colProm / 2, yPosition + 4, { align: 'center' });
        
        // Líneas divisorias
        doc.setLineWidth(0.2);
        xDiv = margin + colN;
        doc.line(xDiv, yPosition, xDiv, yPosition + 12);
        xDiv += colNombre;
        doc.line(xDiv, yPosition, xDiv, yPosition + 12);
        anchosCriterios.forEach(item => {
          xDiv += item.ancho;
          doc.line(xDiv, yPosition, xDiv, yPosition + 12);
        });
        if (datosNotas.curso.examen_mensual) {
          xDiv += anchoExamenMensual;
          doc.line(xDiv, yPosition, xDiv, yPosition + 12);
        }
        
        yPosition += 12;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
      }

      // Fondo alternado
      if (index % 2 === 0) {
        doc.setFillColor(252, 252, 252); // #fcfcfc
        doc.rect(margin, yPosition, contentWidth, alturaFila, 'F');
      }

      // Borde de fila
      doc.setDrawColor(...colorBorder);
      doc.setLineWidth(0.2);
      doc.rect(margin, yPosition, contentWidth, alturaFila);

      // Líneas divisorias verticales
      doc.setLineWidth(0.1);
      xDiv = margin + colN;
      doc.line(xDiv, yPosition, xDiv, yPosition + alturaFila);
      xDiv += colNombre;
      doc.line(xDiv, yPosition, xDiv, yPosition + alturaFila);
      anchosCriterios.forEach(item => {
        xDiv += item.ancho;
        doc.line(xDiv, yPosition, xDiv, yPosition + alturaFila);
      });
      if (datosNotas.curso.examen_mensual) {
        xDiv += anchoExamenMensual;
        doc.line(xDiv, yPosition, xDiv, yPosition + alturaFila);
      }

      // N°
      doc.setTextColor(...colorText);
      doc.text(alumno.numero.toString(), margin + colN / 2, yPosition + 5.5, { align: 'center' });

      // Nombre
      doc.setTextColor(...colorName);
      const nombreLines = doc.splitTextToSize(alumno.nombre_completo, colNombre - 4);
      doc.text(nombreLines[0] || alumno.nombre_completo, margin + colN + 2, yPosition + 5.5);

      // Criterios - mostrar TODAS las notas individuales
      xPos = margin + colN + colNombre;
      anchosCriterios.forEach(item => {
        const criterio = item.criterio;
        const anchoCriterio = item.ancho;
        const tieneIndicadores = criterio.indicadores && criterio.indicadores.length > 0;
        
        if (tieneIndicadores) {
          // Calcular total de cuadros para centrar correctamente
          const totalCuadros = criterio.indicadores.reduce((sum, ind) => sum + (ind.cuadros || 1), 0);
          const anchoCuadro = 4.5; // Ancho de cada cuadro de nota (más grande)
          const altoCuadro = 5.5; // Alto de cada cuadro
          const espacioEntreCuadros = 0.5; // Espacio entre cuadros
          const anchoPromedio = 5.5; // Ancho del cuadro de promedio
          const espacioAntesPromedio = 1; // Espacio antes del promedio
          const paddingLateralCuadros = 1.5; // Padding lateral adicional para los cuadros
          
          // Calcular ancho total de todos los cuadros + espacios + promedio
          const anchoTotalCuadros = (totalCuadros * anchoCuadro) + ((totalCuadros - 1) * espacioEntreCuadros) + espacioAntesPromedio + anchoPromedio;
          const paddingLateral = Math.max(paddingLateralCuadros, (anchoCriterio - anchoTotalCuadros) / 2); // Padding para centrar (mínimo 1.5mm)
          const paddingVertical = (alturaFila - altoCuadro) / 2; // Padding vertical
          
          // Mostrar TODAS las notas individuales de cada indicador (incluso vacías)
          let xNota = xPos + paddingLateral;
          let cuadroIndex = 0;
          
          criterio.indicadores.forEach(indicador => {
            const cuadros = indicador.cuadros || 1;
            for (let i = 0; i < cuadros; i++) {
              const valor = notasEditadas[alumno.matricula_id]?.[criterio.id]?.[indicador.id]?.[i] || 
                           alumno.notas_detalladas?.[criterio.id]?.[indicador.id]?.[i] || '';
              
              // Dibujar cuadro SIEMPRE (incluso si está vacío)
              doc.setDrawColor(...colorBorder);
              doc.setLineWidth(0.15);
              doc.rect(xNota, yPosition + paddingVertical, anchoCuadro, altoCuadro);
              
              // Mostrar valor solo si existe
              if (valor !== '') {
                doc.setTextColor(...colorText);
                doc.setFontSize(8);
                doc.text(valor.toString(), xNota + anchoCuadro / 2, yPosition + paddingVertical + altoCuadro / 2 + 1.5, { align: 'center' });
              }
              
              xNota += anchoCuadro + espacioEntreCuadros;
              cuadroIndex++;
            }
          });
          
          // Mostrar promedio del criterio al final (centrado)
          const promedioCriterio = calcularPromedioCriterio(alumno.matricula_id, criterio.id);
          const xPromedio = xNota + espacioAntesPromedio;
          
          if (promedioCriterio !== null) {
            const esBajo = promedioCriterio < datosNotas.curso.nivel.nota_aprobatoria;
            
            if (esBajo) {
              doc.setFillColor(...colorBelowMinBg);
              doc.rect(xPromedio, yPosition + paddingVertical, anchoPromedio, altoCuadro, 'F');
              doc.setTextColor(...colorBelowMin);
            } else {
              doc.setFillColor(249, 249, 249); // #f9f9f9
              doc.rect(xPromedio, yPosition + paddingVertical, anchoPromedio, altoCuadro, 'F');
              doc.setTextColor(...colorBlue);
            }
            doc.setDrawColor(...colorBorder);
            doc.setLineWidth(0.15);
            doc.rect(xPromedio, yPosition + paddingVertical, anchoPromedio, altoCuadro);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text(promedioCriterio.toString(), xPromedio + anchoPromedio / 2, yPosition + paddingVertical + altoCuadro / 2 + 1.5, { align: 'center' });
            doc.setFont('helvetica', 'normal');
          } else {
            // Dibujar cuadro vacío para el promedio si no hay valor
            doc.setDrawColor(...colorBorder);
            doc.setLineWidth(0.15);
            doc.rect(xPromedio, yPosition + paddingVertical, anchoPromedio, altoCuadro);
          }
        } else {
          // Nota directa
          const notaDirecta = notasEditadas[alumno.matricula_id]?.[criterio.id]?.directa || 
                             alumno.notas_criterios?.[criterio.id] || '';
          if (notaDirecta !== '') {
            doc.setTextColor(...colorText);
            doc.setFontSize(8);
            doc.text(notaDirecta, xPos + anchoCriterio / 2, yPosition + 5.5, { align: 'center' });
          }
        }
        
        xPos += anchoCriterio;
      });

      // Examen Mensual (si aplica) - mostrar ambos exámenes (siempre, incluso vacíos)
      if (datosNotas.curso.examen_mensual) {
        const examen1 = notasEditadas[alumno.matricula_id]?.examen_mensual?.[1] || 
                       alumno.examenes_mensuales?.[1] || '';
        const examen2 = notasEditadas[alumno.matricula_id]?.examen_mensual?.[2] || 
                       alumno.examenes_mensuales?.[2] || '';
        const promedioExamen = (() => {
          const e1 = parseFloat(examen1);
          const e2 = parseFloat(examen2);
          if (!isNaN(e1) && !isNaN(e2) && e1 > 0 && e2 > 0) {
            return Math.round((e1 + e2) / 2);
          }
          return null;
        })();

        // Calcular para centrar
        const anchoCuadro = 4.5;
        const altoCuadro = 5.5;
        const espacioEntreCuadros = 0.5;
        const anchoPromedio = 5.5;
        const espacioAntesPromedio = 1;
        const totalExamenes = 2; // Siempre 2 exámenes
        const paddingLateralCuadros = 1.5; // Padding lateral adicional para los cuadros
        
        const anchoTotal = (totalExamenes * anchoCuadro) + ((totalExamenes - 1) * espacioEntreCuadros) + espacioAntesPromedio + anchoPromedio;
        const paddingLateral = Math.max(paddingLateralCuadros, (anchoExamenMensual - anchoTotal) / 2); // Padding para centrar (mínimo 1.5mm)
        const paddingVertical = (alturaFila - altoCuadro) / 2;
        
        // Mostrar ambos exámenes (siempre, incluso si están vacíos)
        let xExamen = xPos + paddingLateral;
        
        // Examen 1
        doc.setDrawColor(...colorBorder);
        doc.setLineWidth(0.15);
        doc.rect(xExamen, yPosition + paddingVertical, anchoCuadro, altoCuadro);
        if (examen1 !== '') {
          doc.setTextColor(...colorText);
          doc.setFontSize(8);
          doc.text(examen1.toString(), xExamen + anchoCuadro / 2, yPosition + paddingVertical + altoCuadro / 2 + 1.5, { align: 'center' });
        }
        xExamen += anchoCuadro + espacioEntreCuadros;
        
        // Examen 2
        doc.setDrawColor(...colorBorder);
        doc.setLineWidth(0.15);
        doc.rect(xExamen, yPosition + paddingVertical, anchoCuadro, altoCuadro);
        if (examen2 !== '') {
          doc.setTextColor(...colorText);
          doc.setFontSize(8);
          doc.text(examen2.toString(), xExamen + anchoCuadro / 2, yPosition + paddingVertical + altoCuadro / 2 + 1.5, { align: 'center' });
        }
        xExamen += anchoCuadro + espacioAntesPromedio;
        
        // Mostrar promedio al final (centrado)
        if (promedioExamen !== null) {
          doc.setFillColor(249, 249, 249);
          doc.rect(xExamen, yPosition + paddingVertical, anchoPromedio, altoCuadro, 'F');
          doc.setDrawColor(...colorBorder);
          doc.setLineWidth(0.15);
          doc.rect(xExamen, yPosition + paddingVertical, anchoPromedio, altoCuadro);
          doc.setTextColor(...colorBlue);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.text(promedioExamen.toString(), xExamen + anchoPromedio / 2, yPosition + paddingVertical + altoCuadro / 2 + 1.5, { align: 'center' });
          doc.setFont('helvetica', 'normal');
        } else {
          // Dibujar cuadro vacío para el promedio
          doc.setDrawColor(...colorBorder);
          doc.setLineWidth(0.15);
          doc.rect(xExamen, yPosition + paddingVertical, anchoPromedio, altoCuadro);
        }
        
        xPos += anchoExamenMensual;
      }

      // PROMEDIO FINAL (centrado con padding - más estrecho)
      const promedioFinal = calcularPromedioFinal(alumno.matricula_id) || alumno.promedio_final;
      const anchoPromedioFinal = 5.5; // Ancho fijo más estrecho (igual que otros promedios)
      const altoPromedioFinal = 5.5;
      const paddingLateralProm = (colProm - anchoPromedioFinal) / 2; // Centrar el cuadro más estrecho
      const paddingVerticalProm = (alturaFila - altoPromedioFinal) / 2;
      
      if (promedioFinal) {
        const esBajo = parseFloat(promedioFinal) < datosNotas.curso.nivel.nota_aprobatoria;
        if (esBajo) {
          doc.setFillColor(...colorBelowMinBg);
          doc.rect(xPos + paddingLateralProm, yPosition + paddingVerticalProm, anchoPromedioFinal, altoPromedioFinal, 'F');
          doc.setTextColor(...colorBelowMin);
        } else {
          doc.setFillColor(249, 249, 249);
          doc.rect(xPos + paddingLateralProm, yPosition + paddingVerticalProm, anchoPromedioFinal, altoPromedioFinal, 'F');
          doc.setTextColor(...colorBlue);
        }
        doc.setDrawColor(...colorBorder);
        doc.setLineWidth(0.15);
        doc.rect(xPos + paddingLateralProm, yPosition + paddingVerticalProm, anchoPromedioFinal, altoPromedioFinal);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(promedioFinal.toString(), xPos + colProm / 2, yPosition + paddingVerticalProm + altoPromedioFinal / 2 + 1.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
      } else {
        // Dibujar cuadro vacío si no hay promedio
        doc.setDrawColor(...colorBorder);
        doc.setLineWidth(0.15);
        doc.rect(xPos + paddingLateralProm, yPosition + paddingVerticalProm, anchoPromedioFinal, altoPromedioFinal);
      }

      yPosition += alturaFila;
    });

    // ========== PIE DE PÁGINA ==========
    const fechaGeneracion = new Date().toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'italic');
    doc.text(`Generado el: ${fechaGeneracion}`, margin, pageHeight - 8);

    // Guardar PDF
    const nombresBimestres = ['I', 'II', 'III', 'IV'];
    const nombreArchivo = `Notas_${datosNotas.curso.curso_nombre.replace(/\s+/g, '_')}_${datosNotas.curso.grado}°_${datosNotas.curso.seccion}_Bimestre_${nombresBimestres[cicloSeleccionadoNotas - 1]}_${new Date().getTime()}.pdf`;
    doc.save(nombreArchivo);

    Swal.fire({
      title: '¡PDF Generado!',
      text: 'El reporte de notas se ha descargado correctamente',
      icon: 'success',
      zIndex: 100001
    });
  };

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
              <div className="modal-notas-overlay" onClick={(e) => {
            if (e.target.classList.contains('modal-notas-overlay')) {
              cerrarModal();
            }
          }}>
            <div className="modal-notas-container" onClick={(e) => e.stopPropagation()}>
              {loadingNotas ? (
                <div className="loading-overlay-notas">
                  <div className="loading-spinner-notas">
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                  </div>
                  <p className="loading-text-notas">Cargando notas...</p>
                </div>
              ) : datosNotas ? (
                <>
                  <div className="modal-notas-header">
                    <h2>
                      {datosNotas.curso.curso_nombre.toUpperCase()} - {datosNotas.curso.grado}° {datosNotas.curso.seccion} - {datosNotas.curso.nivel_nombre.toUpperCase()} - BIMESTRE {cicloSeleccionadoNotas}
                    </h2>
                      <button
                        className="modal-close-btn"
                        onClick={() => {
                          cerrarModal();
                        }}
                      >
                      ✕
                    </button>
                  </div>

                  <div className="modal-notas-body">
                    {/* Selector de Bimestre y Botones */}
                    <div className="notas-controls">
                      <div className="bimestre-selector">
                        <label>Seleccionar Bimestre:</label>
                        <select
                          value={cicloSeleccionadoNotas}
                          onChange={(e) => cambiarCicloNotas(parseInt(e.target.value))}
                          disabled={loadingNotas}
                        >
                          <option value={1}>Bimestre 1</option>
                          <option value={2}>Bimestre 2</option>
                          <option value={3}>Bimestre 3</option>
                          <option value={4}>Bimestre 4</option>
                        </select>
                      </div>
                      
                      {/* Botones de acción */}
                      <div className="notas-actions-top">
                        <button
                          className="btn-cancelar-notas"
                          onClick={() => {
                            cerrarModal();
                          }}
                          disabled={guardandoNotas}
                        >
                          Cancelar
                        </button>
                        <button
                          className="btn-guardar-notas"
                          onClick={guardarNotas}
                          disabled={guardandoNotas}
                        >
                          {guardandoNotas ? '⏳ Guardando...' : '💾 Guardar Datos'}
                        </button>
                        <button
                          className="btn-imprimir-notas"
                          onClick={imprimirNotas}
                          disabled={guardandoNotas || !datosNotas}
                        >
                          🖨️ Imprimir
                        </button>
                      </div>
                    </div>

                    {/* Barra azul informativa */}
                    <div className="blue-bar-notas">
                      {esCualitativa
                        ? `Ingrese notas en letras (${rangosLetras.length > 0 ? rangosLetras.map(r => r.letra).join(', ') : 'A, B, C, AD'}).`
                        : `Ingrese notas de: ${datosNotas?.curso?.nivel?.nota_minima ?? 0} - ${datosNotas?.curso?.nivel?.nota_maxima ?? 20}.`}
                    </div>

                    {/* Tabla de notas */}
                    <div className="notas-table-wrapper">
                      <table className="notas-table">
                        <thead>
                          <tr>
                            <th>N°</th>
                            <th className="col-name">APELLIDOS Y NOMBRES</th>
                            {datosNotas.criterios.map(criterio => {
                              const abrev = (criterio.abreviatura || '').trim() ||
                                (criterio.descripcion || '').substring(0, 25).trim();
                              // INICIAL: solo abreviatura, sin porcentaje. No-INICIAL: nombre completo + porcentaje
                              const mostrarNombreCompleto = !esCualitativa;
                              const mostrarPorcentaje = !esCualitativa && criterio.peso != null && criterio.peso > 0;
                              return (
                                <th key={criterio.id}>
                                  <div className="th-criterio-content">
                                    <span
                                      className="th-indicador-abrev"
                                      title={criterio.descripcion || abrev}
                                    >
                                      {mostrarNombreCompleto ? (criterio.descripcion || abrev) : (abrev || criterio.descripcion)}
                                      {mostrarPorcentaje && ` (${criterio.peso}%)`}
                                    </span>
                                  </div>
                                </th>
                              );
                            })}
                            {datosNotas.curso.examen_mensual && (
                              <th>
                                {esCualitativa
                                  ? 'EM'
                                  : `EXAMEN MENSUAL (${datosNotas.curso.peso_examen_mensual}%)`}
                              </th>
                            )}
                            <th>PROM.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {datosNotas.alumnos.map((alumno) => (
                            <tr key={alumno.matricula_id}>
                              <td>{alumno.numero}</td>
                              <td className="col-name">{alumno.nombre_completo}</td>
                              {datosNotas.criterios.map(criterio => {
                                const promedioCriterio = calcularPromedioCriterio(alumno.matricula_id, criterio.id);
                                const tieneIndicadores = criterio.indicadores && criterio.indicadores.length > 0;
                                
                                return (
                                  <td key={criterio.id}>
                                    {tieneIndicadores ? (
                                      <div className="box-row">
                                        {criterio.indicadores.map(indicador => {
                                          const cuadros = indicador.cuadros || 1;
                                          return Array.from({ length: cuadros }, (_, i) => {
                                            // Primero intentar obtener de notasEditadas (notas editadas pero no guardadas)
                                            const arrEditado = notasEditadas[alumno.matricula_id]?.[criterio.id]?.[indicador.id];
                                            let valorRaw = Array.isArray(arrEditado) && i < arrEditado.length ? arrEditado[i] : undefined;
                                            // Solo si NO fue editado (undefined), usar datos originales. Si el usuario borró, valorRaw es ''
                                            if (valorRaw === undefined) {
                                              const notasOriginales = alumno.notas_detalladas?.[criterio.id]?.[indicador.id];
                                              if (Array.isArray(notasOriginales) && notasOriginales[i] !== undefined) {
                                                valorRaw = notasOriginales[i];
                                              }
                                            }
                                            
                                            // Asegurar que el valor sea un string, no un objeto
                                            let valor = '';
                                            if (valorRaw !== undefined && valorRaw !== null && valorRaw !== '') {
                                              if (typeof valorRaw === 'object') {
                                                // Si es un objeto, no debería pasar, pero por seguridad usar string vacío
                                                console.warn('Valor de nota es un objeto:', valorRaw);
                                                valor = '';
                                              } else {
                                                // Convertir a string
                                                valor = String(valorRaw);
                                              }
                                            }
                                            return (
                                              <input
                                                key={`${indicador.id}-${i}`}
                                                type="text"
                                                className="box"
                                                value={valor}
                                                onChange={(e) => {
                                                  const nuevoValor = e.target.value;
                                                  if (esCualitativa) {
                                                    if (!esEntradaValidaCualitativa(nuevoValor)) return;
                                                    actualizarNota(alumno.matricula_id, criterio.id, indicador.id, i, nuevoValor);
                                                  } else {
                                                    actualizarNota(
                                                      alumno.matricula_id,
                                                      criterio.id,
                                                      indicador.id,
                                                      i,
                                                      sanearEntradaCuantitativaNotasModal(nuevoValor)
                                                    );
                                                  }
                                                }}
                                                onBlur={(e) => {
                                                  if (esCualitativa) {
                                                    const v = (e.target.value || '').trim().toUpperCase();
                                                    if (v && !esEntradaValidaCualitativa(v)) {
                                                      actualizarNota(alumno.matricula_id, criterio.id, indicador.id, i, '');
                                                    } else if (v) {
                                                      actualizarNota(alumno.matricula_id, criterio.id, indicador.id, i, v);
                                                    }
                                                  } else {
                                                    const res = aplicarCuantitativaAlSalirNotasModal(e.target.value);
                                                    if (res.tipo === 'invalido') {
                                                      void Swal.fire({
                                                        icon: 'warning',
                                                        title: 'Nota no válida',
                                                        text: `Ingrese un número entero entre ${res.min} y ${res.max}.`,
                                                        confirmButtonText: 'Entendido'
                                                      });
                                                      actualizarNota(alumno.matricula_id, criterio.id, indicador.id, i, '');
                                                      return;
                                                    }
                                                    if (res.tipo === 'fuera') {
                                                      void Swal.fire({
                                                        icon: 'info',
                                                        title: 'Nota fuera de rango',
                                                        html: `El rango permitido es <strong>${res.min}</strong> a <strong>${res.max}</strong>. El valor (${res.intentado}) se ajustó a <strong>${res.texto}</strong>.`,
                                                        confirmButtonText: 'Entendido'
                                                      });
                                                    }
                                                    actualizarNota(alumno.matricula_id, criterio.id, indicador.id, i, res.texto);
                                                  }
                                                }}
                                                placeholder=""
                                                maxLength={esCualitativa ? 2 : 2}
                                              />
                                            );
                                          });
                                        })}
                                        <div className={`box avg ${promedioCriterio !== null && !esCualitativa && typeof promedioCriterio === 'number' && promedioCriterio < datosNotas.curso.nivel.nota_aprobatoria ? 'below-min' : ''}`}>
                                          {promedioCriterio !== null ? promedioCriterio : ''}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="box-row">
                                        <input
                                          type="text"
                                          className="box"
                                          value={
                                            (notasEditadas[alumno.matricula_id]?.[criterio.id] && 'directa' in notasEditadas[alumno.matricula_id][criterio.id])
                                              ? (notasEditadas[alumno.matricula_id][criterio.id].directa ?? '')
                                              : (alumno.notas_criterios?.[criterio.id] || '')
                                          }
                                          onChange={(e) => {
                                            const nuevoValor = e.target.value;
                                            if (esCualitativa) {
                                              if (!esEntradaValidaCualitativa(nuevoValor)) return;
                                              setNotasEditadas(prev => {
                                                const nuevo = { ...prev };
                                                if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                                if (!nuevo[alumno.matricula_id][criterio.id]) nuevo[alumno.matricula_id][criterio.id] = {};
                                                nuevo[alumno.matricula_id][criterio.id].directa = nuevoValor;
                                                return nuevo;
                                              });
                                              setForceUpdate(prev => prev + 1);
                                            } else {
                                              const limpio = sanearEntradaCuantitativaNotasModal(nuevoValor);
                                              setNotasEditadas(prev => {
                                                const nuevo = { ...prev };
                                                if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                                if (!nuevo[alumno.matricula_id][criterio.id]) nuevo[alumno.matricula_id][criterio.id] = {};
                                                nuevo[alumno.matricula_id][criterio.id].directa = limpio;
                                                return nuevo;
                                              });
                                              setForceUpdate(prev => prev + 1);
                                            }
                                          }}
                                          onBlur={(e) => {
                                            if (esCualitativa) {
                                              const v = (e.target.value || '').trim().toUpperCase();
                                              if (v && !esEntradaValidaCualitativa(v)) {
                                                setNotasEditadas(prev => {
                                                  const nuevo = { ...prev };
                                                  if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                                  if (!nuevo[alumno.matricula_id][criterio.id]) nuevo[alumno.matricula_id][criterio.id] = {};
                                                  nuevo[alumno.matricula_id][criterio.id].directa = '';
                                                  return nuevo;
                                                });
                                                setForceUpdate(prev => prev + 1);
                                              } else if (v) {
                                                setNotasEditadas(prev => {
                                                  const nuevo = { ...prev };
                                                  if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                                  if (!nuevo[alumno.matricula_id][criterio.id]) nuevo[alumno.matricula_id][criterio.id] = {};
                                                  nuevo[alumno.matricula_id][criterio.id].directa = v;
                                                  return nuevo;
                                                });
                                                setForceUpdate(prev => prev + 1);
                                              }
                                            } else {
                                              const res = aplicarCuantitativaAlSalirNotasModal(e.target.value);
                                              if (res.tipo === 'invalido') {
                                                void Swal.fire({
                                                  icon: 'warning',
                                                  title: 'Nota no válida',
                                                  text: `Ingrese un número entero entre ${res.min} y ${res.max}.`,
                                                  confirmButtonText: 'Entendido'
                                                });
                                                setNotasEditadas(prev => {
                                                  const nuevo = { ...prev };
                                                  if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                                  if (!nuevo[alumno.matricula_id][criterio.id]) nuevo[alumno.matricula_id][criterio.id] = {};
                                                  nuevo[alumno.matricula_id][criterio.id].directa = '';
                                                  return nuevo;
                                                });
                                                setForceUpdate(prev => prev + 1);
                                                return;
                                              }
                                              if (res.tipo === 'fuera') {
                                                void Swal.fire({
                                                  icon: 'info',
                                                  title: 'Nota fuera de rango',
                                                  html: `El rango permitido es <strong>${res.min}</strong> a <strong>${res.max}</strong>. El valor (${res.intentado}) se ajustó a <strong>${res.texto}</strong>.`,
                                                  confirmButtonText: 'Entendido'
                                                });
                                              }
                                              setNotasEditadas(prev => {
                                                const nuevo = { ...prev };
                                                if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                                if (!nuevo[alumno.matricula_id][criterio.id]) nuevo[alumno.matricula_id][criterio.id] = {};
                                                nuevo[alumno.matricula_id][criterio.id].directa = res.texto;
                                                return nuevo;
                                              });
                                              setForceUpdate(prev => prev + 1);
                                            }
                                          }}
                                          placeholder=""
                                          maxLength={esCualitativa ? 2 : 2}
                                        />
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                              {datosNotas.curso.examen_mensual && (
                                <td>
                                  <div className="box-row">
                                    <input
                                      type="text"
                                      className="box"
                                      value={
                                        (notasEditadas[alumno.matricula_id]?.examen_mensual && '1' in notasEditadas[alumno.matricula_id].examen_mensual)
                                          ? (notasEditadas[alumno.matricula_id].examen_mensual[1] ?? '')
                                          : (alumno.examenes_mensuales?.[1] || '')
                                      }
                                      onChange={(e) => {
                                        const nuevoValor = e.target.value;
                                        if (esCualitativa) {
                                          if (!esEntradaValidaCualitativa(nuevoValor)) return;
                                        }
                                        const valorCampo = esCualitativa
                                          ? nuevoValor
                                          : sanearEntradaCuantitativaNotasModal(nuevoValor);
                                        setNotasEditadas(prev => {
                                          const nuevo = { ...prev };
                                          if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                          if (!nuevo[alumno.matricula_id].examen_mensual) nuevo[alumno.matricula_id].examen_mensual = {};
                                          nuevo[alumno.matricula_id].examen_mensual[1] = valorCampo;
                                          return nuevo;
                                        });
                                        setForceUpdate(prev => prev + 1);
                                      }}
                                      onBlur={(e) => {
                                        if (esCualitativa) {
                                          const v = (e.target.value || '').trim().toUpperCase();
                                          setNotasEditadas(prev => {
                                            const nuevo = { ...prev };
                                            if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                            if (!nuevo[alumno.matricula_id].examen_mensual) nuevo[alumno.matricula_id].examen_mensual = {};
                                            if (v && !esEntradaValidaCualitativa(v)) {
                                              nuevo[alumno.matricula_id].examen_mensual[1] = '';
                                            } else {
                                              nuevo[alumno.matricula_id].examen_mensual[1] = v;
                                            }
                                            return nuevo;
                                          });
                                          setForceUpdate(prev => prev + 1);
                                          return;
                                        }
                                        const res = aplicarCuantitativaAlSalirNotasModal(e.target.value);
                                        if (res.tipo === 'invalido') {
                                          void Swal.fire({
                                            icon: 'warning',
                                            title: 'Nota no válida',
                                            text: `Ingrese un número entero entre ${res.min} y ${res.max}.`,
                                            confirmButtonText: 'Entendido'
                                          });
                                          setNotasEditadas(prev => {
                                            const nuevo = { ...prev };
                                            if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                            if (!nuevo[alumno.matricula_id].examen_mensual) nuevo[alumno.matricula_id].examen_mensual = {};
                                            nuevo[alumno.matricula_id].examen_mensual[1] = '';
                                            return nuevo;
                                          });
                                          setForceUpdate(prev => prev + 1);
                                          return;
                                        }
                                        if (res.tipo === 'fuera') {
                                          void Swal.fire({
                                            icon: 'info',
                                            title: 'Nota fuera de rango',
                                            html: `El rango permitido es <strong>${res.min}</strong> a <strong>${res.max}</strong>. El valor (${res.intentado}) se ajustó a <strong>${res.texto}</strong>.`,
                                            confirmButtonText: 'Entendido'
                                          });
                                        }
                                        setNotasEditadas(prev => {
                                          const nuevo = { ...prev };
                                          if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                          if (!nuevo[alumno.matricula_id].examen_mensual) nuevo[alumno.matricula_id].examen_mensual = {};
                                          nuevo[alumno.matricula_id].examen_mensual[1] = res.texto;
                                          return nuevo;
                                        });
                                        setForceUpdate(prev => prev + 1);
                                      }}
                                      placeholder=""
                                      maxLength={2}
                                    />
                                    <input
                                      type="text"
                                      className="box"
                                      value={
                                        (notasEditadas[alumno.matricula_id]?.examen_mensual && '2' in notasEditadas[alumno.matricula_id].examen_mensual)
                                          ? (notasEditadas[alumno.matricula_id].examen_mensual[2] ?? '')
                                          : (alumno.examenes_mensuales?.[2] || '')
                                      }
                                      onChange={(e) => {
                                        const nuevoValor = e.target.value;
                                        if (esCualitativa) {
                                          if (!esEntradaValidaCualitativa(nuevoValor)) return;
                                        }
                                        const valorCampo = esCualitativa
                                          ? nuevoValor
                                          : sanearEntradaCuantitativaNotasModal(nuevoValor);
                                        setNotasEditadas(prev => {
                                          const nuevo = { ...prev };
                                          if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                          if (!nuevo[alumno.matricula_id].examen_mensual) nuevo[alumno.matricula_id].examen_mensual = {};
                                          nuevo[alumno.matricula_id].examen_mensual[2] = valorCampo;
                                          return nuevo;
                                        });
                                        setForceUpdate(prev => prev + 1);
                                      }}
                                      onBlur={(e) => {
                                        if (esCualitativa) {
                                          const v = (e.target.value || '').trim().toUpperCase();
                                          setNotasEditadas(prev => {
                                            const nuevo = { ...prev };
                                            if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                            if (!nuevo[alumno.matricula_id].examen_mensual) nuevo[alumno.matricula_id].examen_mensual = {};
                                            if (v && !esEntradaValidaCualitativa(v)) {
                                              nuevo[alumno.matricula_id].examen_mensual[2] = '';
                                            } else {
                                              nuevo[alumno.matricula_id].examen_mensual[2] = v;
                                            }
                                            return nuevo;
                                          });
                                          setForceUpdate(prev => prev + 1);
                                          return;
                                        }
                                        const res = aplicarCuantitativaAlSalirNotasModal(e.target.value);
                                        if (res.tipo === 'invalido') {
                                          void Swal.fire({
                                            icon: 'warning',
                                            title: 'Nota no válida',
                                            text: `Ingrese un número entero entre ${res.min} y ${res.max}.`,
                                            confirmButtonText: 'Entendido'
                                          });
                                          setNotasEditadas(prev => {
                                            const nuevo = { ...prev };
                                            if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                            if (!nuevo[alumno.matricula_id].examen_mensual) nuevo[alumno.matricula_id].examen_mensual = {};
                                            nuevo[alumno.matricula_id].examen_mensual[2] = '';
                                            return nuevo;
                                          });
                                          setForceUpdate(prev => prev + 1);
                                          return;
                                        }
                                        if (res.tipo === 'fuera') {
                                          void Swal.fire({
                                            icon: 'info',
                                            title: 'Nota fuera de rango',
                                            html: `El rango permitido es <strong>${res.min}</strong> a <strong>${res.max}</strong>. El valor (${res.intentado}) se ajustó a <strong>${res.texto}</strong>.`,
                                            confirmButtonText: 'Entendido'
                                          });
                                        }
                                        setNotasEditadas(prev => {
                                          const nuevo = { ...prev };
                                          if (!nuevo[alumno.matricula_id]) nuevo[alumno.matricula_id] = {};
                                          if (!nuevo[alumno.matricula_id].examen_mensual) nuevo[alumno.matricula_id].examen_mensual = {};
                                          nuevo[alumno.matricula_id].examen_mensual[2] = res.texto;
                                          return nuevo;
                                        });
                                        setForceUpdate(prev => prev + 1);
                                      }}
                                      placeholder=""
                                      maxLength={2}
                                    />
                                    <div className="box avg">
                                      {(() => {
                                        const examen1 = parseFloat(notasEditadas[alumno.matricula_id]?.examen_mensual?.[1] || alumno.examenes_mensuales?.[1] || 0);
                                        const examen2 = parseFloat(notasEditadas[alumno.matricula_id]?.examen_mensual?.[2] || alumno.examenes_mensuales?.[2] || 0);
                                        if (!isNaN(examen1) && !isNaN(examen2) && examen1 > 0 && examen2 > 0) {
                                          return Math.round((examen1 + examen2) / 2);
                                        }
                                        return '';
                                      })()}
                                    </div>
                                  </div>
                                </td>
                              )}
                              <td>
                                <div className={`box avg final ${(() => {
                                  const promedioFinal = calcularPromedioFinal(alumno.matricula_id);
                                  if (esCualitativa) return '';
                                  return promedioFinal !== null && typeof promedioFinal === 'number' && promedioFinal < datosNotas.curso.nivel.nota_aprobatoria ? 'below-min' : '';
                                })()}`}>
                                  {(() => {
                                    const promedioFinal = calcularPromedioFinal(alumno.matricula_id);
                                    // Si hay notas editadas, usar solo el promedio calculado (no buscar en datos originales)
                                    if (notasEditadas[alumno.matricula_id]) {
                                      return promedioFinal !== null ? promedioFinal : '';
                                    }
                                    // Si no hay notas editadas, usar el promedio del backend o el calculado
                                    return promedioFinal !== null ? promedioFinal : (alumno.promedio_final || '');
                                  })()}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="loading-overlay-notas">
                  <div className="loading-spinner-notas">
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                  </div>
                  <p className="loading-text-notas">No se pudieron cargar las notas</p>
                </div>
              )}
            </div>
          </div>,
    document.body
  );
}
