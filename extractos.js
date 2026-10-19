// Extractos en PDF: uno por socio o todos en un solo archivo, para descargar o compartir.
// El PDF se arma en el navegador con jsPDF; los datos no salen de la app.
import { describirTasa } from './motor.js';
import { planConEstado } from './modelo.js';
import { cop, fecha, fechaLarga, esc } from './formato.js';
import { ic } from './iconos.js';
import { estado, avatar, vacio, pildoras, accion, aviso } from './ui.js';

const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
let cargaJsPDF = null;

export function precargarPDF() {
  if (!cargaJsPDF) {
    cargaJsPDF = new Promise((ok, mal) => {
      if (window.jspdf?.jsPDF) return ok(window.jspdf.jsPDF);
      const s = document.createElement('script');
      s.src = JSPDF_URL;
      s.onload = () => ok(window.jspdf.jsPDF);
      s.onerror = () => { cargaJsPDF = null; mal(new Error('No se pudo cargar el generador de PDF. Revisa tu conexión a internet.')); };
      document.head.appendChild(s);
    });
  }
  return cargaJsPDF;
}

// ── Colores y medidas (los mismos de los extractos anteriores) ──
const C = {
  tinta: [26, 46, 68], verde: [15, 110, 92], rojo: [165, 50, 30], gris: [107, 114, 128],
  linea: [217, 222, 228], papel: [244, 246, 248], blanco: [255, 255, 255], suave: [250, 251, 252],
};
const ANCHO = 210, ALTO = 297, M = 16, UTIL = ANCHO - 2 * M, PIE = 8;
const TIPOS_MOV = { saldo_inicial: 'Saldo inicial', aporte: 'Aportes', retiro: 'Retiros', utilidad: 'Utilidades asignadas', ajuste: 'Ajustes' };

class Hoja {
  constructor(JsPDF) {
    this.doc = new JsPDF({ unit: 'mm', format: 'a4' });
    this.y = M;
  }
  color(c) { this.doc.setTextColor(...c); }
  fuente(tam, estilo = 'normal', c = C.tinta) { this.doc.setFont('helvetica', estilo); this.doc.setFontSize(tam); this.color(c); }
  alto(tam) { return tam * 0.3528 * 1.4; }
  asegurar(h) {
    if (this.y + h > ALTO - M - PIE) { this.doc.addPage(); this.y = M; return true; }
    return false;
  }
  texto(t, tam = 9.5, estilo = 'normal', c = C.tinta, ancho = UTIL, x = M) {
    this.fuente(tam, estilo, c);
    const lineas = this.doc.splitTextToSize(String(t), ancho);
    const h = this.alto(tam);
    for (const l of lineas) { this.asegurar(h); this.doc.text(l, x, this.y + h * 0.75); this.y += h; }
  }
  espacio(h) { this.y += h; }
  titulo(t) {
    this.asegurar(14);
    this.espacio(2);
    this.fuente(10, 'bold', C.verde);
    this.doc.text(t.toUpperCase(), M, this.y + 4);
    this.y += 7;
  }
  cajas(items, h = 15) {
    this.asegurar(h + 2);
    const gap = 3, w = (UTIL - gap * (items.length - 1)) / items.length;
    items.forEach(([t, v, c], i) => {
      const x = M + i * (w + gap);
      this.doc.setFillColor(...C.papel); this.doc.rect(x, this.y, w, h, 'F');
      this.fuente(7.5, 'normal', C.gris); this.doc.text(t, x + 3, this.y + 4.8);
      this.fuente(h > 14 ? 13 : 10.5, 'bold', c || C.tinta); this.doc.text(v, x + 3, this.y + h - 3.5);
    });
    this.y += h + 3;
  }
  /** cols: [{ t, w, a: 'l'|'r'|'c' }]; filas: arrays de texto; opciones: cabeza (color), estilos por fila. */
  tabla(cols, filas, { cabeza = C.tinta, estilos = [], total = null } = {}) {
    const hf = 6.6;
    const anchoTotal = cols.reduce((s, c) => s + c.w, 0);
    const esc_ = UTIL / anchoTotal;
    const xs = []; let acc = M;
    for (const c of cols) { xs.push(acc); acc += c.w * esc_; }
    const celda = (txt, i, y, estilo, color) => {
      const c = cols[i], w = c.w * esc_;
      this.fuente(8, estilo, color);
      const a = c.a || 'l';
      const x = a === 'r' ? xs[i] + w - 2 : a === 'c' ? xs[i] + w / 2 : xs[i] + 2;
      this.doc.text(String(txt), x, y, { align: a === 'r' ? 'right' : a === 'c' ? 'center' : 'left' });
    };
    const encabezado = () => {
      this.doc.setFillColor(...cabeza); this.doc.rect(M, this.y, UTIL, hf, 'F');
      cols.forEach((c, i) => celda(c.t, i, this.y + 4.4, 'bold', C.blanco));
      this.y += hf;
    };
    this.asegurar(hf * 2);
    encabezado();
    filas.forEach((f, k) => {
      if (this.asegurar(hf)) encabezado();
      const st = estilos[k] || {};
      if (k % 2 === 1 && !st.sinFondo) { this.doc.setFillColor(...C.suave); this.doc.rect(M, this.y, UTIL, hf, 'F'); }
      f.forEach((t, i) => celda(t, i, this.y + 4.4, st.negrita?.includes(i) ? 'bold' : st.cursiva ? 'italic' : 'normal', st.colores?.[i] || (st.cursiva ? C.gris : C.tinta)));
      this.doc.setDrawColor(...C.linea); this.doc.setLineWidth(0.15); this.doc.line(M, this.y + hf, M + UTIL, this.y + hf);
      this.y += hf;
    });
    if (total) {
      if (this.asegurar(hf)) encabezado();
      this.doc.setDrawColor(...cabeza); this.doc.setLineWidth(0.4); this.doc.line(M, this.y, M + UTIL, this.y);
      total.forEach((t, i) => celda(t, i, this.y + 4.4, 'bold', C.tinta));
      this.y += hf;
    }
    this.y += 2;
  }
  pies(izq) {
    const n = this.doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      this.doc.setPage(i);
      this.doc.setDrawColor(...C.linea); this.doc.setLineWidth(0.2);
      this.doc.line(M, ALTO - M + 1, ANCHO - M, ALTO - M + 1);
      this.fuente(7, 'normal', C.gris);
      this.doc.text(izq, M, ALTO - M + 5);
      this.doc.text(`Página ${i} de ${n}`, ANCHO - M, ALTO - M + 5, { align: 'right' });
    }
  }
}

