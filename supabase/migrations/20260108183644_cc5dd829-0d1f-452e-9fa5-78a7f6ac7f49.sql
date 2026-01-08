-- Ensure every authenticated user has a profiles row (required for messaging RLS)

create or replace function public.ensure_profile()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _auth_user_id uuid;
  _profile_id uuid;
  _username text;
begin
  _auth_user_id := auth.uid();
  if _auth_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select id
    into _profile_id
  from public.profiles
  where user_id = _auth_user_id
  limit 1;

  if _profile_id is not null then
    return _profile_id;
  end if;

  -- Deterministic + practically unique username derived from auth user id
  _username := 'user_' || substring(replace(_auth_user_id::text, '-', ''), 1, 12);

  insert into public.profiles (user_id, username, bio)
  values (_auth_user_id, _username, '')
  on conflict (user_id)
  do update set user_id = excluded.user_id
  returning id into _profile_id;

  return _profile_id;
end;
$$;

revoke all on function public.ensure_profile() from public;
grant execute on function public.ensure_profile() to authenticated;
