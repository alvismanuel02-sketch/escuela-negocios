// Pantallas principales: inicio, miembros, ficha del miembro, préstamos y detalle del préstamo.
import { hoyISO, valorParaSaldar, generarPlan, interesPeriodo, liquidar, respaldoDisponible } from './motor.js';
import { planConEstado } from './modelo.js';
import { cop, fecha, fechaLarga, esc, leerPesos, pct } from './formato.js';
import { insertar, actualizar, borrar } from './datos.js';
import { ic } from './iconos.js';
import {
  estado, app, avatar, kpi, vacio, diasTxt, nombreDe, dona, leyenda, pildoras, pestanas,
  inputPesos, activarPesos, guardar, accion, aviso, nombreAdmin,
} from './ui.js';
import { descargarExtracto, compartirExtracto } from './extractos.js';

export const COLORES_CAPITAL = { prestado: '#2E6BA6', activos: '#C08A2E', disponible: '#1E8A6A' };

// ── Piezas comunes ──

export function tasaCorta(p) {
  const monto = Number(p.monto), respaldo = Number(p.capital_respaldo || 0);
  if (p.tasa_fija) return `${String(+(Number(p.tasa_fija) * 100).toFixed(2)).replace('.', ',')}% pactada`;
  if (!respaldo) return '10% mensual';
  if (monto <= respaldo) return '2% mensual';
  return '2% y 5% mensual';
}

export function estadoPrestamo(p) {
  const l = p.liq;
  if (!l.activo) return l.favor > 0 ? `<span class="estado bien">Cancelado, ${cop(l.favor)} a favor</span>` : '<span class="estado bien">Cancelado</span>';
  const f = p.franja?.clave;
  if (f === 'aldia') return `<span class="estado bien">Al día</span>`;
  return `<span class="estado ${f === 'f30' ? 'aviso' : 'mal'}">${diasTxt(l.diasSinAbonar)} sin abonar</span>`;
}

function excedeLimite(p) {
  const x = estado.modelo.miembroPorId[p.miembro_id];
  const lim = estado.modelo.fondo.limiteExposicion;
  return x && x.capital.total > 0 && Number(p.monto) > x.capital.total * lim;
}

export function provisionSugerida(activos) {
  return activos.reduce((s, p) => s + p.liq.capital * (p.franja?.provision || 0), 0);
}

// ═══════════════════════ Inicio ═══════════════════════

