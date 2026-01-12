import { useMemo } from 'react';
import { useFriends } from './useFriends';
import { useUsersOnlineStatus } from './usePresence';

export interface OnlineFriend {
  id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  isOnline: boolean;
}

export function useOnlineFriends() {
  const { data: friends, isLoading: friendsLoading } = useFriends();
  
  // Get all friend IDs for presence check
  const friendIds = useMemo(() => 
    (friends || [])
      .filter((f): f is NonNullable<typeof f> => f !== null && !!f.id)
      .map(f => f.id),
    [friends]
  );

  const { data: onlineStatus = {}, isLoading: presenceLoading } = useUsersOnlineStatus(friendIds);

  // Filter and map friends with online status
  const onlineFriends = useMemo(() => {
    if (!friends) return [];
    
    return friends
      .filter((f): f is NonNullable<typeof f> => f !== null && !!f.id)
      .filter(f => onlineStatus[f.id] === true) // Only online friends
      .map(f => ({
        id: f.id,
        username: f.username,
        avatar_url: f.avatar_url,
        display_name: f.display_name,
        isOnline: true,
      }));
  }, [friends, onlineStatus]);

  // All friends with online status
  const allFriendsWithStatus = useMemo(() => {
    if (!friends) return [];
    
    return friends
      .filter((f): f is NonNullable<typeof f> => f !== null && !!f.id)
      .map(f => ({
        id: f.id,
        username: f.username,
        avatar_url: f.avatar_url,
        display_name: f.display_name,
        isOnline: onlineStatus[f.id] === true,
      }))
      .sort((a, b) => {
        // Online friends first
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return 0;
      });
  }, [friends, onlineStatus]);

  return {
    onlineFriends,
    allFriendsWithStatus,
    isLoading: friendsLoading || presenceLoading,
    onlineCount: onlineFriends.length,
  };
}
