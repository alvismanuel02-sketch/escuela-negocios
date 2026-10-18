// Escuela de Negocios: arranque, sesión, marco de la app y rutas.
import { sb, cargarTodo, esAdmin, iniciarSesion, cambiarClave, cerrarSesion } from './datos.js';
import { construirModelo } from './modelo.js';
import { fechaLarga, esc } from './formato.js';
import { ic } from './iconos.js';
import { estado, app, iniciales, mostrarError, aviso, nombreAdmin } from './ui.js';
import { vistaResumen, vistaMiembros, vistaMiembro, vistaPrestamos, vistaPrestamo } from './vistas.js';
import { vistaMovimientos, vistaRiesgo, vistaConfiguracion } from './vistas-fondo.js';
import { vistaExtractos } from './extractos.js';

const raiz = document.getElementById('app');

const LOGO = `<span class="logo-i">${ic('logo', 20)}</span>
  <span class="logo-t"><b>Escuela de Negocios</b><small>Fondo de Ahorro y Préstamos</small></span>`;

const SECCIONES = [
  ['resumen', 'Inicio', 'inicio'],
  ['miembros', 'Miembros', 'miembros'],
  ['prestamos', 'Préstamos', 'prestamos'],
  ['movimientos', 'Movimientos', 'movimientos'],
  ['riesgo', 'Panel de riesgo', 'riesgo'],
  ['extractos', 'Extractos', 'extractos'],
  ['configuracion', 'Configuración', 'configuracion'],
];

const VISTAS = {
  resumen: vistaResumen, miembros: vistaMiembros, miembro: vistaMiembro,
  prestamos: vistaPrestamos, prestamo: vistaPrestamo, movimientos: vistaMovimientos,
  riesgo: vistaRiesgo, extractos: vistaExtractos, configuracion: vistaConfiguracion,
};

// ═══════════════════════ Arranque y sesión ═══════════════════════

async function iniciar() {
  app.recargar = recargar;
  app.pintar = pintar;
  const { data } = await sb.auth.getSession();
  if (data.session) await entrar(data.session.user);
  else pantallaIngreso();
  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') pantallaIngreso();
  });
  window.addEventListener('hashchange', () => {
    document.body.classList.remove('menu-abierto');
    if (estado.modelo) pintar();
  });
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
  raiz.innerHTML = `<div class="centro"><div class="tarjeta ingreso">
    <div class="logo">${LOGO}</div>
    <h1 class="h2">No se pudieron cargar los datos</h1>
    <p>${esc(texto)}</p>
    <button class="btn" id="reintentar">Intentar de nuevo</button></div></div>`;
  raiz.querySelector('#reintentar').onclick = () => entrar(estado.usuario);
}

function pantallaIngreso() {
  raiz.innerHTML = `
  <div class="centro">
    <form class="tarjeta ingreso" id="f-ingreso" novalidate>
      <div class="logo">${LOGO}</div>
      <div><h1 class="h2">Ingreso de administradores</h1><p class="sub peq">Usa el correo con el que te registraron en el fondo.</p></div>
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
    <form class="tarjeta ingreso" id="f-clave" novalidate>
      <div class="logo">${LOGO}</div>
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
      location.hash = '#/';
      await entrar(user);
      aviso('Contraseña guardada');
    } catch (e) { mostrarError(err, e.message); }
  };
}

function pantallaSinAcceso() {
  raiz.innerHTML = `<div class="centro"><div class="tarjeta ingreso">
    <div class="logo">${LOGO}</div>
    <h1 class="h2">Tu correo no está autorizado</h1>
    <p>${esc(estado.usuario?.email)} no aparece en la lista de administradores del fondo.</p>
    <button class="btn" id="salir">Cerrar sesión</button></div></div>`;
  raiz.querySelector('#salir').onclick = cerrarSesion;
}

// ═══════════════════════ Marco y rutas ═══════════════════════

function ruta() {
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  return { vista: partes[0] || 'resumen', id: partes[1] };
}

function pintar() {
  const r = ruta();
  if (r.vista === 'clave') return pantallaCambioClave(false);
  const activa = r.vista === 'miembro' ? 'miembros' : r.vista === 'prestamo' ? 'prestamos' : r.vista;
  const nombre = nombreAdmin();
  const scroll = window.scrollY;
  const mismaVista = raiz.dataset.ruta === location.hash;
  raiz.dataset.ruta = location.hash;

  raiz.innerHTML = `
  <header class="top">
    <button class="btn-top top-menu" id="abrir-menu" aria-label="Abrir menú">${ic('menu', 20)}</button>
    <a class="logo" href="#/">${LOGO}</a>
    <div class="top-der">
      <label class="corte" title="Todos los saldos se calculan a esta fecha">${ic('calendario', 16)}
        <input type="date" id="corte" value="${estado.corte}" aria-label="Fecha de corte">
      </label>
      <button class="btn-top" id="actualizar" title="Traer los cambios de otros administradores" aria-label="Actualizar">${ic('actualizar', 17)}</button>
      <details class="usuario">
        <summary aria-label="Cuenta"><span class="avatar">${esc(iniciales(nombre))}</span>
          <span class="usuario-t"><b>${esc(nombre)}</b><small>Administrador</small></span>${ic('abajo', 16)}</summary>
        <div class="menu-in">
          <div class="menu-correo">${esc(estado.usuario?.email)}</div>
          <a href="#/clave">${ic('llave', 16)}Cambiar contraseña</a>
          <button id="salir">${ic('salir', 16)}Cerrar sesión</button>
        </div>
      </details>
    </div>
  </header>
  <div class="cuerpo">
    <nav class="lateral" aria-label="Secciones">${SECCIONES.map(([k, t, i]) =>
      `<a href="#/${k}" class="${activa === k ? 'on' : ''}">${ic(i, 19)}${t}</a>`).join('')}</nav>
    <div class="velo" id="velo"></div>
    <main id="vista" class="contenido"></main>
  </div>
  <div id="avisos" aria-live="polite"></div>`;

  raiz.querySelector('#corte').onchange = (ev) => {
    if (!ev.target.value) return;
    estado.corte = ev.target.value;
    estado.modelo = construirModelo(estado.datos, estado.corte);
    pintar();
  };
  raiz.querySelector('#actualizar').onclick = async () => { await recargar(); aviso('Datos actualizados'); };
  raiz.querySelector('#salir').onclick = cerrarSesion;
  raiz.querySelector('#abrir-menu').onclick = () => document.body.classList.toggle('menu-abierto');
  raiz.querySelector('#velo').onclick = () => document.body.classList.remove('menu-abierto');

  const vista = raiz.querySelector('#vista');
  (VISTAS[r.vista] || vistaResumen)(vista, r.id);
  if (estado.corte !== hoy()) {
    vista.insertAdjacentHTML('afterbegin', `<div class="banda">${ic('calendario', 16)}<span>Estás viendo el fondo al <strong>${fechaLarga(estado.corte)}</strong>, no a hoy.</span></div>`);
  }
  if (mismaVista) window.scrollTo(0, scroll);
  else window.scrollTo(0, 0);
}

function hoy() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

iniciar();