export function vistaResumen(el) {
  const { fondo, activos } = estado.modelo;
  const conPlan = activos.map((p) => ({ p, plan: planConEstado(p, estado.corte) }));
  const atrasados = conPlan.filter((x) => x.plan?.vencidas > 0).sort((a, b) => b.plan.valorVencido - a.plan.valorVencido);
  const sinPlan = conPlan.filter((x) => !x.plan);
  const exceden = activos.filter(excedeLimite);
  const provision = provisionSugerida(activos);
  const pctColocado = fondo.capital > 0 ? fondo.colocado / fondo.capital : 0;
  const primerNombre = /^administrador$/i.test(nombreAdmin()) ? '' : nombreAdmin().split(' ')[0];

  const partes = [
    { t: 'En préstamos', v: fondo.colocado, color: COLORES_CAPITAL.prestado },
    ...(fondo.inmovilizado ? [{ t: `Otros activos (${fondo.inmovilizadoDesc || 'bienes'})`, v: fondo.inmovilizado, color: COLORES_CAPITAL.activos }] : []),
    { t: 'Disponible para prestar', v: fondo.disponible, color: COLORES_CAPITAL.disponible },
  ];

  const alertas = [];
  if (atrasados.length) alertas.push(['rojo', 'alerta', `${atrasados.length} ${atrasados.length === 1 ? 'préstamo tiene' : 'préstamos tienen'} cuotas vencidas por ${cop(atrasados.reduce((s, x) => s + x.plan.valorVencido, 0))}`, '#/riesgo', 'Ver detalle']);
  if (exceden.length) alertas.push(['ocre', 'alerta', `${exceden.length} ${exceden.length === 1 ? 'préstamo supera' : 'préstamos superan'} el límite de exposición (${fondo.limiteExposicion} veces el capital del socio)`, '#/riesgo', 'Ver detalle']);
  if (sinPlan.length) alertas.push(['azul', 'info', `${sinPlan.length} ${sinPlan.length === 1 ? 'préstamo activo no tiene' : 'préstamos activos no tienen'} plan de cuotas: ${sinPlan.map(({ p }) => `<a href="#/prestamo/${p.id}">${esc(nombreDe(p))}</a>`).join(', ')}`, '', '']);
  if (provision > 0) alertas.push(['azul', 'riesgo', `Provisión sugerida por cartera en riesgo: ${cop(provision)}`, '#/riesgo', 'Ver panel de riesgo']);
  if (fondo.disponible < 0) alertas.push(['rojo', 'alerta', `Hay ${cop(-fondo.disponible)} más prestado que el capital libre del fondo.`, '', '']);
  if (!alertas.length) alertas.push(['verde', 'ok', 'Todo al día: no hay cuotas vencidas ni préstamos por encima del límite.', '', '']);

  el.innerHTML = `
  <div class="cabeza"><div><h1 class="h1">Hola${primerNombre ? `, ${esc(primerNombre)}` : ''}</h1>
    <p class="sub">Este es el estado del fondo al ${fechaLarga(estado.corte)}.</p></div></div>

  <div class="kpis">
    ${kpi('capital', '', 'Capital total del fondo', cop(fondo.capital))}
    ${kpi('prestamos', 'azul', 'En préstamos', cop(fondo.colocado), `${pct(pctColocado)} del capital`)}
    ${kpi('disponible', '', 'Disponible para prestar', cop(fondo.disponible), '', fondo.disponible < 0 ? 'rojo' : 'verde')}
    ${kpi('activos', 'ocre', 'Otros activos', cop(fondo.inmovilizado), esc(fondo.inmovilizadoDesc))}
    ${kpi('intereses', 'morado', 'Intereses por cobrar', cop(fondo.interesesPorCobrar))}
  </div>

  <div class="rejilla-2 ancha-izq" style="margin-top:16px">
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2 class="h2">Composición del capital</h2></div>
      <div class="dona-cont">${dona(partes, cop(fondo.capital), 'Capital total')}${leyenda(partes)}</div>
    </section>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2 class="h2">Alertas y pendientes</h2></div>
      <ul class="alertas">${alertas.map(([c, i, t, href, link]) => `<li><span class="a-i ${c}">${ic(i, 16)}</span>
        <div><p>${t}</p>${href ? `<a href="${href}">${link}</a>` : ''}</div></li>`).join('')}</ul>
    </section>
  </div>

  ${atrasados.length ? `
  <section class="tarjeta sin-relleno" id="vencidas" style="margin-top:16px">
    <div class="tarjeta-cab"><h2 class="h2">Préstamos con cuotas vencidas <span class="tenue">(${atrasados.length})</span></h2></div>
    <div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Socio</th><th class="ocultar-movil">Préstamo</th><th>Cuotas vencidas</th><th class="d">Atrasado</th><th class="d">Debe hoy</th><th class="ocultar-movil">Estado</th></tr></thead>
      <tbody>${atrasados.map(({ p, plan }) => `<tr class="clic" data-ir="#/prestamo/${p.id}">
        <td><span class="persona">${avatar(nombreDe(p))}<a href="#/prestamo/${p.id}">${esc(nombreDe(p))}</a></span></td>
        <td class="ocultar-movil num">${cop(p.monto)}<span class="celda-sub">${fecha(p.fecha)}</span></td>
        <td>${plan.vencidas} de ${plan.cuotas.length}</td>
        <td class="d num mal-t">${cop(plan.valorVencido)}</td>
        <td class="d num fuerte">${cop(p.liq.deuda)}</td>
        <td class="ocultar-movil">${estadoPrestamo(p)}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>` : ''}`;

  filasClic(el);
}

export function filasClic(el) {
  el.querySelectorAll('tr[data-ir]').forEach((tr) => {
    tr.onclick = (ev) => { if (!ev.target.closest('a,button')) location.hash = tr.dataset.ir; };
  });
}

// ═══════════════════════ Miembros ═══════════════════════

export function vistaMiembros(el) {
  const m = estado.modelo;
  const q = estado.busqueda.trim().toLowerCase();
  const f = estado.filtroMiembros;
  const cuenta = { todos: m.miembros.length, activos: m.miembros.filter((x) => x.activo).length };
  cuenta.inactivos = cuenta.todos - cuenta.activos;
  const lista = m.miembros
    .filter((x) => f === 'todos' || (f === 'activos' ? x.activo : !x.activo))
    .filter((x) => !q || x.nombre.toLowerCase().includes(q) || (x.telefono || '').includes(q))
    .sort((a, b) => (b.activo - a.activo) || a.nombre.localeCompare(b.nombre, 'es'));

  el.innerHTML = `
  <div class="cabeza"><div><h1 class="h1">Miembros</h1><p class="sub">${cuenta.activos} socios activos en el fondo.</p></div>
    <div class="cabeza-acc"><button class="btn" id="nuevo">${ic('mas', 17)}Nuevo miembro</button></div></div>
  <div id="form-nuevo"></div>
  <section class="tarjeta sin-relleno">
    <div class="tarjeta-cab"><h2 class="h2">Miembros del fondo</h2></div>
    <div class="filtros">
      <label class="buscador">${ic('buscar', 16)}<input type="search" id="buscar" placeholder="Buscar por nombre o teléfono" value="${esc(estado.busqueda)}" aria-label="Buscar miembro"></label>
      ${pildoras([['todos', `Todos (${cuenta.todos})`], ['activos', `Activos (${cuenta.activos})`], ['inactivos', `Inactivos (${cuenta.inactivos})`]], f, 'data-filtro')}
    </div>
    <div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Nombre</th><th class="ocultar-movil">Teléfono</th><th class="d">Capital</th><th class="d">Deuda</th><th class="d ocultar-movil">Posición neta</th><th class="ocultar-movil">Estado</th></tr></thead>
      <tbody>${lista.map((x) => `
        <tr class="clic ${x.activo ? '' : 'inactivo'}" data-ir="#/miembro/${x.id}">
          <td><span class="persona">${avatar(x.nombre)}<a href="#/miembro/${x.id}">${esc(x.nombre)}</a></span></td>
          <td class="ocultar-movil tenue">${esc(x.telefono || '—')}</td>
          <td class="d num">${cop(x.capital.total)}</td>
          <td class="d num ${x.deuda > 0 ? 'mal-t' : 'tenue'}">${x.deuda > 0 ? cop(x.deuda) : '—'}</td>
          <td class="d num ocultar-movil ${x.neto < 0 ? 'mal-t' : ''}">${cop(x.neto)}</td>
          <td class="ocultar-movil">${x.activo ? '<span class="estado bien">Activo</span>' : '<span class="estado">Inactivo</span>'}</td>
        </tr>`).join('')}</tbody>
    </table></div>
    ${lista.length ? `<div class="pie-tabla"><span>Mostrando ${lista.length} de ${cuenta.todos}</span></div>` : vacio('Ningún miembro coincide con la búsqueda.')}
  </section>`;

  const buscar = el.querySelector('#buscar');
  buscar.oninput = () => {
    estado.busqueda = buscar.value;
    const pos = buscar.selectionStart;
    vistaMiembros(el);
    const b = el.querySelector('#buscar'); b.focus(); b.setSelectionRange(pos, pos);
  };
  el.querySelectorAll('[data-filtro]').forEach((b) => { b.onclick = () => { estado.filtroMiembros = b.dataset.filtro; vistaMiembros(el); }; });
  filasClic(el);
  el.querySelector('#nuevo').onclick = () => formNuevoMiembro(el.querySelector('#form-nuevo'));
}

function formNuevoMiembro(cont) {
  cont.innerHTML = `
  <form class="form" novalidate>
    <h2 class="h2">Nuevo miembro</h2>
    <div class="rejilla">
      <label class="campo"><span>Nombre completo</span><input name="nombre" required></label>
      <label class="campo"><span>Teléfono (opcional)</span><input name="telefono" inputmode="tel"></label>
      <label class="campo"><span>Capital inicial</span>${inputPesos('capital')}</label>
      <label class="campo"><span>Fecha del aporte</span><input type="date" name="fecha" value="${hoyISO()}"></label>
    </div>
    <p class="error" hidden></p>
    <div class="acciones"><button class="btn" type="submit">Guardar</button><button class="btn sec" type="button" data-cancelar>Cancelar</button></div>
  </form>`;
  const f = cont.querySelector('form');
  activarPesos(f);
  f.nombre.focus();
  f.querySelector('[data-cancelar]').onclick = () => { cont.innerHTML = ''; };
  f.onsubmit = (ev) => guardar(ev, f, async () => {
    const nombre = f.nombre.value.trim();
    if (!nombre) throw new Error('Escribe el nombre del miembro.');
    const capital = leerPesos(f.capital.value);
    const nuevo = await insertar('miembros', { nombre, telefono: f.telefono.value.trim() || null });
    if (capital > 0) {
      await insertar('movimientos_capital', { miembro_id: nuevo.id, fecha: f.fecha.value || hoyISO(), tipo: 'saldo_inicial', valor: capital, nota: 'Capital inicial' });
    }
    await app.recargar();
    location.hash = `#/miembro/${nuevo.id}`;
    aviso('Miembro creado');
  });
}

// ═══════════════════════ Ficha del miembro ═══════════════════════

const TIPOS_MOV = { saldo_inicial: 'Saldo inicial', aporte: 'Aporte', retiro: 'Retiro', utilidad: 'Utilidad', ajuste: 'Ajuste' };