function encabezadoSocio(h, x) {
  h.fuente(8.5, 'bold', C.verde); h.doc.text('ESCUELA DE NEGOCIOS', M, h.y + 3);
  h.fuente(8, 'normal', C.gris); h.doc.text('Fondo colaborativo de ahorro y préstamos', M, h.y + 7);
  h.y += 13;
  h.fuente(19, 'bold', C.tinta); h.doc.text(x.nombre, M, h.y + 5);
  h.y += 9;
  h.fuente(9, 'normal', C.gris); h.doc.text(`Extracto con corte al ${fechaLarga(estado.corte)}`, M, h.y + 2);
  h.y += 5;
  h.doc.setDrawColor(...C.tinta); h.doc.setLineWidth(0.5); h.doc.line(M, h.y, ANCHO - M, h.y);
  h.y += 4;
}

function seccionCapital(h, x) {
  h.titulo('Composición de tu capital');
  const suma = {};
  for (const m of x.movimientos.filter((mv) => mv.fecha <= estado.corte)) suma[m.tipo] = (suma[m.tipo] || 0) + Number(m.valor);
  const filas = Object.entries(TIPOS_MOV).filter(([k]) => suma[k]).map(([k, t]) => [t, cop(suma[k])]);
  if (x.capital.cruces) filas.push(['Cruzado para pagar tus préstamos', cop(-x.capital.cruces)]);
  if (x.capital.excesos) filas.push(['Pagos de más abonados a tu capital', cop(x.capital.excesos)]);
  if (!filas.length) filas.push(['Sin movimientos de capital registrados', cop(0)]);
  h.tabla([{ t: 'Concepto', w: 140 }, { t: 'Valor', w: 40, a: 'r' }], filas, { total: ['Capital actual', cop(x.capital.total)] });
}

