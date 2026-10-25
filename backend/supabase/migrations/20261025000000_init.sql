-- =============================================================================
-- AidRelease · Esquema de Supabase (Postgres + Storage)
-- Ejecutar entero en Supabase > SQL Editor (o con `supabase db push`).
--
-- Qué va aquí y qué va en la cadena:
--   * Stellar (contrato Soroban): dinero, estado de pago de los hitos y hash de evidencia.
--   * Supabase: datos descriptivos, presentaciones del estudiante, archivos y revisiones.
-- Importes en unidades mínimas del token (1 USDCDEMO = 10.000.000) y plazos en
-- segundos Unix, igual que el contrato, para no convertir al llamar a Soroban.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- becas
-- -----------------------------------------------------------------------------
create sequence if not exists public.becas_codigo_seq;

create table if not exists public.becas (
  -- Id de presentación (SCH-2026-001), separado del contrato.
  id                 text primary key
                     default ('SCH-' || to_char(now(), 'YYYY') || '-' ||
                              lpad(nextval('public.becas_codigo_seq')::text, 3, '0')),
  -- Dirección C... del contrato de ESTA beca (un contrato por beca). Null = sin desplegar.
  contract_id        text unique check (contract_id ~ '^C[A-Z2-7]{55}$'),
  -- Id numérico on-chain. Con un contrato por beca no se usa; se mantiene por compatibilidad.
  onchain_id         bigint,
  estudiante_addr    text not null check (estudiante_addr ~ '^G[A-Z2-7]{55}$'),
  donante_addr       text not null check (donante_addr ~ '^G[A-Z2-7]{55}$'),
  verificador_addr   text not null check (verificador_addr ~ '^G[A-Z2-7]{55}$'),
  token_addr         text not null check (token_addr ~ '^C[A-Z2-7]{55}$'),
  moneda             text not null default 'USDCDEMO',
  titulo             text not null,
  institucion        text not null,
  descripcion        text,
  requisitos         jsonb not null default '[]'::jsonb,
  estudiante_alias   text,               -- nombre visible para el verificador (fuera de la cadena)
  verificador_nombre text,
  -- Copia del estado on-chain para listar sin consultar la cadena. La autoridad es el contrato.
  estado             text not null default 'unfunded'
                     check (estado in ('unfunded', 'active', 'completed', 'refunded')),
  fecha_inicio       date not null default current_date,
  fecha_fin          date,
  creado_en          timestamptz not null default now(),
  constraint becas_roles_distintos check (
    estudiante_addr <> donante_addr and
    estudiante_addr <> verificador_addr and
    donante_addr <> verificador_addr
  )
);

create index if not exists becas_estudiante_idx  on public.becas (estudiante_addr);
create index if not exists becas_donante_idx     on public.becas (donante_addr);
create index if not exists becas_verificador_idx on public.becas (verificador_addr);

-- -----------------------------------------------------------------------------
-- hitos
-- -----------------------------------------------------------------------------
create table if not exists public.hitos (
  id                        bigint generated always as identity primary key,
  beca_id                   text not null references public.becas (id) on delete cascade,
  indice                    int  not null check (indice between 0 and 9),  -- índice del contrato (empieza en 0)
  titulo                    text not null,
  descripcion               text,
  importe                   bigint not null check (importe > 0),           -- unidades mínimas
  plazo                     bigint not null,                               -- segundos Unix
  -- locked|pending|submitted|correction_requested|paid (+ expired|cancelled tras un reembolso)
  estado                    text not null default 'locked'
                            check (estado in ('locked', 'pending', 'submitted',
                                              'correction_requested', 'paid',
                                              'expired', 'cancelled')),
  criterios                 jsonb not null default '[]'::jsonb,
  documentos_requeridos     jsonb not null default '[]'::jsonb,
  instrucciones_verificador text,
  tx_hash                   text,  -- transacción de pago (approve_milestone)
  unique (beca_id, indice)
);

create index if not exists hitos_beca_idx on public.hitos (beca_id);

-- -----------------------------------------------------------------------------
-- presentaciones (cada envío del estudiante para un hito)
-- -----------------------------------------------------------------------------
create table if not exists public.presentaciones (
  id              uuid primary key default gen_random_uuid(),
  hito_id         bigint not null references public.hitos (id) on delete cascade,
  estudiante_addr text not null check (estudiante_addr ~ '^G[A-Z2-7]{55}$'),
  observaciones   text,
  -- sha256(JSON.stringify(hashesOrdenados)) en hex: es el BytesN<32> de approve_milestone.
  hash_conjunto   text not null check (hash_conjunto ~ '^[0-9a-f]{64}$'),
  creado_en       timestamptz not null default now()
);