export function vistaMiembro(el, id) {
  const x = estado.modelo.miembroPorId[id];
  if (!x) { el.innerHTML = vacio('Ese miembro no existe.'); return; }
  const disponible = respaldoDisponible(x.capital.total, x.capitalPendiente);
  const prestamos = x.prestamos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const anulados = estado.datos.prestamos.filter((p) => p.miembro_id === id && p.anulado);
  const tab = estado.tabMiembro;

  el.innerHTML = `
  <a class="volver" href="#/miembros">${ic('atras', 16)}Volver a la lista</a>
  <div class="rejilla-2 ancha-izq">
    <section class="tarjeta">
      <div class="ficha">
        ${avatar(x.nombre, 'grande')}
        <div class="ficha-t">
          <h1 class="h1">${esc(x.nombre)} ${x.activo ? '<span class="estado bien">Activo</span>' : '<span class="estado">Inactivo</span>'}</h1>
          <p class="sub">${x.telefono ? `Teléfono ${esc(x.telefono)}` : 'Sin teléfono registrado'}</p>
        </div>
      </div>
      ${x.notas ? `<p class="ayuda" style="margin:14px 0 0">${esc(x.notas)}</p>` : ''}
      <div class="acciones" style="margin-top:16px">
        <button class="btn sec peq" data-extracto="descargar">${ic('descargar', 16)}Descargar extracto</button>
        <button class="btn sec peq" data-extracto="compartir">${ic('compartir', 16)}Compartir extracto</button>
      </div>
    </section>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2 class="h2">Resumen</h2></div>
      <dl class="datos">
        <div><dt>Capital actual</dt><dd class="bien-t">${cop(x.capital.total)}</dd></div>
        <div><dt>Deuda vigente</dt><dd class="${x.deuda > 0 ? 'mal-t' : ''}">${cop(x.deuda)}</dd></div>
        <div><dt>Posición neta</dt><dd class="${x.neto < 0 ? 'mal-t' : ''}">${cop(x.neto)}</dd></div>
        <div><dt>Respaldo para un préstamo nuevo</dt><dd>${cop(disponible)}</dd></div>
      </dl>
      <p class="nota-pie">Un préstamo hasta ${cop(disponible)} va al 2% mensual; lo que lo supere, al 5%.</p>
    </section>
  </div>

  <section class="tarjeta" style="margin-top:16px">
    ${pestanas([['prestamos', `Préstamos (${prestamos.length})`], ['movimientos', 'Movimientos de capital'], ['datos', 'Datos personales']], tab, 'data-tab')}
    <div id="tab-cont"></div>
  </section>`;

  const cont = el.querySelector('#tab-cont');
  if (tab === 'movimientos') tabMovimientosCapital(cont, x);
  else if (tab === 'datos') tabDatosMiembro(cont, x);
  else {
    cont.innerHTML = `
      <div class="tarjeta-cab"><h2 class="h2">Préstamos de ${esc(x.nombre.split(' ')[0])}</h2>
        <button class="btn" id="nuevo-prestamo">${ic('mas', 17)}Nuevo préstamo</button></div>
      <div id="form-prestamo"></div>
      ${prestamos.length ? `<div class="tabla-envoltura"><table class="tabla">
        <thead><tr><th>Desembolso</th><th class="d">Monto</th><th class="ocultar-movil">Tasa</th><th class="d">Debe hoy</th><th>Estado</th></tr></thead>
        <tbody>${prestamos.map((p) => `<tr class="clic" data-ir="#/prestamo/${p.id}">
          <td><a href="#/prestamo/${p.id}">${fecha(p.fecha)}</a></td><td class="d num">${cop(p.monto)}</td>
          <td class="ocultar-movil">${tasaCorta(p)}</td>
          <td class="d num fuerte">${p.liq.activo ? cop(p.liq.deuda) : '—'}</td><td>${estadoPrestamo(p)}</td></tr>`).join('')}</tbody>
      </table></div>` : vacio('No tiene préstamos registrados.')}
      ${anulados.length ? `<p class="nota-pie">${anulados.length} ${anulados.length === 1 ? 'préstamo anulado no se muestra' : 'préstamos anulados no se muestran'}.</p>` : ''}`;
    cont.querySelector('#nuevo-prestamo').onclick = () => formNuevoPrestamo(cont.querySelector('#form-prestamo'), x, disponible);
  }

  el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { estado.tabMiembro = b.dataset.tab; vistaMiembro(el, id); }; });
  el.querySelectorAll('[data-extracto]').forEach((b) => {
    b.onclick = () => accion(() => (b.dataset.extracto === 'compartir' ? compartirExtracto(x) : descargarExtracto(x)));
  });
  filasClic(el);
}

