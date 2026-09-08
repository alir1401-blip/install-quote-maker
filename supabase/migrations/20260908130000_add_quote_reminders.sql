alter table public.quotes
  add column if not exists sent_at timestamptz,
  add column if not exists last_reminded_at timestamptz,
  add column if not exists reminder_snoozed_until timestamptz,
  add column if not exists reminder_count integer not null default 0 check (reminder_count >= 0),
  add column if not exists reminder_version integer not null default 0 check (reminder_version >= 0);

-- Historical quotes have no delivery timestamp: use their issue date as a fallback.
update public.quotes
set sent_at = issued_at::timestamp at time zone 'Europe/Paris'
where status in ('envoye', 'sent') and sent_at is null;

create function public.track_quote_reminder_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.status in ('envoye', 'sent') then
      NEW.sent_at := now();
    end if;
  elsif NEW.status is distinct from OLD.status then
    NEW.reminder_version := OLD.reminder_version + 1;
    if NEW.status in ('envoye', 'sent') and OLD.status not in ('envoye', 'sent') then
      NEW.sent_at := now();
      NEW.reminder_snoozed_until := null;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger track_quote_reminder_status
before insert or update of status on public.quotes
for each row execute function public.track_quote_reminder_status();

create index quotes_pending_reminder_idx on public.quotes(owner_id, id)
where status in ('envoye', 'sent');

-- Row-level security and explicit ownership both apply. The version prevents a
-- double click or stale tab from recording the same action twice.
create function public.handle_quote_reminder(
  p_quote_id uuid,
  p_action text,
  p_expected_version integer
) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if p_action is null or p_action not in ('done', 'snooze') then
    raise exception 'Action de rappel invalide' using errcode = '22023';
  end if;

  update public.quotes
  set last_reminded_at = case when p_action = 'done' then now() else last_reminded_at end,
      reminder_count = reminder_count + case when p_action = 'done' then 1 else 0 end,
      reminder_snoozed_until = case when p_action = 'snooze' then now() + interval '72 hours' else null end,
      reminder_version = reminder_version + 1
  where id = p_quote_id
    and owner_id = (select auth.uid())
    and status in ('envoye', 'sent')
    and reminder_version = p_expected_version;

  if not found then
    raise exception 'Ce devis a changé. Actualisez la liste avant de réessayer.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.track_quote_reminder_status() from public;
revoke all on function public.handle_quote_reminder(uuid, text, integer) from public;
grant execute on function public.handle_quote_reminder(uuid, text, integer) to authenticated;
