-- Keeps the ticket number sent by the field-service tool: the quote webhook sends it back
-- as quote.ticket_id so the receiver attaches the quote to the ticket it knows.
alter table public.tickets
  add column if not exists external_number text,
  add column if not exists installation_stopped boolean not null default false;
alter table public.intervention_reports
  add column if not exists installation_stopped boolean not null default false;

create or replace function public.import_quote_ticket_from_webhook(p_token text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  endpoint public.webhook_endpoints%rowtype;
  field record;
  client jsonb;
  site jsonb;
  equipment jsonb;
  ticket jsonb;
  problem jsonb;
  technician jsonb;
  work_type jsonb;
  requested_id uuid;
  entity_name text;
  candidates uuid[];
  name_candidates uuid[];
  addr_candidates uuid[];
  existing_ticket record;
  v_client_id uuid;
  v_client_number text;
  v_client_created boolean;
  v_site_id uuid;
  v_site_number text;
  v_site_created boolean;
  v_installation_id uuid;
  v_installation_number text;
  v_installation_created boolean;
  v_installation_stopped boolean;
  v_ticket_id uuid;
  v_ticket_number text;
  v_ticket_type text;
  description text;
  receipt record;
begin
  select * into endpoint from public.webhook_endpoints where token = p_token for update;
  if not found then
    raise exception 'URL de réception inconnue.' using errcode = 'PT404';
  end if;
  if not endpoint.ticket_import_enabled then
    raise exception 'La création de tickets est désactivée pour cette URL.' using errcode = 'PT403';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Le corps doit être un objet JSON.' using errcode = 'PT400';
  end if;
  if octet_length(p_payload::text) > 65536 then
    raise exception 'Le JSON dépasse 64 Ko.' using errcode = 'PT413';
  end if;
  if not (p_payload ?& array['event', 'ticket', 'client', 'site']) then
    raise exception 'Le JSON doit contenir au moins event, ticket, client et site.' using errcode = 'PT400';
  end if;
  for field in select * from jsonb_object_keys(p_payload) as key loop
    if field.key not in
      ('event', 'ticket', 'problem', 'client', 'site', 'equipment', 'equipment_checks', 'work_type', 'technician') then
      raise exception 'Champ non autorisé : %.', field.key using errcode = 'PT400';
    end if;
  end loop;
  if p_payload->>'event' <> 'status_en_attente_devis' then
    raise exception 'Cette URL ne traite que l’évènement status_en_attente_devis.' using errcode = 'PT400';
  end if;

  ticket := p_payload->'ticket';
  problem := p_payload->'problem';
  client := p_payload->'client';
  site := p_payload->'site';
  equipment := p_payload->'equipment';
  work_type := p_payload->'work_type';
  technician := p_payload->'technician';

  if jsonb_typeof(ticket) <> 'object' or coalesce(ticket->>'id', '') = '' then
    raise exception 'ticket.id est obligatoire.' using errcode = 'PT400';
  end if;
  if length(ticket->>'id') > 200 then
    raise exception 'ticket.id dépasse 200 caractères.' using errcode = 'PT400';
  end if;
  if length(ticket->>'title') > 200 then
    raise exception 'ticket.title dépasse 200 caractères.' using errcode = 'PT400';
  end if;
  if jsonb_typeof(client) <> 'object' or coalesce(client->>'id', client->>'name') is null then
    raise exception 'client.id ou client.name est obligatoire.' using errcode = 'PT400';
  end if;
  if jsonb_typeof(site) <> 'object' or coalesce(site->>'id', site->>'name') is null then
    raise exception 'site.id ou site.name est obligatoire.' using errcode = 'PT400';
  end if;
  if equipment is not null and jsonb_typeof(equipment) <> 'object' then
    raise exception 'equipment doit être un objet.' using errcode = 'PT400';
  end if;

  -- Shares the delivery quota and history of the existing webhook receiver.
  -- All inserts below, including this receipt, roll back together on any error.
  select * into receipt from public.receive_webhook(
    p_token, p_payload::text, 'application/json',
    '{"x-operation":"ensure-quote-ticket"}'::jsonb, '{}'::jsonb
  );

  -- Idempotency: replaying the same delivery reuses the ticket already created for it.
  select id, ticket_number into existing_ticket
    from public.tickets
    where owner_id = endpoint.owner_id and external_source = 'field_service' and external_ref = ticket->>'id';
  if found then
    return jsonb_build_object(
      'id', receipt.id, 'received_at', receipt.received_at,
      'ticket', jsonb_build_object('id', existing_ticket.id, 'number', existing_ticket.ticket_number, 'created', false)
    );
  end if;

  -- Client: id, else name within the account, else create.
  requested_id := (client->>'id')::uuid;
  entity_name := btrim(regexp_replace(coalesce(client->>'name', ''), '[[:space:]]+', ' ', 'g'));
  if requested_id is not null then
    select id into v_client_id from public.clients where id = requested_id and owner_id = endpoint.owner_id;
    if v_client_id is null then raise exception 'client.id est introuvable dans ce compte.' using errcode = 'PT404'; end if;
    v_client_created := false;
  else
    select array_agg(id) into candidates from public.clients
      where owner_id = endpoint.owner_id and public.normalize_import_name(name) = public.normalize_import_name(entity_name);
    if coalesce(array_length(candidates, 1), 0) > 1 then
      raise exception 'Plusieurs clients correspondent à ce nom. Fournissez client.id.' using errcode = 'PT409';
    end if;
    v_client_id := candidates[1];
    v_client_created := v_client_id is null;
    if v_client_created then
      insert into public.clients(owner_id, name, email, phone, contact_name)
      values (endpoint.owner_id, entity_name, client->>'contact_email', client->>'contact_phone', client->>'contact_name')
      returning id, client_number into v_client_id, v_client_number;
    end if;
  end if;
  if not v_client_created then
    select clients.client_number into v_client_number from public.clients where id = v_client_id;
  end if;

  -- Site: id, else name or address+postal code within the client, else create.
  requested_id := (site->>'id')::uuid;
  entity_name := btrim(regexp_replace(coalesce(site->>'name', ''), '[[:space:]]+', ' ', 'g'));
  if requested_id is not null then
    select id into v_site_id from public.sites where id = requested_id and owner_id = endpoint.owner_id and client_id = v_client_id;
    if v_site_id is null then raise exception 'site.id est introuvable pour ce client.' using errcode = 'PT404'; end if;
    v_site_created := false;
  else
    select array_agg(id) into name_candidates from public.sites
      where owner_id = endpoint.owner_id and client_id = v_client_id
        and entity_name <> '' and public.normalize_import_name(name) = public.normalize_import_name(entity_name);
    select array_agg(id) into addr_candidates from public.sites
      where owner_id = endpoint.owner_id and client_id = v_client_id
        and site->>'address' is not null
        and public.normalize_import_name(address) = public.normalize_import_name(site->>'address')
        and (site->>'postal_code' is null or postal_code = site->>'postal_code');
    select array_agg(distinct id) into candidates
      from unnest(coalesce(name_candidates, '{}') || coalesce(addr_candidates, '{}')) as id;
    if coalesce(array_length(candidates, 1), 0) > 1 then
      raise exception 'Plusieurs sites correspondent. Fournissez site.id.' using errcode = 'PT409';
    end if;
    v_site_id := candidates[1];
    v_site_created := v_site_id is null;
    if v_site_created then
      if entity_name = '' then
        raise exception 'site.name est obligatoire pour créer un site.' using errcode = 'PT400';
      end if;
      insert into public.sites(
        owner_id, client_id, name, address, postal_code, city, contact_name, contact_phone, notes, latitude, longitude
      ) values (
        endpoint.owner_id, v_client_id, entity_name, site->>'address', site->>'postal_code', site->>'city',
        site->>'contact_name', site->>'contact_phone', site->>'access_notes',
        nullif(site->>'lat', '')::numeric, nullif(site->>'lng', '')::numeric
      )
      returning id, site_number into v_site_id, v_site_number;
    end if;
  end if;
  if not v_site_created then
    select sites.site_number into v_site_number from public.sites where id = v_site_id;
  end if;

  -- Equipment / installation: id, else serial number or code within the site, else create.
  v_installation_created := false;
  v_installation_stopped := equipment is not null and (
    coalesce((equipment->>'stopped')::boolean, false)
    or lower(btrim(coalesce(equipment->>'state', ''))) in ('hs', 'arret', 'à l’arrêt', 'stopped', 'out_of_service', 'hors_service')
  );
  if equipment is not null then
    requested_id := (equipment->>'id')::uuid;
    if requested_id is not null then
      select id into v_installation_id from public.installations
        where id = requested_id and owner_id = endpoint.owner_id and site_id = v_site_id;
      if v_installation_id is null then
        raise exception 'equipment.id est introuvable pour ce site.' using errcode = 'PT404';
      end if;
    else
      candidates := null;
      if coalesce(equipment->>'serial_number', '') <> '' then
        select array_agg(id) into candidates from public.installations
          where owner_id = endpoint.owner_id and site_id = v_site_id
            and serial_number is not null
            and lower(btrim(serial_number)) = lower(btrim(equipment->>'serial_number'));
      end if;
      if coalesce(array_length(candidates, 1), 0) = 0 and coalesce(equipment->>'code', '') <> '' then
        select array_agg(id) into candidates from public.installations
          where owner_id = endpoint.owner_id and site_id = v_site_id
            and code is not null and lower(btrim(code)) = lower(btrim(equipment->>'code'));
      end if;
      if coalesce(array_length(candidates, 1), 0) > 1 then
        raise exception 'Plusieurs installations correspondent à cet équipement. Fournissez equipment.id.' using errcode = 'PT409';
      end if;
      v_installation_id := candidates[1];
      v_installation_created := v_installation_id is null;
      if v_installation_created then
        entity_name := btrim(concat_ws(' ', equipment->>'equipment_type', equipment->>'code'));
        if entity_name = '' then entity_name := 'Équipement'; end if;
        insert into public.installations(owner_id, site_id, name, code, serial_number, year, notes)
        values (
          endpoint.owner_id, v_site_id, entity_name, equipment->>'code', equipment->>'serial_number',
          nullif(equipment->>'year', '')::int,
          nullif(concat_ws(E'\n',
            case when equipment->>'brand' is not null then 'Marque : ' || (equipment->>'brand') end,
            case when equipment->>'model' is not null then 'Modèle : ' || (equipment->>'model') end,
            case when equipment->>'state' is not null then 'État : ' || (equipment->>'state') end
          ), '')
        )
        returning id, installation_number into v_installation_id, v_installation_number;
      end if;
    end if;
    if not v_installation_created then
      select installations.installation_number into v_installation_number
        from public.installations where id = v_installation_id;
    end if;
  end if;

  v_ticket_type := case when ticket->>'type' = 'preventif' then 'maintenance' else 'repair' end;
  description := nullif(concat_ws(E'\n\n',
    case when v_installation_stopped then '⚠ Installation à l’arrêt' end,
    nullif(ticket->>'description', ''),
    case when problem is not null then concat_ws(E'\n',
      case when problem->>'panne_description' is not null then 'Panne constatée : ' || (problem->>'panne_description') end,
      case when problem->>'actions_done' is not null then 'Actions déjà réalisées : ' || (problem->>'actions_done') end,
      case when problem->>'recommendation' is not null then 'Recommandation : ' || (problem->>'recommendation') end
    ) end,
    case when work_type->>'name' is not null then 'Type d’intervention : ' || (work_type->>'name') end,
    case when technician->>'full_name' is not null then 'Technicien : ' || (technician->>'full_name') end,
    'Ticket source : ' || coalesce(ticket->>'number', ticket->>'id')
  ), '');

  insert into public.tickets(
    owner_id, client_id, site_id, installation_id, title, description, priority, status, ticket_type,
    external_source, external_ref, external_number, installation_stopped
  ) values (
    endpoint.owner_id, v_client_id, v_site_id, v_installation_id,
    coalesce(nullif(ticket->>'title', ''), 'Devis à préparer'), description,
    coalesce(nullif(lower(ticket->>'priority'), ''), 'normale'), 'devis_a_creer', v_ticket_type,
    'field_service', ticket->>'id', nullif(ticket->>'number', ''), v_installation_stopped
  )
  returning id, ticket_number into v_ticket_id, v_ticket_number;

  insert into public.history_events(owner_id, ticket_id, site_id, installation_id, event_type, title, description, metadata, actor_id)
  values (
    endpoint.owner_id, v_ticket_id, v_site_id, v_installation_id, 'ticket_imported',
    'Ticket importé depuis le webhook', 'Reçu en attente de devis via l’intégration externe.',
    jsonb_build_object('external_ref', ticket->>'id', 'webhook_event_id', receipt.id), null
  );

  return jsonb_build_object(
    'id', receipt.id, 'received_at', receipt.received_at,
    'client', jsonb_build_object('id', v_client_id, 'number', v_client_number, 'created', v_client_created),
    'site', jsonb_build_object('id', v_site_id, 'number', v_site_number, 'created', v_site_created),
    'installation', case when v_installation_id is null then null else
      jsonb_build_object('id', v_installation_id, 'number', v_installation_number, 'created', v_installation_created) end,
    'ticket', jsonb_build_object('id', v_ticket_id, 'number', v_ticket_number, 'created', true)
  );
end;
$$;

revoke all on function public.import_quote_ticket_from_webhook(text, jsonb) from public;
grant execute on function public.import_quote_ticket_from_webhook(text, jsonb) to anon, authenticated;