function tabMovimientosCapital(cont, x) {
  cont.innerHTML = `
    <div class="tarjeta-cab"><h2 class="h2">Movimientos de capital</h2>
      <button class="btn sec" id="nuevo-mov">${ic('mas', 17)}Registrar movimiento</button></div>
    <div id="form-mov"></div>
    <div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Concepto</th><th class="d">Valor</th><th></th></tr></thead>
      <tbody>
        ${x.movimientos.map((mv) => `<tr>
          <td>${fecha(mv.fecha)}</td>
          <td>${TIPOS_MOV[mv.tipo] || mv.tipo}${mv.nota ? `<span class="celda-sub">${esc(mv.nota)}</span>` : ''}</td>
          <td class="d num ${mv.valor < 0 ? 'mal-t' : ''}">${cop(mv.valor)}</td>
          <td class="d"><button class="btn-x" data-borrar-mov="${mv.id}" aria-label="Borrar movimiento">×</button></td></tr>`).join('')}
        ${x.prestamos.filter((p) => p.liq.cruzado > 0).map((p) => `<tr class="derivado">
          <td>${fecha(p.pagos.filter((g) => g.tipo === 'cruce').at(-1)?.fecha)}</td>
          <td>Cruce para pagar el préstamo de ${cop(p.monto)}<span class="celda-sub">Se registra desde el préstamo</span></td>
          <td class="d num mal-t">${cop(-p.liq.cruzado)}</td><td></td></tr>`).join('')}
        ${x.prestamos.filter((p) => p.liq.favor > 0).map((p) => `<tr class="derivado">
          <td>${fecha(p.liq.ultimoPago)}</td>
          <td>Pago en exceso del préstamo de ${cop(p.monto)}<span class="celda-sub">Se abona solo a su capital</span></td>
          <td class="d num">${cop(p.liq.favor)}</td><td></td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td colspan="2">Capital actual</td><td class="d num">${cop(x.capital.total)}</td><td></td></tr></tfoot>
    </table></div>`;
  cont.querySelector('#nuevo-mov').onclick = () => formMovimiento(cont.querySelector('#form-mov'), x);
  cont.querySelectorAll('[data-borrar-mov]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('¿Borrar este movimiento de capital? Queda registrado en la auditoría.')) return;
      await accion(async () => { await borrar('movimientos_capital', b.dataset.borrarMov); await app.recargar(); aviso('Movimiento borrado'); });
    };
  });
}

function tabDatosMiembro(cont, x) {
  const puedeBorrar = x.prestamos.length === 0 && x.movimientos.length === 0;
  cont.innerHTML = `
  <form novalidate>
    <div class="rejilla">
      <label class="campo"><span>Nombre completo</span><input name="nombre" value="${esc(x.nombre)}" required></label>
      <label class="campo"><span>Teléfono</span><input name="telefono" inputmode="tel" value="${esc(x.telefono || '')}"></label>
    </div>
    <label class="campo"><span>Notas</span><textarea name="notas" rows="2">${esc(x.notas || '')}</textarea></label>
    <label class="check"><input type="checkbox" name="activo" ${x.activo ? 'checked' : ''}> Miembro activo</label>
    <p class="error" hidden></p>
    <div class="acciones"><button class="btn" type="submit">Guardar cambios</button>
      ${puedeBorrar ? '<button class="btn peligro" type="button" id="borrar-miembro">Eliminar miembro</button>' : ''}</div>
  </form>`;
  const f = cont.querySelector('form');
  f.onsubmit = (ev) => guardar(ev, f, async () => {
    if (!f.nombre.value.trim()) throw new Error('El nombre no puede quedar vacío.');
    await actualizar('miembros', x.id, { nombre: f.nombre.value.trim(), telefono: f.telefono.value.trim() || null, notas: f.notas.value.trim() || null, activo: f.activo.checked });
    await app.recargar(); aviso('Datos guardados');
  });
  const bm = cont.querySelector('#borrar-miembro');
  if (bm) bm.onclick = async () => {
    if (!confirm(`¿Eliminar a ${x.nombre}?`)) return;
    await accion(async () => { await borrar('miembros', x.id); await app.recargar(); location.hash = '#/miembros'; aviso('Miembro eliminado'); });
  };
}

function formMovimiento(cont, x) {
  cont.innerHTML = `
  <form class="form" novalidate>
    <div class="rejilla">
      <label class="campo"><span>Tipo</span><select name="tipo">
        <option value="aporte">Aporte</option><option value="retiro">Retiro</option>
        <option value="utilidad">Utilidad asignada</option><option value="ajuste">Ajuste</option></select></label>
      <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${hoyISO()}"></label>
      <label class="campo"><span>Valor</span>${inputPesos('valor')}</label>
      <label class="campo" data-signo hidden><span>El ajuste</span><select name="signo"><option value="1">Suma al capital</option><option value="-1">Resta del capital</option></select></label>
    </div>
    <label class="campo"><span>Nota</span><input name="nota" placeholder="Opcional"></label>
    <p class="ayuda" data-ayuda></p>
    <p class="error" hidden></p>
    <div class="acciones"><button class="btn" type="submit">Registrar</button><button class="btn sec" type="button" data-cancelar>Cancelar</button></div>
  </form>`;
  const f = cont.querySelector('form');
  activarPesos(f);
  const ayuda = f.querySelector('[data-ayuda]');
  const refrescar = () => {
    f.querySelector('[data-signo]').hidden = f.tipo.value !== 'ajuste';
    ayuda.textContent = f.tipo.value === 'retiro'
      ? `Por regla del fondo, primero se descuentan las deudas. Puede retirar hasta ${cop(Math.max(0, x.neto))} (su posición neta).`
      : '';
    ayuda.hidden = !ayuda.textContent;
  };
  f.tipo.onchange = refrescar; refrescar();
  f.querySelector('[data-cancelar]').onclick = () => { cont.innerHTML = ''; };
  f.onsubmit = (ev) => guardar(ev, f, async () => {
    const v = leerPesos(f.valor.value);
    if (v <= 0) throw new Error('Escribe un valor mayor que cero.');
    if (!f.fecha.value) throw new Error('Elige la fecha.');
    let valor = v;
    if (f.tipo.value === 'retiro') {
      if (v > x.neto + 1) throw new Error(`No puede retirar más de su posición neta (${cop(Math.max(0, x.neto))}). Primero debe cubrir sus deudas.`);
      valor = -v;
    }
    if (f.tipo.value === 'ajuste') valor = v * Number(f.signo.value);
    await insertar('movimientos_capital', { miembro_id: x.id, fecha: f.fecha.value, tipo: f.tipo.value, valor, nota: f.nota.value.trim() || null });
    await app.recargar(); aviso('Movimiento registrado');
  });
}

function formNuevoPrestamo(cont, x, disponible) {
  const limite = estado.modelo.fondo.limiteExposicion;
  cont.innerHTML = `
  <form class="form" novalidate>
    <h2 class="h2">Nuevo préstamo para ${esc(x.nombre)}</h2>
    <div class="rejilla">
      <label class="campo"><span>Monto</span>${inputPesos('monto')}</label>
      <label class="campo"><span>Fecha de desembolso</span><input type="date" name="fecha" value="${hoyISO()}"></label>
      <label class="campo"><span>Capital que lo respalda</span>${inputPesos('respaldo', disponible)}
        <small class="tenue">Sugerido: su capital menos lo que ya respalda otros préstamos.</small></label>
      <label class="campo"><span>Tasa</span><select name="tasa"><option value="">Regla del fondo</option><option value="pactada">Tasa pactada</option></select></label>
      <label class="campo" data-pactada hidden><span>Tasa pactada (% mensual)</span><input name="pct" inputmode="decimal" value="5"></label>
    </div>
    <div data-vista></div>
    <label class="campo"><span>Nota</span><input name="nota" placeholder="Ej.: aprobado en el grupo el 20/10"></label>
    <p class="error" hidden></p>
    <div class="acciones"><button class="btn" type="submit">Registrar préstamo</button><button class="btn sec" type="button" data-cancelar>Cancelar</button></div>
  </form>`;
  const f = cont.querySelector('form');
  activarPesos(f);
  const vista = f.querySelector('[data-vista]');
  const disp = estado.modelo.fondo.disponible;
  const refrescar = () => {
    f.querySelector('[data-pactada]').hidden = f.tasa.value !== 'pactada';
    const monto = leerPesos(f.monto.value), resp = leerPesos(f.respaldo.value);
    const tf = f.tasa.value === 'pactada' ? parseFloat(String(f.pct.value).replace(',', '.')) / 100 : null;
    if (!monto) { vista.innerHTML = ''; return; }
    const alertas = [];
    if (x.capital.total <= 0) alertas.push('No tiene capital aportado: el préstamo va al 10% mensual y no tiene respaldo si deja de pagar.');
    else if (monto > x.capital.total * limite) alertas.push(`Supera el límite de exposición: es ${(monto / x.capital.total).toFixed(1).replace('.', ',')} veces su capital y el fondo permite hasta ${limite}.`);
    if (monto > disp) alertas.push(`El fondo tiene ${cop(disp)} disponibles para prestar.`);
    vista.innerHTML = `<div class="tarjeta" style="margin:4px 0 12px">${barraTasas(monto, resp, tf)}</div>` + alertas.map((a) => `<p class="alerta">${esc(a)}</p>`).join('');
  };
  ['input', 'change'].forEach((e) => f.addEventListener(e, refrescar));
  f.monto.focus();
  f.querySelector('[data-cancelar]').onclick = () => { cont.innerHTML = ''; };
  f.onsubmit = (ev) => guardar(ev, f, async () => {
    const monto = leerPesos(f.monto.value);
    if (monto <= 0) throw new Error('Escribe el monto del préstamo.');
    if (!f.fecha.value) throw new Error('Elige la fecha de desembolso.');
    let tasa_fija = null;
    if (f.tasa.value === 'pactada') {
      tasa_fija = parseFloat(String(f.pct.value).replace(',', '.')) / 100;
      if (!(tasa_fija > 0 && tasa_fija < 1)) throw new Error('La tasa pactada debe estar entre 0 y 100%.');
    }
    const nuevo = await insertar('prestamos', {
      miembro_id: x.id, monto, fecha: f.fecha.value, capital_respaldo: leerPesos(f.respaldo.value),
      tasa_fija, nota: f.nota.value.trim() || null,
      plan: { modo: 'n', n: 4, cadaDias: 15, alinear: false, desde: f.fecha.value },
    });
    await app.recargar();
    estado.tabPrestamo = 'plan';
    location.hash = `#/prestamo/${nuevo.id}`;
    aviso('Préstamo registrado. Revisa el plan de cuotas.');
  });
}

