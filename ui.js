// Estado compartido de la interfaz y piezas que usan todas las pantallas.
import { hoyISO } from './motor.js';
import { esc, cop, leerPesos } from './formato.js';
import { ic } from './iconos.js';

export const estado = {
  datos: null, modelo: null, corte: hoyISO(), usuario: null,
  busqueda: '', filtroMiembros: 'todos', filtroPrestamos: 'activos',
  filtroMovs: 'todos', tabMiembro: 'prestamos', tabPrestamo: 'plan',
};

// app.js registra aquí recargar() y pintar() para que las pantallas las usen.
export const app = { recargar: async () => {}, pintar: () => {} };

export function nombreAdmin() {
  const email = (estado.usuario?.email || '').toLowerCase();
  const a = (estado.datos?.administradores || []).find((x) => x.email === email);
  return a?.nombre || email.split('@')[0];
}

export function iniciales(nombre) {
  const p = String(nombre || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function tono(nombre) {
  let h = 0;
  for (const c of String(nombre)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `t${h % 6}`;
}

export function avatar(nombre, clase = '') {
  return `<span class="avatar ${tono(nombre)} ${clase}">${esc(iniciales(nombre))}</span>`;
}

export function kpi(icono, color, titulo, valor, nota = '', tonoValor = '') {
  return `<div class="kpi"><div class="kpi-i ${color}">${ic(icono, 18)}</div>
    <div class="kpi-t">${esc(titulo)}</div><div class="kpi-v ${tonoValor}">${valor}</div>
    ${nota ? `<div class="kpi-n">${nota}</div>` : ''}</div>`;
}

export function vacio(texto) { return `<p class="vacio">${esc(texto)}</p>`; }

export function diasTxt(n) { return n === 1 ? '1 día' : `${n} días`; }

export function nombreDe(p) { return estado.modelo.miembroPorId[p.miembro_id]?.nombre || '—'; }

/** Dona SVG: partes = [{ t, v, color }]. Separación de 2 px entre segmentos. */
export function dona(partes, centro, sub) {
  const total = partes.reduce((s, x) => s + Math.max(0, x.v), 0);
  const r = 70, C = 2 * Math.PI * r, hueco = partes.filter((x) => x.v > 0).length > 1 ? 2.5 : 0;
  let acum = 0;
  const segs = partes.filter((x) => x.v > 0).map((x) => {
    const largo = total ? (x.v / total) * C : 0;
    const s = `<circle class="seg" cx="90" cy="90" r="${r}" stroke="${x.color}" stroke-dasharray="${Math.max(0, largo - hueco)} ${C}" stroke-dashoffset="${-acum}"><title>${esc(x.t)}: ${cop(x.v)}</title></circle>`;
    acum += largo;
    return s;
  }).join('');
  return `<div class="dona"><svg viewBox="0 0 180 180" role="img" aria-label="${esc(sub || '')}">
    <circle cx="90" cy="90" r="${r}" stroke="#EEF2F4"></circle>${segs}</svg>
    <div class="dona-centro"><b>${centro}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
}

export function leyenda(partes, totalTxt) {
  const total = partes.reduce((s, x) => s + Math.max(0, x.v), 0);
  return `<ul class="leyenda">${partes.map((x) => `<li><i style="background:${x.color}"></i><span>${esc(x.t)}</span>
    <span class="pct">${total ? ((Math.max(0, x.v) / total) * 100).toFixed(1).replace('.', ',') + '%' : '—'}</span>
    <span class="val">${cop(x.v)}</span></li>`).join('')}
    ${totalTxt ? `<li class="total"><i></i><span>${esc(totalTxt)}</span><span class="pct"></span><span class="val">${cop(total)}</span></li>` : ''}</ul>`;
}

export function pildoras(opciones, actual, atributo) {
  return `<div class="pildoras" role="tablist">${opciones.map(([k, t]) =>
    `<button type="button" class="pildora ${k === actual ? 'on' : ''}" ${atributo}="${k}" role="tab" aria-selected="${k === actual}">${t}</button>`).join('')}</div>`;
}

export function pestanas(opciones, actual, atributo) {
  return `<div class="pestanas" role="tablist">${opciones.map(([k, t]) =>
    `<button type="button" class="${k === actual ? 'on' : ''}" ${atributo}="${k}" role="tab" aria-selected="${k === actual}">${t}</button>`).join('')}</div>`;
}

// ── Formularios ──

export function inputPesos(nombre, valor = 0) {
  return `<span class="pesos"><input name="${nombre}" inputmode="numeric" autocomplete="off" value="${valor ? Math.round(valor).toLocaleString('es-CO') : ''}"></span>`;
}

export function activarPesos(form) {
  form.querySelectorAll('.pesos input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const v = leerPesos(inp.value);
      inp.value = v ? v.toLocaleString('es-CO') : '';
    });
  });
}

export async function guardar(ev, form, fn) {
  ev.preventDefault();
  const err = form.querySelector('.error');
  const btn = form.querySelector('button[type=submit]');
  err.hidden = true;
  btn.disabled = true;
  try {
    await fn();
  } catch (e) {
    mostrarError(err, e.message);
  } finally {
    if (document.body.contains(btn)) btn.disabled = false;
  }
}

export async function accion(fn) {
  try { await fn(); } catch (e) { aviso(e.message, true); }
}

export function mostrarError(el, texto) {
  el.textContent = texto;
  el.hidden = false;
}

export function aviso(texto, error = false) {
  const cont = document.getElementById('avisos');
  if (!cont) return;
  const d = document.createElement('div');
  d.className = `toast ${error ? 'mal' : ''}`;
  d.textContent = texto;
  cont.appendChild(d);
  setTimeout(() => d.remove(), error ? 6000 : 3000);
}
