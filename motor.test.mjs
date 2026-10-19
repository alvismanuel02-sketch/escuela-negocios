// Pruebas del motor contra casos reales del fondo, ya validados (sin nombres).
// Ejecutar: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidar, valorParaSaldar, generarPlan } from './motor.js';

const cerca = (real, esperado, tol = 1) =>
  assert.ok(Math.abs(real - esperado) <= tol, `esperado ${esperado}, obtuvo ${Math.round(real)}`);

const p = (fecha, valor, tipo = 'abono') => ({ fecha, valor, tipo });

test('Préstamo mixto pagado de más: queda saldo a favor', () => {
  const r = liquidar(
    { monto: 500000, fecha: '2025-12-07', capital_respaldo: 495486 },
    [p('2026-03-11', 100000), p('2026-03-19', 100000), p('2026-04-16', 100000),
     p('2026-05-01', 100000), p('2026-05-31', 100000), p('2026-07-14', 100000)],
    '2026-07-17');
  cerca(r.favor, 53111);
  cerca(r.totalInt, 46889);
  assert.equal(r.deuda, 0);
});

test('Préstamo mixto con abonos irregulares: saldo a una fecha de corte', () => {
  const r = liquidar(
    { monto: 800000, fecha: '2025-10-18', capital_respaldo: 538278 },
    [p('2025-12-29', 140000), p('2026-02-02', 100000), p('2026-03-11', 120000),
     p('2026-04-02', 100000), p('2026-07-14', 150000)],
    '2026-07-17');
  cerca(r.deuda, 329163);
});

test('Cruce con capital que salda toda la deuda', () => {
  const prestamo = { monto: 1000000, fecha: '2026-04-24', capital_respaldo: 608096 };
  const pagos = [p('2026-05-02', 191700), p('2026-05-30', 370834)];
  const saldar = valorParaSaldar(prestamo, pagos, '2026-07-13');
  cerca(saldar, 480723);
  const r = liquidar(prestamo, [...pagos, p('2026-07-13', saldar, 'cruce')], '2026-07-17');
  cerca(r.totalInt, 43257);
  cerca(r.cruzado, 480723);
  assert.equal(r.deuda, 0);
});

test('Tasa pactada del 5% anula la regla', () => {
  const r = liquidar(
    { monto: 550000, fecha: '2025-11-17', capital_respaldo: 468286, tasa_fija: 0.05 },
    [p('2025-12-30', 59000)], '2026-07-17');
  cerca(r.deuda, 706338);
});

test('Cruce parcial con capital', () => {
  const r = liquidar(
    { monto: 650000, fecha: '2025-12-31', capital_respaldo: 891383 },
    [p('2026-07-13', 445691, 'cruce')], '2026-07-17');
  cerca(r.deuda, 289145);
});

test('Plan de 10 cuotas el 15 y 30 con primera cuota de 18 días', () => {
  const plan = generarPlan({
    capital: 2300000, respaldo: 127373, desde: '2026-07-28',
    modo: 'n', n: 10, cadaDias: 15, primera: '2026-08-15', alinear: true,
  });
  assert.equal(plan.length, 10);
  assert.deepEqual(plan.map((c) => c.fecha), [
    '2026-08-15', '2026-08-30', '2026-09-15', '2026-09-30', '2026-10-15',
    '2026-10-30', '2026-11-15', '2026-11-30', '2026-12-15', '2026-12-30']);
  cerca(plan[0].cuota, 296707);
  cerca(plan.reduce((s, c) => s + c.cuota, 0), 2612607);
});

test('Plan de 3 cuotas quincenales con intereses pendientes', () => {
  const plan = generarPlan({
    capital: 328506.47, intPend: 657, respaldo: 538278, desde: '2026-07-17',
    modo: 'n', n: 3, cadaDias: 15,
  });
  cerca(plan[0].cuota, 113444, 2);
  cerca(plan[2].cuota, 110597, 2);
});

test('Plan de cuota fija hasta saldar', () => {
  const plan = generarPlan({
    capital: 420900, intPend: 55839, respaldo: 468286, desde: '2026-07-17',
    modo: 'fija', cuotaFija: 50000, cadaDias: 15,
  });
  assert.equal(plan.length, 11);
  cerca(plan.at(-1).cuota, 2815, 2);
});

test('Plan alineado sin primera cuota: empieza en la siguiente quincena', () => {
  const plan = generarPlan({ capital: 900000, respaldo: 163736, desde: '2026-10-17', modo: 'n', n: 3, cadaDias: 15, alinear: true });
  assert.deepEqual(plan.map((c) => c.fecha), ['2026-10-30', '2026-11-15', '2026-11-30']);
});

test('Febrero: la segunda quincena cae el último día del mes', () => {
  const plan = generarPlan({ capital: 300000, respaldo: 300000, desde: '2027-02-01', modo: 'n', n: 2, cadaDias: 15, alinear: true });
  assert.deepEqual(plan.map((c) => c.fecha), ['2027-02-15', '2027-02-28']);
});