// ═══════════════════════ Préstamos ═══════════════════════

export function vistaPrestamos(el) {
  const { prestamos } = estado.modelo;
  const activos = prestamos.filter((p) => p.liq.activo).sort((a, b) => b.liq.diasSinAbonar - a.liq.diasSinAbonar);
  const cancelados = prestamos.filter((p) => !p.liq.activo).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const f = estado.filtroPrestamos;
  const lista = f === 'cancelados' ? cancelados : activos;
  el.innerHTML = `
  <div class="cabeza"><div><h1 class="h1">Préstamos</h1><p class="sub">Para registrar un préstamo nuevo, entra a la ficha del miembro.</p></div></div>
  <section class="tarjeta sin-relleno">
    <div class="tarjeta-cab"><h2 class="h2">Cartera de préstamos</h2></div>
    <div class="filtros">${pildoras([['activos', `Activos (${activos.length})`], ['cancelados', `Cancelados (${cancelados.length})`]], f, 'data-filtro')}</div>
    ${lista.length ? `<div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Socio</th><th class="d">Monto</th><th class="ocultar-movil">Desembolso</th><th class="ocultar-movil">Tasa</th><th class="d">${f === 'cancelados' ? 'Pagado' : 'Debe hoy'}</th><th class="ocultar-movil">Estado</th></tr></thead>
      <tbody>${lista.map((p) => `<tr class="clic" data-ir="#/prestamo/${p.id}">
        <td><span class="persona">${avatar(nombreDe(p))}<a href="#/prestamo/${p.id}">${esc(nombreDe(p))}</a></span></td>
        <td class="d num">${cop(p.monto)}</td><td class="ocultar-movil">${fecha(p.fecha)}</td>
        <td class="ocultar-movil">${tasaCorta(p)}</td>
        <td class="d num fuerte">${cop(f === 'cancelados' ? p.liq.efectivo + p.liq.cruzado : p.liq.deuda)}</td>
        <td class="ocultar-movil">${estadoPrestamo(p)}</td></tr>`).join('')}</tbody>
    </table></div>` : vacio(f === 'cancelados' ? 'Aún no hay préstamos cancelados.' : 'No hay préstamos activos.')}
  </section>`;
  el.querySelectorAll('[data-filtro]').forEach((b) => { b.onclick = () => { estado.filtroPrestamos = b.dataset.filtro; vistaPrestamos(el); }; });
  filasClic(el);
}

// Cómo se parte el préstamo entre las tasas.
export function barraTasas(monto, respaldo, tasaFija) {
  if (!monto) return '';
  let tramos;
  if (tasaFija) tramos = [{ t: `${String(+(tasaFija * 100).toFixed(2)).replace('.', ',')}% mensual pactado`, v: monto, c: 'ocre', r: tasaFija }];
  else if (!respaldo) tramos = [{ t: '10% mensual, sin capital que lo respalde', v: monto, c: 'rojo', r: 0.10 }];
  else if (monto <= respaldo) tramos = [{ t: '2% mensual, cubierto por su capital', v: monto, c: 'verde', r: 0.02 }];
  else tramos = [{ t: '2% mensual sobre lo que cubre su capital', v: respaldo, c: 'verde', r: 0.02 }, { t: '5% mensual sobre lo que supera su capital', v: monto - respaldo, c: 'ocre', r: 0.05 }];
  const mensual = tramos.reduce((s, x) => s + x.v * x.r, 0);
  return `<div class="tramos-barra">${tramos.map((x) => `<div class="tramo ${x.c}" style="flex:${x.v}" title="${esc(x.t)}: ${cop(x.v)}"></div>`).join('')}</div>
    ${tramos.map((x) => `<div class="tramo-fila"><span><i class="punto ${x.c}"></i>${esc(x.t)}</span><span class="num">${cop(x.v)}</span></div>`).join('')}
    <div class="tramo-fila total"><span>Interés de un mes completo sobre el monto</span><span class="num">${cop(mensual)}</span></div>`;
}

const ESTADO_CUOTA = {
  pagada: ['Pagada', 'bien'], parcial: ['Abono parcial', 'aviso'],
  'parcial-vencida': ['Parcial, vencida', 'mal'], vencida: ['Vencida', 'mal'], pendiente: ['Pendiente', ''],
};

