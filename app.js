// Escuela de Negocios · interfaz de administración
import { sb, cargarTodo, insertar, actualizar, borrar, esAdmin, iniciarSesion, cambiarClave, cerrarSesion } from './datos.js';
import { hoyISO, describirTasa, valorParaSaldar, generarPlan, interesPeriodo, liquidar, respaldoDisponible } from './motor.js';
import { construirModelo, planConEstado } from './modelo.js';
import { cop, fecha, fechaLarga, esc, leerPesos, pct } from './formato.js';

const raiz = document.getElementById('app');
const estado = { datos: null, modelo: null, corte: hoyISO(), usuario: null, busqueda: '' };

// ═══════════════════════ Arranque y sesión ═══════════════════════

async function iniciar() {
  const { data } = await sb.auth.getSession();
  if (data.session) await entrar(data.session.user);
  else pantallaIngreso();
  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') pantallaIngreso();
  });
  window.addEventListener('hashchange', () => estado.modelo && pintar());
}

async function entrar(usuario) {
  estado.usuario = usuario;
  if (usuario.user_metadata?.debe_cambiar_clave) return pantallaCambioClave(true);
  pantallaCarga('Verificando acceso…');
  try {
    if (!(await esAdmin())) return pantallaSinAcceso();
    await recargar();
  } catch (e) {
    pantallaError(e.message);
  }
}

async function recargar() {
  estado.datos = await cargarTodo();
  estado.modelo = construirModelo(estado.datos, estado.corte);
  pintar();
}

function pantallaCarga(texto) {
  raiz.innerHTML = `<div class="centro"><p class="tenue">${esc(texto)}</p></div>`;
}

function pantallaError(texto) {
  raiz.innerHTML = `<div class="centro"><div class="tarjeta angosta">
    <h1 class="h2">No se pudieron cargar los datos</h1>
    <p>${esc(texto)}</p>
    <button class="btn" id="reintentar">Intentar de nuevo</button></div></div>`;
  raiz.querySelector('#reintentar').onclick = () => entrar(estado.usuario);
}

function pantallaIngreso() {
  raiz.innerHTML = `
  <div class="centro">
    <form class="tarjeta angosta" id="f-ingreso" novalidate>
      <div class="marca">Escuela de Negocios</div>
      <h1 class="h2">Ingreso de administradores</h1>
      <label class="campo"><span>Correo</span>
        <input type="email" name="email" autocomplete="username" required></label>
      <label class="campo"><span>Contraseña</span>
        <input type="password" name="clave" autocomplete="current-password" required></label>
      <p class="error" id="err" hidden></p>
      <button class="btn ancho" type="submit">Ingresar</button>
    </form>
  </div>`;
  const f = raiz.querySelector('#f-ingreso');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const err = f.querySelector('#err');
    const email = f.email.value, clave = f.clave.value;
    if (!email || !clave) return mostrarError(err, 'Escribe tu correo y tu contraseña.');
    const btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = 'Ingresando…';
    try {
      const { user } = await iniciarSesion(email, clave);
      await entrar(user);
    } catch (e) {
      mostrarError(err, e.message);
      btn.disabled = false; btn.textContent = 'Ingresar';
    }
  };
}

function pantallaCambioClave(obligatorio) {
  raiz.innerHTML = `
  <div class="centro">
    <form class="tarjeta angosta" id="f-clave" novalidate>
      <div class="marca">Escuela de Negocios</div>
      <h1 class="h2">${obligatorio ? 'Crea tu contraseña' : 'Cambiar contraseña'}</h1>
      ${obligatorio ? '<p class="tenue">Estás usando una contraseña temporal. Elige una nueva para continuar.</p>' : ''}
      <label class="campo"><span>Nueva contraseña</span>
        <input type="password" name="c1" autocomplete="new-password" minlength="8" required></label>
      <label class="campo"><span>Repítela</span>
        <input type="password" name="c2" autocomplete="new-password" required></label>
      <p class="error" id="err" hidden></p>
      <button class="btn ancho" type="submit">Guardar contraseña</button>
      ${obligatorio ? '' : '<a class="enlace" href="#/">Cancelar</a>'}
    </form>
  </div>`;
  const f = raiz.querySelector('#f-clave');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const err = f.querySelector('#err');
    if (f.c1.value.length < 8) return mostrarError(err, 'La contraseña debe tener al menos 8 caracteres.');
    if (f.c1.value !== f.c2.value) return mostrarError(err, 'Las dos contraseñas no coinciden.');
    try {
      const { user } = await cambiarClave(f.c1.value);
      aviso('Contraseña guardada');
      location.hash = '#/';
      await entrar(user);
    } catch (e) { mostrarError(err, e.message); }
  };
}

function pantallaSinAcceso() {
  raiz.innerHTML = `<div class="centro"><div class="tarjeta angosta">
    <div class="marca">Escuela de Negocios</div>
    <h1 class="h2">Tu correo no está autorizado</h1>
    <p>${esc(estado.usuario?.email)} no aparece en la lista de administradores del fondo.</p>
    <button class="btn" id="salir">Cerrar sesión</button></div></div>`;
  raiz.querySelector('#salir').onclick = cerrarSesion;
}

// ═══════════════════════ Estructura y rutas ═══════════════════════

function ruta() {
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  return { vista: partes[0] || 'resumen', id: partes[1] };
}

