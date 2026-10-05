import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMapPinState } from '@/hooks/useMapPins';
import { manageMapPin, type MapPinArea, type MapPinKind, type MapPinMutation, type MapPinReceipt } from '@/lib/vybemap/mapPinService';
import { MapPinAreaPicker } from './MapPinAreaPicker';

type Draft = { area: MapPinArea | null; review: boolean; reviewed?: MapPinMutation; attempt: MapPinMutation | null };
// Uncertain payloads remain only in this tab's memory; account epochs never share a draft.
const drafts = new Map<string, Draft>();
export function MapPinDialog({ kind, sourceId, onClose }: { kind: MapPinKind; sourceId: string; onClose: () => void }) {
  const read = useMapPinState(kind, sourceId), client = useQueryClient(), account = read.account;
  const key = JSON.stringify([account.user?.id, account.profile?.id, account.session.epoch, kind, sourceId]);
  return <MapPinEditor key={key} {...{ kind, sourceId, onClose, read, client, draftKey: key }} />;
}
function MapPinEditor({ kind, sourceId, onClose, read, client, draftKey }: { kind: MapPinKind; sourceId: string; onClose: () => void; read: ReturnType<typeof useMapPinState>; client: ReturnType<typeof useQueryClient>; draftKey: string }) {
  const [draft, setDraft] = useState<Draft>(() => drafts.get(draftKey) || { area: null, review: false, attempt: null });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const lifetime = useMemo(() => ({ active: true, visibility: 0, pending: null as symbol | null }), []);
  const latest = useRef(read); latest.current = read;
  const saveDraft = (value: Draft) => { drafts.set(draftKey, value); while (drafts.size > 20) drafts.delete(drafts.keys().next().value!); setDraft(value); };
  useEffect(() => {
    lifetime.active = true;
    const hide = () => { lifetime.visibility++; lifetime.pending = null; setBusy(false); setMessage(''); };
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', hide);
    return () => { lifetime.active = false; document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', hide); };
  }, [lifetime]);
  const changeArea = (area: MapPinArea) => { saveDraft({ area, review: false, attempt: null }); setMessage(''); setError(''); };
  const submit = async (action: 'share' | 'remove') => {
    const current = read.data; if (!current || lifetime.pending) return;
    const visibility = lifetime.visibility, token = Symbol();
    const guard = () => {
      read.guardCurrent(); latest.current.guardCurrent();
      if (!lifetime.active || lifetime.visibility !== visibility || document.visibilityState === 'hidden') throw new Error('This map-sharing view closed.');
      if (!latest.current.data || latest.current.isError || latest.current.data.validUntil <= Date.now()) throw new Error('Map sharing access needs a fresh check. Retry to confirm the change.');
    };
    let input = draft.attempt;
    if (!input || input.action !== action) {
      if (action === 'share') {
        if (!draft.review || !draft.reviewed || !draft.area?.label.trim() || !current.canShare || !current.sourceRevision) return;
        input = draft.reviewed;
        if (input.action !== 'share' || input.expectedRevision !== current.revision || input.expectedSourceRevision !== current.sourceRevision) {
          saveDraft({ ...draft, review: false, reviewed: undefined }); setError('This post changed after your review. Review the area again before sharing.'); return;
        }
      } else { if (!current.revision) return; input = { action, kind, sourceId, expectedRevision: current.revision }; }
    }
    try {
      guard(); lifetime.pending = token; saveDraft({ ...draft, attempt: input }); setBusy(true); setError(''); setMessage('');
      const result = await manageMapPin({ uid: read.account.user!.id, profileId: read.account.profile!.id }, input, guard) as MapPinReceipt;
      guard();
      const fresh = latest.current.data!;
      if (result.applied && ((fresh.revision !== input.expectedRevision && fresh.revision !== result.revision) || (input.action === 'share' && (!fresh.canShare || fresh.sourceRevision !== result.sourceRevision)))) throw new Error('Map sharing changed while saving. Refresh and retry to confirm its current state.');
      result.acknowledge();
      saveDraft({ ...draft, attempt: null, review: false });
      setMessage(result.applied ? action === 'share' ? 'Map area shared. Your post audience and location privacy still apply.' : 'Removed from the map.' : 'That earlier change was superseded. Current map sharing is being refreshed.');
      void client.invalidateQueries({ queryKey: ['map-pins', read.account.user!.id, read.account.profile!.id, read.account.session.epoch] });
    } catch (reason) {
      try { guard(); } catch { return; }
      if (reason && typeof reason === 'object' && 'code' in reason && ['aborted', 'invalid-argument', 'already-exists'].includes(String(reason.code))) saveDraft({ ...draft, attempt: null, review: false });
      setError(reason instanceof Error ? reason.message : 'Map sharing could not be confirmed. Retry the same change.');
    } finally { if (lifetime.pending === token) { lifetime.pending = null; try { read.guardCurrent(); if (lifetime.active && lifetime.visibility === visibility) setBusy(false); } catch { /* Retired view. */ } } }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>Map sharing</DialogTitle><DialogDescription>Choose an approximate area for this published {kind === 'clip' ? 'clip' : 'post'}. Only people who can access the post and your location privacy may see its pin.</DialogDescription></DialogHeader>
    <p className="text-sm text-muted-foreground">Sharing on the map is separate from Local discovery and live location sharing. The map stores a rounded area of about 2 km, not your exact selected point.</p>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {read.isError ? <div role="alert">Map sharing could not be loaded. <Button variant="outline" onClick={() => void read.refetch()}>Retry map sharing</Button></div> : !read.data ? <p role="status">Checking current map sharing…</p> : <>
      <p className="font-medium">{read.data.status === 'shared' ? `Currently shared near ${read.data.pin!.areaLabel}` : read.data.status === 'unavailable' ? 'This source is unavailable for map sharing.' : 'Not currently shared on the map.'}</p>
      {read.data.canShare ? <>
        <MapPinAreaPicker value={draft.area} disabled={busy} onChoose={point => changeArea({ ...point, label: draft.area?.label || '' })} />
        <label className="space-y-1 text-sm">Area name<Input value={draft.area?.label || ''} maxLength={120} disabled={busy || !draft.area} placeholder="For example: Lincoln Park area" onChange={event => { if (draft.area) changeArea({ ...draft.area, label: event.target.value }); }} /></label>
        {draft.area && <p className="text-sm">Chosen approximate area: {draft.area.label || 'Add an area name'} · {draft.area.latitude.toFixed(2)}°, {draft.area.longitude.toFixed(2)}°</p>}
        {draft.review && <p className="rounded-xl border p-3 text-sm">Review: share this {kind === 'clip' ? 'clip' : 'post'} near <strong>{draft.area?.label}</strong>. This rounded area remains shared until removed, or until source access or your location privacy no longer allows it.</p>}
        {!draft.attempt && (draft.review ? <Button disabled={busy} onClick={() => void submit('share')}>{busy ? 'Sharing…' : 'Share this area on map'}</Button> : <Button disabled={busy || !draft.area?.label.trim()} onClick={() => { if (draft.area && read.data?.sourceRevision) saveDraft({ ...draft, review: true, reviewed: { action: 'share', kind, sourceId, expectedRevision: read.data.revision, expectedSourceRevision: read.data.sourceRevision, area: { ...draft.area, label: draft.area.label.trim() } } }); }}>Review area</Button>)}
      </> : <p className="text-sm text-muted-foreground">A currently published, owned source is required. Review an older post before sharing it on the map.</p>}
      {draft.attempt && <Button disabled={busy} onClick={() => void submit(draft.attempt!.action)}>{busy ? 'Confirming…' : 'Retry same map change'}</Button>}
      {read.data.revision && <Button variant="outline" disabled={busy} onClick={() => void submit('remove')}>{busy ? 'Confirming…' : 'Remove from map'}</Button>}
    </>}
    <Button variant="ghost" onClick={onClose}>Close</Button>
  </DialogContent></Dialog>;
}