function seccionPrestamo(h, p, x, varios) {
  const l = p.liq;
  const plan = planConEstado(p, estado.corte);
  const respaldo = Number(p.capital_respaldo || 0);
  const tf = p.tasa_fija ? Number(p.tasa_fija) : null;
  h.titulo(varios ? `Préstamo de ${cop(p.monto)}  |  Activo` : 'Tu préstamo  |  Activo');
  h.texto(`Monto desembolsado ${cop(p.monto)} el ${fechaLarga(p.fecha)}.`);
  h.texto(`Tasa aplicada: ${describirTasa(Number(p.monto), respaldo, tf, cop).replace('el capital aportado', 'tu capital aportado')}.`);
  h.texto('Los intereses se calculan día a día sobre el saldo pendiente. Cada abono cubre primero los intereses corridos y el resto reduce el capital.', 9, 'normal', C.gris);
  h.espacio(2);
  if (l.filas.length) {
    const filas = l.filas.map((f) => [fecha(f.fecha), f.dias, cop(f.interes), cop(f.valor) + (f.tipo === 'cruce' ? ' (cruce)' : ''), cop(f.aInt), cop(f.aCap), cop(f.saldo)]);
    const estilos = filas.map(() => ({ negrita: [6] }));
    if (l.corteFila && l.corteFila.dias > 0) {
      filas.push([fecha(l.corteFila.fecha), l.corteFila.dias, cop(l.corteFila.interes), '-', '-', '-', cop(l.capital)]);
      estilos.push({ cursiva: true });
    }
    h.tabla([{ t: 'Fecha', w: 26 }, { t: 'Días', w: 14, a: 'r' }, { t: 'Interés', w: 24, a: 'r' }, { t: 'Abono', w: 34, a: 'r' },
      { t: 'A interés', w: 24, a: 'r' }, { t: 'A capital', w: 24, a: 'r' }, { t: 'Saldo', w: 26, a: 'r' }], filas, { estilos });
    if (l.corteFila && l.corteFila.dias > 0) h.texto(`La última línea no es un pago: son los ${l.corteFila.dias} días de interés corridos desde tu último movimiento hasta la fecha de corte.`, 8, 'italic', C.gris);
  } else {
    h.texto('Aún no registras abonos sobre este préstamo.', 9.5, 'italic', C.gris);
  }
  h.espacio(2);
  h.cajas([
    ['Total abonado', cop(l.efectivo)], ['Cruzado con capital', cop(l.cruzado)], ['Intereses generados', cop(l.totalInt)],
    ['Capital pendiente', cop(l.capital)], ['Total a la fecha', cop(l.deuda), C.rojo],
  ], 12);

  if (plan) {
    const pendientes = plan.cuotas.filter((c) => c.estado !== 'pagada');
    const frecuencia = (p.plan?.cadaDias || 15) === 30 ? 'mensuales' : 'quincenales';
    h.texto(`Tu plan de pagos: ${plan.cuotas.length} cuotas ${frecuencia}, calculadas con tu saldo al ${fecha(plan.desde)}.`, 9.5, 'normal');
    h.espacio(1);
    const ESTADO = { pagada: 'Pagada', parcial: 'Abono parcial', 'parcial-vencida': 'Vencida (parcial)', vencida: 'Vencida', pendiente: 'Pendiente' };
    const filas = plan.cuotas.map((c) => [`${c.n} de ${plan.cuotas.length}`, fecha(c.fecha), cop(c.capital), cop(c.interes), cop(c.cuota), ESTADO[c.estado]]);
    const estilos = plan.cuotas.map((c) => ({ negrita: [4], colores: { 5: c.estado.includes('vencida') ? C.rojo : c.estado === 'pagada' ? C.verde : C.tinta } }));
    h.tabla([{ t: 'Cuota', w: 20 }, { t: 'Fecha de pago', w: 28 }, { t: 'Abono a capital', w: 32, a: 'r' }, { t: 'Intereses', w: 26, a: 'r' },
      { t: 'Valor a pagar', w: 30, a: 'r' }, { t: 'Estado', w: 30, a: 'r' }], filas,
    { cabeza: C.verde, estilos, total: ['', 'TOTAL', cop(plan.cuotas.reduce((s, c) => s + c.capital, 0)), cop(plan.cuotas.reduce((s, c) => s + c.interes, 0)), cop(plan.total), ''] });
    if (plan.vencidas) h.texto(`Tienes ${plan.vencidas} ${plan.vencidas === 1 ? 'cuota vencida' : 'cuotas vencidas'} por ${cop(plan.valorVencido)}. Mientras no pagues, el interés sigue corriendo a ${cop(l.interesDiario)} por día.`, 9, 'bold', C.rojo);
    else if (pendientes.length) h.texto(`Tu próxima cuota es de ${cop(plan.proxima.cuota)} el ${fecha(plan.proxima.fecha)}. Estos valores son válidos si pagas en las fechas indicadas; si te atrasas, el interés sigue corriendo a ${cop(l.interesDiario)} por día.`, 8.5, 'normal', C.gris);
  } else {
    h.texto(`Este préstamo no tiene un plan de cuotas acordado. Cada día suma ${cop(l.interesDiario)} de interés.`, 9, 'normal', C.gris);
  }
  h.espacio(1);
  h.texto(`Puedes abonar más o cancelar antes cuando quieras: si pagas todo hoy son ${cop(l.deuda)}.`, 9.5, 'bold', C.tinta);
}

