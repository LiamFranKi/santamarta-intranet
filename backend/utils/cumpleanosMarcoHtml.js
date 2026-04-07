/**
 * Marco visual único para plantillas de cumpleaños (modal, mensaje intranet, envoltorio email).
 * Evita doble envoltorio con data-cumple-marco="1".
 */

const MARCO_ATTR = 'data-cumple-marco="1"';

function tieneMarcoCumpleanos(html) {
  return String(html || '').includes('data-cumple-marco="1"');
}

/**
 * Para modal / mensajes en la app (clases CSS + estilos inline de respaldo).
 */
function envolverMarcoCumpleanosWeb(innerHtml) {
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

/**
 * Versión tolerante a clientes de correo (tablas + estilos inline, sin clases críticas).
 */
function envolverMarcoCumpleanosEmail(innerHtml) {
  const inner = String(innerHtml || '').trim();
  if (!inner) return inner;
  if (tieneMarcoCumpleanos(inner)) return inner;

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" ${MARCO_ATTR} style="max-width:560px;margin:0 auto;border-collapse:collapse;">` +
    `<tr><td style="padding:12px 8px 0;text-align:center;font-size:22px;line-height:1.4;color:#92400e;">🎉 🎂 ✨</td></tr>` +
    `<tr><td style="padding:8px 12px 20px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-radius:14px;border:1px solid #fbbf24;background:linear-gradient(180deg,#fffbeb 0%,#ffffff 55%,#fff1f2 100%);overflow:hidden;">` +
    `<tr><td style="padding:20px 22px 24px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1f2937;">` +
    inner +
    `</td></tr></table></td></tr></table>`
  );
}

module.exports = {
  tieneMarcoCumpleanos,
  envolverMarcoCumpleanosWeb,
  envolverMarcoCumpleanosEmail,
};
