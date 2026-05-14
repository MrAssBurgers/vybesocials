
CREATE TABLE IF NOT EXISTS public._demo_seed_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles DISABLE TRIGGER trg_auto_founding_badge;
ALTER TABLE public.profiles DISABLE TRIGGER link_profile_to_auth_trigger;
ALTER TABLE public.posts DISABLE TRIGGER trigger_post_challenge;
ALTER TABLE public.posts DISABLE TRIGGER trigger_xp_on_post;
ALTER TABLE public.posts DISABLE TRIGGER trg_vybe_on_post;
ALTER TABLE public.messages DISABLE TRIGGER trigger_message_challenge;
ALTER TABLE public.messages DISABLE TRIGGER trigger_snap_challenge;
ALTER TABLE public.messages DISABLE TRIGGER trigger_update_streak_on_message;
ALTER TABLE public.messages DISABLE TRIGGER trg_vybe_on_message;
ALTER TABLE public.messages DISABLE TRIGGER on_message_insert_notify;
ALTER TABLE public.messages DISABLE TRIGGER trg_set_dm_default_expiry;
ALTER TABLE public.follows DISABLE TRIGGER trg_notify_on_follow;
ALTER TABLE public.follows DISABLE TRIGGER trg_vybe_on_follow;
ALTER TABLE public.follows DISABLE TRIGGER trigger_follow_challenge;
ALTER TABLE public.server_members DISABLE TRIGGER update_server_member_count;
ALTER TABLE public.conversation_members DISABLE TRIGGER trigger_conversation_challenge;