function pintar() {
  const r = ruta();
  if (r.vista === 'clave') return pantallaCambioClave(false);
  const tabs = [['resumen', 'Resumen'], ['miembros', 'Miembros'], ['prestamos', 'Préstamos']];
  const activa = r.vista === 'miembro' ? 'miembros' : r.vista === 'prestamo' ? 'prestamos' : r.vista;
  raiz.innerHTML = `
  <header class="barra">
    <div class="barra-in">
      <a class="marca" href="#/">Escuela de Negocios</a>
      <div class="barra-der">
        <label class="corte" title="Todos los saldos se calculan a esta fecha">
          <span>Corte</span>
          <input type="date" id="corte" value="${estado.corte}">
        </label>
        <button class="btn-icono" id="actualizar" title="Traer los cambios de otros administradores" aria-label="Actualizar">↻</button>
        <details class="menu">
          <summary aria-label="Cuenta">${esc((estado.usuario?.email || '?')[0].toUpperCase())}</summary>
          <div class="menu-in">
            <div class="tenue peq">${esc(estado.usuario?.email)}</div>
            <a href="#/clave">Cambiar contraseña</a>
            <button id="salir">Cerrar sesión</button>
          </div>
        </details>
      </div>
    </div>
    <nav class="tabs">${tabs.map(([k, t]) =>
      `<a href="#/${k}" class="${activa === k ? 'on' : ''}">${t}</a>`).join('')}</nav>
  </header>
  <main id="vista" class="contenido"></main>
  <div id="avisos" aria-live="polite"></div>`;

  raiz.querySelector('#corte').onchange = (ev) => {
    if (!ev.target.value) return;
    estado.corte = ev.target.value;
    estado.modelo = construirModelo(estado.datos, estado.corte);
    pintar();
  };
  raiz.querySelector('#actualizar').onclick = async () => { await recargar(); aviso('Datos actualizados'); };
  raiz.querySelector('#salir').onclick = cerrarSesion;

  const vista = raiz.querySelector('#vista');
  const vistas = { resumen: vistaResumen, miembros: vistaMiembros, miembro: vistaMiembro, prestamos: vistaPrestamos, prestamo: vistaPrestamo };
  (vistas[r.vista] || vistaResumen)(vista, r.id);
  if (estado.corte !== hoyISO()) {
    vista.insertAdjacentHTML('afterbegin', `<div class="banda">Estás viendo el fondo al <strong>${fechaLarga(estado.corte)}</strong>, no a hoy.</div>`);
  }
}

// ═══════════════════════ Resumen ═══════════════════════

function vistaResumen(el) {
  const { fondo, activos } = estado.modelo;
  const conPlan = activos.map((p) => ({ p, plan: planConEstado(p, estado.corte) }));
  const atrasados = conPlan.filter((x) => x.plan?.vencidas > 0).sort((a, b) => b.plan.valorVencido - a.plan.valorVencido);
  const sinPlan = conPlan.filter((x) => !x.plan);
  const pctColocado = fondo.capital > 0 ? fondo.colocado / fondo.capital : 0;

  // El capital de los socios está en tres lugares: prestado, en bienes y disponible.
  const partes = [
    { c: 'seg-tinta', t: 'Prestado (capital pendiente)', v: fondo.colocado, n: `${pct(pctColocado)} del capital` },
    ...(fondo.inmovilizado ? [{ c: 'seg-ocre', t: fondo.inmovilizadoDesc || 'Bienes del fondo', v: fondo.inmovilizado, n: '' }] : []),
    { c: 'seg-verde', t: 'Disponible para prestar', v: fondo.disponible, n: fondo.disponible < 0 ? 'Hay más prestado que capital libre' : '', tono: fondo.disponible < 0 ? 'rojo' : 'verde' },
  ];

  el.innerHTML = `
  <h1 class="h1">Resumen del fondo</h1>
  <section class="fondo">
    <div class="fondo-cabeza">
      <div><div class="fondo-t">Capital de los socios</div><div class="fondo-v">${cop(fondo.capital)}</div></div>
      <div class="fondo-lado"><div class="fondo-t">Intereses por cobrar</div><div class="fondo-v">${cop(fondo.interesesPorCobrar)}</div></div>
    </div>
    <div class="fondo-barra" role="img" aria-label="Reparto del capital">${partes.map((x) =>
      `<div class="${x.c}" style="flex:${Math.max(0, x.v)}" title="${esc(x.t)}: ${cop(x.v)}"></div>`).join('')}</div>
    <div class="fondo-partes">${partes.map((x) => `<div class="parte">
      <div class="parte-t"><i class="${x.c}"></i>${esc(x.t)}</div>
      <div class="parte-v ${x.tono || ''}">${cop(x.v)}</div>
      ${x.n ? `<div class="parte-n">${x.n}</div>` : ''}</div>`).join('')}</div>
  </section>

  ${atrasados.length ? `
  <section>
    <h2 class="h2">Con cuotas vencidas <span class="tenue">(${atrasados.length})</span></h2>
    <div class="lista">${cabezaLista()}${atrasados.map(({ p, plan }) => filaPrestamo(p, `
      <span class="chip mal">${plan.vencidas} ${plan.vencidas === 1 ? 'cuota vencida' : 'cuotas vencidas'}</span>
      <span class="tenue">${cop(plan.valorVencido)} atrasado</span>`)).join('')}</div>
  </section>` : ''}

  <section>
    <h2 class="h2">Préstamos activos <span class="tenue">(${activos.length})</span></h2>
    ${activos.length ? `<div class="lista">${cabezaLista()}${activos.slice().sort((a, b) => b.liq.deuda - a.liq.deuda).map((p) => filaPrestamo(p)).join('')}</div>` : vacio('No hay préstamos activos.')}
  </section>

  ${sinPlan.length ? `<p class="nota">${sinPlan.length} ${sinPlan.length === 1 ? 'préstamo activo no tiene' : 'préstamos activos no tienen'} plan de cuotas:
    ${sinPlan.map(({ p }) => `<a href="#/prestamo/${p.id}">${esc(nombreDe(p))}</a>`).join(', ')}.</p>` : ''}`;
}