function extractoSocio(h, x) {
  encabezadoSocio(h, x);
  h.titulo('Tu posición en el fondo');
  h.cajas([
    ['Capital actual', cop(x.capital.total), C.verde],
    ['Deuda vigente', cop(x.deuda), x.deuda > 0 ? C.rojo : C.tinta],
    ['Posición neta', cop(x.neto), x.neto < 0 ? C.rojo : C.tinta],
  ]);
  seccionCapital(h, x);

  const activos = x.prestamos.filter((p) => p.liq.activo).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pagados = x.prestamos.filter((p) => !p.liq.activo);
  if (activos.length) activos.forEach((p) => seccionPrestamo(h, p, x, activos.length > 1));
  else {
    h.titulo('Tus préstamos');
    h.texto('No tienes préstamos vigentes con el fondo.');
    if (x.capital.total > 0) h.texto(`Con ${cop(x.capital.total)} de capital aportado, hoy podrías pedir hasta ese monto al 2% mensual. Si pidieras más, la parte que supere tu capital iría al 5%.`, 9.5, 'normal', C.gris);
  }
  if (pagados.length) {
    h.espacio(2);
    h.texto(`Préstamos ya pagados: ${pagados.map((p) => `${cop(p.monto)} del ${fecha(p.fecha)}`).join('; ')}.`, 8.5, 'normal', C.gris);
  }
  h.espacio(2);
  h.asegurar(12);
  h.doc.setDrawColor(...C.linea); h.doc.setLineWidth(0.2); h.doc.line(M, h.y, ANCHO - M, h.y); h.espacio(2);
  h.texto('Cómo se calcula tu tasa: si el préstamo no supera tu capital aportado, todo va al 2% mensual. Si lo supera, la parte cubierta por tu capital va al 2% y el excedente al 5%. Si no tienes capital aportado, el préstamo va al 10%.', 7.8, 'normal', C.gris);
  h.texto('Si encuentras alguna diferencia con tus registros, avísale a la administración para revisarla.', 7.8, 'normal', C.gris);
}

function nombreArchivo(t) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
}

export async function pdfSocio(x) {
  const JsPDF = await precargarPDF();
  const h = new Hoja(JsPDF);
  extractoSocio(h, x);
  h.pies(`Escuela de Negocios   Extracto de ${x.nombre} al ${fecha(estado.corte)}`);
  return { blob: h.doc.output('blob'), nombre: `Extracto_${nombreArchivo(x.nombre)}_${estado.corte}.pdf` };
}

