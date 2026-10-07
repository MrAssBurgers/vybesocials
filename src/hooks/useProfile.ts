import { db } from '@/lib/firebase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { setCachedProfile } from '@/lib/profileCache';
import { getDocumentFromServer, getDocumentsFromServer, where, firestoreLimit } from '@/lib/firebase/firestoreDb';
import { useVisiblePostCount } from './useVisiblePostCount';
import { useProfileReadView } from './useProfileReadView';
import { withProfileReadDeadline } from '@/lib/profileReadDeadline';
import { chooseProfileIdentity, profileUsernameCandidates } from '@/lib/profileUsername';

interface Profile {
  id: string; user_id: string; username: string; display_name?: string | null;
  avatar_url: string | null; bio: string; created_at: string;
  follower_count: number; follower_count_label?: string; following_count: number; following_count_label?: string;
  post_count: number; post_count_label?: string; post_count_exact?: boolean;
  is_following: boolean; is_private?: boolean | null; is_verified?: boolean | null;
}
const selectedFields = 'id user_id username avatar_url bio created_at display_name link_url location is_private is_verified interests language timezone coins_balance onboarding_completed tutorial_completed tutorial_skipped intro_completed badge_settings feature_on_landing'.split(' ');
const validId=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=128&&!value.includes('/');
function checkedProfile(row:Record<string,unknown>):Profile {
  const id = validId(row.id) ? row.id : '';
  const userId = validId(row.user_id) ? row.user_id : id;
  if(!id||!userId||typeof row.username!=='string'||!row.username.trim())throw new Error('This profile needs an identity review.');
  const picked = Object.fromEntries(selectedFields.filter(field=>Object.prototype.hasOwnProperty.call(row,field)).map(field=>[field,row[field]]));
  return {...picked, id, user_id: userId, follower_count:0,following_count:0,post_count:0,is_following:false} as unknown as Profile;
}

function useProfileRead(kind:'id'|'username',target:string|undefined,preferredId?:string) {
  const raw=(target||'').trim();
  const name=kind==='username'?raw.replace(/^@+/,''):raw,normalized=kind==='username'?name.toLowerCase():name;
  const preferred=(preferredId||'').trim();
  const view=useProfileReadView(!!name);
  const root=kind==='id'?'profile-by-id':'profile';
  const query=useQuery({
    queryKey:[root,normalized,preferred,...view.key],enabled:view.active,
    placeholderData:undefined,staleTime:0,gcTime:0,retry:false,refetchOnMount:'always',refetchOnWindowFocus:true,networkMode:'always',
    queryFn:({signal}):Promise<Profile|null>=>withProfileReadDeadline(async guard=>{
      guard();
      if(!name||name.includes('/'))throw new Error('This profile address is invalid.');
      // The AuthProvider has already checked this exact current owner's profile.
      // Do not read it again or wait for auxiliary statistics before painting it.
      let row:Record<string,unknown>|null=null;
      const ownName = typeof view.profile?.username === 'string' ? view.profile.username.toLowerCase() : '';
      if(view.profile && (kind==='id'?[view.profile.id,view.profile.user_id].includes(name):ownName===normalized))row=view.profile as unknown as Record<string,unknown>;
      if(!row&&kind==='username')for(const candidate of profileUsernameCandidates(name)){
        guard();const rows=await getDocumentsFromServer<Record<string,unknown>>('profiles',[where('username','==',candidate),firestoreLimit(8)]);guard();
        const chosen=chooseProfileIdentity(rows,preferred);if(chosen){row=chosen;break;}
      }
      if(!row&&preferred&&!preferred.includes('/')&&preferred.length<=128){
        guard();const linked=await getDocumentFromServer<Record<string,unknown>>('profiles',preferred);guard();
        const linkedName=typeof linked?.username==='string'?linked.username:'';
        const linkedHandles=profileUsernameCandidates(linkedName);
        if(linked&&profileUsernameCandidates(name).some(candidate=>linkedHandles.includes(candidate)))row=linked;
      }
      if(!row){guard();row=await getDocumentFromServer<Record<string,unknown>>('profiles',name);guard();}
      if(!row){guard();const rows=await getDocumentsFromServer<Record<string,unknown>>('profiles',[where('user_id','==',name),firestoreLimit(2)]);guard();if(rows.length>1)throw new Error('This account needs an identity review.');row=rows[0]??null;}
      if(!row)return null;
      const profile=checkedProfile(row);guard();
      setCachedProfile({id:profile.id,username:profile.username,display_name:profile.display_name||null,avatar_url:profile.avatar_url});
      return profile;
    },()=>view.guard(signal),signal),
  });
  const current=view.active && query.isFetchedAfterMount && !query.isPlaceholderData && !query.isError ? query.data:undefined;
  // Statistics are independently scoped and cannot overwrite the identity query
  // or another viewer's follow state, even after an account A -> B -> A switch.
  const stats=useQuery({
    queryKey:[root,normalized,'stats',...view.key,current?.id,query.dataUpdatedAt],enabled:view.active&&!!current,
    placeholderData:undefined,staleTime:0,gcTime:0,retry:false,refetchOnMount:'always',refetchOnWindowFocus:true,
    refetchInterval:view.active&&!!current?30_000:false,
    queryFn:({signal})=>withProfileReadDeadline(async guard=>{
      guard();if(!current)throw new Error('Profile is not loaded.');
      const [followers,following,isFollowing]=await Promise.all([
        db.from('follows').select('id',{count:'exact',head:true}).eq('following_id',current.id),
        db.from('follows').select('id',{count:'exact',head:true}).eq('follower_id',current.id),
        view.profile?db.from('follows').select('id').eq('follower_id',view.profile.id).eq('following_id',current.id).maybeSingle():Promise.resolve({data:null,error:null}),
      ]);guard();
      if(followers.error||following.error||isFollowing.error)throw new Error('Profile counts could not be loaded.');
      if(!Number.isSafeInteger(followers.count)||followers.count!<0||!Number.isSafeInteger(following.count)||following.count!<0)throw new Error('Profile counts could not be confirmed.');
      return {follower_count:followers.count!,following_count:following.count!,is_following:!!isFollowing.data};
    },()=>view.guard(signal),signal),
  });
  const summary=useVisiblePostCount(current?.id);
  const counts=view.active&&stats.isFetchedAfterMount&&!stats.isError?stats.data:undefined;
  return {...query,data:current?{...current,...counts,follower_count_label:counts?String(counts.follower_count):'—',following_count_label:counts?String(counts.following_count):'—',post_count:summary.count??0,post_count_label:summary.label,post_count_exact:summary.exact}:current,
    isLoading:view.active&&(!query.isFetchedAfterMount||query.isPending),statsPending:!!current&&stats.isPending,statsError:stats.isError};
}

export function useProfileById(profileId:string|undefined){return useProfileRead('id',profileId);}
export function useProfileByUsername(username:string,preferredId?:string){return useProfileRead('username',username,preferredId);}

export function useUpdateAvatar() {
  const { profile, updateProfile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!profile) throw new Error('Not authenticated');
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.user_id}/avatar.${fileExt}`;
      const { error: uploadError } = await db.storage.from('media').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = db.storage.from('media').getPublicUrl(fileName);
      await updateProfile({ avatar_url: publicUrl });
      return publicUrl;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); },
  });
}
