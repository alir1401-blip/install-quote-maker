-- One owner-scoped snapshot of all saved quote data. Outgoing settings use app_settings.
create function public.get_quote_webhook_snapshot(p_quote_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  q public.quotes%rowtype;
  owner uuid := auth.uid();
begin
  if owner is null then raise exception 'Non authentifié.' using errcode = 'PT401'; end if;
  select * into q from public.quotes where id = p_quote_id and owner_id = owner;
  if not found then raise exception 'Devis introuvable.' using errcode = 'PT404'; end if;
  return jsonb_build_object(
    'quote', to_jsonb(q) - 'owner_id',
    'client', (select to_jsonb(c) - 'owner_id' from public.clients c where c.id = q.client_id and c.owner_id = owner),
    'site', (select to_jsonb(s) - 'owner_id' from public.sites s where s.id = q.site_id and s.owner_id = owner),
    'contract', (select to_jsonb(c) - 'owner_id' from public.contracts c where c.id = q.contract_id and c.owner_id = owner),
    'items', coalesce((select jsonb_agg((to_jsonb(i) - 'owner_id') || jsonb_build_object(
      'part', (select to_jsonb(p) - 'owner_id' from public.parts p where p.id = i.part_id and p.owner_id = owner),
      'supplier', (select to_jsonb(s) - 'owner_id' from public.suppliers s where s.id = (to_jsonb(i)->>'supplier_id')::uuid and s.owner_id = owner)
    ) order by i.position, i.id) from public.quote_items i where i.quote_id = q.id and i.owner_id = owner), '[]'::jsonb),
    'installations', coalesce((
      with linked as (
        select qi.installation_id as id, qi.position from public.quote_installations qi where qi.quote_id = q.id and qi.owner_id = owner
        union all select q.installation_id, 2147483646 where q.installation_id is not null
        union all select i.installation_id, 2147483647 from public.quote_items i where i.quote_id = q.id and i.owner_id = owner and i.installation_id is not null
      ), ids as (select id, min(position) as position from linked group by id)
      select jsonb_agg((to_jsonb(i) - 'owner_id') || jsonb_build_object(
        'position', ids.position,
        'brand', (select to_jsonb(b) - 'owner_id' from public.brands b where b.id = i.brand_id and b.owner_id = owner),
        'type', (select to_jsonb(t) - 'owner_id' from public.installation_types t where t.id = i.type_id and t.owner_id = owner),
        'model', (select to_jsonb(m) - 'owner_id' from public.models m where m.id = i.model_id and m.owner_id = owner),
        'contract', (select to_jsonb(c) - 'owner_id' from public.contracts c where c.id = i.contract_id and c.owner_id = owner)
      ) order by ids.position, i.id) from ids join public.installations i on i.id = ids.id where i.owner_id = owner
    ), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(to_jsonb(t) - 'owner_id' order by t.id) from public.tickets t
      where t.owner_id = owner and (t.id = q.ticket_id or t.id in (
        select qt.ticket_id from public.quote_tickets qt where qt.quote_id = q.id and qt.owner_id = owner
      ))), '[]'::jsonb),
    'report', (select to_jsonb(r) - 'owner_id' from public.intervention_reports r where r.id = q.report_id and r.owner_id = owner),
    'ticket_group', (select to_jsonb(g) - 'owner_id' from public.ticket_groups g where g.id = q.ticket_group_id and g.owner_id = owner),
    'document', coalesce((select s.value from public.app_settings s where s.owner_id = owner and s.key = 'quote_document'), '{}'::jsonb)
  );
end;
$$;
revoke all on function public.get_quote_webhook_snapshot(uuid) from public, anon;
grant execute on function public.get_quote_webhook_snapshot(uuid) to authenticated;
