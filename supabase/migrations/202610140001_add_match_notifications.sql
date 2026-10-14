create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.match_reminders (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null,
  match_at timestamptz not null,
  notify_at timestamptz not null,
  title text not null,
  body text not null,
  url text not null default '/?view=calendario',
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, match_id)
);

create index if not exists match_reminders_due_idx
  on public.match_reminders (notify_at)
  where sent_at is null;
create index if not exists push_subscriptions_user_enabled_idx
  on public.push_subscriptions (user_id, enabled);

create or replace function public.reset_match_reminder_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.match_at is distinct from old.match_at or new.notify_at is distinct from old.notify_at then
    new.sent_at := null;
    new.last_error := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_match_reminder_delivery on public.match_reminders;
create trigger reset_match_reminder_delivery
before update on public.match_reminders
for each row execute function public.reset_match_reminder_delivery();

alter table public.push_subscriptions enable row level security;
alter table public.match_reminders enable row level security;

create policy "Users manage their own push subscriptions"
  on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their own match reminders"
  on public.match_reminders for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.match_reminders to authenticated;

create or replace function public.get_push_vapid_config()
returns table(public_key text, private_key text)
language sql
security definer
set search_path = ''
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'refflow_vapid_public' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'refflow_vapid_private' limit 1);
$$;

revoke all on function public.get_push_vapid_config() from public, anon, authenticated;
grant execute on function public.get_push_vapid_config() to service_role;

create or replace function public.claim_due_match_reminders(batch_size integer default 100)
returns setof public.match_reminders
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select reminder.user_id, reminder.match_id
    from public.match_reminders reminder
    where reminder.sent_at is null
      and reminder.notify_at <= now()
      and reminder.match_at > now()
    order by reminder.notify_at
    for update skip locked
    limit greatest(1, least(batch_size, 500))
  )
  update public.match_reminders reminder
  set sent_at = now(), last_error = null, updated_at = now()
  from due
  where reminder.user_id = due.user_id and reminder.match_id = due.match_id
  returning reminder.*;
end;
$$;

revoke all on function public.claim_due_match_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_match_reminders(integer) to service_role;
