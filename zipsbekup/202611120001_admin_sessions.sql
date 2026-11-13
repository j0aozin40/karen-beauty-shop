begin;

create table public.admin_sessions (
  sid text primary key check (length(sid) between 1 and 256),
  session_data jsonb not null,
  expires_at timestamptz not null
);

create index admin_sessions_expires_at_idx
  on public.admin_sessions (expires_at);

alter table public.admin_sessions enable row level security;
revoke all on public.admin_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.admin_sessions to service_role;

commit;