function cifra(titulo, valor, nota = '', tono = '') {
  return `<div class="cifra ${tono}"><div class="cifra-t">${esc(titulo)}</div>
    <div class="cifra-v">${valor}</div>${nota ? `<div class="cifra-n">${nota}</div>` : ''}</div>`;
}

function diasTxt(n) { return n === 1 ? '1 día' : `${n} días`; }

function vacio(texto) { return `<p class="vacio">${esc(texto)}</p>`; }

function nombreDe(p) { return estado.modelo.miembroPorId[p.miembro_id]?.nombre || '—'; }

function cabezaLista(izq = 'Socio y préstamo') {
  return `<div class="lista-cabeza"><span>${izq}</span><span>Debe hoy</span></div>`;
}

// En la ficha del socio el nombre sobra: la fila se titula con el préstamo.
function filaPrestamo(p, extra = '', { enFicha = false } = {}) {
  const l = p.liq;
  const tarde = l.activo && p.franja && p.franja.clave !== 'aldia';
  return `<a class="fila" href="#/prestamo/${p.id}">
    <div class="fila-a">${enFicha
      ? `<strong>Préstamo de ${cop(p.monto)}</strong><span class="peq tenue">Desembolsado el ${fecha(p.fecha)}</span>`
      : `<strong>${esc(nombreDe(p))}</strong><span class="peq tenue">${cop(p.monto)} del ${fecha(p.fecha)}</span>`}
      ${extra ? `<span class="fila-extra">${extra}</span>` : ''}</div>
    <div class="fila-b">${l.activo
      ? `<strong class="num">${cop(l.deuda)}</strong><span class="peq ${tarde ? 'mal-t' : 'tenue'}">${diasTxt(l.diasSinAbonar)} sin abonar</span>`
      : l.favor > 0 ? `<span class="chip bien">Cancelado, ${cop(l.favor)} a favor</span>` : '<span class="chip bien">Cancelado</span>'}</div>
  </a>`;
}

// ═══════════════════════ Miembros ═══════════════════════

function vistaMiembros(el) {
  const m = estado.modelo;
  const q = estado.busqueda.trim().toLowerCase();
  const lista = m.miembros
    .filter((x) => !q || x.nombre.toLowerCase().includes(q))
    .sort((a, b) => (b.activo - a.activo) || a.nombre.localeCompare(b.nombre, 'es'));
  el.innerHTML = `
  <div class="titulo-acc">
    <h1 class="h1">Miembros <span class="tenue">(${m.miembros.length})</span></h1>
    <button class="btn" id="nuevo">Nuevo miembro</button>
  </div>
  <div id="form-nuevo"></div>
  <input class="buscar" type="search" id="buscar" placeholder="Buscar por nombre" value="${esc(estado.busqueda)}">
  <div class="tabla-envoltura">
  <table class="tabla">
    <thead><tr><th>Miembro</th><th class="d">Capital</th><th class="d">Deuda</th><th class="d">Posición neta</th></tr></thead>
    <tbody>${lista.map((x) => `
      <tr class="clic ${x.activo ? '' : 'inactivo'}" data-ir="#/miembro/${x.id}">
        <td><a href="#/miembro/${x.id}">${esc(x.nombre)}</a>${x.activo ? '' : ' <span class="chip">Inactivo</span>'}</td>
        <td class="d num">${cop(x.capital.total)}</td>
        <td class="d num ${x.deuda > 0 ? 'mal-t' : 'tenue'}">${x.deuda > 0 ? cop(x.deuda) : '—'}</td>
        <td class="d num ${x.neto < 0 ? 'mal-t' : ''}">${cop(x.neto)}</td>
      </tr>`).join('')}</tbody>
  </table></div>`;

  const buscar = el.querySelector('#buscar');
  buscar.oninput = () => { estado.busqueda = buscar.value; const pos = buscar.selectionStart; vistaMiembros(el); const b = el.querySelector('#buscar'); b.focus(); b.setSelectionRange(pos, pos); };
  el.querySelectorAll('tr[data-ir]').forEach((tr) => { tr.onclick = (ev) => { if (ev.target.tagName !== 'A') location.hash = tr.dataset.ir; }; });
  el.querySelector('#nuevo').onclick = () => formNuevoMiembro(el.querySelector('#form-nuevo'));
}

