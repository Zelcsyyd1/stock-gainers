create table if not exists public.auth_events (
  id bigserial primary key,
  action text not null,
  email_hash text,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);

create index if not exists auth_events_action_email_created_idx
  on public.auth_events (action, email_hash, created_at desc);

create index if not exists auth_events_action_ip_created_idx
  on public.auth_events (action, ip_hash, created_at desc);

create table if not exists public.email_codes (
  email_hash text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists email_codes_expires_idx
  on public.email_codes (expires_at);
