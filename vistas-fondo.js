// Pantallas del fondo completo: movimientos, panel de riesgo y configuración con auditoría.
import { franjaMora } from './motor.js';
import { cop, fecha, fechaLarga, esc, leerPesos, pct } from './formato.js';
import { guardarConfig, cargarAuditoria } from './datos.js';
import { ic } from './iconos.js';
import { estado, app, avatar, kpi, vacio, diasTxt, nombreDe, dona, pildoras, inputPesos, activarPesos, guardar, aviso } from './ui.js';
import { estadoPrestamo, filasClic } from './vistas.js';

const TIPOS_MOV = { saldo_inicial: 'Saldo inicial', aporte: 'Aporte', retiro: 'Retiro', utilidad: 'Utilidad', ajuste: 'Ajuste' };
const BADGE = {
  desembolso: ['Desembolso', 'naranja'], abono: ['Abono', 'bien'], cruce: ['Cruce', 'morado'],
  saldo_inicial: ['Saldo inicial', 'azul'], aporte: ['Aporte', 'azul'], retiro: ['Retiro', 'mal'],
  utilidad: ['Utilidad', 'azul'], ajuste: ['Ajuste', ''],
};

// ═══════════════════════ Movimientos del fondo ═══════════════════════

function libroDelFondo() {
  const m = estado.modelo;
  const filas = [];
  for (const p of m.prestamos) {
    const nombre = nombreDe(p);
    filas.push({ fecha: p.fecha, tipo: 'desembolso', desc: `Préstamo de ${cop(p.monto)}`, miembro: nombre, valor: Number(p.monto), ir: `#/prestamo/${p.id}`, orden: 0 });
    for (const f of p.liq.filas) {
      filas.push({
        fecha: f.fecha, tipo: f.tipo, miembro: nombre, valor: f.valor, aInt: f.aInt, aCap: f.aCap, ir: `#/prestamo/${p.id}`, orden: 1,
        desc: `${f.tipo === 'cruce' ? 'Cruce con su capital' : 'Abono'}: ${cop(f.aInt)} a interés y ${cop(f.aCap)} a capital${f.nota ? `. ${f.nota}` : ''}`,
      });
    }
  }
  for (const x of m.miembros) {
    for (const mv of x.movimientos) {
      if (mv.fecha > estado.corte) continue;
      filas.push({ fecha: mv.fecha, tipo: mv.tipo, desc: mv.nota || TIPOS_MOV[mv.tipo], miembro: x.nombre, valor: Number(mv.valor), ir: `#/miembro/${x.id}`, orden: 2 });
    }
  }
  return filas.sort((a, b) => (a.fecha === b.fecha ? a.orden - b.orden : a.fecha < b.fecha ? 1 : -1));
}

const GRUPOS = {
  todos: () => true,
  desembolsos: (f) => f.tipo === 'desembolso',
  abonos: (f) => f.tipo === 'abono',
  cruces: (f) => f.tipo === 'cruce',
  capital: (f) => f.tipo in TIPOS_MOV,
};

