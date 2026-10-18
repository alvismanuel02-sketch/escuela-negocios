// Motor de cálculo de la Escuela de Negocios.
// Es la única fuente de verdad para intereses, saldos y planes de cuotas:
// lo usan todas las pantallas, los PDF y las pruebas (tests/motor.test.mjs).
//
// Regla del fondo
//   - sin capital que respalde el préstamo  -> 10% mensual
//   - préstamo cubierto por el capital      -> 2% mensual
//   - préstamo mayor que el capital         -> 2% sobre la parte cubierta, 5% sobre el excedente
//   - tasa pactada (tasaFija)               -> anula la regla
// El interés corre por día sobre el saldo de capital: saldo × tasa / 30 × días.
// Cada pago cubre primero el interés acumulado y el resto baja capital.

const DIA_MS = 86400000;

/** Días entre dos fechas 'AAAA-MM-DD' (b - a). */
export function dias(a, b) {
  return Math.round((aUTC(b) - aUTC(a)) / DIA_MS);
}

function aUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function deUTC(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function sumarDias(iso, n) {
  return deUTC(aUTC(iso) + n * DIA_MS);
}

export function hoyISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Interés de un periodo sobre un saldo de capital. */
export function interesPeriodo(saldo, respaldo, ndias, tasaFija) {
  if (saldo <= 0 || ndias <= 0) return 0;
  if (tasaFija) return (saldo * tasaFija) / 30 * ndias;
  if (!respaldo || respaldo <= 0) return (saldo * 0.10) / 30 * ndias;
  const tramo2 = Math.min(saldo, respaldo);
  const tramo5 = Math.max(0, saldo - respaldo);
  return ((tramo2 * 0.02 + tramo5 * 0.05) / 30) * ndias;
}

/** Interés que genera el saldo en un día. */
export function interesDiario(saldo, respaldo, tasaFija) {
  return interesPeriodo(saldo, respaldo, 1, tasaFija);
}

/** Tasa en palabras, para pantallas y PDF. */
export function describirTasa(monto, respaldo, tasaFija, fmt = (v) => String(Math.round(v))) {
  if (tasaFija) return `${String(+(tasaFija * 100).toFixed(2)).replace('.', ',')}% mensual pactado sobre el saldo`;
  if (!respaldo || respaldo <= 0) return '10% mensual (sin capital aportado que respalde el préstamo)';
  if (monto <= respaldo) return '2% mensual (el capital aportado cubre todo el préstamo)';
  return `2% mensual sobre ${fmt(respaldo)} y 5% mensual sobre ${fmt(monto - respaldo)} (la parte que supera el capital aportado)`;
}

/**
 * Liquida un préstamo a una fecha de corte.
 * prestamo: { monto, fecha, capital_respaldo, tasa_fija }
 * pagos:    [{ fecha, valor, tipo: 'abono'|'cruce' }]  (se ignoran los posteriores al corte)
 */
export function liquidar(prestamo, pagos, corte) {
  const monto = Number(prestamo.monto);
  const respaldo = Number(prestamo.capital_respaldo || 0);
  const tasaFija = prestamo.tasa_fija ? Number(prestamo.tasa_fija) : null;

  let saldo = monto;
  let intPend = 0;
  let anterior = prestamo.fecha;
  let totalInt = 0;
  let efectivo = 0;
  let cruzado = 0;
  let ultimoPago = null;
  const filas = [];

  const ordenados = (pagos || [])
    .filter((p) => p.fecha && Number(p.valor) > 0 && p.fecha <= corte)
    .slice()
    .sort((a, b) => (a.fecha === b.fecha ? 0 : a.fecha < b.fecha ? -1 : 1));

  for (const p of ordenados) {
    const nd = Math.max(0, dias(anterior, p.fecha));
    const i = interesPeriodo(saldo, respaldo, nd, tasaFija);
    totalInt += i;
    const exigible = intPend + i;
    const valor = Number(p.valor);
    const aInt = Math.min(valor, exigible);
    const aCap = valor - aInt;
    intPend = exigible - aInt;
    saldo -= aCap;
    if (p.tipo === 'cruce') cruzado += valor;
    else efectivo += valor;
    filas.push({
      id: p.id, fecha: p.fecha, dias: nd, interes: i, valor, aInt, aCap,
      saldo: Math.max(saldo, 0), tipo: p.tipo || 'abono', nota: p.nota || '',
    });
    anterior = p.fecha;
    ultimoPago = p.fecha;
  }

  let corteFila = null;
  if (saldo > 0.5) {
    const nd = Math.max(0, dias(anterior, corte));
    const i = interesPeriodo(saldo, respaldo, nd, tasaFija);
    totalInt += i;
    intPend += i;
    corteFila = { fecha: corte, dias: nd, interes: i };
  }

  const activo = saldo > 0.5;
  return {
    filas,
    corteFila,
    capital: Math.max(saldo, 0),
    intPend: activo ? intPend : 0,
    deuda: activo ? saldo + intPend : 0,
    favor: saldo < 0 ? -saldo : 0,
    totalInt,
    efectivo,
    cruzado,
    activo,
    ultimoPago,
    diasSinAbonar: activo ? dias(ultimoPago || prestamo.fecha, corte) : 0,
    interesDiario: activo ? interesDiario(saldo, respaldo, tasaFija) : 0,
  };
}

/** Valor exacto para saldar toda la deuda en una fecha (opción "Saldar todo"). */
export function valorParaSaldar(prestamo, pagos, fecha) {
  const previos = (pagos || []).filter((p) => p.fecha <= fecha);
  return liquidar(prestamo, previos, fecha).deuda;
}

/** Fechas de pago alineadas al 15 y al último día hábil de quincena (30, o fin de febrero). */
function siguienteQuincena(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const finMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dia30 = Math.min(30, finMes);
  if (d < 15) return fechaISO(y, m, 15);
  if (d < dia30) return fechaISO(y, m, dia30);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return fechaISO(ny, nm, 15);
}

function fechaISO(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Genera la lista de fechas de un plan. */
export function fechasPlan({ primera, cadaDias = 15, alinear = false, cantidad }) {
  const out = [];
  let f = primera;
  for (let k = 0; k < cantidad; k++) {
    out.push(f);
    if (alinear && cadaDias === 15) f = siguienteQuincena(f);
    else if (alinear && cadaDias === 30) {
      const [y, m, d] = f.split('-').map(Number);
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      const fin = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
      f = fechaISO(ny, nm, Math.min(d, fin));
    } else f = sumarDias(f, cadaDias);
  }
  return out;
}

/**
 * Plan de cuotas a partir del saldo en la fecha `desde`.
 * opciones: { modo: 'n'|'fija', n, cuotaFija, cadaDias: 15|30, primera, alinear }
 * El interés de la primera cuota cuenta los días reales entre `desde` y `primera`.
 */
export function generarPlan({ capital, intPend = 0, respaldo, tasaFija, desde, modo = 'n', n = 4, cuotaFija = 0, cadaDias = 15, primera, alinear = false }) {
  const filas = [];
  if (capital <= 0.5) return filas;
  const inicio = primera || (alinear && cadaDias === 15 ? siguienteQuincena(desde) : sumarDias(desde, cadaDias));

  if (modo === 'n') {
    const fechas = fechasPlan({ primera: inicio, cadaDias, alinear, cantidad: n });
    const abono = capital / n;
    let saldo = capital;
    let anterior = desde;
    fechas.forEach((f, k) => {
      let i = interesPeriodo(saldo, respaldo, dias(anterior, f), tasaFija);
      if (k === 0) i += intPend;
      const aCap = k < n - 1 ? abono : saldo;
      saldo -= aCap;
      filas.push({ n: k + 1, fecha: f, interes: i, capital: aCap, cuota: aCap + i, saldo: Math.max(saldo, 0) });
      anterior = f;
    });
    return filas;
  }

  // Cuota fija: se repite hasta saldar (tope 120 cuotas).
  if (!(cuotaFija > 0)) return filas;
  const fechas = fechasPlan({ primera: inicio, cadaDias, alinear, cantidad: 120 });
  let saldo = capital;
  let ip = intPend;
  let anterior = desde;
  for (let k = 0; k < fechas.length && saldo + ip > 0.5; k++) {
    const f = fechas[k];
    ip += interesPeriodo(saldo, respaldo, dias(anterior, f), tasaFija);
    const pago = Math.min(cuotaFija, saldo + ip);
    const aInt = Math.min(pago, ip);
    ip -= aInt;
    const aCap = pago - aInt;
    saldo -= aCap;
    filas.push({ n: k + 1, fecha: f, interes: aInt, capital: aCap, cuota: pago, saldo: Math.max(saldo + ip, 0) });
    anterior = f;
  }
  return filas;
}

/**
 * Capital actual de un socio.
 * = movimientos del libro de capital (saldo inicial, aportes, retiros, utilidades, ajustes)
 *   − cruces que autorizó para pagar sus préstamos
 *   + lo que pagó de más en préstamos ya cancelados
 */
export function capitalActual(movimientos, prestamosLiquidados) {
  const libro = (movimientos || []).reduce((s, m) => s + Number(m.valor), 0);
  const cruces = prestamosLiquidados.reduce((s, x) => s + x.liq.cruzado, 0);
  const excesos = prestamosLiquidados.reduce((s, x) => s + x.liq.favor, 0);
  return { libro, cruces, excesos, total: libro - cruces + excesos };
}

/**
 * Capital que puede respaldar un préstamo nuevo: el capital actual menos lo que
 * ya respalda el capital pendiente de sus otros préstamos activos (el más antiguo primero).
 */
export function respaldoDisponible(capital, capitalPendienteOtros) {
  return Math.max(0, capital - capitalPendienteOtros);
}

/** Franja de mora según días sin abonar. */
export function franjaMora(diasSinAbonar) {
  if (diasSinAbonar <= 30) return { clave: 'aldia', texto: 'Al día', provision: 0 };
  if (diasSinAbonar <= 60) return { clave: 'f30', texto: '1 a 30 días', provision: 0.05 };
  if (diasSinAbonar <= 90) return { clave: 'f60', texto: '31 a 60 días', provision: 0.20 };
  if (diasSinAbonar <= 120) return { clave: 'f90', texto: '61 a 90 días', provision: 0.50 };
  return { clave: 'critica', texto: 'Más de 90 días', provision: 1 };
}
