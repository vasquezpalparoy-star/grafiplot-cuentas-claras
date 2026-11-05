-- Correct the DATE/TEXT comparison in worker_status without changing operational data.
create or replace function app_private.worker_status(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h text; d jsonb; rd date; authorized boolean;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Dispositivo inválido'; end if;
 h:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 select exists(select 1 from app_private.worker_access where token_hash=h) into authorized;
 if not authorized then return jsonb_build_object('authorized',false); end if;
 select data into d from public.cuentas_claras_state where id=1;
 rd:=(now() at time zone 'America/Lima')::date;
 return jsonb_build_object('authorized',true,
  'workers',coalesce((select jsonb_agg(jsonb_build_object('id',x->>'id','name',x->>'name')) from jsonb_array_elements(coalesce(d->'workers','[]'::jsonb)) x where coalesce((x->>'active')::boolean,false)),'[]'::jsonb),
  'shifts',coalesce((select jsonb_agg(jsonb_build_object('shift',x->'shift','opening',x->'opening','counted',x->'counted')) from jsonb_array_elements(coalesce(d->'shifts','[]'::jsonb)) x where x->>'date'=rd::text),'[]'::jsonb),
  'attendance',coalesce((select jsonb_agg(jsonb_build_object('workerId',worker_id,'shift',shift,'event',event,'time',to_char(recorded_at at time zone 'America/Lima','HH24:MI'))) from app_private.worker_attendance_events where report_date=rd),'[]'::jsonb));
end $$;
