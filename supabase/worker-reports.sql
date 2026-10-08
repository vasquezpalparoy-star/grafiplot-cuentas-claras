-- API limitada para informes. No concede lectura de caja a los trabajadores.
-- Requiere las funciones app_private.device_allowed del sistema existente.
create table app_private.worker_access (
 worker_id text primary key check (worker_id = '__phone__'),
 invite_hash text unique,
 invite_expires timestamptz,
 token_hash text unique,
 activated_at timestamptz
);
create table app_private.worker_reports (
 id uuid primary key default gen_random_uuid(),
 worker_id text not null check (worker_id = '__phone__'),
 report_date date not null,
 shift smallint not null check (shift in (1,2)),
 payload jsonb not null,
 created_at timestamptz not null default now(),
 unique(report_date,shift)
);
alter table app_private.worker_access enable row level security;
alter table app_private.worker_reports enable row level security;
revoke all on app_private.worker_access, app_private.worker_reports from public,anon,authenticated;

create function app_private.worker_invite(p_secret text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not app_private.device_allowed() then raise exception 'Acceso denegado' using errcode='42501'; end if;
 if p_secret is null or p_secret !~ '^[a-f0-9]{64}$' then raise exception 'Código inválido'; end if;
 insert into app_private.worker_access(worker_id,invite_hash,invite_expires)
 values('__phone__',encode(sha256(convert_to(p_secret,'UTF8')),'hex'),now()+interval '7 days')
 on conflict(worker_id) do update set invite_hash=excluded.invite_hash,invite_expires=excluded.invite_expires,token_hash=null,activated_at=null;
 return true;
end $$;
create function app_private.worker_activate(p_invite text,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare wid text;
begin
 if p_invite is null or p_token is null or p_invite !~ '^[a-f0-9]{64}$' or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Código inválido'; end if;
 -- El token lo genera el equipo antes del envío: un reintento de red es idempotente.
 select a.worker_id into wid from app_private.worker_access a where a.invite_hash=encode(sha256(convert_to(p_invite,'UTF8')),'hex') and a.invite_expires>now() for update;
 if wid is null then
  select a.worker_id into wid from app_private.worker_access a where a.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if wid is null then raise exception 'El código venció o ya fue utilizado. Pide otro a tu encargado.'; end if;
 end if;
 update app_private.worker_access set token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex'),invite_hash=null,invite_expires=null,activated_at=now() where worker_id=wid;
 return jsonb_build_object('activated',true);
end $$;
create function app_private.worker_submit(p_token text,p_report jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d jsonb; rd date; sh smallint; rid uuid; counted numeric; shifts jsonb; previous jsonb; next_shift jsonb; old app_private.worker_reports%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Activa tu equipo'; end if;
 perform 1 from app_private.worker_access a where a.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for share;
 if not found then raise exception 'Acceso retirado. Pide otro código a tu encargado.'; end if;
 if p_report is null or jsonb_typeof(p_report)<>'object' or pg_column_size(p_report)>2000 then raise exception 'Conteo inválido'; end if;
 if exists(select 1 from jsonb_object_keys(p_report) k where k not in ('date','shift','counted')) then raise exception 'Solo se permite enviar fecha, turno y efectivo contado'; end if;
 if jsonb_typeof(p_report->'date') is distinct from 'string' or jsonb_typeof(p_report->'shift') is distinct from 'number' or jsonb_typeof(p_report->'counted') is distinct from 'number' then raise exception 'Completa el turno y el efectivo contado'; end if;
 if p_report->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or p_report->>'shift' not in ('1','2') then raise exception 'Fecha o turno inválido'; end if;
 rd:=(p_report->>'date')::date; sh:=(p_report->>'shift')::smallint; counted:=(p_report->>'counted')::numeric;
 if rd<>(now() at time zone 'America/Lima')::date then raise exception 'Solo puedes informar el conteo de hoy'; end if;
 if counted<0 or counted>1000000 or counted<>round(counted,2) then raise exception 'Efectivo contado inválido'; end if;
 select s.data into d from public.cuentas_claras_state s where s.id=1 for update;
 if not found then raise exception 'El propietario debe iniciar primero la caja en el sistema principal'; end if;
 select * into old from app_private.worker_reports where report_date=rd and shift=sh;
 if found then
  if old.payload=p_report then return jsonb_build_object('id',old.id,'duplicate',true); end if;
  raise exception 'Ya se envió el conteo de este turno. Solo el propietario puede corregirlo.';
 end if;
 select x into previous from jsonb_array_elements(d->'shifts') x where x->>'date'=rd::text and (x->>'shift')::smallint=sh limit 1;
 if previous->>'counted' is not null or coalesce((previous->>'closed')::boolean,false) then raise exception 'Este turno ya tiene un conteo o un cierre. No se reemplazaron datos.'; end if;
 rid:=gen_random_uuid();
 select coalesce(jsonb_agg(x),'[]'::jsonb) into shifts from jsonb_array_elements(d->'shifts') x where not(x->>'date'=rd::text and (x->>'shift')::smallint=sh);
 -- Solo se actualiza el conteo de efectivo. Yape, movimientos y asistencia se conservan.
 -- El propietario completa y confirma el cierre en la aplicación principal.
 next_shift:=coalesce(previous,jsonb_build_object('date',rd,'shift',sh,'yapeClosing',null,'explanation',''))||jsonb_build_object('opening',60,'counted',counted,'closed',false);
 shifts:=shifts||jsonb_build_array(next_shift);
 d:=jsonb_set(d,'{shifts}',shifts);
 d:=jsonb_set(d,'{audit}',jsonb_build_array(jsonb_build_object('id',rid,'at',now(),'action','crear','entity','conteo trabajador','recordId',rid,'before',previous,'after',p_report,'note','Conteo enviado desde el celular autorizado. Efectivo inicial: S/ 60.'))||coalesce(d->'audit','[]'::jsonb));
 insert into app_private.worker_reports(id,worker_id,report_date,shift,payload) values(rid,'__phone__',rd,sh,p_report);
 update public.cuentas_claras_state set revision=revision+1,data=jsonb_set(d,'{revision}',to_jsonb(revision+1)),updated_at=now() where id=1;
 return jsonb_build_object('id',rid,'duplicate',false);
end $$;

-- Los wrappers invocadores no leen tablas. La autorización está en las funciones privadas.
create function public.grafiplot_worker_invite(p_secret text) returns boolean language sql set search_path='' as $$ select app_private.worker_invite(p_secret) $$;
create function public.grafiplot_worker_activate(p_invite text,p_token text) returns jsonb language sql set search_path='' as $$ select app_private.worker_activate(p_invite,p_token) $$;
create function public.grafiplot_worker_submit(p_token text,p_report jsonb) returns jsonb language sql set search_path='' as $$ select app_private.worker_submit(p_token,p_report) $$;
revoke all on function app_private.worker_invite(text),app_private.worker_activate(text,text),app_private.worker_submit(text,jsonb),public.grafiplot_worker_invite(text),public.grafiplot_worker_activate(text,text),public.grafiplot_worker_submit(text,jsonb) from public,anon,authenticated;
grant usage on schema app_private to anon,authenticated;
grant execute on function app_private.worker_invite(text),public.grafiplot_worker_invite(text) to authenticated;
grant execute on function app_private.worker_activate(text,text),app_private.worker_submit(text,jsonb),public.grafiplot_worker_activate(text,text),public.grafiplot_worker_submit(text,jsonb) to anon;
