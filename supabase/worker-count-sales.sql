-- Calcula únicamente las ventas asociadas a nuevos conteos de la APK.
-- Los gastos agregados por el propietario se incluyen para no descontarlos dos veces.
create or replace function app_private.recalculate_worker_count_sales() returns trigger
language plpgsql set search_path='' as $$
declare es jsonb; result jsonb:='[]'::jsonb; e jsonb; sh jsonb; calculated numeric;
begin
 es:=coalesce(new.data->'entries','[]'::jsonb);
 for e in select value from jsonb_array_elements(es) loop
  if e->>'cashCountAuto'='true' and e->>'sourceId' like 'worker-count:%' and not coalesce((e->>'excluded')::boolean,false) then
    select x into sh from jsonb_array_elements(coalesce(new.data->'shifts','[]'::jsonb)) x where x->>'date'=e->>'date' and x->>'shift'=e->>'shift' limit 1;
    if sh->>'counted' is not null then
     select greatest(0,(sh->>'counted')::numeric-coalesce((sh->>'opening')::numeric,60)+coalesce(sum(case
      when x->>'kind' in ('venta','otro_ingreso') then -(x->>'amount')::numeric
      when x->>'kind' in ('bono','descuento') then 0
      else (x->>'amount')::numeric end),0)) into calculated
     from jsonb_array_elements(es) x where x->>'id'<>e->>'id' and x->>'date'=e->>'date' and x->>'shift'=e->>'shift' and x->>'method'='efectivo' and not coalesce((x->>'excluded')::boolean,false);
     e:=e||jsonb_build_object('amount',round(calculated,2));
    end if;
  end if;
  result:=result||jsonb_build_array(e);
 end loop;
 new.data:=jsonb_set(new.data,'{entries}',result);
 return new;
end $$;
revoke all on function app_private.recalculate_worker_count_sales() from public,anon,authenticated;
create trigger grafiplot_worker_count_sales before update of data on public.cuentas_claras_state
for each row execute function app_private.recalculate_worker_count_sales();

create or replace function app_private.worker_submit(p_token text,p_report jsonb) returns jsonb
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
 -- Se conserva el conteo total y los movimientos existentes. Yape y asistencia se conservan.
 -- El propietario completa y confirma el cierre en la aplicación principal.
 next_shift:=coalesce(previous,jsonb_build_object('date',rd,'shift',sh,'yapeClosing',null,'explanation',''))||jsonb_build_object('opening',60,'counted',counted,'closed',false);
 shifts:=shifts||jsonb_build_array(next_shift);
 d:=jsonb_set(d,'{shifts}',shifts);
 -- Guarda todo el conteo y crea una venta calculada solo si no hay venta manual.
 -- El trigger ajusta después el importe al registrar gastos/otros movimientos.
 if not exists(select 1 from jsonb_array_elements(coalesce(d->'entries','[]'::jsonb)) x where x->>'date'=rd::text and (x->>'shift')::smallint=sh and x->>'kind'='venta' and x->>'method'='efectivo' and not coalesce((x->>'excluded')::boolean,false)) then
  d:=jsonb_set(d,'{entries}',coalesce(d->'entries','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'date',rd,'shift',sh,'kind','venta','method','efectivo','amount',greatest(0,counted-60),'concept','Ventas en efectivo del conteo','sourceId','worker-count:'||rid::text,'cashCountAuto',true)));
 end if;
 d:=jsonb_set(d,'{audit}',jsonb_build_array(jsonb_build_object('id',rid,'at',now(),'action','crear','entity','conteo trabajador','recordId',rid,'before',previous,'after',p_report,'note','Conteo enviado desde el celular autorizado. Efectivo inicial: S/ 60.'))||coalesce(d->'audit','[]'::jsonb));
 insert into app_private.worker_reports(id,worker_id,report_date,shift,payload) values(rid,'__phone__',rd,sh,p_report);
 update public.cuentas_claras_state set revision=revision+1,data=jsonb_set(d,'{revision}',to_jsonb(revision+1)),updated_at=now() where id=1;
 return jsonb_build_object('id',rid,'duplicate',false);
end $$;