create index if not exists presentaciones_hito_idx on public.presentaciones (hito_id, creado_en desc);

-- -----------------------------------------------------------------------------
-- evidencias (archivos de una presentación)
-- -----------------------------------------------------------------------------
create table if not exists public.evidencias (
  id              uuid primary key default gen_random_uuid(),
  presentacion_id uuid not null references public.presentaciones (id) on delete cascade,
  ruta_storage    text not null,   -- becas/{becaId}/hitos/{indice}/{sha256}
  nombre          text not null,
  mime            text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  tamano          bigint not null check (tamano > 0 and tamano <= 10485760),
  sha256          text not null check (sha256 ~ '^[0-9a-f]{64}$'),  -- sha256(salt || archivo)
  salt            text not null check (salt ~ '^[0-9a-f]{32}$')     -- 16 bytes aleatorios por archivo
);

create index if not exists evidencias_presentacion_idx on public.evidencias (presentacion_id);

-- -----------------------------------------------------------------------------
-- revisiones (decisiones del verificador)
-- -----------------------------------------------------------------------------
create table if not exists public.revisiones (
  id               uuid primary key default gen_random_uuid(),
  presentacion_id  uuid not null references public.presentaciones (id) on delete cascade,
  verificador_addr text not null check (verificador_addr ~ '^G[A-Z2-7]{55}$'),
  decision         text not null check (decision in ('correction_requested', 'approved')),
  comentario       text,
  tx_hash          text,
  creado_en        timestamptz not null default now(),
  constraint revisiones_aprobada_con_tx check (decision <> 'approved' or tx_hash is not null)
);

create index if not exists revisiones_presentacion_idx on public.revisiones (presentacion_id, creado_en desc);

-- -----------------------------------------------------------------------------
-- Vista para la bandeja del verificador: última presentación de cada hito.
-- -----------------------------------------------------------------------------
create or replace view public.solicitudes_verificacion
with (security_invoker = true) as
select distinct on (p.hito_id)
  p.id               as presentacion_id,
  p.creado_en        as presentado_en,
  p.hash_conjunto,
  h.id               as hito_id,
  h.indice,
  h.titulo           as hito_titulo,
  h.importe::text    as importe,
  h.estado           as hito_estado,
  b.id               as beca_id,
  b.titulo           as beca_titulo,
  b.moneda,
  b.estudiante_addr,
  b.estudiante_alias,
  b.verificador_addr,
  (select count(*) from public.evidencias e where e.presentacion_id = p.id)::int as documentos
from public.presentaciones p
join public.hitos h on h.id = p.hito_id
join public.becas b on b.id = h.beca_id
order by p.hito_id, p.creado_en desc;

-- -----------------------------------------------------------------------------
-- Permisos y RLS
--
-- VERSIÓN DE DEMO: la identidad es la cuenta de Freighter, sin login de Supabase,
-- así que la clave anon puede leer y escribir. El frontend filtra por la dirección
-- conectada y el dinero está protegido por require_auth en el contrato, pero los
-- datos fuera de la cadena NO están protegidos. Para producción: firma de reto con
-- signMessage validada en una Edge Function que emita un JWT con la dirección y
-- políticas que comparen auth.jwt() ->> 'addr' con becas.*_addr.
-- No se concede DELETE a nadie.
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.becas, public.hitos, public.presentaciones,
  public.evidencias, public.revisiones to anon, authenticated;
grant select on public.solicitudes_verificacion to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter table public.becas          enable row level security;
alter table public.hitos          enable row level security;
alter table public.presentaciones enable row level security;
alter table public.evidencias     enable row level security;
alter table public.revisiones     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['becas', 'hitos', 'presentaciones', 'evidencias', 'revisiones'] loop
    execute format('drop policy if exists %I on public.%I', t || '_demo_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_demo_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_demo_update', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)',
                   t || '_demo_select', t);
    execute format('create policy %I on public.%I for insert to anon, authenticated with check (true)',
                   t || '_demo_insert', t);
    execute format('create policy %I on public.%I for update to anon, authenticated using (true) with check (true)',
                   t || '_demo_update', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Storage: bucket PRIVADO para los documentos. El verificador los abre con
-- URLs firmadas temporales (createSignedUrl). Ruta: becas/{becaId}/hitos/{indice}/{sha256}
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "evidencias_demo_insert" on storage.objects;
drop policy if exists "evidencias_demo_select" on storage.objects;

create policy "evidencias_demo_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'evidencias' and (storage.foldername(name))[1] = 'becas');

-- Necesaria para crear URLs firmadas. Igual que arriba: aceptable solo en la demo.
create policy "evidencias_demo_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'evidencias');
