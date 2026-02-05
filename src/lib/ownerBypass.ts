 /**
  * Owner Bypass Utilities
  * 
  * Provides bypass functionality for the owner account.
  * The owner can bypass AI content safety scanners.
  */
 
 import { supabase } from '@/integrations/supabase/client';
 
 // Owner username - must match OwnerBadge.tsx
 const OWNER_USERNAME = 'mrassburgers';
 
 // Cache the owner status to avoid repeated checks
 let cachedOwnerStatus: { userId: string; isOwner: boolean } | null = null;
 
 /**
  * Check if the current authenticated user is the owner
  */
 export async function isCurrentUserOwner(): Promise<boolean> {
   try {
     const { data: { user } } = await supabase.auth.getUser();
     if (!user) return false;
 
     // Check cache
     if (cachedOwnerStatus?.userId === user.id) {
       return cachedOwnerStatus.isOwner;
     }
 
     // Fetch profile to check username
     const { data: profile } = await supabase
       .from('profiles')
       .select('username')
       .eq('user_id', user.id)
       .single();
 
     const isOwner = profile?.username?.toLowerCase() === OWNER_USERNAME.toLowerCase();
     
     // Cache result
     cachedOwnerStatus = { userId: user.id, isOwner };
     
     return isOwner;
   } catch (err) {
     console.error('Error checking owner status:', err);
     return false;
   }
 }
 
 /**
  * Check if a given username is the owner
  */
 export function isOwnerUsername(username: string | null | undefined): boolean {
   return username?.trim().toLowerCase() === OWNER_USERNAME.toLowerCase();
 }
 
 /**
  * Clear the cached owner status (call on logout)
  */
 export function clearOwnerCache(): void {
   cachedOwnerStatus = null;
 }