-- Optional catalogue references for installation imports; existing records are never edited.
-- This helper is private: only the token-authorized import function may invoke it.
create function public.resolve_installation_import_reference(
  p_owner uuid, p_kind text, p_ref jsonb, p_parent uuid default null, p_type uuid default null
) returns uuid language plpgsql set search_path = '' as $$
declare
  table_name text;
  field record;
  requested_id uuid;
  candidates uuid[];
  extra_filter text := 'true';
begin
  if p_ref is null or p_ref = 'null'::jsonb then return null; end if;
  if jsonb_typeof(p_ref) <> 'object' then
    raise exception 'installation.% doit être un objet.', p_kind using errcode = 'PT400';
  end if;
  for field in select * from jsonb_each(p_ref) loop
    if field.key not in ('id', 'name') and not (p_kind = 'contract' and field.key = 'type') then
      raise exception 'Champ non autorisé : installation.%.%', p_kind, field.key using errcode = 'PT400';
    end if;
    if field.value <> 'null'::jsonb and jsonb_typeof(field.value) <> 'string' then
      raise exception 'Référence invalide : installation.%.%', p_kind, field.key using errcode = 'PT400';
    end if;
  end loop;
  if p_ref->>'id' is not null and not ((p_ref->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'installation.%.id doit être un UUID.', p_kind using errcode = 'PT400';
  end if;
  if p_ref->>'name' is not null and (length(btrim(p_ref->>'name')) = 0 or length(p_ref->>'name') > 200) then
    raise exception 'installation.%.name doit contenir de 1 à 200 caractères.', p_kind using errcode = 'PT400';
  end if;
  if p_ref->>'id' is null and coalesce(public.normalize_import_name(p_ref->>'name'), '') = '' then
    raise exception 'installation.% : indiquez un nom ou un id.', p_kind using errcode = 'PT400';
  end if;
  if p_kind = 'contract' and p_ref ? 'type' and
     (p_ref->>'type' is null or p_ref->>'type' not in ('none','generic','framework','maintenance','warranty')) then
    raise exception 'Type de contrat invalide.' using errcode = 'PT400';
  end if;
  table_name := case p_kind when 'type' then 'installation_types' when 'brand' then 'brands'
    when 'model' then 'models' when 'contract' then 'contracts' else null end;
  if table_name is null then raise exception 'Référence non autorisée.' using errcode = 'PT400'; end if;
  requested_id := (p_ref->>'id')::uuid;
  if p_kind = 'model' then
    extra_filter := '($4 is null or brand_id = $4) and ($5 is null or type_id is null or type_id = $5)';
  elsif p_kind = 'contract' then
    extra_filter := '(client_id is null or client_id = $4) and ($6 is null or type = $6)';
  end if;
  execute format('select array_agg(id) from public.%I where owner_id = $1 and
    (($2 is not null and id = $2) or ($2 is null and public.normalize_import_name(name) = $3)) and %s', table_name, extra_filter)
    into candidates using p_owner, requested_id, public.normalize_import_name(p_ref->>'name'), p_parent, p_type, p_ref->>'type';
  if coalesce(array_length(candidates, 1), 0) = 0 then
    raise exception 'installation.% : référence introuvable ou incompatible dans ce compte. Créez-la dans le catalogue avant de réessayer.', p_kind using errcode = 'PT404';
  end if;
  if array_length(candidates, 1) > 1 then
    raise exception 'installation.% : nom ambigu, fournissez un id.', p_kind using errcode = 'PT409';
  end if;
  return candidates[1];
end;
$$;
revoke all on function public.resolve_installation_import_reference(uuid, text, jsonb, uuid, uuid) from public, anon, authenticated;

create or replace function public.import_installation_from_webhook(p_token text, p_payload jsonb)
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
  type_id uuid;
  brand_id uuid;
  model_id uuid;
  contract_id uuid;
  model_row public.models%rowtype;
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
      when 'site' then array['id','name','email','address','contact_name','contact_phone','notes','latitude','longitude']
      else array['id','name','serial_number','year','location','notes','characteristics','photo_url','type','brand','model','contract'] end;
    for field in select * from jsonb_each(entity) loop
      if not (field.key = any(allowed)) then
        raise exception 'Champ non autorisé : %.%', kind, field.key using errcode = 'PT400';
      end if;
      if kind = 'installation' and field.key in ('type', 'brand', 'model', 'contract') then
        -- Full reference validation and owner-scoped lookup happen below.
        if field.value <> 'null'::jsonb and jsonb_typeof(field.value) <> 'object' then
          raise exception 'installation.% doit être un objet.', field.key using errcode = 'PT400';
        end if;
      elsif kind = 'site' and field.key in ('latitude', 'longitude') then
        if field.value <> 'null'::jsonb then
          if jsonb_typeof(field.value) <> 'number' then
            raise exception 'site.% doit être un nombre.', field.key using errcode = 'PT400';
          end if;
          if abs((field.value::text)::numeric) > case field.key when 'latitude' then 90 else 180 end then
            raise exception 'site.% est hors limites.', field.key using errcode = 'PT400';
          end if;
        end if;
      elsif field.key = 'year' then
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

    if kind = 'installation' then
      type_id := public.resolve_installation_import_reference(endpoint.owner_id, 'type', entity->'type');
      brand_id := public.resolve_installation_import_reference(endpoint.owner_id, 'brand', entity->'brand');
      model_id := public.resolve_installation_import_reference(endpoint.owner_id, 'model', entity->'model', brand_id, type_id);
      contract_id := public.resolve_installation_import_reference(endpoint.owner_id, 'contract', entity->'contract', (result->'client'->>'id')::uuid);
      if model_id is not null then
        select * into strict model_row from public.models where id = model_id and owner_id = endpoint.owner_id;
        if (brand_id is not null and brand_id <> model_row.brand_id)
           or (type_id is not null and model_row.type_id is not null and type_id <> model_row.type_id) then
          raise exception 'Le modèle ne correspond pas à la marque ou au type indiqué.' using errcode = 'PT400';
        end if;
        brand_id := coalesce(brand_id, model_row.brand_id);
        type_id := coalesce(type_id, model_row.type_id);
        -- Also validate inferred relationships, even if old catalogue data is inconsistent.
        perform public.resolve_installation_import_reference(endpoint.owner_id, 'brand', jsonb_build_object('id', brand_id));
        if type_id is not null then
          perform public.resolve_installation_import_reference(endpoint.owner_id, 'type', jsonb_build_object('id', type_id));
        end if;
      end if;
    end if;

    if was_created then
      if kind = 'client' then
        insert into public.clients(owner_id, name, email, phone, address, contact_name, notes, siret)
        values (endpoint.owner_id, entity_name, entity->>'email', entity->>'phone', entity->>'address',
          entity->>'contact_name', entity->>'notes', entity->>'siret')
        returning id, client_number into entity_id, entity_number;
      elsif kind = 'site' then
        insert into public.sites(owner_id, client_id, name, email, address, contact_name, contact_phone, notes, latitude, longitude)
        values (endpoint.owner_id, parent_id, entity_name, entity->>'email', entity->>'address',
          entity->>'contact_name', entity->>'contact_phone', entity->>'notes', (entity->>'latitude')::numeric, (entity->>'longitude')::numeric)
        returning id, site_number into entity_id, entity_number;
      else
        insert into public.installations(owner_id, site_id, name, serial_number, year, location, notes, characteristics, photo_url, type_id, brand_id, model_id, contract_id)
        values (endpoint.owner_id, parent_id, entity_name, entity->>'serial_number', (entity->>'year')::numeric::integer,
          entity->>'location', entity->>'notes', coalesce(entity->'characteristics', '{}'::jsonb), entity->>'photo_url', type_id, brand_id, model_id, contract_id)
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