function formNuevoMiembro(cont) {
  cont.innerHTML = `
  <form class="tarjeta" novalidate>
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
  f.querySelector('[data-cancelar]').onclick = () => { cont.innerHTML = ''; };
  f.onsubmit = (ev) => guardar(ev, f, async () => {
    const nombre = f.nombre.value.trim();
    if (!nombre) throw new Error('Escribe el nombre del miembro.');
    const capital = leerPesos(f.capital.value);
    const nuevo = await insertar('miembros', { nombre, telefono: f.telefono.value.trim() || null });
    if (capital > 0) {
      await insertar('movimientos_capital', { miembro_id: nuevo.id, fecha: f.fecha.value || hoyISO(), tipo: 'saldo_inicial', valor: capital, nota: 'Capital inicial' });
    }
    await recargar();
    location.hash = `#/miembro/${nuevo.id}`;
    aviso('Miembro creado');
  });
}

// ═══════════════════════ Ficha del miembro ═══════════════════════

const TIPOS_MOV = { saldo_inicial: 'Saldo inicial', aporte: 'Aporte', retiro: 'Retiro', utilidad: 'Utilidad', ajuste: 'Ajuste' };

function vistaMiembro(el, id) {
  const x = estado.modelo.miembroPorId[id];
  if (!x) { el.innerHTML = vacio('Ese miembro no existe.'); return; }
  const disponible = respaldoDisponible(x.capital.total, x.capitalPendiente);
  const prestamos = x.prestamos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const anulados = estado.datos.prestamos.filter((p) => p.miembro_id === id && p.anulado);

  el.innerHTML = `
  <a class="volver" href="#/miembros">Miembros</a>
  <div class="titulo-acc">
    <h1 class="h1">${esc(x.nombre)} ${x.activo ? '' : '<span class="chip">Inactivo</span>'}</h1>
    <button class="btn sec" id="editar">Editar datos</button>
  </div>
  <div id="form-editar"></div>
  ${x.telefono ? `<p class="tenue">Teléfono: ${esc(x.telefono)}</p>` : ''}
  ${x.notas ? `<p class="nota">${esc(x.notas)}</p>` : ''}

  <section class="cifras">
    ${cifra('Capital actual', cop(x.capital.total), '', 'bien')}
    ${cifra('Deuda vigente', cop(x.deuda), x.activos.length ? `${x.activos.length} ${x.activos.length === 1 ? 'préstamo activo' : 'préstamos activos'}` : 'Sin préstamos activos', x.deuda > 0 ? 'mal' : '')}
    ${cifra('Posición neta', cop(x.neto), x.neto < 0 ? 'Debe más de lo que tiene en el fondo' : 'Capital menos deuda', x.neto < 0 ? 'mal' : '')}
    ${cifra('Respaldo para un préstamo nuevo', cop(disponible), 'Hasta este monto, al 2% mensual')}
  </section>

  <section>
    <div class="titulo-acc"><h2 class="h2">Préstamos</h2><button class="btn" id="nuevo-prestamo">Nuevo préstamo</button></div>
    <div id="form-prestamo"></div>
    ${prestamos.length ? `<div class="lista">${cabezaLista('Préstamo')}${prestamos.map((p) => filaPrestamo(p, '', { enFicha: true })).join('')}</div>` : vacio('No tiene préstamos registrados.')}
    ${anulados.length ? `<p class="peq tenue">${anulados.length} ${anulados.length === 1 ? 'préstamo anulado' : 'préstamos anulados'} no se muestran.</p>` : ''}
  </section>

  <section>
    <div class="titulo-acc"><h2 class="h2">Movimientos de capital</h2><button class="btn sec" id="nuevo-mov">Registrar movimiento</button></div>
    <div id="form-mov"></div>
    <div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Fecha</th><th>Concepto</th><th class="d">Valor</th><th></th></tr></thead>
      <tbody>
        ${x.movimientos.map((mv) => `<tr>
          <td>${fecha(mv.fecha)}</td>
          <td>${TIPOS_MOV[mv.tipo] || mv.tipo}${mv.nota ? `<div class="peq tenue">${esc(mv.nota)}</div>` : ''}</td>
          <td class="d num ${mv.valor < 0 ? 'mal-t' : ''}">${cop(mv.valor)}</td>
          <td class="d"><button class="btn-x" data-borrar-mov="${mv.id}" aria-label="Borrar movimiento">×</button></td></tr>`).join('')}
        ${x.prestamos.filter((p) => p.liq.cruzado > 0).map((p) => `<tr class="derivado">
          <td>${fecha(p.pagos.filter((g) => g.tipo === 'cruce').at(-1)?.fecha)}</td>
          <td>Cruce para pagar el préstamo de ${cop(p.monto)}<div class="peq tenue">Se registra desde el préstamo</div></td>
          <td class="d num mal-t">${cop(-p.liq.cruzado)}</td><td></td></tr>`).join('')}
        ${x.prestamos.filter((p) => p.liq.favor > 0).map((p) => `<tr class="derivado">
          <td>${fecha(p.liq.ultimoPago)}</td>
          <td>Pago en exceso del préstamo de ${cop(p.monto)}<div class="peq tenue">Se abona solo a su capital</div></td>
          <td class="d num">${cop(p.liq.favor)}</td><td></td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td colspan="2">Capital actual</td><td class="d num">${cop(x.capital.total)}</td><td></td></tr></tfoot>
    </table></div>
  </section>

  ${x.prestamos.length === 0 && x.movimientos.length === 0 ? '<button class="btn peligro" id="borrar-miembro">Eliminar miembro</button>' : ''}`;

  el.querySelector('#editar').onclick = () => formEditarMiembro(el.querySelector('#form-editar'), x);
  el.querySelector('#nuevo-prestamo').onclick = () => formNuevoPrestamo(el.querySelector('#form-prestamo'), x, disponible);
  el.querySelector('#nuevo-mov').onclick = () => formMovimiento(el.querySelector('#form-mov'), x);
  el.querySelectorAll('[data-borrar-mov]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('¿Borrar este movimiento de capital? Queda registrado en la auditoría.')) return;
      await accion(async () => { await borrar('movimientos_capital', b.dataset.borrarMov); await recargar(); aviso('Movimiento borrado'); });
    };
  });
  const bm = el.querySelector('#borrar-miembro');
  if (bm) bm.onclick = async () => {
    if (!confirm(`¿Eliminar a ${x.nombre}?`)) return;
    await accion(async () => { await borrar('miembros', x.id); await recargar(); location.hash = '#/miembros'; aviso('Miembro eliminado'); });
  };
}

function formEditarMiembro(cont, x) {
  cont.innerHTML = `
  <form class="tarjeta" novalidate>
    <div class="rejilla">
      <label class="campo"><span>Nombre completo</span><input name="nombre" value="${esc(x.nombre)}" required></label>
      <label class="campo"><span>Teléfono</span><input name="telefono" inputmode="tel" value="${esc(x.telefono || '')}"></label>
    </div>
    <label class="campo"><span>Notas</span><textarea name="notas" rows="2">${esc(x.notas || '')}</textarea></label>
    <label class="check"><input type="checkbox" name="activo" ${x.activo ? 'checked' : ''}> Miembro activo</label>
    <p class="error" hidden></p>
    <div class="acciones"><button class="btn" type="submit">Guardar cambios</button><button class="btn sec" type="button" data-cancelar>Cancelar</button></div>
  </form>`;
  const f = cont.querySelector('form');
  f.querySelector('[data-cancelar]').onclick = () => { cont.innerHTML = ''; };
  f.onsubmit = (ev) => guardar(ev, f, async () => {
    if (!f.nombre.value.trim()) throw new Error('El nombre no puede quedar vacío.');
    await actualizar('miembros', x.id, { nombre: f.nombre.value.trim(), telefono: f.telefono.value.trim() || null, notas: f.notas.value.trim() || null, activo: f.activo.checked });
    await recargar(); aviso('Datos guardados');
  });
}

function formMovimiento(cont, x) {
  cont.innerHTML = `
  <form class="tarjeta" novalidate>
    <div class="rejilla">
      <label class="campo"><span>Tipo</span><select name="tipo">
        <option value="aporte">Aporte</option><option value="retiro">Retiro</option>
        <option value="utilidad">Utilidad asignada</option><option value="ajuste">Ajuste</option></select></label>
      <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${hoyISO()}"></label>
      <label class="campo"><span>Valor</span>${inputPesos('valor')}</label>
      <label class="campo" data-signo hidden><span>El ajuste</span><select name="signo"><option value="1">Suma al capital</option><option value="-1">Resta del capital</option></select></label>
    </div>
    <label class="campo"><span>Nota</span><input name="nota" placeholder="Opcional"></label>
    <p class="peq tenue" data-ayuda></p>
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
    await recargar(); aviso('Movimiento registrado');
  });
}

