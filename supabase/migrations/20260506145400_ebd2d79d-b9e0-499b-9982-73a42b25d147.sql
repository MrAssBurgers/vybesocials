create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    'user_' || substr(new.id::text, 1, 8)
  );

  insert into public.profiles (user_id, username, email, bio)
  values (new.id, v_username, new.email, '')
  on conflict (user_id) do nothing;

  return new;
exception when others then
  -- Never block auth signup if profile creation hits a transient issue
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();