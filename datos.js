// Acceso a Supabase: sesión, lectura completa y escrituras.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

function revisar({ data, error }) {
  if (error) throw new Error(traducirError(error));
  return data;
}

function traducirError(error) {
  const msg = error.message || String(error);
  if (/row-level security|permission denied/i.test(msg)) return 'Tu usuario no tiene permiso para hacer este cambio.';
  if (/violates foreign key/i.test(msg)) return 'No se puede borrar: tiene préstamos, pagos o movimientos asociados.';
  if (/duplicate key.*nombre/i.test(msg)) return 'Ya existe un miembro con ese nombre.';
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'No hay conexión con la base de datos. Revisa tu internet e intenta de nuevo.';
  return msg;
}

export async function cargarTodo() {
  const [miembros, movimientos, prestamos, pagos, configuracion, administradores, inversiones, saldosCaja] = await Promise.all([
    sb.from('miembros').select('*').order('nombre'),
    sb.from('movimientos_capital').select('*').order('fecha'),
    sb.from('prestamos').select('*').order('fecha'),
    sb.from('pagos').select('*').order('fecha'),
    sb.from('configuracion').select('*'),
    sb.from('administradores').select('email, nombre').order('nombre'),
    sb.from('inversiones').select('*').order('fecha'),
    sb.from('saldos_caja').select('*').order('fecha'),
  ]);
  const config = {};
  for (const c of revisar(configuracion)) config[c.clave] = c.valor;
  return {
    miembros: revisar(miembros),
    movimientos: revisar(movimientos),
    prestamos: revisar(prestamos),
    pagos: revisar(pagos),
    config,
    administradores: revisar(administradores),
    inversiones: revisar(inversiones),
    saldosCaja: revisar(saldosCaja),
  };
}

/** Últimos cambios registrados por la base (quién cambió qué). */
export async function cargarAuditoria(limite = 150) {
  return revisar(await sb.from('auditoria').select('*').order('fecha', { ascending: false }).limit(limite));
}

export async function insertar(tabla, fila) {
  return revisar(await sb.from(tabla).insert(fila).select().single());
}

export async function actualizar(tabla, id, cambios) {
  return revisar(await sb.from(tabla).update(cambios).eq('id', id).select().single());
}

export async function borrar(tabla, id) {
  revisar(await sb.from(tabla).delete().eq('id', id));
}

export async function guardarConfig(clave, valor) {
  return revisar(await sb.from('configuracion').upsert({ clave, valor }).select().single());
}

export async function esAdmin() {
  return revisar(await sb.rpc('es_admin'));
}

export async function iniciarSesion(email, clave) {
  return revisar(await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: clave }));
}

export async function cambiarClave(nueva) {
  return revisar(await sb.auth.updateUser({ password: nueva, data: { debe_cambiar_clave: false } }));
}

export async function cerrarSesion() {
  await sb.auth.signOut();
}

export { traducirError };
