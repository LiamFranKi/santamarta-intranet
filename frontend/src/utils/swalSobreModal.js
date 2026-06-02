import Swal from 'sweetalert2';

/** SweetAlert2 por encima de modales docente (overlay ~100000). Swal v11 ignora zIndex en .fire(). */
export const SwalSobreModal = Swal.mixin({
  target: document.body,
  customClass: { container: 'docente-swal-over-modal' },
  didOpen: (popup) => {
    const root = popup?.closest?.('.swal2-container');
    if (root) root.style.setProperty('z-index', '500000', 'important');
  },
});

export default SwalSobreModal;
