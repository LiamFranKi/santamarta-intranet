/**
 * Mismo HTML que backend/utils/cumpleanosMarcoHtml.js (vista previa admin).
 * Si cambias el marco en el servidor, mantén esto alineado.
 */

const MARCO_ATTR = 'data-cumple-marco="1"';

export function tieneMarcoCumpleanos(html) {
  return String(html || '').includes('data-cumple-marco="1"');
}

export function envolverMarcoCumpleanosWeb(innerHtml) {
  const inner = String(innerHtml || '').trim();
  if (!inner) return inner;
  if (tieneMarcoCumpleanos(inner)) return inner;

  return (
    `<div class="cumple-marco-festivo" ${MARCO_ATTR} style="position:relative;border-radius:16px;padding:0;overflow:hidden;border:1px solid rgba(251,191,36,0.45);box-shadow:0 8px 28px rgba(245,158,11,0.12),0 0 0 1px rgba(255,255,255,0.5) inset;background:linear-gradient(165deg,#fffbeb 0%,#fff7ed 35%,#ffffff 72%,#fdf2f8 100%);">` +
    `<div class="cumple-marco-festivo__ribbon" aria-hidden="true" style="text-align:center;padding:10px 12px 6px;font-size:1.35rem;line-height:1;letter-spacing:0.25em;opacity:0.92;">🎉 🎂 ✨</div>` +
    `<div class="cumple-marco-festivo__body" style="position:relative;padding:12px 16px 18px;margin:0 10px 12px;border-radius:12px;background:rgba(255,255,255,0.82);border:1px solid rgba(253,224,71,0.35);box-shadow:0 2px 12px rgba(15,23,42,0.04);">` +
    inner +
    `</div></div>`
  );
}
