-- JG3D Cotizador - almacenamiento privado por usuario
-- Ejecutar una sola vez desde Supabase > SQL Editor.

create table if not exists public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  clients jsonb not null default '[]'::jsonb,
  quotes jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

drop policy if exists "Users can read their workspace" on public.workspaces;
create policy "Users can read their workspace"
on public.workspaces for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their workspace" on public.workspaces;
create policy "Users can create their workspace"
on public.workspaces for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their workspace" on public.workspaces;
create policy "Users can update their workspace"
on public.workspaces for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their workspace" on public.workspaces;
create policy "Users can delete their workspace"
on public.workspaces for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.workspaces from anon;
grant select, insert, update, delete on table public.workspaces to authenticated;
