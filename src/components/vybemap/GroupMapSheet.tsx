import { useEffect, useRef, useState } from 'react';
import { Users, Sparkles } from 'lucide-react';
import { MapLiquidSheet } from './MapLiquidSheet';
import { useSquadAction, useSquadDetail, useSquadList, useSquadRoster } from '@/hooks/vybemap/useMapSquads';
import { useMapViewGuard } from '@/hooks/vybemap/useMapSocial';
import { SQUAD_EMOJIS, squadInviteToken, type SquadMutation, type SquadPreview, type SquadReceipt } from '@/lib/vybemap/mapSquadService';

const button = 'rounded-xl bg-violet-500/20 px-3 py-2 text-sm font-semibold disabled:opacity-50';
const field = 'w-full rounded-xl border border-border/50 bg-card/50 p-3 text-sm';
type Props = { onClose: () => void; onSelect: (id: string) => void; initialInvite?: string };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The squad change could not be confirmed. Please retry.';
function useDeadline(deadline: number) {
  const [, update] = useState(0);
  useEffect(() => { if (!deadline || deadline <= Date.now()) return; const timer = setTimeout(() => update(n => n + 1), deadline - Date.now() + 1); return () => clearTimeout(timer); }, [deadline]);
  return deadline > Date.now();
}
function useVisibleGuard(onHidden: () => void) {
  const epoch = useRef(0), callback = useRef(onHidden); callback.current = onHidden;
  useEffect(() => { const hidden = () => { if (document.visibilityState === 'hidden') { epoch.current++; callback.current(); } }; document.addEventListener('visibilitychange', hidden); return () => document.removeEventListener('visibilitychange', hidden); }, []);
  return () => { const captured = epoch.current; return () => { if (captured !== epoch.current || document.visibilityState === 'hidden') throw new Error('Reopen the squad to confirm current access.'); }; };
}
export function GroupMapSheet(props: Props) {
  const view = useMapViewGuard('squads');
  return <SquadPanel key={view.scope} {...props} />;
}
function SquadPanel({ onClose, onSelect, initialInvite }: Props) {
  const view = useMapViewGuard('squads'), list = useSquadList(), action = useSquadAction('squads');
  const [name, setName] = useState(''), [emoji, setEmoji] = useState('🗺️');
  const [selected, setSelected] = useState<string | null>(null), [problem, setProblem] = useState('');
  const [code, setCode] = useState(initialInvite || ''), [preview, setPreview] = useState<SquadPreview | null>(null);
  const [busy, setBusy] = useState(false), pending = useRef(false);
  const captureVisible = useVisibleGuard(() => setPreview(null));
  const previewCurrent = useDeadline(preview?.validUntil || 0) && document.visibilityState !== 'hidden';
  const run = async (input: SquadMutation | { action: 'previewInvite'; token: string }) => {
    if (pending.current) return; try { view.guard(); } catch { return; }
    pending.current = true; setBusy(true); setProblem('');
    const visible = captureVisible();
    try {
      visible(); const receipt = await action.mutateAsync(input, visible); view.guard(); visible();
      if (input.action === 'previewInvite') { setPreview(receipt as SquadPreview); if (!(receipt as SquadPreview).invite) setProblem('This invitation is unavailable or expired. Ask its owner for a current invitation.'); }
      else {
        const result = receipt as SquadReceipt;
        if (result.status !== 'active' || !result.squad) throw new Error('This squad is no longer available. Refresh before trying again.');
        setSelected(result.squadId); if (input.action === 'create') setName('');
        if (input.action === 'join') { setPreview(null); setCode(''); }
      }
    } catch (error) { try { view.guard(); visible(); setProblem(errorText(error)); } catch { /* Retired view. */ } }
    finally { pending.current = false; try { view.guard(); setBusy(false); } catch { /* Retired view. */ } }
  };
  const review = () => { const token = squadInviteToken(code); if (!token) { setProblem('Paste a valid squad invitation link or code.'); return; } void run({ action: 'previewInvite', token }); };
  return <MapLiquidSheet onClose={onClose} maxHeight="85vh" title={<div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-400" /><h2 className="text-lg font-bold">Squad Maps</h2></div>}>
    <p className="mb-4 text-xs text-muted-foreground">Highlight squad members who already share their location with you. Joining a squad never turns on location sharing.</p>
    {problem && <p role="alert" className="mb-3 text-sm text-destructive">{problem}</p>}
    {selected ? <SquadDetails key={selected} squadId={selected} onBack={() => setSelected(null)} onSelect={onSelect} /> : <>
      <section aria-label="Your squads" className="mb-5 space-y-2">
        {list.isError ? <p role="alert">Couldn&apos;t load your squads. <button className={button} onClick={() => void list.refetch()}>Retry squads</button></p> : !list.data ? <p role="status">Checking your squads…</p> : !list.data.length ? <p>No squads in this group of results.</p> : list.data.map(group => <button key={group.id} className="flex w-full items-center gap-3 rounded-xl border border-border/40 p-3 text-left" disabled={busy} onClick={() => { list.guardCurrent(); setSelected(group.id); setProblem(''); }}>
          <span aria-hidden className="text-2xl">{group.emoji}</span><span className="flex-1"><strong>{group.name}</strong><span className="block text-xs text-muted-foreground">{group.legacy ? 'Previous squad · owner review required' : `${group.member_count} member${group.member_count === 1 ? '' : 's'}`}</span></span><Users className="h-4 w-4" />
        </button>)}
        {list.hasNextPage && list.data && <button className={button} disabled={list.isFetchingNextPage || busy} onClick={() => void list.fetchNextPage()}>{list.nextGroup ? 'Next squads' : 'More squads'}</button>}
        {list.windowed && <button className={button} disabled={busy} onClick={() => void list.restart()}>First squads</button>}
      </section>
      <form className="space-y-3 rounded-2xl border border-violet-500/25 p-4" onSubmit={event => { event.preventDefault(); if (!name.trim()) { setProblem('Name your squad map.'); return; } void run({ action: 'create', name: name.trim(), emoji }); }}>
        <h3 className="font-semibold">New squad map</h3><div className="flex flex-wrap gap-1">{SQUAD_EMOJIS.map(value => <button type="button" key={value} aria-label={`Choose ${value}`} aria-pressed={emoji === value} disabled={busy} className={button} onClick={() => setEmoji(value)}>{value}</button>)}</div>
        <label className="block text-sm">Squad name<input className={field} value={name} onChange={event => setName(event.target.value)} maxLength={40} disabled={busy} placeholder="Friday night crew, road trip…" /></label>
        <button className={button} disabled={busy || !view.account.ready}>{busy ? 'Confirming…' : 'Create squad map'}</button>
      </form>
      <section className="mt-4 space-y-3 rounded-2xl border border-border p-4" aria-label="Join a squad">
        <h3 className="font-semibold">Have an invitation?</h3><label className="block text-sm">Invitation link or code<input className={field} autoComplete="off" value={code} disabled={busy} onChange={event => { setCode(event.target.value); setPreview(null); }} /></label>
        <button className={button} disabled={busy || !code.trim() || !view.account.ready} onClick={review}>{preview && !previewCurrent ? 'Check invitation again' : 'Review invitation'}</button>
        {preview?.invite && previewCurrent && <div className="space-y-2"><p><strong>{preview.invite.squad.name}</strong> · {preview.invite.squad.member_count} members</p><p className="text-xs text-muted-foreground">Joining makes your profile visible to the squad. It does not share your location. You can leave at any time.</p><button className={button} disabled={busy} onClick={() => { if (preview.validUntil > Date.now()) void run({ action: 'join', token: preview.token }); }}>Join this squad</button></div>}
        {preview?.invite && !previewCurrent && <p role="status" className="text-xs">Check this invitation again before joining.</p>}
      </section>
    </>}
  </MapLiquidSheet>;
}
function SquadDetails({ squadId, onBack, onSelect }: { squadId: string; onBack: () => void; onSelect: (id: string) => void }) {
  const view = useMapViewGuard(squadId), detail = useSquadDetail(squadId), roster = useSquadRoster(squadId), action = useSquadAction(squadId);
  const [problem, setProblem] = useState(''), [notice, setNotice] = useState(''), [confirm, setConfirm] = useState<SquadMutation | null>(null);
  const [invite, setInvite] = useState<SquadReceipt | null>(null), [busy, setBusy] = useState(false), pending = useRef(false);
  const captureVisible = useVisibleGuard(() => { setInvite(null); setNotice(''); });
  const activeInvite = useDeadline(invite?.invitationExpiresAt || 0) && !!invite?.invite?.active;
  const group = detail.data?.squad;
  const currentDetail = useRef(detail.data); currentDetail.current = detail.data;
  const run = async (input: SquadMutation) => {
    if (pending.current) return; try { view.guard(); } catch { return; }
    pending.current = true; setBusy(true); setProblem(''); setNotice('');
    const visible = captureVisible();
    try {
      visible(); const result = await action.mutateAsync(input, visible) as SquadReceipt; view.guard(); visible();
      if (input.action === 'createInvite') { setInvite(result); if (!result.invite?.active || result.status !== 'active' || !result.invitationExpiresAt || result.invitationExpiresAt <= Date.now()) throw new Error('This invitation is no longer available. Generate a new invitation.'); }
      else if (input.action === 'leave' || input.action === 'archive') {
        if (result.status !== (input.action === 'leave' ? 'left' : 'archived')) throw new Error('The squad changed. Refresh before trying again.'); onBack();
      } else if (input.action === 'recreate') { if (result.status !== 'active') throw new Error('The replacement squad is unavailable. Refresh your squads.'); onBack(); }
      setConfirm(null);
    } catch (error) { try { view.guard(); visible(); setProblem(errorText(error)); } catch { /* Retired view. */ } }
    finally { pending.current = false; try { view.guard(); setBusy(false); } catch { /* Retired view. */ } }
  };
  const copyInvite = async () => {
    const visible = captureVisible();
    const currentOwner = () => {
      view.guard(); visible(); detail.guardCurrent();
      const checked = currentDetail.current;
      if (!checked?.squad || checked.validUntil <= Date.now() || checked.squad.id !== squadId || checked.squad.status !== 'active' || checked.squad.owner_id !== view.account.profile?.id || checked.squad.membership?.role !== 'owner' || !invite?.invite?.active || !invite.invitationExpiresAt || invite.invitationExpiresAt <= Date.now()) throw new Error('Refresh current squad access before copying this invitation.');
    };
    try {
      currentOwner();
      const link = `${window.location.origin}/map#squad-invite=${invite!.invite!.token}`;
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable. Copy the displayed code instead.');
      await navigator.clipboard.writeText(link); currentOwner(); setNotice('Invitation link copied.');
    } catch (error) { try { view.guard(); visible(); setProblem(errorText(error)); } catch { /* Retired view. */ } }
  };
  return <section className="space-y-3" aria-label="Squad details">
    <button className={button} disabled={busy} onClick={onBack}>Back to squads</button>
    {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}{notice && <p role="status">{notice}</p>}
    {detail.isError ? <p role="alert">Couldn&apos;t confirm this squad. <button className={button} onClick={() => void detail.refetch()}>Retry squad</button></p> : !detail.data ? <p role="status">Checking squad membership…</p> : !group ? <p>This squad is no longer available to you.</p> : <>
      <h3 className="text-lg font-bold">{group.emoji} {group.name}</h3>
      {group.legacy ? <div className="space-y-3"><p>This previous squad needs a fresh start. Create a new squad with this name; previous members are not added automatically. The previous record is retained.</p><button className={button} disabled={busy} onClick={() => setConfirm({ action: 'recreate', legacySquadId: group.id, expectedRevision: group.revision })}>Review new squad</button></div> : <>
        <p className="text-sm">{group.member_count} member{group.member_count === 1 ? '' : 's'}. Locations appear only when separately shared with you.</p>
        <button className={button} disabled={busy} onClick={() => { detail.guardCurrent(); if (detail.data && detail.data.validUntil > Date.now()) onSelect(group.id); }}>Highlight on map</button>
        <section aria-label="Squad members" className="space-y-2"><h4 className="font-semibold">Members</h4>{roster.isError ? <p role="alert">Couldn&apos;t load members. <button className={button} onClick={() => void roster.refetch()}>Retry members</button></p> : !roster.data ? <p role="status">Checking members…</p> : roster.data.length ? roster.data.map(member => <p key={member.profile_id} className="text-sm">{member.display_name || member.username || 'Unavailable profile'}{member.role === 'owner' ? ' · Owner' : ''}</p>) : <p>No visible members in this group of results.</p>}
          {roster.data && roster.hasNextPage && <button className={button} disabled={roster.isFetchingNextPage || busy} onClick={() => void roster.fetchNextPage()}>{roster.nextGroup ? 'Next members' : 'More members'}</button>}{roster.windowed && <button className={button} onClick={() => void roster.restart()}>First members</button>}
        </section>
        {group.membership?.role === 'owner' ? <>
          <p className="text-xs text-muted-foreground">Anyone signed in with your invitation can join, subject to current account access. Share it only with your intended squad.</p><button className={button} disabled={busy} onClick={() => void run({ action: 'createInvite', squadId: group.id, expectedRevision: group.revision })}>Generate 24-hour invitation</button>
          {invite?.invite && activeInvite && <div className="space-y-2"><label className="block text-sm">Invitation code<input readOnly className={field} value={invite.invite.token} /></label><p className="text-xs text-muted-foreground">Expires {new Date(invite.invitationExpiresAt!).toLocaleString()}.</p><button className={button} onClick={() => void copyInvite()}>Copy invitation link</button></div>}
          {invite && !activeInvite && <p className="text-xs">This invitation has expired. Generate a new invitation to share.</p>}
          <button className={`${button} block`} disabled={busy} onClick={() => setConfirm({ action: 'archive', squadId: group.id, expectedRevision: group.revision })}>Archive squad</button>
        </> : <button className={button} disabled={busy} onClick={() => { if (group.membership) setConfirm({ action: 'leave', squadId: group.id, expectedMembershipRevision: group.membership.revision }); }}>Leave squad</button>}
      </>}
      {confirm && <div role="alert" className="space-y-2 rounded-xl border border-border p-3"><p>{confirm.action === 'archive' ? 'Archive this squad for everyone? Invitations will stop working.' : confirm.action === 'leave' ? 'Leave this squad? A current invitation will be needed to join again.' : 'Create a new squad containing only you? Previous members will need a new invitation.'}</p><button className={button} disabled={busy} onClick={() => void run(confirm)}>Confirm {confirm.action === 'recreate' ? 'new squad' : confirm.action}</button><button className={button} disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div>}
    </>}
  </section>;
}