export function vistaMovimientos(el) {
  const todas = libroDelFondo();
  const g = estado.filtroMovs;
  const desde = estado.movDesde || '', hasta = estado.movHasta || '';
  const q = (estado.movBusqueda || '').trim().toLowerCase();
  const enRango = todas.filter((f) => (!desde || f.fecha >= desde) && (!hasta || f.fecha <= hasta) && (!q || f.miembro.toLowerCase().includes(q)));
  const lista = enRango.filter(GRUPOS[g]);
  const cuenta = (k) => enRango.filter(GRUPOS[k]).length;
  const limite = estado.movLimite || 60;

  el.innerHTML = `
  <div class="cabeza"><div><h1 class="h1">Movimientos del fondo</h1><p class="sub">Desembolsos, abonos, cruces y movimientos de capital hasta el ${fecha(estado.corte)}.</p></div>
    <div class="cabeza-acc"><button class="btn" id="exportar">${ic('exportar', 17)}Exportar a Excel</button></div></div>
  <section class="tarjeta sin-relleno">
    <div class="tarjeta-cab" style="padding-bottom:4px">
      <div class="filtros" style="margin:0;flex:1">
        <label class="buscador">${ic('buscar', 16)}<input type="search" id="mov-buscar" placeholder="Buscar por miembro" value="${esc(estado.movBusqueda || '')}" aria-label="Buscar por miembro"></label>
        <label class="campo" style="margin:0;grid-template-columns:auto 1fr;align-items:center"><span>Desde</span><input type="date" id="mov-desde" value="${desde}"></label>
        <label class="campo" style="margin:0;grid-template-columns:auto 1fr;align-items:center"><span>Hasta</span><input type="date" id="mov-hasta" value="${hasta}"></label>
      </div>
    </div>
    <div class="filtros" style="margin-top:12px">${pildoras([['todos', `Todos (${cuenta('todos')})`], ['desembolsos', `Desembolsos (${cuenta('desembolsos')})`], ['abonos', `Abonos (${cuenta('abonos')})`], ['cruces', `Cruces (${cuenta('cruces')})`], ['capital', `Capital (${cuenta('capital')})`]], g, 'data-grupo')}</div>
    ${lista.length ? `<div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Tipo</th><th class="ocultar-movil">Descripción</th><th>Miembro</th><th class="d">Valor</th></tr></thead>
      <tbody>${lista.slice(0, limite).map((f) => {
        const [t, c] = BADGE[f.tipo] || [f.tipo, ''];
        return `<tr class="clic" data-ir="${f.ir}"><td class="num">${fecha(f.fecha)}</td><td><span class="estado ${c}">${t}</span></td>
          <td class="ocultar-movil tenue">${esc(f.desc)}</td><td><a href="${f.ir}">${esc(f.miembro)}</a></td>
          <td class="d num fuerte ${f.valor < 0 ? 'mal-t' : ''}">${cop(f.valor)}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <div class="pie-tabla"><span>Mostrando ${Math.min(limite, lista.length)} de ${lista.length}</span>
      ${lista.length > limite ? '<button class="btn sec peq" id="mas">Mostrar más</button>' : ''}</div>` : vacio('No hay movimientos con esos filtros.')}
  </section>`;

  const repintar = () => vistaMovimientos(el);
  el.querySelectorAll('[data-grupo]').forEach((b) => { b.onclick = () => { estado.filtroMovs = b.dataset.grupo; estado.movLimite = 60; repintar(); }; });
  el.querySelector('#mov-desde').onchange = (e) => { estado.movDesde = e.target.value; repintar(); };
  el.querySelector('#mov-hasta').onchange = (e) => { estado.movHasta = e.target.value; repintar(); };
  const b = el.querySelector('#mov-buscar');
  b.oninput = () => {
    estado.movBusqueda = b.value; const pos = b.selectionStart; repintar();
    const n = el.querySelector('#mov-buscar'); n.focus(); n.setSelectionRange(pos, pos);
  };
  const mas = el.querySelector('#mas');
  if (mas) mas.onclick = () => { estado.movLimite = limite + 100; repintar(); };
  el.querySelector('#exportar').onclick = () => exportarCSV(lista);
  filasClic(el);
}

function exportarCSV(lista) {
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = [['Fecha', 'Tipo', 'Miembro', 'Descripción', 'Valor', 'A interés', 'A capital']]
    .concat(lista.map((f) => [fecha(f.fecha), (BADGE[f.tipo] || [f.tipo])[0], f.miembro, f.desc, Math.round(f.valor),
      f.aInt != null ? Math.round(f.aInt) : '', f.aCap != null ? Math.round(f.aCap) : '']));
  const csv = '﻿' + filas.map((r) => r.map(celda).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `Movimientos_Escuela_de_Negocios_${estado.corte}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  aviso(`Se descargaron ${lista.length} movimientos`);
}

// ═══════════════════════ Panel de riesgo ═══════════════════════

const FRANJAS = [
  ['aldia', 'Al día', '#1E8A6A', 'bien'],
  ['f30', '1 a 30 días de mora', '#2E6BA6', 'azul'],
  ['f60', '31 a 60 días de mora', '#D9A62E', 'aviso'],
  ['f90', '61 a 90 días de mora', '#CC5A2A', 'naranja'],
  ['critica', 'Más de 90 días de mora', '#9A3A86', 'mal'],
];
const PROVISION = Object.fromEntries(['aldia', 'f30', 'f60', 'f90', 'critica'].map((k, i) => [k, franjaMora([0, 45, 75, 105, 200][i]).provision]));

export function vistaRiesgo(el) {
  const m = estado.modelo;
  const { activos, fondo } = m;
  const cartera = activos.reduce((s, p) => s + p.liq.capital, 0);
  const grupos = FRANJAS.map(([k, t, color, tono]) => {
    const ps = activos.filter((p) => p.franja?.clave === k);
    const capital = ps.reduce((s, p) => s + p.liq.capital, 0);
    return { k, t, color, tono, ps, capital, provision: capital * PROVISION[k] };
  });
  const enMora = grupos.filter((g) => g.k !== 'aldia');
  const capMora = enMora.reduce((s, g) => s + g.capital, 0);
  const provision = grupos.reduce((s, g) => s + g.provision, 0);
  const avanzada = activos.filter((p) => ['f90', 'critica'].includes(p.franja?.clave));
  const lim = fondo.limiteExposicion;
  const exceden = activos.filter((p) => {
    const x = m.miembroPorId[p.miembro_id];
    return x.capital.total > 0 && Number(p.monto) > x.capital.total * lim;
  });
  const sinRespaldo = activos.filter((p) => !p.tasa_fija && !Number(p.capital_respaldo));
  const morosos = activos.filter((p) => p.franja?.clave !== 'aldia').sort((a, b) => b.liq.diasSinAbonar - a.liq.diasSinAbonar);

  const alertas = [];
  if (avanzada.length) alertas.push(['rojo', `${avanzada.length} ${avanzada.length === 1 ? 'préstamo está' : 'préstamos están'} en mora avanzada (más de 60 días de mora): ${avanzada.map((p) => `<a href="#/prestamo/${p.id}">${esc(nombreDe(p))}</a>`).join(', ')}.`]);
  if (exceden.length) alertas.push(['ocre', `${exceden.length} ${exceden.length === 1 ? 'préstamo supera' : 'préstamos superan'} el límite de exposición (${lim} veces el capital aportado): ${exceden.map((p) => `<a href="#/prestamo/${p.id}">${esc(nombreDe(p))}</a>`).join(', ')}.`]);
  if (sinRespaldo.length) alertas.push(['azul', `${sinRespaldo.length} ${sinRespaldo.length === 1 ? 'préstamo no tiene' : 'préstamos no tienen'} capital que lo respalde (van al 10%): ${sinRespaldo.map((p) => `<a href="#/prestamo/${p.id}">${esc(nombreDe(p))}</a>`).join(', ')}.`]);
  if (!alertas.length) alertas.push(['verde', 'Sin alertas: ningún préstamo en mora avanzada ni por encima del límite.']);

  el.innerHTML = `
  <div class="cabeza"><div><h1 class="h1">Panel de riesgo y tesorería</h1><p class="sub">Cartera y mora al ${fechaLarga(estado.corte)}.</p></div></div>
  <div class="kpis">
    ${kpi('capital', '', 'Capital total', cop(fondo.capital))}
    ${kpi('prestamos', 'azul', 'En préstamos', cop(cartera), `${activos.length} préstamos activos`)}
    ${kpi('alerta', 'rojo', 'Capital en mora', cop(capMora), cartera ? `${pct(capMora / cartera)} de la cartera` : '', capMora > 0 ? 'rojo' : '')}
    ${kpi('disponible', '', 'Disponible', cop(fondo.disponible), '', fondo.disponible < 0 ? 'rojo' : 'verde')}
    ${kpi('activos', 'ocre', 'Otros activos', cop(fondo.inmovilizado), esc(fondo.inmovilizadoDesc))}
  </div>

  <div class="rejilla-2 ancha-izq" style="margin-top:16px">
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2 class="h2">Cartera por edades de mora</h2></div>
      <div class="dona-cont">${dona(grupos.map((g) => ({ t: g.t, v: g.capital, color: g.color })), cop(cartera), 'En préstamos')}
        <ul class="leyenda">${grupos.map((g) => `<li><i style="background:${g.color}"></i><span>${g.t} <span class="tenue">(${g.ps.length})</span></span>
          <span class="pct">${cartera ? pct(g.capital / cartera) : '—'}</span><span class="val">${cop(g.capital)}</span></li>`).join('')}</ul>
      </div>
      <p class="nota-pie">La mora cuenta desde el día 31 sin abonar. Los montos son el capital pendiente de cada préstamo.</p>
    </section>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2 class="h2">Provisión sugerida</h2></div>
      <div class="kpi-v ${provision > 0 ? 'rojo' : ''}" style="font-size:26px">${cop(provision)}</div>
      <p class="sub peq" style="margin-bottom:12px">${cartera ? pct(provision / cartera) : '0%'} de la cartera. Es lo que convendría reservar por si esos préstamos no se pagan.</p>
      <div class="tabla-envoltura" style="margin:0 -20px -20px"><table class="tabla compacta">
        <thead><tr><th>Franja</th><th class="d">Se provisiona</th><th class="d">Provisión</th></tr></thead>
        <tbody>${grupos.map((g) => `<tr><td>${g.t}</td><td class="d num tenue">${pct(PROVISION[g.k], 0)}</td><td class="d num">${cop(g.provision)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>
  </div>

  <section class="tarjeta" style="margin-top:16px">
    <div class="tarjeta-cab"><h2 class="h2">Alertas</h2></div>
    <ul class="alertas">${alertas.map(([c, t]) => `<li><span class="a-i ${c}">${ic(c === 'verde' ? 'ok' : 'alerta', 16)}</span><div><p>${t}</p></div></li>`).join('')}</ul>
  </section>

  <section class="tarjeta sin-relleno" style="margin-top:16px">
    <div class="tarjeta-cab"><h2 class="h2">Préstamos en mora <span class="tenue">(${morosos.length})</span></h2></div>
    ${morosos.length ? `<div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Socio</th><th class="d">Debe hoy</th><th class="d ocultar-movil">Capital pendiente</th><th>Sin abonar</th><th class="d ocultar-movil">Provisión</th></tr></thead>
      <tbody>${morosos.map((p) => `<tr class="clic" data-ir="#/prestamo/${p.id}">
        <td><span class="persona">${avatar(nombreDe(p))}<a href="#/prestamo/${p.id}">${esc(nombreDe(p))}</a></span></td>
        <td class="d num fuerte">${cop(p.liq.deuda)}</td><td class="d num ocultar-movil">${cop(p.liq.capital)}</td>
        <td>${estadoPrestamo(p)}</td><td class="d num ocultar-movil">${cop(p.liq.capital * (p.franja?.provision || 0))}</td></tr>`).join('')}</tbody>
    </table></div>` : vacio('Ningún préstamo está en mora.')}
  </section>`;
  filasClic(el);
}

// ═══════════════════════ Configuración y auditoría ═══════════════════════

const TABLAS = { pagos: 'pago', prestamos: 'préstamo', miembros: 'miembro', movimientos_capital: 'movimiento de capital', configuracion: 'configuración', administradores: 'administrador' };
const ACCIONES = { INSERT: 'Creación', UPDATE: 'Cambio', DELETE: 'Borrado' };

export function vistaConfiguracion(el) {
  const { fondo } = estado.modelo;
  const admins = estado.datos.administradores || [];
  el.innerHTML = `
  <div class="cabeza"><div><h1 class="h1">Configuración y auditoría</h1><p class="sub">Reglas del fondo, límites y registro de cambios.</p></div></div>
  <div class="rejilla-2">
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2 class="h2">Tasas de la regla del fondo</h2></div>
      <div class="tabla-envoltura" style="margin:0 -20px"><table class="tabla compacta">
        <thead><tr><th>Condición</th><th class="d">Tasa mensual</th></tr></thead>
        <tbody><tr><td>Sin capital aportado</td><td class="d num">10%</td></tr>
          <tr><td>Préstamo cubierto por su capital</td><td class="d num">2%</td></tr>
          <tr><td>Parte que supera su capital</td><td class="d num">5%</td></tr></tbody>
      </table></div>
      <p class="nota-pie">El interés corre por día sobre el saldo. Una tasa pactada en el préstamo reemplaza la regla. Cambiar estas tasas requiere ajustar el cálculo de la app.</p>
    </section>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2 class="h2">Límite de exposición</h2></div>
      <form id="f-limite" novalidate>
        <label class="campo"><span>Un préstamo no debería superar este múltiplo del capital aportado por el socio</span>
          <input name="limite" type="number" min="1" max="20" step="0.5" value="${fondo.limiteExposicion}"></label>
        <p class="error" hidden></p>
        <button class="btn" type="submit">Guardar límite</button>
      </form>
    </section>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2 class="h2">Otros activos del fondo</h2></div>
      <form id="f-activos" novalidate>
        <div class="rejilla">
          <label class="campo"><span>Valor</span>${inputPesos('valor', fondo.inmovilizado)}</label>
          <label class="campo"><span>Descripción</span><input name="desc" value="${esc(fondo.inmovilizadoDesc)}"></label>
        </div>
        <p class="ayuda">Este valor se descuenta del capital disponible para prestar.</p>
        <p class="error" hidden></p>
        <button class="btn" type="submit">Guardar</button>
      </form>
    </section>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2 class="h2">Administradores</h2></div>
      <ul class="alertas">${admins.map((a) => `<li style="grid-template-columns:32px 1fr">${avatar(a.nombre)}<div><p class="fuerte">${esc(a.nombre)}</p><span class="peq tenue">${esc(a.email)}</span></div></li>`).join('')}</ul>
      <p class="nota-pie">Para agregar un administrador hay que registrarlo en Supabase (ver README del repositorio).</p>
    </section>
  </div>
  <section class="tarjeta sin-relleno" style="margin-top:16px">
    <div class="tarjeta-cab"><h2 class="h2">Registro de auditoría</h2><span class="peq tenue">Últimos 150 cambios</span></div>
    <div id="auditoria"><p class="vacio">Cargando…</p></div>
  </section>`;

  const fl = el.querySelector('#f-limite');
  fl.onsubmit = (ev) => guardar(ev, fl, async () => {
    const v = parseFloat(String(fl.limite.value).replace(',', '.'));
    if (!(v >= 1 && v <= 20)) throw new Error('Escribe un número entre 1 y 20.');
    await guardarConfig('limite_exposicion', v);
    await app.recargar(); aviso('Límite guardado');
  });
  const fa = el.querySelector('#f-activos');
  activarPesos(fa);
  fa.onsubmit = (ev) => guardar(ev, fa, async () => {
    await guardarConfig('activos_inmovilizados', { valor: leerPesos(fa.valor.value), descripcion: fa.desc.value.trim() });
    await app.recargar(); aviso('Otros activos guardados');
  });
  pintarAuditoria(el.querySelector('#auditoria'));
}

async function pintarAuditoria(cont) {
  let filas;
  try { filas = await cargarAuditoria(150); } catch (e) { cont.innerHTML = vacio(`No se pudo cargar la auditoría: ${e.message}`); return; }
  if (!document.body.contains(cont)) return;
  if (!filas.length) { cont.innerHTML = vacio('Todavía no hay cambios registrados.'); return; }
  const admins = Object.fromEntries((estado.datos.administradores || []).map((a) => [a.email, a.nombre]));
  cont.innerHTML = `<div class="tabla-envoltura"><table class="tabla">
    <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th class="ocultar-movil">Detalle</th></tr></thead>
    <tbody>${filas.map((r) => `<tr><td class="num">${fechaHora(r.fecha)}</td>
      <td>${esc(admins[r.usuario] || r.usuario || '—')}</td>
      <td>${ACCIONES[r.accion] || r.accion} de ${TABLAS[r.tabla] || r.tabla}</td>
      <td class="ocultar-movil tenue">${esc(detalle(r))}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function fechaHora(ts) {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function detalle(r) {
  const d = r.despues || r.antes || {};
  const nombreMiembro = (id) => estado.modelo.miembroPorId[id]?.nombre || '';
  const prestamo = (id) => estado.datos.prestamos.find((p) => p.id === id);
  const cambios = () => {
    if (r.accion !== 'UPDATE' || !r.antes || !r.despues) return '';
    const k = Object.keys(r.despues).filter((c) => !['creado', 'creado_por', 'actualizado', 'actualizado_por'].includes(c)
      && JSON.stringify(r.antes[c]) !== JSON.stringify(r.despues[c]));
    return k.length ? ` (cambió: ${k.join(', ').replace('capital_respaldo', 'respaldo').replace('tasa_fija', 'tasa')})` : '';
  };
  switch (r.tabla) {
    case 'pagos': {
      const p = prestamo(d.prestamo_id);
      return `${d.tipo === 'cruce' ? 'Cruce' : 'Abono'} de ${cop(d.valor)} del ${fecha(d.fecha)}${p ? `, préstamo de ${nombreMiembro(p.miembro_id)}` : ''}${cambios()}`;
    }
    case 'prestamos': return `Préstamo de ${cop(d.monto)} a ${nombreMiembro(d.miembro_id)}${d.anulado && r.accion === 'UPDATE' && !r.antes?.anulado ? ', anulado' : ''}${cambios()}`;
    case 'movimientos_capital': return `${TIPOS_MOV[d.tipo] || d.tipo} de ${cop(d.valor)}, ${nombreMiembro(d.miembro_id)}${cambios()}`;
    case 'miembros': return `${d.nombre || ''}${cambios()}`;
    case 'configuracion': return d.clave === 'limite_exposicion' ? `Límite de exposición: ${JSON.stringify(d.valor)}` : d.clave === 'activos_inmovilizados' ? `Otros activos: ${cop(d.valor?.valor)} ${d.valor?.descripcion || ''}` : String(d.clave || '');
    case 'administradores': return String(d.email || '');
    default: return '';
  }
}
