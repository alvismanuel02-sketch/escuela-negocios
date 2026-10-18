// Arma la vista calculada del fondo a partir de los datos crudos y una fecha de corte.
import { liquidar, capitalActual, generarPlan, franjaMora, dias } from './motor.js';

export function construirModelo(datos, corte) {
  const pagosPor = agrupar(datos.pagos, 'prestamo_id');
  const movsPor = agrupar(datos.movimientos, 'miembro_id');

  const prestamos = datos.prestamos
    .filter((p) => !p.anulado && p.fecha <= corte)
    .map((p) => {
      const pagos = pagosPor[p.id] || [];
      const liq = liquidar(p, pagos, corte);
      return { ...p, pagos, liq, franja: liq.activo ? franjaMora(liq.diasSinAbonar) : null };
    });
  const prestamosPor = agrupar(prestamos, 'miembro_id');

  const miembros = datos.miembros.map((m) => {
    const movs = (movsPor[m.id] || []).filter((x) => x.fecha <= corte);
    const suyos = prestamosPor[m.id] || [];
    const cap = capitalActual(movs, suyos);
    const activos = suyos.filter((p) => p.liq.activo);
    const deuda = activos.reduce((s, p) => s + p.liq.deuda, 0);
    const capitalPendiente = activos.reduce((s, p) => s + p.liq.capital, 0);
    return {
      ...m, movimientos: movsPor[m.id] || [], prestamos: suyos, activos,
      capital: cap, deuda, capitalPendiente, neto: cap.total - deuda,
    };
  });
  const miembroPorId = Object.fromEntries(miembros.map((m) => [m.id, m]));

  const activos = prestamos.filter((p) => p.liq.activo);
  const capitalFondo = miembros.reduce((s, m) => s + m.capital.total, 0);
  const colocado = activos.reduce((s, p) => s + p.liq.capital, 0);
  const interesesPorCobrar = activos.reduce((s, p) => s + p.liq.intPend, 0);
  const inmov = Number(datos.config.activos_inmovilizados?.valor || 0);

  return {
    corte,
    miembros,
    miembroPorId,
    prestamos,
    prestamoPorId: Object.fromEntries(prestamos.map((p) => [p.id, p])),
    activos,
    config: datos.config,
    fondo: {
      capital: capitalFondo,
      colocado,
      interesesPorCobrar,
      deuda: colocado + interesesPorCobrar,
      inmovilizado: inmov,
      inmovilizadoDesc: datos.config.activos_inmovilizados?.descripcion || '',
      disponible: capitalFondo - colocado - inmov,
      limiteExposicion: Number(datos.config.limite_exposicion || 3),
    },
  };
}

/**
 * Plan pactado de un préstamo y cómo va contra lo pagado.
 * El plan se calcula sobre el saldo que había en plan.desde; los pagos posteriores
 * se acumulan y se comparan contra las cuotas en orden.
 */
export function planConEstado(prestamo, corte) {
  const plan = prestamo.plan;
  if (!plan) return null;
  const desde = plan.desde || prestamo.fecha;
  const base = liquidar(prestamo, prestamo.pagos.filter((p) => p.fecha <= desde), desde);
  const cuotas = generarPlan({
    capital: base.capital, intPend: base.intPend,
    respaldo: Number(prestamo.capital_respaldo || 0),
    tasaFija: prestamo.tasa_fija ? Number(prestamo.tasa_fija) : null,
    desde, modo: plan.modo, n: plan.n, cuotaFija: plan.cuotaFija,
    cadaDias: plan.cadaDias || 15, primera: plan.primera, alinear: !!plan.alinear,
  });
  const pagado = prestamo.pagos
    .filter((p) => p.fecha > desde && p.fecha <= corte)
    .reduce((s, p) => s + Number(p.valor), 0);

  let acumulado = 0;
  let vencidas = 0;
  let valorVencido = 0;
  const filas = cuotas.map((c) => {
    const antes = acumulado;
    acumulado += c.cuota;
    let estado;
    if (pagado >= acumulado - 1) estado = 'pagada';
    else if (pagado > antes + 1) estado = c.fecha < corte ? 'parcial-vencida' : 'parcial';
    else estado = c.fecha < corte ? 'vencida' : 'pendiente';
    if (estado === 'vencida' || estado === 'parcial-vencida') {
      vencidas++;
      valorVencido += Math.min(c.cuota, acumulado - Math.max(pagado, antes));
    }
    return { ...c, estado };
  });
  const proxima = filas.find((c) => c.estado !== 'pagada');
  return {
    desde, cuotas: filas, pagado, vencidas, valorVencido,
    total: cuotas.reduce((s, c) => s + c.cuota, 0),
    proxima,
    diasAtraso: filas.filter((c) => c.estado.includes('vencida')).length
      ? dias(filas.find((c) => c.estado.includes('vencida')).fecha, corte) : 0,
    saldoBase: base.deuda,
  };
}

function agrupar(lista, clave) {
  const out = {};
  for (const x of lista) (out[x[clave]] ||= []).push(x);
  return out;
}
