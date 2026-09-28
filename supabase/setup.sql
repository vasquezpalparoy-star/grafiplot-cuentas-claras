-- Grafiplot: ejecutar en un proyecto propio de Supabase.
-- Antes de ejecutar, reemplazar REEMPLAZAR_HASH_SHA256 por el SHA-256 hexadecimal
-- del SUPABASE_APP_TOKEN que guardarás como secreto del servidor.
-- Nunca pongas el token sin cifrar ni la service_role key en GitHub.
create table if not exists public.cuentas_claras_state (
  id smallint primary key check (id = 1),
  revision integer not null default 1,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.cuentas_claras_state enable row level security;
revoke all on public.cuentas_claras_state from public, authenticated, anon;
grant select, insert, update on public.cuentas_claras_state to anon;

create policy cuentas_state_read on public.cuentas_claras_state
  for select to anon
  using (encode(sha256(convert_to(coalesce(current_setting('request.headers',true)::jsonb->>'x-cuentas-token',''),'UTF8')),'hex') = 'REEMPLAZAR_HASH_SHA256');
create policy cuentas_state_insert on public.cuentas_claras_state
  for insert to anon
  with check (encode(sha256(convert_to(coalesce(current_setting('request.headers',true)::jsonb->>'x-cuentas-token',''),'UTF8')),'hex') = 'REEMPLAZAR_HASH_SHA256');
create policy cuentas_state_update on public.cuentas_claras_state
  for update to anon
  using (encode(sha256(convert_to(coalesce(current_setting('request.headers',true)::jsonb->>'x-cuentas-token',''),'UTF8')),'hex') = 'REEMPLAZAR_HASH_SHA256')
  with check (encode(sha256(convert_to(coalesce(current_setting('request.headers',true)::jsonb->>'x-cuentas-token',''),'UTF8')),'hex') = 'REEMPLAZAR_HASH_SHA256');