function formNuevoPrestamo(cont, x, disponible) {
  const limite = estado.modelo.fondo.limiteExposicion;
  cont.innerHTML = `
  <form class="tarjeta" novalidate>
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
    vista.innerHTML = barraTasas(monto, resp, tf) + alertas.map((a) => `<p class="alerta">${esc(a)}</p>`).join('');
  };
  ['input', 'change'].forEach((e) => f.addEventListener(e, refrescar));
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
    await recargar();
    location.hash = `#/prestamo/${nuevo.id}`;
    aviso('Préstamo registrado. Revisa el plan de cuotas.');
  });
}

// ═══════════════════════ Préstamos ═══════════════════════

function vistaPrestamos(el) {
  const { prestamos } = estado.modelo;
  const activos = prestamos.filter((p) => p.liq.activo).sort((a, b) => b.liq.diasSinAbonar - a.liq.diasSinAbonar);
  const cancelados = prestamos.filter((p) => !p.liq.activo).sort((a, b) => b.fecha.localeCompare(a.fecha));
  el.innerHTML = `
  <h1 class="h1">Préstamos</h1>
  <p class="tenue">Para registrar un préstamo nuevo, entra a la ficha del miembro.</p>
  <section><h2 class="h2">Activos <span class="tenue">(${activos.length})</span></h2>
    ${activos.length ? `<div class="lista">${cabezaLista()}${activos.map((p) => filaPrestamo(p)).join('')}</div>` : vacio('No hay préstamos activos.')}</section>
  <section><h2 class="h2">Cancelados <span class="tenue">(${cancelados.length})</span></h2>
    ${cancelados.length ? `<div class="lista">${cancelados.map((p) => filaPrestamo(p)).join('')}</div>` : vacio('Aún no hay préstamos cancelados.')}</section>`;
}