DO $seed$
DECLARE
  p_you uuid := gen_random_uuid();
  p_maya uuid := gen_random_uuid();
  p_jules uuid := gen_random_uuid();
  p_noah uuid := gen_random_uuid();
  p_riv uuid := gen_random_uuid();
  p_tina uuid := gen_random_uuid();
  p_dex uuid := gen_random_uuid();
  c_id uuid := gen_random_uuid();
  s_id uuid := gen_random_uuid();
  new_id uuid;
  friends uuid[];
  f uuid;
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url, bio, onboarding_completed, age_verified, intro_completed, tutorial_completed) VALUES
    (p_you,'demo_you','you','https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400','just vibin ✨',true,true,true,true),
    (p_maya,'mayaaa','maya','https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400','sunsets + iced lattes',true,true,true,true),
    (p_jules,'jules.k','jules','https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400','plants & playlists',true,true,true,true),
    (p_noah,'noah_p','noah','https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400','denver / film / fits',true,true,true,true),
    (p_riv,'riv','riv','https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400','hot girl walks only',true,true,true,true),
    (p_tina,'tinab','tina','https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400','baking until i die',true,true,true,true),
    (p_dex,'dex2x','dex','https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400','skate, repeat',true,true,true,true)
  ON CONFLICT (username) DO NOTHING;

  INSERT INTO public._demo_seed_log(table_name, row_id) VALUES
    ('profiles',p_you),('profiles',p_maya),('profiles',p_jules),('profiles',p_noah),
    ('profiles',p_riv),('profiles',p_tina),('profiles',p_dex);

  friends := ARRAY[p_maya,p_jules,p_noah,p_riv,p_tina,p_dex];

  FOREACH f IN ARRAY friends LOOP
    INSERT INTO public.follows(follower_id, following_id) VALUES (p_you, f) RETURNING id INTO new_id;
    INSERT INTO public._demo_seed_log(table_name,row_id) VALUES('follows',new_id);
    INSERT INTO public.follows(follower_id, following_id) VALUES (f, p_you) RETURNING id INTO new_id;
    INSERT INTO public._demo_seed_log(table_name,row_id) VALUES('follows',new_id);
  END LOOP;
  INSERT INTO public.follows(follower_id, following_id) VALUES
    (p_maya,p_jules),(p_jules,p_maya),(p_noah,p_riv),(p_riv,p_noah),(p_tina,p_dex),(p_dex,p_tina),
    (p_maya,p_noah),(p_jules,p_tina),(p_riv,p_maya);

  INSERT INTO public.posts(id,author_id,type,caption,media_url,media_urls,view_count,trending_score,created_at,age_rating) VALUES
    (gen_random_uuid(),p_maya,'post','golden hour hits different','https://images.unsplash.com/photo-1495567720989-cebdbdd97913?w=1080',NULL,1240,82.4, now() - interval '2 hours','safe'),
    (gen_random_uuid(),p_jules,'post','new plant family member 🌿','https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=1080',NULL,860,71.2, now() - interval '5 hours','safe'),
    (gen_random_uuid(),p_noah,'post','35mm forever','https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1080',NULL,2103,91.7, now() - interval '8 hours','safe'),
    (gen_random_uuid(),p_riv,'post','walk + podcast = therapy','https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1080',NULL,540,55.9, now() - interval '14 hours','safe'),
    (gen_random_uuid(),p_tina,'post','sourdough win 🍞','https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1080',NULL,1820,84.1, now() - interval '1 day','safe'),
    (gen_random_uuid(),p_dex,'post','board snapped. worth it.',NULL,NULL,310,40.0,now() - interval '1 day 4 hours','safe'),
    (gen_random_uuid(),p_maya,'post','coffee + book + rain. literally heaven',NULL,NULL,480,52.3,now() - interval '2 days','safe'),
    (gen_random_uuid(),p_jules,'post','spring carousel 🌸',NULL,
      ARRAY['https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=1080','https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=1080','https://images.unsplash.com/photo-1501004318641-b39e6451bec6?w=1080'],
      990,76.8,now() - interval '2 days 6 hours','safe');

  INSERT INTO public._demo_seed_log(table_name,row_id) SELECT 'posts', id FROM public.posts WHERE author_id = ANY(ARRAY[p_you] || friends) AND created_at > now() - interval '3 days';

  INSERT INTO public.posts(id,author_id,type,caption,media_url,thumbnail_url,view_count,trending_score,created_at,age_rating) VALUES
    (gen_random_uuid(),p_dex,'video','first try fr 🛹','https://videos.pexels.com/video-files/4434286/4434286-uhd_1440_2732_25fps.mp4','https://images.unsplash.com/photo-1531565637446-32307b194362?w=720',5420,94.0,now() - interval '6 hours','safe'),
    (gen_random_uuid(),p_tina,'video','pour shot ☕','https://videos.pexels.com/video-files/3843433/3843433-hd_1080_1920_30fps.mp4','https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=720',3210,88.5,now() - interval '12 hours','safe'),
    (gen_random_uuid(),p_riv,'video','my dog knows shes the moment','https://videos.pexels.com/video-files/4434150/4434150-uhd_1440_2732_25fps.mp4','https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=720',8910,96.2,now() - interval '20 hours','safe');

  INSERT INTO public._demo_seed_log(table_name,row_id) SELECT 'posts', id FROM public.posts WHERE author_id = ANY(ARRAY[p_you] || friends) AND type='video' AND created_at > now() - interval '3 days';

  INSERT INTO public.servers(id,name,description,owner_id,icon_url,cover_url,is_public,member_count,active_now_count) VALUES
    (s_id,'late night coders','for the 2am builders',p_you,'https://images.unsplash.com/photo-1518770660439-4636190af475?w=300','https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1080',true,84,12);
  INSERT INTO public._demo_seed_log(table_name,row_id) VALUES('servers',s_id);

  FOREACH f IN ARRAY ARRAY[p_you,p_maya,p_jules,p_noah,p_dex] LOOP
    INSERT INTO public.server_members(server_id,user_id,role) VALUES (s_id, f, CASE WHEN f=p_you THEN 'owner' ELSE 'member' END) RETURNING id INTO new_id;
    INSERT INTO public._demo_seed_log(table_name,row_id) VALUES('server_members',new_id);
  END LOOP;

  INSERT INTO public.conversations(id,is_group,created_by) VALUES (c_id, false, p_you);
  INSERT INTO public._demo_seed_log(table_name,row_id) VALUES('conversations',c_id);

  INSERT INTO public.conversation_members(conversation_id,user_id,role) VALUES (c_id,p_you,'member') RETURNING id INTO new_id;
  INSERT INTO public._demo_seed_log(table_name,row_id) VALUES('conversation_members',new_id);
  INSERT INTO public.conversation_members(conversation_id,user_id,role) VALUES (c_id,p_maya,'member') RETURNING id INTO new_id;
  INSERT INTO public._demo_seed_log(table_name,row_id) VALUES('conversation_members',new_id);

  INSERT INTO public.messages(id,conversation_id,sender_id,content,created_at,view_mode,message_type) VALUES
    (gen_random_uuid(),c_id,p_maya,'omg are you up',now() - interval '40 minutes','permanent','text'),
    (gen_random_uuid(),c_id,p_you,'unfortunately yes lol',now() - interval '38 minutes','permanent','text'),
    (gen_random_uuid(),c_id,p_maya,'wanna get coffee tmrw',now() - interval '37 minutes','permanent','text'),
    (gen_random_uuid(),c_id,p_you,'yes pls. corvus?',now() - interval '36 minutes','permanent','text'),
    (gen_random_uuid(),c_id,p_maya,'10am 🤝',now() - interval '35 minutes','permanent','text'),
    (gen_random_uuid(),c_id,p_you,'bet',now() - interval '34 minutes','permanent','text'),
    (gen_random_uuid(),c_id,p_maya,'also did u see noahs film roll',now() - interval '20 minutes','permanent','text'),
    (gen_random_uuid(),c_id,p_you,'YES the second one is insane',now() - interval '19 minutes','permanent','text'),
    (gen_random_uuid(),c_id,p_maya,'right?? he never misses',now() - interval '18 minutes','permanent','text'),
    (gen_random_uuid(),c_id,p_you,'ok sleep. nite 🌙',now() - interval '5 minutes','permanent','text');

  INSERT INTO public._demo_seed_log(table_name,row_id) SELECT 'messages', id FROM public.messages WHERE conversation_id = c_id;

  INSERT INTO public.user_locations(user_id,latitude,longitude,sharing_enabled,label,status,updated_at) VALUES
    (p_you, 39.7392, -104.9903, true, 'lodo', 'online', now()),
    (p_maya, 39.7405, -104.9847, true, 'corvus coffee', 'online', now()),
    (p_jules, 39.7508, -105.0001, true, 'highlands', 'online', now() - interval '6 minutes'),
    (p_noah, 39.7325, -104.9650, true, 'cap hill', 'idle', now() - interval '15 minutes'),
    (p_riv, 39.7280, -105.0150, true, 'wash park loop', 'online', now() - interval '2 minutes'),
    (p_tina, 39.7600, -104.9750, true, 'rino', 'idle', now() - interval '22 minutes');

  INSERT INTO public._demo_seed_log(table_name,row_id) SELECT 'user_locations', id FROM public.user_locations WHERE user_id = ANY(ARRAY[p_you] || friends);
