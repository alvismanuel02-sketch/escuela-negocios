// Formatos de pesos colombianos y fechas, y escape de texto para HTML.

const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

export function cop(v) {
  const n = Math.round(Number(v) || 0);
  return (n < 0 ? '-$' : '$') + nf.format(Math.abs(n));
}

export function fecha(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fechaLarga(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

export function pct(v, dec = 1) {
  return `${(v * 100).toFixed(dec).replace('.', ',')}%`;
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Lee un valor en pesos escrito con puntos o comas de miles. */
export function leerPesos(texto) {
  const limpio = String(texto ?? '').replace(/[^\d]/g, '');
  return limpio ? parseInt(limpio, 10) : 0;
}