// Firma visual de la app: cómo se parte el préstamo entre las tasas.
function barraTasas(monto, respaldo, tasaFija) {
  if (!monto) return '';
  let tramos;
  if (tasaFija) tramos = [{ t: `${String(+(tasaFija * 100).toFixed(2)).replace('.', ',')}% mensual pactado`, v: monto, c: 'ocre', r: tasaFija }];
  else if (!respaldo) tramos = [{ t: '10% mensual, sin capital que lo respalde', v: monto, c: 'rojo', r: 0.10 }];
  else if (monto <= respaldo) tramos = [{ t: '2% mensual, cubierto por su capital', v: monto, c: 'verde', r: 0.02 }];
  else tramos = [{ t: '2% mensual sobre lo que cubre su capital', v: respaldo, c: 'verde', r: 0.02 }, { t: '5% mensual sobre lo que supera su capital', v: monto - respaldo, c: 'ocre', r: 0.05 }];
  const mensual = tramos.reduce((s, x) => s + x.v * x.r, 0);
  return `<div class="tramos">
    <div class="tramos-barra">${tramos.map((x) => `<div class="tramo ${x.c}" style="flex:${x.v}" title="${esc(x.t)}: ${cop(x.v)}"></div>`).join('')}</div>
    ${tramos.map((x) => `<div class="tramo-fila"><span><i class="punto ${x.c}"></i>${esc(x.t)}</span><span class="num">${cop(x.v)}</span></div>`).join('')}
    <div class="tramo-fila total"><span>Interés de un mes completo sobre el monto</span><span class="num">${cop(mensual)}</span></div>
  </div>`;
}

const ESTADO_CUOTA = {
  pagada: ['Pagada', 'bien'], parcial: ['Abono parcial', 'aviso'],
  'parcial-vencida': ['Parcial, vencida', 'mal'], vencida: ['Vencida', 'mal'], pendiente: ['Pendiente', ''],
};

function vistaPrestamo(el, id) {
  const p = estado.modelo.prestamoPorId[id];
  if (!p) { el.innerHTML = vacio('Ese préstamo no existe o está anulado.'); return; }
  const x = estado.modelo.miembroPorId[p.miembro_id];
  const l = p.liq;
  const plan = planConEstado(p, estado.corte);
  const respaldo = Number(p.capital_respaldo || 0);
  const tf = p.tasa_fija ? Number(p.tasa_fija) : null;

  el.innerHTML = `
  <a class="volver" href="#/miembro/${x.id}">${esc(x.nombre)}</a>
  <div class="titulo-acc">
    <h1 class="h1">Préstamo de ${cop(p.monto)}</h1>
    <span class="chip ${l.activo ? (p.franja?.clave === 'aldia' ? '' : 'mal') : 'bien'}">${l.activo ? (p.franja?.clave === 'aldia' ? 'Al día' : `${diasTxt(l.diasSinAbonar)} sin abonar`) : 'Cancelado'}</span>
  </div>
  <p class="subtitulo">Desembolsado a ${esc(x.nombre)} el ${fechaLarga(p.fecha)}</p>
  ${p.nota ? `<p class="nota">${esc(p.nota)}</p>` : ''}
  ${barraTasas(Number(p.monto), respaldo, tf)}

  <section class="cifras">
    ${cifra('Capital pendiente', cop(l.capital))}
    ${cifra('Intereses pendientes', cop(l.intPend))}
    ${l.favor > 0
      ? cifra('Pagó de más', cop(l.favor), 'Se abona a su capital', 'bien')
      : cifra('Saldo para cancelar hoy', cop(l.deuda), l.activo ? `Crece ${cop(l.interesDiario)} por día` : 'Préstamo cancelado', l.activo ? 'mal' : 'bien')}
  </section>

  ${l.activo ? `<section class="tarjeta" id="pago">
    <h2 class="h2">Registrar pago</h2>
    <form novalidate>
      <div class="rejilla">
        <label class="campo"><span>Fecha del pago</span><input type="date" name="fecha" value="${hoyISO() < p.fecha ? p.fecha : hoyISO()}"></label>
        <label class="campo"><span>Valor recibido</span>${inputPesos('valor')}</label>
        <label class="campo"><span>Tipo</span><select name="tipo"><option value="abono">Abono en efectivo</option><option value="cruce">Cruce con su capital</option></select></label>
      </div>
      <div class="acciones"><button class="btn sec" type="button" data-saldar>Calcular valor para saldar todo</button></div>
      <p class="peq" data-ayuda></p>
      <label class="campo"><span>Nota</span><input name="nota" placeholder="Opcional"></label>
      <p class="error" hidden></p>
      <div class="acciones"><button class="btn" type="submit">Registrar pago</button></div>
    </form>
  </section>` : ''}

  ${l.activo || plan ? `<section>
    <div class="titulo-acc"><h2 class="h2">Plan de cuotas</h2>
      <div class="acciones">${plan ? '<button class="btn sec" id="reprogramar">Reprogramar desde el corte</button>' : ''}<button class="btn sec" id="editar-plan">${plan ? 'Cambiar plan' : 'Crear plan'}</button></div></div>
    <div id="form-plan"></div>
    ${plan ? bloquePlan(plan) : vacio('Este préstamo no tiene plan de cuotas.')}
  </section>` : ''}

  <section>
    <h2 class="h2">Movimientos del préstamo</h2>
    <p class="peq tenue">El interés se calcula por día sobre el saldo. Cada pago cubre primero los intereses acumulados y el resto baja el capital.</p>
    <div class="tabla-envoltura"><table class="tabla">
      <thead><tr><th>Fecha</th><th class="d">Días</th><th class="d">Interés</th><th class="d">Pago</th><th class="d">A interés</th><th class="d">A capital</th><th class="d">Saldo</th><th></th></tr></thead>
      <tbody>
        <tr class="derivado"><td>${fecha(p.fecha)}</td><td colspan="5">Desembolso</td><td class="d num">${cop(p.monto)}</td><td></td></tr>
        ${l.filas.map((f) => `<tr class="${f.tipo === 'cruce' ? 'cruce' : ''}">
          <td>${fecha(f.fecha)}${f.nota ? `<div class="peq tenue">${esc(f.nota)}</div>` : ''}</td>
          <td class="d num tenue">${f.dias}</td><td class="d num">${cop(f.interes)}</td>
          <td class="d num fuerte">${cop(f.valor)}${f.tipo === 'cruce' ? ' <span class="chip">cruce</span>' : ''}</td>
          <td class="d num tenue">${cop(f.aInt)}</td><td class="d num tenue">${cop(f.aCap)}</td>
          <td class="d num fuerte">${cop(f.saldo)}</td>
          <td class="d"><button class="btn-x" data-borrar-pago="${f.id}" aria-label="Borrar pago">×</button></td></tr>`).join('')}
        ${l.corteFila && l.corteFila.dias > 0 ? `<tr class="derivado"><td>${fecha(l.corteFila.fecha)}</td><td class="d num">${l.corteFila.dias}</td>
          <td class="d num">${cop(l.corteFila.interes)}</td><td colspan="3" class="tenue">Intereses corridos hasta el corte, sin pago</td>
          <td class="d num">${cop(l.capital)}</td><td></td></tr>` : ''}
      </tbody>
      <tfoot><tr><td colspan="2">Totales</td><td class="d num">${cop(l.totalInt)}</td><td class="d num">${cop(l.efectivo + l.cruzado)}</td><td colspan="4"></td></tr></tfoot>
    </table></div>
  </section>

  <details class="tarjeta">
    <summary>Datos del préstamo</summary>
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
    </form>
  </details>`;

  montarPago(el, p);
  el.querySelectorAll('[data-borrar-pago]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('¿Borrar este pago? Los saldos se recalculan y el cambio queda en la auditoría.')) return;
      await accion(async () => { await borrar('pagos', b.dataset.borrarPago); await recargar(); aviso('Pago borrado'); });
    };
  });
  const ep = el.querySelector('#editar-plan');
  if (ep) ep.onclick = () => formPlan(el.querySelector('#form-plan'), p);
  const rp = el.querySelector('#reprogramar');
  if (rp) rp.onclick = async () => {
    if (!confirm(`¿Rehacer el plan con el saldo al ${fecha(estado.corte)}? Las cuotas anteriores dejan de contarse como vencidas.`)) return;
    await accion(async () => {
      await actualizar('prestamos', p.id, { plan: { ...p.plan, desde: estado.corte, primera: null } });
      await recargar(); aviso('Plan reprogramado');
    });
  };
  montarDatos(el, p);
}

