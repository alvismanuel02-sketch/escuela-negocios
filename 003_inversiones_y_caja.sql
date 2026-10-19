-- Inversiones de la Escuela en proyectos (otros activos) y saldos reales de la cuenta.

-- Valor positivo: dinero que la Escuela pone en el proyecto.
-- Valor negativo: dinero que vuelve a la Escuela (venta, devolución).
create table public.inversiones (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  proyecto    text not null default 'Ganadería' check (length(trim(proyecto)) > 0),
  concepto    text not null check (length(trim(concepto)) > 0),
  valor       numeric(14,2) not null check (valor <> 0),
  nota        text,
  creado      timestamptz not null default now(),
  creado_por  text default lower(auth.jwt() ->> 'email')
);
create index inversiones_fecha on public.inversiones (fecha);

-- Saldo real de la cuenta de la Escuela en una fecha, para compararlo con lo calculado.
create table public.saldos_caja (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  valor       numeric(14,2) not null,
  nota        text,
  creado      timestamptz not null default now(),
  creado_por  text default lower(auth.jwt() ->> 'email')
);
create index saldos_caja_fecha on public.saldos_caja (fecha);

create trigger aud_inversiones after insert or update or delete on public.inversiones
  for each row execute function public.fn_auditoria();
create trigger aud_saldos_caja after insert or update or delete on public.saldos_caja
  for each row execute function public.fn_auditoria();

alter table public.inversiones enable row level security;
alter table public.saldos_caja enable row level security;
revoke all on public.inversiones, public.saldos_caja from anon;

create policy admin_todo_inversiones on public.inversiones
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy admin_todo_saldos_caja on public.saldos_caja
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- Desde esta versión los otros activos salen de la suma de inversiones;
-- la clave activos_inmovilizados de configuracion ya no se usa.
