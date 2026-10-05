import { useMemo } from 'react';
import { useLocationMutation, useLocationSharing } from './useLocationSharing';
import type { LocationDuration, LocationPrecision, LocationRequest, LocationShare } from '@/lib/locationSharingService';

/** Both directional grants are distinct; pausing one never hides its controls. */
export function useLocationShareWithFriend(otherProfileId: string | undefined, enabled = true) {
  const query = useLocationSharing(otherProfileId, enabled && !!otherProfileId);
  const mutation = useLocationMutation(otherProfileId);
  const shares = query.data?.shares;
  const outgoingShare = shares?.find(row => row.sharerId === query.actor.profileId && row.viewerId === otherProfileId && row.active);
  const incomingShare = shares?.find(row => row.viewerId === query.actor.profileId && row.sharerId === otherProfileId && row.active);
  const requests = query.data?.requests;
  const incomingRequests = useMemo(() => requests?.filter(row => row.targetId === query.actor.profileId && row.status === 'pending') ?? [], [requests, query.actor.profileId]);
  const outgoingRequests = useMemo(() => requests?.filter(row => row.requesterId === query.actor.profileId && row.status === 'pending') ?? [], [requests, query.actor.profileId]);
  const requireRead = () => { mutation.guardCurrent(); if (!query.data) throw new Error('Refresh location sharing before changing it.'); };
  return {
    ...query, shares, outgoingShare, incomingShare, incomingRequests, outgoingRequests,
    share: outgoingShare || incomingShare,
    isSharer: !!outgoingShare, isViewer: !!incomingShare,
    isActive: !!shares?.some(row => row.active && !row.paused),
    location: query.data?.locations.find(row => row.id === otherProfileId),
    guardCurrent: mutation.guardCurrent,
    requestShare: { ...mutation, mutateAsync: async (opts: { duration?: LocationDuration; precision?: LocationPrecision; message?: string }) => {
      requireRead();
      if (!otherProfileId) throw new Error('Choose a friend.');
      return mutation.mutateAsync({ action: 'request', targetId: otherProfileId, duration: opts.duration || '1h', precision: opts.precision || 'approximate', message: opts.message || null });
    } },
    respondRequest: { ...mutation, mutateAsync: async (opts: { request: LocationRequest; intent: 'accept' | 'decline' | 'block' }) => {
      requireRead();
      if (!incomingRequests.some(row => row.id === opts.request.id && row.revision === opts.request.revision)) throw new Error('This request changed. Refresh location sharing.');
      return mutation.mutateAsync({ action: 'respond', locationRequestId: opts.request.id, expectedRevision: opts.request.revision, intent: opts.intent });
    } },
    stopShare: { ...mutation, mutateAsync: async (share: LocationShare = outgoingShare || incomingShare!) => {
      requireRead(); if (!share || !shares?.some(row => row.id === share.id && row.revision === share.revision)) throw new Error('This share changed. Refresh location sharing.');
      return mutation.mutateAsync({ action: 'stop', shareId: share.id, expectedRevision: share.revision });
    } },
    pauseShare: { ...mutation, mutateAsync: async (paused: boolean) => {
      requireRead(); if (!outgoingShare) throw new Error('There is no active outgoing share.');
      return mutation.mutateAsync({ action: 'pause', shareId: outgoingShare.id, expectedRevision: outgoingShare.revision, paused });
    } },
  };
}
