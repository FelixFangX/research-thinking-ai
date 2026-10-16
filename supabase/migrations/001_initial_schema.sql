-- Research Topic Agent - Initial Schema
-- Supabase PostgreSQL with Row Level Security

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. public.profiles (extends auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles: users can view own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Profiles: users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Profiles: insert own profile on signup"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. public.sessions (core topic-selection sessions)
-- ============================================================
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  share_token text unique,
  share_enabled boolean not null default false,
  input_data jsonb not null,
  result_data jsonb,
  locale text not null default 'zh',
  complexity_score int,
  architecture_mode text,
  selected_path_id text,
  confidence int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "Sessions: users see own sessions"
  on public.sessions for select using (auth.uid() = user_id);

create policy "Sessions: users insert own sessions"
  on public.sessions for insert with check (auth.uid() = user_id);

create policy "Sessions: users update own sessions"
  on public.sessions for update using (auth.uid() = user_id);

create policy "Sessions: users delete own sessions"
  on public.sessions for delete using (auth.uid() = user_id);

create policy "Sessions: public can view shared sessions"
  on public.sessions for select using (share_enabled = true and share_token is not null);

-- Auto-update updated_at
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists sessions_updated_at on public.sessions;
create trigger sessions_updated_at
  before update on public.sessions
  for each row execute procedure public.update_updated_at();

-- ============================================================
-- 3. public.evidence_items (evidence items)
-- ============================================================
create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  external_id text,
  title text not null,
  source text not null,
  url text,
  year int,
  tier text not null check (tier in ('T1', 'T2', 'T3')),
  claim text not null,
  relevance int check (relevance >= 0 and relevance <= 100),
  credibility int check (credibility >= 0 and credibility <= 100),
  conflicts_with text[],
  raw_data jsonb,
  created_at timestamptz not null default now(),
  foreign key (session_id) references public.sessions(id) on delete cascade
);

alter table public.evidence_items enable row level security;

create policy "Evidence: users see from own sessions"
  on public.evidence_items for select
  using (exists (
    select 1 from public.sessions s
    where s.id = evidence_items.session_id and s.user_id = auth.uid()
  ));

create policy "Evidence: insert for own sessions"
  on public.evidence_items for insert
  with check (exists (
    select 1 from public.sessions s
    where s.id = session_id and s.user_id = auth.uid()
  ));

create policy "Evidence: delete from own sessions"
  on public.evidence_items for delete
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and s.user_id = auth.uid()
  ));

-- ============================================================
-- 4. public.candidates (candidate paths)
-- ============================================================
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  external_id text not null,
  name text not null,
  hypothesis text,
  method text,
  novelty int check (novelty >= 0 and novelty <= 100),
  feasibility int check (feasibility >= 0 and feasibility <= 100),
  impact int check (impact >= 0 and impact <= 100),
  risk int check (risk >= 0 and risk <= 100),
  evidence_coverage int check (evidence_coverage >= 0 and evidence_coverage <= 100),
  score int check (score >= 0 and score <= 100),
  confidence int check (confidence >= 0 and confidence <= 100),
  first_experiment text,
  stop_condition text,
  evidence_ids text[],
  created_at timestamptz not null default now(),
  foreign key (session_id) references public.sessions(id) on delete cascade
);

alter table public.candidates enable row level security;

create policy "Candidates: users see from own sessions"
  on public.candidates for select
  using (exists (
    select 1 from public.sessions s
    where s.id = candidates.session_id and s.user_id = auth.uid()
  ));

create policy "Candidates: insert for own sessions"
  on public.candidates for insert
  with check (exists (
    select 1 from public.sessions s
    where s.id = session_id and s.user_id = auth.uid()
  ));

-- ============================================================
-- 5. public.iterations (topic iteration tracking)
-- ============================================================
create table public.iterations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid not null,
  path_id text not null,
  path_name text,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  days jsonb not null default '[]',
  journal jsonb not null default '[]',
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id) references auth.users(id) on delete cascade,
  foreign key (session_id) references public.sessions(id) on delete cascade
);

alter table public.iterations enable row level security;

create policy "Iterations: users manage own iterations"
  on public.iterations for all using (auth.uid() = user_id);

drop trigger if exists iterations_updated_at on public.iterations;
create trigger iterations_updated_at
  before update on public.iterations
  for each row execute procedure public.update_updated_at();

-- ============================================================
-- 6. public.usage (usage stats for Free/Pro limits)
-- ============================================================
create table public.usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now(),
  foreign key (user_id) references auth.users(id) on delete cascade
);

alter table public.usage enable row level security;

create policy "Usage: users see own usage"
  on public.usage for select using (auth.uid() = user_id);

create policy "Usage: system records usage"
  on public.usage for insert with check (auth.uid() = user_id);

-- ============================================================
-- 7. public.share_tokens (temporary access tokens for account-free sharing)
-- ============================================================
create table public.share_tokens (
  token text primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

alter table public.share_tokens enable row level security;

create policy "Share tokens: anyone can view (for public sharing)"
  on public.share_tokens for select using (true);

-- ============================================================
-- Indexes
-- ============================================================
create index sessions_user_id_idx on public.sessions(user_id);
create index sessions_share_token_idx on public.sessions(share_token) where share_token is not null;
create index sessions_created_at_idx on public.sessions(created_at desc);
create index evidence_items_session_id_idx on public.evidence_items(session_id);
create index candidates_session_id_idx on public.candidates(session_id);
create index iterations_user_id_idx on public.iterations(user_id);
create index iterations_session_id_idx on public.iterations(session_id);
create index usage_user_action_idx on public.usage(user_id, action);
create index usage_created_at_idx on public.usage(created_at desc);
