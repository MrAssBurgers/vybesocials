-- Fix infinite recursion in conversation_members SELECT policy by using a security definer helper

create or replace function public.is_member_of_conversation(_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = _conversation_id
      and cm.user_id = public.current_profile_id()
  )
$$;

drop policy if exists "Users can view members of their conversations" on public.conversation_members;

create policy "Users can view members of their conversations"
on public.conversation_members
for select
to authenticated
using (public.is_member_of_conversation(conversation_id));
