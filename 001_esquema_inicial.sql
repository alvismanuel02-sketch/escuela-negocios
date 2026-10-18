-- Escuela de Negocios · esquema inicial
-- Solo los correos registrados en public.administradores pueden leer o escribir.
-- Cada cambio queda en public.auditoria con el correo de quien lo hizo.

-- ── Administradores ─────────────────────────────────────────────
create table public.administradores (
  email   text primary key check (email = lower(email)),
  nombre  text not null,
  creado  timestamptz not null default now()
);

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.administradores a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke execute on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- ── Miembros ────────────────────────────────────────────────────
create table public.miembros (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique check (length(trim(nombre)) > 0),
  activo      boolean not null default true,
  telefono    text,
  notas       text,
  creado      timestamptz not null default now(),
  creado_por  text default lower(auth.jwt() ->> 'email')
);

-- ── Movimientos de capital (libro de cada socio) ────────────────
-- valor con signo: positivo suma al capital, negativo resta.
-- Los cruces y los pagos en exceso NO se guardan aquí: se derivan de los
-- pagos de cada préstamo, para que nunca haya dos versiones del mismo dato.
create table public.movimientos_capital (
  id          uuid primary key default gen_random_uuid(),
  miembro_id  uuid not null references public.miembros(id) on delete restrict,
  fecha       date not null,
  tipo        text not null check (tipo in ('saldo_inicial', 'aporte', 'retiro', 'utilidad', 'ajuste')),
  valor       numeric(14,2) not null,
  nota        text,
  creado      timestamptz not null default now(),
  creado_por  text default lower(auth.jwt() ->> 'email'),
  constraint signo_valido check (
    (tipo in ('saldo_inicial', 'aporte', 'utilidad') and valor >= 0)
    or (tipo = 'retiro' and valor < 0)
    or (tipo = 'ajuste')
  )
);
create index on public.movimientos_capital (miembro_id, fecha);

-- ── Préstamos ───────────────────────────────────────────────────
-- capital_respaldo: capital del socio que respalda este préstamo, congelado
-- al desembolso. Define qué parte va al 2% y qué parte al 5%.
-- tasa_fija: si no es nula, anula la regla (ej. 0.05 = 5% mensual pactado).
create table public.prestamos (
  id                uuid primary key default gen_random_uuid(),
  miembro_id        uuid not null references public.miembros(id) on delete restrict,
  monto             numeric(14,2) not null check (monto > 0),
  fecha             date not null,
  capital_respaldo  numeric(14,2) not null default 0 check (capital_respaldo >= 0),
  tasa_fija         numeric(6,4) check (tasa_fija is null or (tasa_fija > 0 and tasa_fija < 1)),
  plan              jsonb,
  nota              text,
  anulado           boolean not null default false,
  creado            timestamptz not null default now(),
  creado_por        text default lower(auth.jwt() ->> 'email')
);
create index on public.prestamos (miembro_id, fecha);

-- ── Pagos (abonos en efectivo y cruces con capital) ─────────────
create table public.pagos (
  id           uuid primary key default gen_random_uuid(),
  prestamo_id  uuid not null references public.prestamos(id) on delete restrict,
  fecha        date not null,
  valor        numeric(14,2) not null check (valor > 0),
  tipo         text not null default 'abono' check (tipo in ('abono', 'cruce')),
  nota         text,
  creado       timestamptz not null default now(),
  creado_por   text default lower(auth.jwt() ->> 'email')
);
create index on public.pagos (prestamo_id, fecha);

-- ── Configuración del fondo ─────────────────────────────────────
create table public.configuracion (
  clave            text primary key,
  valor            jsonb not null,
  actualizado      timestamptz not null default now(),
  actualizado_por  text default lower(auth.jwt() ->> 'email')
);

-- ── Auditoría ───────────────────────────────────────────────────
create table public.auditoria (
  id           bigint generated always as identity primary key,
  tabla        text not null,
  registro_id  text,
  accion       text not null,
  antes        jsonb,
  despues      jsonb,
  usuario      text,
  fecha        timestamptz not null default now()
);
create index on public.auditoria (fecha desc);

create or replace function public.fn_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes   jsonb;
  v_despues jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_antes := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_despues := to_jsonb(new); end if;
  insert into public.auditoria (tabla, registro_id, accion, antes, despues, usuario)
  values (
    tg_table_name,
    coalesce(v_despues ->> 'id', v_antes ->> 'id', v_despues ->> 'clave', v_antes ->> 'clave'),
    tg_op,
    v_antes,
    v_despues,
    coalesce(lower(auth.jwt() ->> 'email'), 'sistema')
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger aud_miembros after insert or update or delete on public.miembros
  for each row execute function public.fn_auditoria();
create trigger aud_movimientos_capital after insert or update or delete on public.movimientos_capital
  for each row execute function public.fn_auditoria();
create trigger aud_prestamos after insert or update or delete on public.prestamos
  for each row execute function public.fn_auditoria();
create trigger aud_pagos after insert or update or delete on public.pagos
  for each row execute function public.fn_auditoria();
create trigger aud_configuracion after insert or update or delete on public.configuracion
  for each row execute function public.fn_auditoria();
create trigger aud_administradores after insert or update or delete on public.administradores
  for each row execute function public.fn_auditoria();

-- ── Seguridad por filas ─────────────────────────────────────────
alter table public.administradores     enable row level security;
alter table public.miembros            enable row level security;
alter table public.movimientos_capital enable row level security;
alter table public.prestamos           enable row level security;
alter table public.pagos               enable row level security;
alter table public.configuracion       enable row level security;
alter table public.auditoria           enable row level security;

-- Nadie anónimo toca nada.
revoke all on all tables in schema public from anon;

-- Administradores: solo lectura desde la app (se agregan desde Supabase).
create policy admin_lee_administradores on public.administradores
  for select to authenticated using ((select public.es_admin()));

-- Datos del fondo: lectura y escritura completa para administradores.
create policy admin_todo_miembros on public.miembros
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy admin_todo_movimientos on public.movimientos_capital
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy admin_todo_prestamos on public.prestamos
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy admin_todo_pagos on public.pagos
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy admin_todo_configuracion on public.configuracion
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- Auditoría: solo lectura. La escribe el trigger, nunca la app.
create policy admin_lee_auditoria on public.auditoria
  for select to authenticated using ((select public.es_admin()));
revoke insert, update, delete on public.auditoria from authenticated;

-- ── Valores iniciales ───────────────────────────────────────────
insert into public.configuracion (clave, valor) values
  ('limite_exposicion', '3'::jsonb),
  ('activos_inmovilizados', '{"valor": 8000000, "descripcion": "Ganado (4 vacas)"}'::jsonb);