export async function pdfTodos(socios) {
  const JsPDF = await precargarPDF();
  const h = new Hoja(JsPDF);
  const f = estado.modelo.fondo;
  h.fuente(8.5, 'bold', C.verde); h.doc.text('ESCUELA DE NEGOCIOS', M, h.y + 3);
  h.fuente(8, 'normal', C.gris); h.doc.text('Fondo colaborativo de ahorro y préstamos', M, h.y + 7);
  h.y += 13;
  h.fuente(19, 'bold', C.tinta); h.doc.text('Extractos de los socios', M, h.y + 5); h.y += 9;
  h.fuente(9, 'normal', C.gris); h.doc.text(`Corte al ${fechaLarga(estado.corte)}. ${socios.length} extractos, uno por socio en las páginas siguientes.`, M, h.y + 2); h.y += 5;
  h.doc.setDrawColor(...C.tinta); h.doc.setLineWidth(0.5); h.doc.line(M, h.y, ANCHO - M, h.y); h.y += 4;
  h.titulo('El fondo en cifras');
  h.cajas([['Capital de los socios', cop(f.capital), C.verde], ['En préstamos', cop(f.colocado)], ['Intereses por cobrar', cop(f.interesesPorCobrar)], ['Disponible para prestar', cop(f.disponible)]], 13);
  h.titulo('Resumen por socio');
  h.tabla([{ t: 'Socio', w: 80 }, { t: 'Capital', w: 34, a: 'r' }, { t: 'Deuda', w: 34, a: 'r' }, { t: 'Posición neta', w: 34, a: 'r' }],
    socios.map((x) => [x.nombre, cop(x.capital.total), x.deuda > 0 ? cop(x.deuda) : '-', cop(x.neto)]),
    { estilos: socios.map((x) => ({ colores: { 2: x.deuda > 0 ? C.rojo : C.gris, 3: x.neto < 0 ? C.rojo : C.tinta } })),
      total: ['Total', cop(socios.reduce((s, x) => s + x.capital.total, 0)), cop(socios.reduce((s, x) => s + x.deuda, 0)), cop(socios.reduce((s, x) => s + x.neto, 0))] });
  for (const x of socios) { h.doc.addPage(); h.y = M; extractoSocio(h, x); }
  h.pies(`Escuela de Negocios   Extractos al ${fecha(estado.corte)}`);
  return { blob: h.doc.output('blob'), nombre: `Extractos_Escuela_de_Negocios_${estado.corte}.pdf` };
}

function encabezadoDoc(h, titulo, sub) {
  h.fuente(8.5, 'bold', C.verde); h.doc.text('ESCUELA DE NEGOCIOS', M, h.y + 3);
  h.fuente(8, 'normal', C.gris); h.doc.text('Fondo colaborativo de ahorro y préstamos', M, h.y + 7);
  h.y += 13;
  h.fuente(19, 'bold', C.tinta); h.doc.text(titulo, M, h.y + 5); h.y += 9;
  h.fuente(9, 'normal', C.gris); h.doc.text(sub, M, h.y + 2); h.y += 5;
  h.doc.setDrawColor(...C.tinta); h.doc.setLineWidth(0.5); h.doc.line(M, h.y, ANCHO - M, h.y); h.y += 4;
}