function bloquePlan(plan) {
  return `
  <div class="cifras">
    ${cifra('Total del plan', cop(plan.total), `Desde el ${fecha(plan.desde)}`)}
    ${cifra('Pagado desde entonces', cop(plan.pagado))}
    ${plan.vencidas ? cifra('Atrasado', cop(plan.valorVencido), `${plan.vencidas} ${plan.vencidas === 1 ? 'cuota vencida' : 'cuotas vencidas'}`, 'mal')
      : plan.proxima ? cifra('Próxima cuota', cop(plan.proxima.cuota), fecha(plan.proxima.fecha)) : cifra('Plan', 'Completo', '', 'bien')}
  </div>
  <div class="tabla-envoltura"><table class="tabla">
    <thead><tr><th>Cuota</th><th>Fecha</th><th class="d">Interés</th><th class="d">A capital</th><th class="d">Valor a pagar</th><th class="d">Saldo</th><th>Estado</th></tr></thead>
    <tbody>${plan.cuotas.map((c) => {
      const [t, tono] = ESTADO_CUOTA[c.estado];
      return `<tr><td class="num">${c.n} de ${plan.cuotas.length}</td><td>${fecha(c.fecha)}</td>
        <td class="d num tenue">${cop(c.interes)}</td><td class="d num tenue">${cop(c.capital)}</td>
        <td class="d num fuerte">${cop(c.cuota)}</td><td class="d num tenue">${cop(c.saldo)}</td>
        <td><span class="chip ${tono}">${t}</span></td></tr>`;
    }).join('')}</tbody>
  </table></div>
  <p class="peq tenue">Las cuotas se calcularon sobre el saldo al ${fecha(plan.desde)}. Si paga tarde, el interés sigue corriendo y el saldo real será mayor; usa "Reprogramar desde el corte" para rehacer las cuotas con el saldo de hoy.</p>`;
}

