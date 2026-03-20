-- Table des profils utilisateur (liée à auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS : chaque utilisateur ne voit et ne modifie que son propre profil
alter table public.profiles enable row level security;

create policy "Utilisateur peut lire son propre profil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Utilisateur peut modifier son propre profil"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Utilisateur peut insérer son propre profil"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Création automatique d'un profil à chaque nouvel utilisateur (auth.users)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.raw_user_meta_data->>'email',
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.raw_user_meta_data->>'email', '@', 1))
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mise à jour de updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