/** Informe de préstamos vigentes: resumen y, por préstamo, cuándo y cómo ha pagado. */
export async function pdfPrestamosVigentes() {
  const JsPDF = await precargarPDF();
  const h = new Hoja(JsPDF);
  const m = estado.modelo;
  const nombre = (p) => m.miembroPorId[p.miembro_id]?.nombre || '';
  const activos = m.activos.slice().sort((a, b) => b.liq.deuda - a.liq.deuda);
  const socios = new Set(activos.map((p) => p.miembro_id)).size;
  const suma = (f) => activos.reduce((s, p) => s + f(p), 0);
  const abonado = (p) => p.liq.efectivo + p.liq.cruzado;

  encabezadoDoc(h, 'Préstamos vigentes', `Corte al ${fechaLarga(estado.corte)}. ${activos.length} préstamos de ${socios} socios.`);
  h.titulo('La cartera en cifras');
  h.cajas([
    ['Prestado', cop(suma((p) => Number(p.monto)))],
    ['Abonado hasta hoy', cop(suma(abonado)), C.verde],
    ['Capital pendiente', cop(suma((p) => p.liq.capital))],
    ['Intereses por cobrar', cop(suma((p) => p.liq.intPend))],
    ['Total por cobrar', cop(suma((p) => p.liq.deuda)), C.rojo],
  ], 13);

  h.titulo('Resumen por préstamo');
  h.tabla([{ t: 'Socio', w: 42 }, { t: 'Préstamo', w: 24, a: 'r' }, { t: 'Desembolso', w: 22 }, { t: 'Abonado', w: 24, a: 'r' },
    { t: 'Capital pend.', w: 25, a: 'r' }, { t: 'Debe hoy', w: 25, a: 'r' }, { t: 'Sin abonar', w: 20, a: 'r' }],
  activos.map((p) => [nombre(p), cop(p.monto), fecha(p.fecha), cop(abonado(p)), cop(p.liq.capital), cop(p.liq.deuda), p.liq.diasSinAbonar === 1 ? '1 día' : `${p.liq.diasSinAbonar} días`]),
  { estilos: activos.map((p) => ({ negrita: [5], colores: { 6: p.franja?.clave === 'aldia' ? C.tinta : C.rojo } })),
    total: ['Total', cop(suma((p) => Number(p.monto))), '', cop(suma(abonado)), cop(suma((p) => p.liq.capital)), cop(suma((p) => p.liq.deuda)), ''] });
  h.texto('"Debe hoy" es el capital pendiente más los intereses corridos hasta la fecha de corte. "Abonado" suma los abonos en dinero y los cruces con capital.', 8, 'normal', C.gris);

  h.doc.addPage(); h.y = M;
  h.fuente(13, 'bold', C.tinta); h.doc.text('Pagos de cada préstamo', M, h.y + 5); h.y += 8;
  h.texto('Cada pago cubre primero los intereses corridos y el resto baja el capital. "Abono" es un pago en dinero (efectivo o transferencia); "Cruce con capital" es un pago descontado del capital que el socio tiene en el fondo.', 8.5, 'normal', C.gris);

  for (const p of activos) {
    const l = p.liq;
    const plan = planConEstado(p, estado.corte);
    h.asegurar(40);
    h.titulo(`${nombre(p)}  |  Préstamo de ${cop(p.monto)}`);
    h.texto(`Desembolsado el ${fechaLarga(p.fecha)}. Tasa: ${describirTasa(Number(p.monto), Number(p.capital_respaldo || 0), p.tasa_fija ? Number(p.tasa_fija) : null, cop)}.`, 9);
    h.texto(plan
      ? `Plan: ${plan.cuotas.length === 1 ? '1 cuota' : `${plan.cuotas.length} cuotas`} ${(p.plan?.cadaDias || 15) === 30 ? (plan.cuotas.length === 1 ? 'mensual' : 'mensuales') : (plan.cuotas.length === 1 ? 'quincenal' : 'quincenales')} desde el ${fecha(plan.desde)}. ${plan.vencidas ? `${plan.vencidas === 1 ? '1 vencida' : `${plan.vencidas} vencidas`}, ${cop(plan.valorVencido)} atrasado.` : plan.proxima ? `Próxima cuota ${cop(plan.proxima.cuota)} el ${fecha(plan.proxima.fecha)}.` : 'Plan completo.'}`
      : 'Sin plan de cuotas acordado.', 9, 'normal', plan?.vencidas ? C.rojo : C.gris);
    h.espacio(1);
    if (l.filas.length) {
      const filas = l.filas.map((f) => [fecha(f.fecha), f.tipo === 'cruce' ? 'Cruce con capital' : 'Abono', cop(f.valor), cop(f.aInt), cop(f.aCap), cop(f.saldo)]);
      h.tabla([{ t: 'Fecha', w: 24 }, { t: 'Cómo pagó', w: 36 }, { t: 'Valor pagado', w: 30, a: 'r' }, { t: 'A interés', w: 28, a: 'r' }, { t: 'A capital', w: 28, a: 'r' }, { t: 'Saldo después', w: 30, a: 'r' }],
        filas, { estilos: l.filas.map((f) => ({ negrita: [2], colores: { 1: f.tipo === 'cruce' ? C.verde : C.tinta } })),
          total: ['', 'Total', cop(l.efectivo + l.cruzado), cop(l.filas.reduce((s, f) => s + f.aInt, 0)), cop(l.filas.reduce((s, f) => s + f.aCap, 0)), ''] });
      const notas = l.filas.filter((f) => f.nota);
      if (notas.length) h.texto(`Notas: ${notas.map((f) => `${fecha(f.fecha)}, ${f.nota}`).join('. ')}.`, 8, 'italic', C.gris);
    } else {
      h.texto('No ha registrado pagos desde el desembolso.', 9, 'italic', C.rojo);
    }
    h.espacio(1);
    h.cajas([
      ['Abonado', cop(l.efectivo)], ['Con cruce', cop(l.cruzado)], ['Capital pendiente', cop(l.capital)],
      ['Intereses pendientes', cop(l.intPend)], ['Debe hoy', cop(l.deuda), C.rojo],
    ], 13);
  }
  h.pies(`Escuela de Negocios   Préstamos vigentes al ${fecha(estado.corte)}`);
  return { blob: h.doc.output('blob'), nombre: `Prestamos_vigentes_${estado.corte}.pdf` };
}

