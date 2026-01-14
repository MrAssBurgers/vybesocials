-- Create a helper to map the authenticated user to their profile id (bypasses RLS safely)
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.profiles
  where user_id = auth.uid()
  limit 1
$$;

-- Fix UPDATE RLS on messages so "unsend" (soft delete) works reliably
-- Recreate policies using current_profile_id() to avoid subquery/RLS edge cases.

drop policy if exists "Senders can update their own messages" on public.messages;
drop policy if exists "Members can delete messages for themselves" on public.messages;

create policy "Senders can update their own messages"
on public.messages
for update
to authenticated
using (sender_id = public.current_profile_id())
with check (sender_id = public.current_profile_id());

create policy "Members can delete messages for themselves"
on public.messages
for update
to authenticated
using (
  conversation_id in (
    select conversation_id
    from public.conversation_members
    where user_id = public.current_profile_id()
  )
)
with check (
  conversation_id in (
    select conversation_id
    from public.conversation_members
    where user_id = public.current_profile_id()
  )
);
