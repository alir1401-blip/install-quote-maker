alter table public.webhook_endpoints
  add column if not exists import_enabled boolean not null default false;

grant update (import_enabled) on public.webhook_endpoints to authenticated;
create policy "Users can configure their imports" on public.webhook_endpoints
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create function public.normalize_import_name(p_name text)
returns text language sql immutable strict set search_path = '' as $$
  select lower(btrim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g')));
$$;

create index clients_import_name_idx on public.clients(owner_id, public.normalize_import_name(name));
create index sites_import_name_idx on public.sites(owner_id, client_id, public.normalize_import_name(name));
create index installations_import_name_idx on public.installations(owner_id, site_id, public.normalize_import_name(name));

create function public.import_installation_from_webhook(p_token text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  endpoint public.webhook_endpoints%rowtype;
  kind text;
  entity jsonb;
  field record;
  allowed text[];
  table_name text;
  parent_column text;
  number_column text;
  parent_id uuid;
  entity_id uuid;
  entity_number text;
  requested_id uuid;
  entity_name text;
  candidates uuid[];
  was_created boolean;
  result jsonb := '{}'::jsonb;
  receipt record;
begin
  select * into endpoint from public.webhook_endpoints where token = p_token for update;
  if not found then
    raise exception 'URL de réception inconnue.' using errcode = 'PT404';
  end if;
  if not endpoint.import_enabled then
    raise exception 'La création automatique est désactivée pour cette URL.' using errcode = 'PT403';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Le corps doit être un objet JSON.' using errcode = 'PT400';
  end if;
  if not (p_payload ?& array['client', 'site', 'installation'])
     or (select count(*) from jsonb_object_keys(p_payload)) <> 3 then
    raise exception 'Le JSON doit contenir uniquement client, site et installation.' using errcode = 'PT400';
  end if;
  if octet_length(p_payload::text) > 65536 then
    raise exception 'Le JSON dépasse 64 Ko.' using errcode = 'PT413';
  end if;

  -- Validate all fields here too: the RPC is directly reachable through PostgREST.
  foreach kind in array array['client', 'site', 'installation'] loop
    entity := p_payload -> kind;
    if jsonb_typeof(entity) <> 'object' then
      raise exception '% doit être un objet.', kind using errcode = 'PT400';
    end if;
    allowed := case kind
      when 'client' then array['id','name','email','phone','address','contact_name','notes','siret']
      when 'site' then array['id','name','email','address','contact_name','contact_phone','notes']
      else array['id','name','serial_number','year','location','notes','characteristics'] end;
    for field in select * from jsonb_each(entity) loop
      if not (field.key = any(allowed)) then
        raise exception 'Champ non autorisé : %.%', kind, field.key using errcode = 'PT400';
      end if;
      if field.key = 'year' then
        if field.value <> 'null'::jsonb and (
          jsonb_typeof(field.value) <> 'number'
        ) then
          raise exception 'installation.year doit être un entier.' using errcode = 'PT400';
        end if;
        if field.value <> 'null'::jsonb and (
          (field.value::text)::numeric <> trunc((field.value::text)::numeric)
          or (field.value::text)::numeric not between 1800 and 2200
        ) then
          raise exception 'installation.year doit être compris entre 1800 et 2200.' using errcode = 'PT400';
        end if;
      elsif field.key = 'characteristics' then
        if jsonb_typeof(field.value) <> 'object' then
          raise exception 'installation.characteristics doit être un objet.' using errcode = 'PT400';
        end if;
      elsif field.value <> 'null'::jsonb then
        if jsonb_typeof(field.value) <> 'string' or length(entity ->> field.key) > 10000 then
          raise exception 'Champ texte invalide : %.%', kind, field.key using errcode = 'PT400';
        end if;
      end if;
    end loop;
    if entity ->> 'id' is null and coalesce(public.normalize_import_name(entity ->> 'name'), '') = '' then
      raise exception '%.name ou %.id est obligatoire.', kind, kind using errcode = 'PT400';
    end if;
    if length(entity ->> 'name') > 200 then
      raise exception '%.name dépasse 200 caractères.', kind using errcode = 'PT400';
    end if;
    if entity ->> 'id' is not null and not ((entity ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception '%.id doit être un UUID.', kind using errcode = 'PT400';
    end if;
  end loop;

  -- Shares the delivery quota and history of the existing webhook receiver.
  -- All inserts below, including this receipt, roll back together on any error.
  select * into receipt from public.receive_webhook(
    p_token, p_payload::text, 'application/json',
    '{"x-operation":"ensure-installation"}'::jsonb, '{}'::jsonb
  );

  foreach kind in array array['client', 'site', 'installation'] loop
    entity := p_payload -> kind;
    requested_id := (entity ->> 'id')::uuid;
    entity_name := btrim(regexp_replace(entity ->> 'name', '[[:space:]]+', ' ', 'g'));
    table_name := case kind when 'client' then 'clients' when 'site' then 'sites' else 'installations' end;
    number_column := kind || '_number';
    parent_column := case kind when 'site' then 'client_id' when 'installation' then 'site_id' else null end;

    -- Identifiers are from the fixed allowlist above; payload values are bound.
    execute format(
      'select array_agg(id) from public.%I where owner_id = $1 and %s and
       (($3 is not null and id = $3) or ($3 is null and public.normalize_import_name(name) = $4))',
      table_name, case when parent_column is null then 'true' else format('%I = $2', parent_column) end
    ) into candidates using endpoint.owner_id, parent_id, requested_id, public.normalize_import_name(entity_name);

    if coalesce(array_length(candidates, 1), 0) > 1 then
      raise exception 'Plusieurs fiches correspondent à %. Fournissez son id.', kind using errcode = 'PT409';
    end if;
    entity_id := candidates[1];
    was_created := entity_id is null;
    if was_created and requested_id is not null then
      raise exception '%.id est introuvable dans ce compte ou ce parent.', kind using errcode = 'PT404';
    end if;

    if was_created then
      if kind = 'client' then
        insert into public.clients(owner_id, name, email, phone, address, contact_name, notes, siret)
        values (endpoint.owner_id, entity_name, entity->>'email', entity->>'phone', entity->>'address',
          entity->>'contact_name', entity->>'notes', entity->>'siret')
        returning id, client_number into entity_id, entity_number;
      elsif kind = 'site' then
        insert into public.sites(owner_id, client_id, name, email, address, contact_name, contact_phone, notes)
        values (endpoint.owner_id, parent_id, entity_name, entity->>'email', entity->>'address',
          entity->>'contact_name', entity->>'contact_phone', entity->>'notes')
        returning id, site_number into entity_id, entity_number;
      else
        insert into public.installations(owner_id, site_id, name, serial_number, year, location, notes, characteristics)
        values (endpoint.owner_id, parent_id, entity_name, entity->>'serial_number', (entity->>'year')::numeric::integer,
          entity->>'location', entity->>'notes', coalesce(entity->'characteristics', '{}'::jsonb))
        returning id, installation_number into entity_id, entity_number;
      end if;
    else
      execute format('select %I from public.%I where id = $1', number_column, table_name)
        into entity_number using entity_id;
    end if;
    result := result || jsonb_build_object(kind, jsonb_build_object(
      'id', entity_id, 'number', entity_number, 'created', was_created
    ));
    parent_id := entity_id;
  end loop;
  return result || jsonb_build_object('id', receipt.id, 'received_at', receipt.received_at);
end;
$$;

revoke all on function public.import_installation_from_webhook(text, jsonb) from public;
grant execute on function public.import_installation_from_webhook(text, jsonb) to anon, authenticated;