export function vistaPrestamo(el, id) {
  const p = estado.modelo.prestamoPorId[id];
  if (!p) { el.innerHTML = vacio('Ese préstamo no existe o está anulado.'); return; }
  const x = estado.modelo.miembroPorId[p.miembro_id];
  const l = p.liq;
  const plan = planConEstado(p, estado.corte);
  const respaldo = Number(p.capital_respaldo || 0);
  const tf = p.tasa_fija ? Number(p.tasa_fija) : null;
  const tab = estado.tabPrestamo;

  el.innerHTML = `
  <a class="volver" href="#/miembro/${x.id}">${ic('atras', 16)}Volver a ${esc(x.nombre)}</a>
  <div class="cabeza">
    <div>
      <h1 class="h1" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">Préstamo de ${cop(p.monto)} ${estadoPrestamo(p)}</h1>
      <p class="sub">Desembolsado a <a href="#/miembro/${x.id}">${esc(x.nombre)}</a> el ${fechaLarga(p.fecha)}</p>
    </div>
    ${l.activo ? `<div class="cabeza-acc">
      <button class="btn oscuro" data-pago="abono">Registrar abono</button>
      <button class="btn sec" data-pago="cruce">Cruce</button>
      <button class="btn" data-pago="saldar">Saldar todo</button></div>` : ''}
  </div>
  ${p.nota ? `<p class="banda">${esc(p.nota)}</p>` : ''}
  <div id="pago"></div>

  <div class="kpis compactas">
    ${kpi('prestamos', 'azul', 'Monto del préstamo', cop(p.monto))}
    ${kpi('calendario', '', 'Fecha de desembolso', fecha(p.fecha))}
    ${kpi('intereses', 'morado', 'Tasa', tasaCorta(p), tf ? 'Pactada' : 'Regla del fondo')}
    ${l.favor > 0
      ? kpi('ok', '', 'Pagó de más', cop(l.favor), 'Se abona a su capital', 'verde')
      : kpi('capital', l.activo ? 'rojo' : '', 'Saldo para cancelar hoy', cop(l.deuda), l.activo ? `Crece ${cop(l.interesDiario)} por día` : 'Préstamo cancelado', l.activo ? 'rojo' : 'verde')}
  </div>

  <div class="rejilla-2" style="margin-top:16px">
    <section class="tarjeta"><div class="tarjeta-cab"><h2 class="h2">Tasa del préstamo</h2></div>${barraTasas(Number(p.monto), respaldo, tf)}</section>
    <section class="tarjeta"><div class="tarjeta-cab"><h2 class="h2">Cuentas a la fecha de corte</h2></div>
      <dl class="datos">
        <div><dt>Capital pendiente</dt><dd>${cop(l.capital)}</dd></div>
        <div><dt>Intereses pendientes</dt><dd>${cop(l.intPend)}</dd></div>
        <div><dt>Total abonado en efectivo</dt><dd>${cop(l.efectivo)}</dd></div>
        <div><dt>Cruzado con su capital</dt><dd>${cop(l.cruzado)}</dd></div>
        <div><dt>Intereses generados</dt><dd>${cop(l.totalInt)}</dd></div>
      </dl></section>
  </div>

  <section class="tarjeta" style="margin-top:16px">
    ${pestanas([['plan', 'Plan de cuotas'], ['movimientos', `Movimientos (${l.filas.length})`], ['datos', 'Datos del préstamo']], tab, 'data-tab')}
    <div id="tab-cont"></div>
  </section>`;

  const cont = el.querySelector('#tab-cont');
  if (tab === 'movimientos') tabMovimientosPrestamo(cont, p);
  else if (tab === 'datos') tabDatosPrestamo(cont, p);
  else {
    cont.innerHTML = l.activo || plan ? `
      <div class="tarjeta-cab"><h2 class="h2">Plan de cuotas</h2>
        <div class="acciones">${plan ? '<button class="btn sec peq" id="reprogramar">Reprogramar desde el corte</button>' : ''}<button class="btn sec peq" id="editar-plan">${plan ? 'Cambiar plan' : 'Crear plan'}</button></div></div>
      <div id="form-plan"></div>
      ${plan ? bloquePlan(plan) : vacio('Este préstamo no tiene plan de cuotas.')}` : vacio('El préstamo está cancelado.');
    const ep = cont.querySelector('#editar-plan');
    if (ep) ep.onclick = () => formPlan(cont.querySelector('#form-plan'), p);
    const rp = cont.querySelector('#reprogramar');
    if (rp) rp.onclick = async () => {
      if (!confirm(`¿Rehacer el plan con el saldo al ${fecha(estado.corte)}? Las cuotas anteriores dejan de contarse como vencidas.`)) return;
      await accion(async () => {
        await actualizar('prestamos', p.id, { plan: { ...p.plan, desde: estado.corte, primera: null } });
        await app.recargar(); aviso('Plan reprogramado');
      });
    };
  }

  el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { estado.tabPrestamo = b.dataset.tab; vistaPrestamo(el, id); }; });
  el.querySelectorAll('[data-pago]').forEach((b) => { b.onclick = () => formPago(el.querySelector('#pago'), p, b.dataset.pago); });
}

function tabMovimientosPrestamo(cont, p) {
  const l = p.liq;
  cont.innerHTML = `
    <p class="ayuda">El interés se calcula por día sobre el saldo. Cada pago cubre primero los intereses acumulados y el resto baja el capital.</p>
    <div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Fecha</th><th class="d">Días</th><th class="d">Interés</th><th class="d">Pago</th><th class="d ocultar-movil">A interés</th><th class="d ocultar-movil">A capital</th><th class="d">Saldo</th><th></th></tr></thead>
      <tbody>
        <tr class="derivado"><td>${fecha(p.fecha)}</td><td colspan="5">Desembolso</td><td class="d num">${cop(p.monto)}</td><td></td></tr>
        ${l.filas.map((f) => `<tr>
          <td>${fecha(f.fecha)}${f.nota ? `<span class="celda-sub">${esc(f.nota)}</span>` : ''}</td>
          <td class="d num tenue">${f.dias}</td><td class="d num">${cop(f.interes)}</td>
          <td class="d num fuerte">${cop(f.valor)}${f.tipo === 'cruce' ? ' <span class="estado morado">Cruce</span>' : ''}</td>
          <td class="d num tenue ocultar-movil">${cop(f.aInt)}</td><td class="d num tenue ocultar-movil">${cop(f.aCap)}</td>
          <td class="d num fuerte">${cop(f.saldo)}</td>
          <td class="d"><button class="btn-x" data-borrar-pago="${f.id}" aria-label="Borrar pago">×</button></td></tr>`).join('')}
        ${l.corteFila && l.corteFila.dias > 0 ? `<tr class="derivado"><td>${fecha(l.corteFila.fecha)}</td><td class="d num">${l.corteFila.dias}</td>
          <td class="d num">${cop(l.corteFila.interes)}</td><td colspan="3">Intereses corridos hasta el corte, sin pago</td>
          <td class="d num">${cop(l.capital)}</td><td></td></tr>` : ''}
      </tbody>
      <tfoot><tr><td colspan="2">Totales</td><td class="d num">${cop(l.totalInt)}</td><td class="d num">${cop(l.efectivo + l.cruzado)}</td><td colspan="4"></td></tr></tfoot>
    </table></div>`;
  cont.querySelectorAll('[data-borrar-pago]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('¿Borrar este pago? Los saldos se recalculan y el cambio queda en la auditoría.')) return;
      await accion(async () => { await borrar('pagos', b.dataset.borrarPago); await app.recargar(); aviso('Pago borrado'); });
    };
  });
}

