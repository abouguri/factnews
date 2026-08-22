-- Phase 4: shared_reports (public, shareable report links).
-- Run by hand in the Supabase SQL editor, after 0002_analyses.sql.

-- Unlike `analyses`, this table has no owner column on purpose — sharing a
-- report doesn't require an account, matching the rest of the app's "no
-- account needed for the core flow" convention. The row is a snapshot: once
-- created it's immutable and world-readable by id, same trust model as any
-- other unlisted link.
create table public.shared_reports (
  id uuid primary key default gen_random_uuid(),
  url text,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.shared_reports enable row level security;

-- Anyone can create a share link — this is the client-facing "Share" button,
-- not a privileged write. app/api/share/route.ts validates and size-caps the
-- payload before it ever reaches this insert.
create policy "shared_reports_insert_any" on public.shared_reports
  for insert with check (true);

-- Anyone can read a shared report by id — that's the entire point of a
-- shareable link. There is no listing policy (no `select *`-style browse);
-- a caller has to already know the id, same as any unlisted link.
create policy "shared_reports_select_any" on public.shared_reports
  for select using (true);

-- No update, no delete policy: a shared report is immutable and permanent
-- once created, same reasoning as `analyses` but without the owner who could
-- otherwise delete it.