// ── Descargar, ver y compartir ──

function descargar({ blob, nombre }) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function telefonoWhatsApp(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 && d.startsWith('3')) return `57${d}`;
  return d;
}

async function compartir(archivo, texto, telefono) {
  const file = new File([archivo.blob], archivo.nombre, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: archivo.nombre, text: texto });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  descargar(archivo);
  const tel = telefonoWhatsApp(telefono);
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  aviso('Este navegador no deja compartir archivos directo. El PDF se descargó y se abrió WhatsApp: adjúntalo en el chat.');
}

function textoSocio(x) {
  return `Hola ${x.nombre.split(' ')[0]}, te comparto tu extracto de la Escuela de Negocios con corte al ${fecha(estado.corte)}.`;
}

export async function descargarExtracto(x) {
  aviso('Preparando el extracto…');
  descargar(await pdfSocio(x));
}

export async function compartirExtracto(x) {
  await compartir(await pdfSocio(x), textoSocio(x), x.telefono);
}

async function verPDF(promesa) {
  const ventana = window.open('', '_blank');
  try {
    const { blob } = await promesa;
    const url = URL.createObjectURL(blob);
    if (ventana) ventana.location.href = url; else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    if (ventana) ventana.close();
    throw e;
  }
}

// ═══════════════════════ Pantalla de extractos ═══════════════════════