END $seed$;

ALTER TABLE public.profiles ENABLE TRIGGER trg_auto_founding_badge;
ALTER TABLE public.profiles ENABLE TRIGGER link_profile_to_auth_trigger;
ALTER TABLE public.posts ENABLE TRIGGER trigger_post_challenge;
ALTER TABLE public.posts ENABLE TRIGGER trigger_xp_on_post;
ALTER TABLE public.posts ENABLE TRIGGER trg_vybe_on_post;
ALTER TABLE public.messages ENABLE TRIGGER trigger_message_challenge;
ALTER TABLE public.messages ENABLE TRIGGER trigger_snap_challenge;
ALTER TABLE public.messages ENABLE TRIGGER trigger_update_streak_on_message;
ALTER TABLE public.messages ENABLE TRIGGER trg_vybe_on_message;
ALTER TABLE public.messages ENABLE TRIGGER on_message_insert_notify;
ALTER TABLE public.messages ENABLE TRIGGER trg_set_dm_default_expiry;
ALTER TABLE public.follows ENABLE TRIGGER trg_notify_on_follow;
ALTER TABLE public.follows ENABLE TRIGGER trg_vybe_on_follow;
ALTER TABLE public.follows ENABLE TRIGGER trigger_follow_challenge;
ALTER TABLE public.server_members ENABLE TRIGGER update_server_member_count;
ALTER TABLE public.conversation_members ENABLE TRIGGER trigger_conversation_challenge;
