import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { captureContactActor, contactDiscoveryState, contactFailureMessage, matchDeviceContacts, type ContactDiscoveryState, type ContactSearchResult } from '@/lib/contactDiscoveryService';
import { readDeviceContacts } from '@/lib/nativeContacts';
import { profileFriendshipAction } from '@/lib/profileFriendshipAction';

type Search = { phase: 'idle' | 'reading' | 'matching' | 'complete' | 'error'; result?: ContactSearchResult; error?: string };
interface View { key: string; settings?: ContactDiscoveryState; settingsError?: string; loadingSettings: boolean; saving: boolean; search: Search; sent: string[]; adding: string | null; friendError?: string }
const initial = (key: string): View => ({ key, loadingSettings: true, saving: false, search: { phase: 'idle' }, sent: [], adding: null });

/** Private address-book state never enters query persistence or browser storage. */
export function useContactDiscovery() {
  const { user, profile } = useAuth(), session = useReportAccountSession();
  const ready = !!user?.id && !!profile?.id && profile.user_id === user.id && session.uid === user.id;
  const key = `${user?.id || ''}:${profile?.id || ''}:${profile?.user_id || ''}:${session.epoch}:${ready}`;
  const live = useRef({ key, mounted: true }); live.current.key = key;
  const operations = useRef({ settings: 0, search: 0, friend: 0 });
  const [stored, setStored] = useState<View>(() => initial(key));
  const view = ready && stored.key === key ? stored : initial(key);
  const actor = () => {
    if (!ready) throw new Error('Wait for your signed-in profile to load.');
    const startedKey = key;
    return captureContactActor(user.id, profile.id, () => {
      if (!live.current.mounted || live.current.key !== startedKey) throw Object.assign(new Error('Your account changed. Reopen contacts.'), { code: 'account-changed' });
    });
  };
  const update = (fn: (old: View) => View) => setStored(old => fn(old.key === key ? old : initial(key)));
  const loadSettings = async () => {
    const operation = ++operations.current.settings;
    let current: ReturnType<typeof actor>;
    try { current = actor(); } catch { return; }
    update(old => ({ ...old, loadingSettings: true, settings: undefined, settingsError: undefined }));
    try {
      const settings = await contactDiscoveryState(current); current.guard();
      if (operation === operations.current.settings) update(old => ({ ...old, settings, loadingSettings: false }));
    } catch (error) {
      try { current.guard(); } catch { return; }
      if (operation === operations.current.settings) update(old => ({ ...old, loadingSettings: false, settingsError: contactFailureMessage(error) }));
    }
  };
  useEffect(() => { live.current.mounted = true; return () => { live.current.mounted = false; operations.current.search++; }; }, []);
  useEffect(() => { setStored(initial(key)); if (ready) void loadSettings(); }, [key, ready]);
  const setDiscoverable = async (enabled: boolean) => {
    if (view.saving) return;
    let current: ReturnType<typeof actor>; try { current = actor(); } catch { return; }
    const operation = ++operations.current.settings;
    update(old => ({ ...old, saving: true, settingsError: undefined }));
    try {
      const settings = await contactDiscoveryState(current, enabled); current.guard();
      if (operation === operations.current.settings) update(old => ({ ...old, settings, saving: false }));
    } catch (error) {
      try { current.guard(); } catch { return; }
      if (operation === operations.current.settings) update(old => ({ ...old, saving: false, settingsError: contactFailureMessage(error) }));
    }
  };
  const discoverFriends = async () => {
    if (view.search.phase === 'reading' || view.search.phase === 'matching') return;
    let current: ReturnType<typeof actor>; try { current = actor(); } catch { return; }
    const operation = ++operations.current.search; operations.current.friend++;
    const baseGuard = current.guard; current.guard = () => { baseGuard(); if (operation !== operations.current.search) throw new Error('contacts_cancelled'); };
    update(old => ({ ...old, search: { phase: 'reading' }, friendError: undefined, sent: [], adding: null }));
    try {
      // The picker starts in the click's user gesture; no network await precedes it.
      const contacts = await readDeviceContacts(); current.guard();
      if (!contacts.length) { update(old => ({ ...old, search: { phase: 'idle' } })); return; }
      update(old => ({ ...old, search: { phase: 'matching' } }));
      const result = await matchDeviceContacts(contacts, current); current.guard();
      update(old => ({ ...old, search: { phase: 'complete', result } }));
    } catch (error) {
      try { baseGuard(); } catch { return; }
      if (operation !== operations.current.search) return;
      update(old => ({ ...old, search: error instanceof Error && error.message === 'contacts_cancelled' ? { phase: 'idle' } : { phase: 'error', error: contactFailureMessage(error) } }));
    }
  };
  const cancelSearch = () => { operations.current.search++; update(old => ({ ...old, search: { phase: 'idle' } })); };
  const addFriend = async (targetId: string) => {
    if (view.adding || !view.search.result?.matches.some(match => match.id === targetId)) return;
    let current: ReturnType<typeof actor>; try { current = actor(); } catch { return; }
    const operation = ++operations.current.friend;
    update(old => ({ ...old, adding: targetId, friendError: undefined }));
    try {
      await profileFriendshipAction({ action: 'send', targetId, expectedOwnerUid: current.uid }, current.guard); current.guard();
      if (operation === operations.current.friend) update(old => ({ ...old, adding: null, sent: [...old.sent, targetId] }));
    } catch (error) {
      try { current.guard(); } catch { return; }
      if (operation === operations.current.friend) update(old => ({ ...old, adding: null, friendError: contactFailureMessage(error) }));
    }
  };
  return { ...view, ready, loadSettings, setDiscoverable, discoverFriends, cancelSearch, addFriend };
}