function montarPago(el, p) {
  const f = el.querySelector('#pago form');
  if (!f) return;
  activarPesos(f);
  const ayuda = f.querySelector('[data-ayuda]');
  const x = estado.modelo.miembroPorId[p.miembro_id];
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
  ['input', 'change'].forEach((e) => f.addEventListener(e, refrescar));
  refrescar();
  f.querySelector('[data-saldar]').onclick = () => {
    if (!f.fecha.value) return;
    const deuda = valorParaSaldar(p, p.pagos, f.fecha.value);
    f.valor.value = Math.round(deuda).toLocaleString('es-CO');
    refrescar();
  };
  f.onsubmit = (ev) => guardar(ev, f, async () => {
    const valor = leerPesos(f.valor.value);
    if (!f.fecha.value) throw new Error('Elige la fecha del pago.');
    if (f.fecha.value < p.fecha) throw new Error('El pago no puede ser anterior al desembolso.');
    if (valor <= 0) throw new Error('Escribe el valor recibido.');
    if (f.tipo.value === 'cruce' && valor > x.capital.total + 1) throw new Error(`El cruce (${cop(valor)}) supera su capital actual (${cop(x.capital.total)}).`);
    const deuda = valorParaSaldar(p, p.pagos, f.fecha.value);
    if (valor > deuda + 1 && !confirm(`El pago supera la deuda en ${cop(valor - deuda)}. Ese valor se abonará a su capital. ¿Continuar?`)) return 'cancelado';
    await insertar('pagos', { prestamo_id: p.id, fecha: f.fecha.value, valor, tipo: f.tipo.value, nota: f.nota.value.trim() || null });
    await recargar(); aviso('Pago registrado');
  });
}

function formPlan(cont, p) {
  const pl = p.plan || { modo: 'n', n: 4, cadaDias: 15, alinear: false };
  const desdeInicial = p.plan?.desde || estado.corte;
  cont.innerHTML = `
  <form class="tarjeta" novalidate>
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
    if (!cuotas.length) { previa.innerHTML = o.modo === 'fija' ? '<p class="tenue peq">Escribe el valor de la cuota.</p>' : ''; return; }
    const total = cuotas.reduce((s, c) => s + c.cuota, 0);
    previa.innerHTML = `<p class="peq">Saldo al ${fecha(o.desde)}: <strong>${cop(base.deuda)}</strong>. ${cuotas.length} cuotas, total ${cop(total)} (${cop(total - base.deuda)} de intereses futuros).</p>
      <div class="tabla-envoltura"><table class="tabla compacta"><thead><tr><th>Cuota</th><th>Fecha</th><th class="d">Interés</th><th class="d">Valor a pagar</th></tr></thead>
      <tbody>${cuotas.map((c) => `<tr><td>${c.n}</td><td>${fecha(c.fecha)}</td><td class="d num tenue">${cop(c.interes)}</td><td class="d num fuerte">${cop(c.cuota)}</td></tr>`).join('')}</tbody></table></div>`;
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
    await recargar(); aviso('Plan guardado');
  });
}

function montarDatos(el, p) {
  const f = el.querySelector('#f-datos');
  activarPesos(f);
  f.onsubmit = (ev) => guardar(ev, f, async () => {
    const monto = leerPesos(f.monto.value);
    if (monto <= 0) throw new Error('El monto debe ser mayor que cero.');
    const txt = String(f.pct.value).trim().replace(',', '.');
    const tasa_fija = txt ? parseFloat(txt) / 100 : null;
    if (txt && !(tasa_fija > 0 && tasa_fija < 1)) throw new Error('La tasa pactada debe estar entre 0 y 100%.');
    if (p.pagos.some((g) => g.fecha < f.fecha.value)) throw new Error('Hay pagos anteriores a esa fecha de desembolso.');
    await actualizar('prestamos', p.id, { monto, fecha: f.fecha.value, capital_respaldo: leerPesos(f.respaldo.value), tasa_fija, nota: f.nota.value.trim() || null });
    await recargar(); aviso('Préstamo actualizado');
  });
  el.querySelector('#anular').onclick = async () => {
    if (!confirm('¿Anular este préstamo? Deja de contar en saldos y en el capital. El registro se conserva en la auditoría.')) return;
    await accion(async () => {
      await actualizar('prestamos', p.id, { anulado: true });
      await recargar(); location.hash = `#/miembro/${p.miembro_id}`; aviso('Préstamo anulado');
    });
  };
}

// ═══════════════════════ Utilidades de formularios ═══════════════════════

function inputPesos(nombre, valor = 0) {
  return `<span class="pesos"><input name="${nombre}" inputmode="numeric" autocomplete="off" value="${valor ? Math.round(valor).toLocaleString('es-CO') : ''}"></span>`;
}

function activarPesos(form) {
  form.querySelectorAll('.pesos input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const v = leerPesos(inp.value);
      inp.value = v ? v.toLocaleString('es-CO') : '';
    });
  });
}

async function guardar(ev, form, fn) {
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

async function accion(fn) {
  try { await fn(); } catch (e) { aviso(e.message, true); }
}

function mostrarError(el, texto) {
  el.textContent = texto;
  el.hidden = false;
}

function aviso(texto, error = false) {
  const cont = document.getElementById('avisos');
  if (!cont) return;
  const d = document.createElement('div');
  d.className = `aviso ${error ? 'mal' : ''}`;
  d.textContent = texto;
  cont.appendChild(d);
  setTimeout(() => d.remove(), error ? 6000 : 2500);
}

iniciar();
