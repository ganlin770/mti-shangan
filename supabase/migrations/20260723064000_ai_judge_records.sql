-- AI 判分解析：逐题永久保存，较旧设备的离线数据不能覆盖较新的云端版本。
create table if not exists public.ai_judge_records (
  id text primary key,
  owner text not null default 'ganlin770',
  question_key text not null,
  source_signature text not null,
  record jsonb not null,
  recorded_at timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.ai_judge_records is
  'Latest saved MTI AI grading analysis per question.';

alter table public.ai_judge_records enable row level security;

drop policy if exists personal_ai_judge_rw on public.ai_judge_records;
create policy personal_ai_judge_rw
  on public.ai_judge_records
  for all
  to anon
  using (owner = 'ganlin770')
  with check (owner = 'ganlin770');

revoke all on table public.ai_judge_records from anon;
grant select, insert, update on table public.ai_judge_records to anon;

create or replace function public.ai_judge_keep_newest()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.recorded_at > new.recorded_at then
    return old;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_judge_keep_newest_trigger
  on public.ai_judge_records;
create trigger ai_judge_keep_newest_trigger
before update on public.ai_judge_records
for each row execute function public.ai_judge_keep_newest();

create index if not exists ai_judge_records_recorded_at_idx
  on public.ai_judge_records (recorded_at desc);
