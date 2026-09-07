create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  constraint webhook_token_format check (token ~ '^[a-f0-9]{64}$')
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  received_at timestamptz not null default now(),
  content_type text not null,
  headers jsonb not null default '{}'::jsonb,
  query_params jsonb not null default '{}'::jsonb,
  body text not null,
  size_bytes integer not null,
  constraint webhook_body_size check (size_bytes = octet_length(body) and size_bytes <= 262144),
  constraint webhook_metadata_size check (
    octet_length(headers::text) <= 16384 and jsonb_typeof(headers) = 'object'
    and octet_length(query_params::text) <= 16384 and jsonb_typeof(query_params) = 'object'
    and octet_length(content_type) <= 1024
  )
);


create index webhook_events_owner_received_idx on public.webhook_events(owner_id, received_at desc);
create index webhook_events_endpoint_received_idx on public.webhook_events(endpoint_id, received_at desc);

alter table public.webhook_endpoints enable row level security;
alter table public.webhook_events enable row level security;

revoke all on public.webhook_endpoints, public.webhook_events from anon, authenticated;
grant select, insert on public.webhook_endpoints to authenticated;
grant select on public.webhook_events to authenticated;

create policy "Users can read their webhook endpoint" on public.webhook_endpoints
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users can create their webhook endpoint" on public.webhook_endpoints
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Users can read their webhook events" on public.webhook_events
  for select to authenticated using ((select auth.uid()) = owner_id);

-- The unguessable URL token permits delivery only. It never permits reading events.
-- Derive both ownership fields here; never trust an owner supplied by the sender.
create function public.receive_webhook(
  p_token text,
  p_body text,
  p_content_type text,
  p_headers jsonb,
  p_query_params jsonb
) returns table (id uuid, received_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  endpoint public.webhook_endpoints%rowtype;
begin
  -- Serialize deliveries per endpoint so the rate limit also holds under concurrency.
  select * into endpoint from public.webhook_endpoints where token = p_token for update;
  if not found then
    raise exception 'Unknown webhook endpoint' using errcode = 'P0002';
  end if;

  if (select count(*) from public.webhook_events e
      where e.endpoint_id = endpoint.id and e.received_at > clock_timestamp() - interval '1 minute') >= 60 then
    raise exception 'Webhook rate limit exceeded' using errcode = 'P0001';
  end if;

  return query
    insert into public.webhook_events (endpoint_id, owner_id, content_type, headers, query_params, body, size_bytes)
    values (endpoint.id, endpoint.owner_id, p_content_type, p_headers, p_query_params, p_body, octet_length(p_body))
    returning webhook_events.id, webhook_events.received_at;
end;
$$;

revoke all on function public.receive_webhook(text, text, text, jsonb, jsonb) from public;
grant execute on function public.receive_webhook(text, text, text, jsonb, jsonb) to anon, authenticated;
