-- Exécuter dans Supabase → SQL Editor si "Ma cave" reste vide alors que les lignes existent :
-- cause typique : policy INSERT OK mais pas de policy SELECT sur public.degustations.

alter table public.degustations enable row level security;

drop policy if exists "degustations_select_own" on public.degustations;
create policy "degustations_select_own"
on public.degustations
for select
to authenticated
using (auth.uid() = user_id);
