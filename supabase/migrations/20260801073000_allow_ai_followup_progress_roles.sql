-- AI 讲解与追问由静态站直接写入 progress。
-- 旧策略只对 anon 生效；若浏览器遗留 Supabase Auth 会话，
-- 同一公开客户端会以 authenticated 身份写入并被 RLS 拒绝。
alter table public.progress enable row level security;

drop policy if exists personal_rw on public.progress;
create policy personal_rw
  on public.progress
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update on table public.progress to anon, authenticated;