function tabDatosPrestamo(cont, p) {
  const respaldo = Number(p.capital_respaldo || 0);
  const tf = p.tasa_fija ? Number(p.tasa_fija) : null;
  cont.innerHTML = `
    <form novalidate id="f-datos">
      <div class="rejilla">
        <label class="campo"><span>Monto</span>${inputPesos('monto', Number(p.monto))}</label>
        <label class="campo"><span>Fecha de desembolso</span><input type="date" name="fecha" value="${p.fecha}"></label>
        <label class="campo"><span>Capital que lo respalda</span>${inputPesos('respaldo', respaldo)}</label>
        <label class="campo"><span>Tasa pactada (% mensual, vacío = regla)</span><input name="pct" inputmode="decimal" value="${tf ? String(+(tf * 100).toFixed(2)).replace('.', ',') : ''}"></label>
      </div>
      <label class="campo"><span>Nota</span><input name="nota" value="${esc(p.nota || '')}"></label>
      <p class="error" hidden></p>
      <div class="acciones"><button class="btn" type="submit">Guardar cambios</button>
        <button class="btn peligro" type="button" id="anular">Anular préstamo</button></div>
    </form>`;
  const f = cont.querySelector('#f-datos');
  activarPesos(f);
  f.onsubmit = (ev) => guardar(ev, f, async () => {
    const monto = leerPesos(f.monto.value);
    if (monto <= 0) throw new Error('El monto debe ser mayor que cero.');
    const txt = String(f.pct.value).trim().replace(',', '.');
    const tasa_fija = txt ? parseFloat(txt) / 100 : null;
    if (txt && !(tasa_fija > 0 && tasa_fija < 1)) throw new Error('La tasa pactada debe estar entre 0 y 100%.');
    if (p.pagos.some((g) => g.fecha < f.fecha.value)) throw new Error('Hay pagos anteriores a esa fecha de desembolso.');
    await actualizar('prestamos', p.id, { monto, fecha: f.fecha.value, capital_respaldo: leerPesos(f.respaldo.value), tasa_fija, nota: f.nota.value.trim() || null });
    await app.recargar(); aviso('Préstamo actualizado');
  });
  cont.querySelector('#anular').onclick = async () => {
    if (!confirm('¿Anular este préstamo? Deja de contar en saldos y en el capital. El registro se conserva en la auditoría.')) return;
    await accion(async () => {
      await actualizar('prestamos', p.id, { anulado: true });
      await app.recargar(); location.hash = `#/miembro/${p.miembro_id}`; aviso('Préstamo anulado');
    });
  };
}

function bloquePlan(plan) {
  return `
  <div class="kpis compactas" style="margin-bottom:16px">
    ${kpi('extractos', 'azul', 'Total del plan', cop(plan.total), `Calculado con el saldo al ${fecha(plan.desde)}`)}
    ${kpi('ok', '', 'Pagado desde entonces', cop(plan.pagado))}
    ${plan.vencidas ? kpi('alerta', 'rojo', 'Atrasado', cop(plan.valorVencido), `${plan.vencidas} ${plan.vencidas === 1 ? 'cuota vencida' : 'cuotas vencidas'}`, 'rojo')
      : plan.proxima ? kpi('calendario', '', 'Próxima cuota', cop(plan.proxima.cuota), fecha(plan.proxima.fecha)) : kpi('ok', '', 'Plan', 'Completo', '', 'verde')}
  </div>
  <div class="tabla-envoltura"><table class="tabla">
    <thead><tr><th>Cuota</th><th>Fecha</th><th class="d ocultar-movil">Interés</th><th class="d ocultar-movil">A capital</th><th class="d">Valor a pagar</th><th class="d ocultar-movil">Saldo</th><th>Estado</th></tr></thead>
    <tbody>${plan.cuotas.map((c) => {
      const [t, tono] = ESTADO_CUOTA[c.estado];
      return `<tr><td class="num">${c.n} de ${plan.cuotas.length}</td><td>${fecha(c.fecha)}</td>
        <td class="d num tenue ocultar-movil">${cop(c.interes)}</td><td class="d num tenue ocultar-movil">${cop(c.capital)}</td>
        <td class="d num fuerte">${cop(c.cuota)}</td><td class="d num tenue ocultar-movil">${cop(c.saldo)}</td>
        <td><span class="estado ${tono}">${t}</span></td></tr>`;
    }).join('')}</tbody>
  </table></div>
  <p class="nota-pie">Las cuotas se calcularon sobre el saldo al ${fecha(plan.desde)}. Si paga tarde, el interés sigue corriendo y el saldo real será mayor; usa "Reprogramar desde el corte" para rehacer las cuotas con el saldo de hoy.</p>`;
}

function formPago(cont, p, modo) {
  const x = estado.modelo.miembroPorId[p.miembro_id];
  const tipo = modo === 'cruce' ? 'cruce' : 'abono';
  const titulo = modo === 'cruce' ? 'Cruce con su capital' : modo === 'saldar' ? 'Saldar todo el préstamo' : 'Registrar abono';
  cont.innerHTML = `
  <form class="form" novalidate>
    <h2 class="h2">${titulo}</h2>
    <div class="rejilla">
      <label class="campo"><span>Fecha del pago</span><input type="date" name="fecha" value="${hoyISO() < p.fecha ? p.fecha : hoyISO()}"></label>
      <label class="campo"><span>Valor recibido</span>${inputPesos('valor')}</label>
      <label class="campo"><span>Tipo</span><select name="tipo"><option value="abono" ${tipo === 'abono' ? 'selected' : ''}>Abono en efectivo</option><option value="cruce" ${tipo === 'cruce' ? 'selected' : ''}>Cruce con su capital</option></select></label>
    </div>
    <p class="ayuda" data-ayuda></p>
    <label class="campo"><span>Nota</span><input name="nota" placeholder="Opcional"></label>
    <p class="error" hidden></p>
    <div class="acciones"><button class="btn" type="submit">Registrar pago</button>
      <button class="btn sec" type="button" data-saldar>Calcular valor para saldar todo</button>
      <button class="btn sec" type="button" data-cancelar>Cancelar</button></div>
  </form>`;
  const f = cont.querySelector('form');
  activarPesos(f);
  const ayuda = f.querySelector('[data-ayuda]');
  const refrescar = () => {
    const v = leerPesos(f.valor.value);
    if (!f.fecha.value) { ayuda.textContent = ''; return; }
    const deuda = valorParaSaldar(p, p.pagos, f.fecha.value);
    const partes = [`A esa fecha debe ${cop(deuda)}.`];
    if (v > deuda + 1) partes.push(`Pagaría ${cop(v - deuda)} de más; ese excedente se abona a su capital.`);
    if (f.tipo.value === 'cruce') partes.push(`Su capital actual es ${cop(x.capital.total)}.`);
    if (f.tipo.value === 'cruce' && v > x.capital.total + 1) partes.push('El cruce supera su capital.');
    ayuda.textContent = partes.join(' ');
  };
  const saldar = () => {
    if (!f.fecha.value) return;
    f.valor.value = Math.round(valorParaSaldar(p, p.pagos, f.fecha.value)).toLocaleString('es-CO');
    refrescar();
  };
  ['input', 'change'].forEach((e) => f.addEventListener(e, refrescar));
  f.querySelector('[data-saldar]').onclick = saldar;
  f.querySelector('[data-cancelar]').onclick = () => { cont.innerHTML = ''; };
  if (modo === 'saldar') saldar(); else refrescar();
  f.valor.focus();
  cont.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  f.onsubmit = (ev) => guardar(ev, f, async () => {
    const valor = leerPesos(f.valor.value);
    if (!f.fecha.value) throw new Error('Elige la fecha del pago.');
    if (f.fecha.value < p.fecha) throw new Error('El pago no puede ser anterior al desembolso.');
    if (valor <= 0) throw new Error('Escribe el valor recibido.');
    if (f.tipo.value === 'cruce' && valor > x.capital.total + 1) throw new Error(`El cruce (${cop(valor)}) supera su capital actual (${cop(x.capital.total)}).`);
    const deuda = valorParaSaldar(p, p.pagos, f.fecha.value);
    if (valor > deuda + 1 && !confirm(`El pago supera la deuda en ${cop(valor - deuda)}. Ese valor se abonará a su capital. ¿Continuar?`)) return;
    await insertar('pagos', { prestamo_id: p.id, fecha: f.fecha.value, valor, tipo: f.tipo.value, nota: f.nota.value.trim() || null });
    await app.recargar(); aviso('Pago registrado');
  });
}

