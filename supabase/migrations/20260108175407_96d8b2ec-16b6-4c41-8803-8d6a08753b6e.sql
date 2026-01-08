-- Allow conversation creation flows to add other members while keeping RLS safe

-- 1) Helper: map auth user -> public profile id
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1
$$;

-- 2) Policy: conversation creator can insert membership rows for other users
-- (Multiple policies OR together, so we add this without removing existing policies.)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'conversation_members'
      and policyname = 'Creators can add members'
  ) then
    create policy "Creators can add members"
    on public.conversation_members
    for insert
    to authenticated
    with check (
      user_id = public.current_profile_id()
      or exists (
        select 1
        from public.conversations c
        where c.id = conversation_id
          and c.created_by = public.current_profile_id()
      )
    );
  end if;
end $$;