function sociosConExtracto() {
  return estado.modelo.miembros
    .filter((x) => x.activo || x.deuda > 0 || Math.abs(x.capital.total) > 0.5)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function vistaExtractos(el) {
  precargarPDF().catch(() => {});
  const todos = sociosConExtracto();
  const f = estado.filtroExtractos || 'todos';
  const q = (estado.extBusqueda || '').trim().toLowerCase();
  const conDeuda = todos.filter((x) => x.deuda > 0);
  const lista = (f === 'deuda' ? conDeuda : todos).filter((x) => !q || x.nombre.toLowerCase().includes(q));

  el.innerHTML = `
  <div class="cabeza"><div><h1 class="h1">Extractos</h1>
    <p class="sub">Estado de cuenta de cada socio con corte al ${fechaLarga(estado.corte)}. Para otra fecha, cámbiala arriba.</p></div></div>

  <section class="tarjeta">
    <div class="ficha">
      <span class="kpi-i" style="margin:0;width:44px;height:44px">${ic('extractos', 22)}</span>
      <div class="ficha-t"><h2 class="h2">Todos los extractos en un solo PDF</h2>
        <p class="sub peq">${todos.length} socios, una sección por socio y una primera página con el resumen del fondo. Sirve para enviarlo al grupo o archivarlo.</p></div>
      <div class="acciones">
        <button class="btn" data-todos="descargar">${ic('descargar', 17)}Descargar PDF</button>
        <button class="btn sec" data-todos="compartir">${ic('compartir', 17)}Compartir</button>
        <button class="btn sec" data-todos="ver">${ic('ver', 17)}Ver</button>
      </div>
    </div>
  </section>

  <section class="tarjeta" style="margin-top:16px">
    <div class="ficha">
      <span class="kpi-i azul" style="margin:0;width:44px;height:44px">${ic('prestamos', 22)}</span>
      <div class="ficha-t"><h2 class="h2">Informe de préstamos vigentes</h2>
        <p class="sub peq">${estado.modelo.activos.length} préstamos: cuánto debe cada socio hoy y cuándo y cómo ha pagado (abono o cruce con capital).</p></div>
      <div class="acciones">
        <button class="btn" data-informe="descargar">${ic('descargar', 17)}Descargar PDF</button>
        <button class="btn sec" data-informe="compartir">${ic('compartir', 17)}Compartir</button>
        <button class="btn sec" data-informe="ver">${ic('ver', 17)}Ver</button>
      </div>
    </div>
  </section>

  <section class="tarjeta sin-relleno" style="margin-top:16px">
    <div class="tarjeta-cab"><h2 class="h2">Extractos individuales</h2></div>
    <div class="filtros">
      <label class="buscador">${ic('buscar', 16)}<input type="search" id="ext-buscar" placeholder="Buscar socio" value="${esc(estado.extBusqueda || '')}" aria-label="Buscar socio"></label>
      ${pildoras([['todos', `Todos (${todos.length})`], ['deuda', `Con deuda (${conDeuda.length})`]], f, 'data-filtro')}
    </div>
    ${lista.length ? `<div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Socio</th><th class="d ocultar-movil">Capital</th><th class="d ocultar-movil">Deuda</th><th class="ocultar-movil">WhatsApp</th><th class="d">Extracto</th></tr></thead>
      <tbody>${lista.map((x) => `<tr>
        <td><span class="persona">${avatar(x.nombre)}<a href="#/miembro/${x.id}">${esc(x.nombre)}</a></span></td>
        <td class="d num ocultar-movil">${cop(x.capital.total)}</td>
        <td class="d num ocultar-movil ${x.deuda > 0 ? 'mal-t' : 'tenue'}">${x.deuda > 0 ? cop(x.deuda) : '—'}</td>
        <td class="ocultar-movil tenue">${esc(x.telefono || 'Sin teléfono')}</td>
        <td class="d"><span class="grupo-btn">
          <button class="btn-ic" data-ver="${x.id}" title="Ver" aria-label="Ver extracto de ${esc(x.nombre)}">${ic('ver', 17)}</button>
          <button class="btn-ic" data-descargar="${x.id}" title="Descargar" aria-label="Descargar extracto de ${esc(x.nombre)}">${ic('descargar', 17)}</button>
          <button class="btn-ic" data-compartir="${x.id}" title="Compartir" aria-label="Compartir extracto de ${esc(x.nombre)}">${ic('compartir', 17)}</button>
        </span></td></tr>`).join('')}</tbody>
    </table></div>` : vacio('Ningún socio coincide con la búsqueda.')}
  </section>
  <p class="nota-pie">En el celular, "Compartir" abre el menú del teléfono para enviarlo por WhatsApp, correo u otra app. En computador, si el navegador no permite adjuntar, el PDF se descarga y se abre WhatsApp Web con el mensaje listo para adjuntarlo.</p>`;

  const por = (id) => estado.modelo.miembroPorId[id];
  el.querySelectorAll('[data-ver]').forEach((b) => { b.onclick = () => accion(() => verPDF(pdfSocio(por(b.dataset.ver)))); });
  el.querySelectorAll('[data-descargar]').forEach((b) => { b.onclick = () => accion(() => descargarExtracto(por(b.dataset.descargar))); });
  el.querySelectorAll('[data-compartir]').forEach((b) => { b.onclick = () => accion(() => compartirExtracto(por(b.dataset.compartir))); });
  el.querySelectorAll('[data-todos]').forEach((b) => {
    b.onclick = () => accion(async () => {
      const modo = b.dataset.todos;
      if (modo === 'ver') return verPDF(pdfTodos(todos));
      b.disabled = true;
      try {
        const archivo = await pdfTodos(todos);
        if (modo === 'descargar') { descargar(archivo); aviso(`Se descargó el PDF con ${todos.length} extractos`); }
        else await compartir(archivo, `Extractos de la Escuela de Negocios con corte al ${fecha(estado.corte)}.`, '');
      } finally { b.disabled = false; }
    });
  });
  el.querySelectorAll('[data-informe]').forEach((b) => {
    b.onclick = () => accion(async () => {
      const modo = b.dataset.informe;
      if (modo === 'ver') return verPDF(pdfPrestamosVigentes());
      b.disabled = true;
      try {
        const archivo = await pdfPrestamosVigentes();
        if (modo === 'descargar') { descargar(archivo); aviso('Se descargó el informe de préstamos vigentes'); }
        else await compartir(archivo, `Préstamos vigentes de la Escuela de Negocios con corte al ${fecha(estado.corte)}.`, '');
      } finally { b.disabled = false; }
    });
  });
  el.querySelectorAll('[data-filtro]').forEach((b) => { b.onclick = () => { estado.filtroExtractos = b.dataset.filtro; vistaExtractos(el); }; });
  const bus = el.querySelector('#ext-buscar');
  bus.oninput = () => {
    estado.extBusqueda = bus.value; const pos = bus.selectionStart; vistaExtractos(el);
    const n = el.querySelector('#ext-buscar'); n.focus(); n.setSelectionRange(pos, pos);
  };
}
