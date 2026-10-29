-- Bouclier : suivi des injections Xolair (projet Supabase partagé avec les académies)
-- Migration 1 : bouclier_xolair
create table public.xolair_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 40),
  interval_days smallint not null default 28 check (interval_days between 7 and 90),
  dose_mg smallint not null default 300 check (dose_mg between 75 and 600),
  updated_at timestamptz not null default now()
);

create table public.xolair_injections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  done_at timestamptz not null,
  status text not null default 'faite' check (status in ('faite','manquee')),
  dose_mg smallint check (dose_mg between 0 and 600),
  site text check (site in ('ventre-g','ventre-d','cuisse-g','cuisse-d','bras-g','bras-d')),
  given_by text check (given_by in ('elle','partenaire','medecin','infirmier','autre')),
  pain smallint check (pain between 0 and 4),
  feeling smallint check (feeling between 0 and 4),
  notes text check (char_length(notes) <= 1000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index xolair_injections_owner_idx on public.xolair_injections(owner_id, done_at desc);
create index xolair_injections_created_by_idx on public.xolair_injections(created_by);

create table public.xolair_shares (
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id),
  check (owner_id <> member_id)
);
create index xolair_shares_member_idx on public.xolair_shares(member_id);

create or replace function public.xolair_can_access(p_owner uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select (select auth.uid()) = p_owner
      or exists (select 1 from public.xolair_shares s where s.owner_id = p_owner and s.member_id = (select auth.uid()));
$$;
revoke all on function public.xolair_can_access(uuid) from public, anon;
grant execute on function public.xolair_can_access(uuid) to authenticated;

alter table public.xolair_settings enable row level security;
alter table public.xolair_injections enable row level security;
alter table public.xolair_shares enable row level security;

create policy "Bouclier lire réglages" on public.xolair_settings for select to authenticated using (public.xolair_can_access(owner_id));
create policy "Bouclier créer réglages" on public.xolair_settings for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Bouclier modifier réglages" on public.xolair_settings for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy "Bouclier lire injections" on public.xolair_injections for select to authenticated using (public.xolair_can_access(owner_id));
create policy "Bouclier ajouter injection" on public.xolair_injections for insert to authenticated with check (public.xolair_can_access(owner_id));
create policy "Bouclier modifier injection" on public.xolair_injections for update to authenticated using (public.xolair_can_access(owner_id)) with check (public.xolair_can_access(owner_id));
create policy "Bouclier supprimer injection" on public.xolair_injections for delete to authenticated using (public.xolair_can_access(owner_id));

create policy "Bouclier voir partages" on public.xolair_shares for select to authenticated using ((select auth.uid()) in (owner_id, member_id));
create policy "Bouclier retirer partage" on public.xolair_shares for delete to authenticated using ((select auth.uid()) in (owner_id, member_id));

-- Partager son suivi avec un nom d'utilisateur
create or replace function public.xolair_share_add(p_username text)
returns text language plpgsql security definer set search_path to '' as $$
declare v_me uuid := auth.uid(); v_target uuid; v_n int;
begin
  if v_me is null then raise exception 'non connecté'; end if;
  select id into v_target from public.profiles where lower(username) = lower(trim(p_username));
  if v_target is null then return 'introuvable'; end if;
  if v_target = v_me then return 'soi-meme'; end if;
  select count(*) into v_n from public.xolair_shares where owner_id = v_me;
  if v_n >= 5 then return 'limite'; end if;
  insert into public.xolair_shares(owner_id, member_id) values (v_me, v_target) on conflict do nothing;
  return 'ok';
end $$;
revoke all on function public.xolair_share_add(text) from public, anon;
grant execute on function public.xolair_share_add(text) to authenticated;

-- Liste des partages (dans les deux sens) avec les noms d'utilisateur
create or replace function public.xolair_share_list()
returns table(owner_id uuid, member_id uuid, owner_name text, member_name text, owner_display text)
language sql stable security definer set search_path to '' as $$
  select s.owner_id, s.member_id, po.username, pm.username, st.display_name
  from public.xolair_shares s
  left join public.profiles po on po.id = s.owner_id
  left join public.profiles pm on pm.id = s.member_id
  left join public.xolair_settings st on st.owner_id = s.owner_id
  where (select auth.uid()) in (s.owner_id, s.member_id);
$$;
revoke all on function public.xolair_share_list() from public, anon;
grant execute on function public.xolair_share_list() to authenticated;

grant select, insert, update, delete on public.xolair_injections to authenticated;
grant select, insert, update on public.xolair_settings to authenticated;
grant select, delete on public.xolair_shares to authenticated;

-- Migration 2 : bouclier_rappels_stock (rappels calendrier + stock de stylos)
alter table public.xolair_settings
  add column cal_token uuid not null default gen_random_uuid(),
  add column reminder_hour smallint not null default 19 check (reminder_hour between 0 and 23),
  add column pens_left smallint check (pens_left between 0 and 50);
create unique index xolair_settings_cal_token_idx on public.xolair_settings(cal_token);

create or replace function public.xolair_cal_reset()
returns uuid language plpgsql security definer set search_path to '' as $$
declare v uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  insert into public.xolair_settings(owner_id, cal_token) values (auth.uid(), v)
  on conflict (owner_id) do update set cal_token = excluded.cal_token, updated_at = now();
  return v;
end $$;
revoke all on function public.xolair_cal_reset() from public, anon;
grant execute on function public.xolair_cal_reset() to authenticated;

create or replace function public.xolair_pens_set(p_owner uuid, p_value int)
returns smallint language plpgsql security definer set search_path to '' as $$
declare v smallint := case when p_value is null then null else least(greatest(p_value, 0), 50) end;
begin
  if not public.xolair_can_access(p_owner) then raise exception 'accès refusé'; end if;
  if p_owner = auth.uid() then
    insert into public.xolair_settings(owner_id, pens_left) values (p_owner, v)
    on conflict (owner_id) do update set pens_left = v, updated_at = now();
  else
    update public.xolair_settings set pens_left = v, updated_at = now() where owner_id = p_owner;
  end if;
  return v;
end $$;
revoke all on function public.xolair_pens_set(uuid, int) from public, anon;
grant execute on function public.xolair_pens_set(uuid, int) to authenticated;

-- Lu uniquement par la fonction Edge bouclier-calendar (clé service_role)
create or replace function public.xolair_calendar_feed(p_token uuid)
returns table(last_day date, interval_days smallint, reminder_hour smallint, n_done int)
language sql stable security definer set search_path to '' as $$
  select (select max(i.done_at at time zone 'Europe/Paris')::date from public.xolair_injections i where i.owner_id = s.owner_id and i.status = 'faite'),
         s.interval_days, s.reminder_hour,
         (select count(*)::int from public.xolair_injections i where i.owner_id = s.owner_id)
  from public.xolair_settings s where s.cal_token = p_token;
$$;
revoke all on function public.xolair_calendar_feed(uuid) from public, anon, authenticated;
grant execute on function public.xolair_calendar_feed(uuid) to service_role;
