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
 worker_id text not null,
 report_date date not null,
 shift smallint not null check (shift in (1,2)),
 payload jsonb not null,
 created_at timestamptz not null default now(),
 unique(worker_id,report_date,shift)
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
declare wid text; roster jsonb;
begin
 if p_invite is null or p_token is null or p_invite !~ '^[a-f0-9]{64}$' or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Código inválido'; end if;
 -- El token lo genera el equipo antes del envío: un reintento de red es idempotente.
 select a.worker_id into wid from app_private.worker_access a where a.invite_hash=encode(sha256(convert_to(p_invite,'UTF8')),'hex') and a.invite_expires>now() for update;
 if wid is null then
  select a.worker_id into wid from app_private.worker_access a where a.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if wid is null then raise exception 'El código venció o ya fue utilizado. Pide otro a tu encargado.'; end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',w->>'id','name',w->>'name')),'[]'::jsonb) into roster from public.cuentas_claras_state s,jsonb_array_elements(s.data->'workers') w where s.id=1 and (w->>'active')::boolean;
 update app_private.worker_access set token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex'),invite_hash=null,invite_expires=null,activated_at=now() where worker_id=wid;
 return jsonb_build_object('workers',roster);
end $$;
create function app_private.worker_submit(p_token text,p_report jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare wid text; wname text; d jsonb; rd date; sh smallint; rid uuid; amount numeric; k text; expense jsonb; entry jsonb; es jsonb; shifts jsonb; opening numeric; counted numeric; expected numeric; note text; old app_private.worker_reports%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Activa tu equipo'; end if;
 select a.worker_id into wid from app_private.worker_access a where a.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for share;
 if wid is null then raise exception 'Acceso retirado. Pide otro código a tu encargado.'; end if;
 wid:=p_report->>'workerId';
 if p_report is null or jsonb_typeof(p_report)<>'object' or pg_column_size(p_report)>20000 then raise exception 'Informe inválido'; end if;
 rd:=(p_report->>'date')::date; sh:=(p_report->>'shift')::smallint;
 if rd is null or sh is null or sh not in (1,2) or rd<>(now() at time zone 'America/Lima')::date then raise exception 'Solo puedes informar la fecha de hoy y un turno válido'; end if;
 foreach k in array array['cashSales','yapeSales','opening','counted','yapeClosing','hours'] loop
  if jsonb_typeof(p_report->k) is distinct from 'number' then raise exception 'Completa todos los importes y las horas'; end if;
  amount:=(p_report->>k)::numeric;
  if amount<0 or amount>1000000 or amount<>round(amount,2) then raise exception 'Importe inválido'; end if;
 end loop;
 if (p_report->>'hours')::numeric>16 then raise exception 'Horas inválidas'; end if;
 note:=coalesce(p_report->>'note','');
 if length(note)>1000 then raise exception 'La observación es muy larga'; end if;
 if jsonb_typeof(p_report->'expenses') is distinct from 'array' or jsonb_array_length(p_report->'expenses')>20 then raise exception 'Gastos inválidos'; end if;
 -- Bloqueo de la misma fila que guarda la aplicación principal: revisión segura.
 select s.data into d from public.cuentas_claras_state s where s.id=1 for update;
 select w->>'name' into wname from jsonb_array_elements(d->'workers') w where w->>'id'=wid and (w->>'active')::boolean;
 if wname is null then raise exception 'Trabajador inactivo'; end if;
 select * into old from app_private.worker_reports where worker_id=wid and report_date=rd and shift=sh;
 if found then
  if old.payload=p_report then return jsonb_build_object('id',old.id,'duplicate',true); end if;
  raise exception 'Ya enviaste un informe para esta fecha y turno';
 end if;
 if exists(select 1 from jsonb_array_elements(d->'shifts') x where x->>'date'=rd::text and (x->>'shift')::smallint=sh and (coalesce((x->>'closed')::boolean,false) or x->>'counted' is not null))
 or exists(select 1 from jsonb_array_elements(d->'entries') x where x->>'date'=rd::text and (x->>'shift')::smallint=sh and x->>'kind'='venta' and not coalesce((x->>'excluded')::boolean,false))
 then raise exception 'Este turno ya tiene ventas o un cierre. Consulta al encargado; no se reemplazaron datos.'; end if;
 rid:=gen_random_uuid(); es:=coalesce(d->'entries','[]'::jsonb);
 foreach k in array array['cashSales','yapeSales'] loop
  amount:=(p_report->>k)::numeric;
  if amount>0 then
   entry:=jsonb_build_object('id',gen_random_uuid(),'date',rd,'shift',sh,'kind','venta','amount',amount,'method',case when k='cashSales' then 'efectivo' else 'yape' end,'concept',case when k='cashSales' then 'Ventas del turno' else 'Cobros Yape del turno' end,'workerId',wid,'sourceId',rid,'note',note);
   es:=es||jsonb_build_array(entry);
  end if;
 end loop;
 for expense in select value from jsonb_array_elements(p_report->'expenses') loop
  if jsonb_typeof(expense->'amount') is distinct from 'number' then raise exception 'Importe de gasto inválido'; end if;
  amount:=(expense->>'amount')::numeric;
  if amount<=0 or amount>1000000 or amount<>round(amount,2) or coalesce(expense->>'method','') not in ('efectivo','yape','transferencia') or length(btrim(coalesce(expense->>'concept','')))=0 or length(expense->>'concept')>160 then raise exception 'Completa concepto, importe y medio del gasto'; end if;
  es:=es||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'date',rd,'shift',sh,'kind','gasto','amount',amount,'method',expense->>'method','concept',expense->>'concept','category','Informe trabajador','workerId',wid,'sourceId',rid));
 end loop;
 opening:=(p_report->>'opening')::numeric; counted:=(p_report->>'counted')::numeric;
 select opening+coalesce(sum(case when x->>'method'='efectivo' then case when x->>'kind' in ('venta','otro_ingreso') then (x->>'amount')::numeric when x->>'kind' in ('bono','descuento') then 0 else -(x->>'amount')::numeric end else 0 end),0) into expected from jsonb_array_elements(es) x where x->>'date'=rd::text and (x->>'shift')::smallint=sh and not coalesce((x->>'excluded')::boolean,false);
 if counted<>expected and btrim(note)='' then raise exception 'Explica la diferencia entre el efectivo esperado y el contado'; end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into shifts from jsonb_array_elements(d->'shifts') x where not(x->>'date'=rd::text and (x->>'shift')::smallint=sh);
 shifts:=shifts||jsonb_build_array(jsonb_build_object('date',rd,'shift',sh,'opening',opening,'counted',counted,'yapeClosing',(p_report->>'yapeClosing')::numeric,'explanation',note,'closed',true));
 d:=jsonb_set(jsonb_set(d,'{entries}',es),'{shifts}',shifts);
 if not exists(select 1 from jsonb_array_elements(d->'attendance') x where x->>'date'=rd::text and (x->>'shift')::smallint=sh and x->>'workerId'=wid) then
  d:=jsonb_set(d,'{attendance}',coalesce(d->'attendance','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'date',rd,'shift',sh,'workerId',wid,'hours',(p_report->>'hours')::numeric,'present',true)));
 end if;
 d:=jsonb_set(d,'{audit}',jsonb_build_array(jsonb_build_object('id',rid,'at',now(),'action','crear','entity','informe trabajador','recordId',rid,'before',null,'after',p_report,'note','Informe de '||wname))||coalesce(d->'audit','[]'::jsonb));
 insert into app_private.worker_reports(id,worker_id,report_date,shift,payload) values(rid,wid,rd,sh,p_report);
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