function formPlan(cont, p) {
  const pl = p.plan || { modo: 'n', n: 4, cadaDias: 15, alinear: false };
  const desdeInicial = p.plan?.desde || estado.corte;
  cont.innerHTML = `
  <form class="form" novalidate>
    <div class="rejilla">
      <label class="campo"><span>Tipo de plan</span><select name="modo">
        <option value="n" ${pl.modo !== 'fija' ? 'selected' : ''}>Número de cuotas</option>
        <option value="fija" ${pl.modo === 'fija' ? 'selected' : ''}>Valor fijo por cuota</option></select></label>
      <label class="campo" data-n><span>Número de cuotas</span><input name="n" type="number" min="1" max="120" value="${pl.n || 4}"></label>
      <label class="campo" data-fija><span>Valor de cada cuota</span>${inputPesos('cuota', pl.cuotaFija || 0)}</label>
      <label class="campo"><span>Frecuencia</span><select name="cada">
        <option value="15" ${(pl.cadaDias || 15) === 15 ? 'selected' : ''}>Quincenal</option>
        <option value="30" ${pl.cadaDias === 30 ? 'selected' : ''}>Mensual</option></select></label>
      <label class="campo"><span>Calcular con el saldo al</span><input type="date" name="desde" value="${desdeInicial}"></label>
      <label class="campo"><span>Primera cuota (opcional)</span><input type="date" name="primera" value="${pl.primera || ''}"></label>
    </div>
    <label class="check"><input type="checkbox" name="alinear" ${pl.alinear ? 'checked' : ''}> Cobrar el 15 y el 30 de cada mes (días de pago de sueldo)</label>
    <div data-previa></div>
    <p class="error" hidden></p>
    <div class="acciones"><button class="btn" type="submit">Guardar plan</button><button class="btn sec" type="button" data-cancelar>Cancelar</button></div>
  </form>`;
  const f = cont.querySelector('form');
  activarPesos(f);
  const previa = f.querySelector('[data-previa]');
  const leer = () => ({
    modo: f.modo.value, n: Math.max(1, parseInt(f.n.value, 10) || 1), cuotaFija: leerPesos(f.cuota.value),
    cadaDias: Number(f.cada.value), alinear: f.alinear.checked, desde: f.desde.value || estado.corte,
    primera: f.primera.value || null,
  });
  const refrescar = () => {
    f.querySelector('[data-n]').hidden = f.modo.value !== 'n';
    f.querySelector('[data-fija]').hidden = f.modo.value !== 'fija';
    const o = leer();
    if (o.primera && o.primera <= o.desde) { previa.innerHTML = '<p class="alerta">La primera cuota debe ser después de la fecha del saldo.</p>'; return; }
    const base = liquidar(p, p.pagos.filter((g) => g.fecha <= o.desde), o.desde);
    const cuotas = generarPlan({ capital: base.capital, intPend: base.intPend, respaldo: Number(p.capital_respaldo || 0), tasaFija: p.tasa_fija ? Number(p.tasa_fija) : null, ...o });
    if (o.modo === 'fija' && cuotas.length && cuotas.length >= 120) { previa.innerHTML = '<p class="alerta">Con esa cuota el préstamo no se termina de pagar: no alcanza a cubrir los intereses.</p>'; return; }
    if (!cuotas.length) { previa.innerHTML = o.modo === 'fija' ? '<p class="ayuda">Escribe el valor de la cuota.</p>' : ''; return; }
    const total = cuotas.reduce((s, c) => s + c.cuota, 0);
    previa.innerHTML = `<p class="ayuda">Saldo al ${fecha(o.desde)}: <strong>${cop(base.deuda)}</strong>. ${cuotas.length} cuotas, total ${cop(total)} (${cop(total - base.deuda)} de intereses futuros).</p>
      <div class="tarjeta sin-relleno" style="margin-bottom:12px"><div class="tabla-envoltura"><table class="tabla compacta"><thead><tr><th>Cuota</th><th>Fecha</th><th class="d">Interés</th><th class="d">Valor a pagar</th></tr></thead>
      <tbody>${cuotas.map((c) => `<tr><td>${c.n}</td><td>${fecha(c.fecha)}</td><td class="d num tenue">${cop(c.interes)}</td><td class="d num fuerte">${cop(c.cuota)}</td></tr>`).join('')}</tbody></table></div></div>`;
  };
  ['input', 'change'].forEach((e) => f.addEventListener(e, refrescar));
  refrescar();
  f.querySelector('[data-cancelar]').onclick = () => { cont.innerHTML = ''; };
  f.onsubmit = (ev) => guardar(ev, f, async () => {
    const o = leer();
    if (o.modo === 'fija' && !(o.cuotaFija > 0)) throw new Error('Escribe el valor de cada cuota.');
    if (o.primera && o.primera <= o.desde) throw new Error('La primera cuota debe ser después de la fecha del saldo.');
    const base = liquidar(p, p.pagos.filter((g) => g.fecha <= o.desde), o.desde);
    if (o.modo === 'fija' && o.cuotaFija <= interesPeriodo(base.capital, Number(p.capital_respaldo || 0), o.cadaDias, p.tasa_fija ? Number(p.tasa_fija) : null)) {
      throw new Error('La cuota no alcanza a cubrir los intereses de cada periodo.');
    }
    await actualizar('prestamos', p.id, { plan: o });
    await app.recargar(); aviso('Plan guardado');
  });
}
