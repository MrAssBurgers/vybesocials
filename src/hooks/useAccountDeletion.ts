import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useVerifiedSettingsScope } from './useVerifiedSettingsScope';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { foregroundReadPhaseCurrent, getForegroundReadPhase, getServerReadPhase, subscribeForegroundReadPhase } from '@/lib/foregroundReadPhase';

type Status = 'none' | 'pending_review' | 'cancelled' | 'review_required' | 'processing' | 'completed';
export type DeletionStatus = { status: Status; revision: string | null; requestedAt: string | null; eligibleAfter: string | null };
type Scope = ReturnType<ReturnType<typeof useVerifiedSettingsScope>['capture']>;
type Attempt = { action: 'request_delete' | 'cancel_delete'; expectedRevision: string | null; requestId: string };
const invalid = () => new Error('The deletion status could not be verified. Refresh and try again.');

export async function checkedDeletionRequest(scope: Scope, input: { action: 'deletion_status' } | Attempt, guard = scope.guard): Promise<DeletionStatus> {
  guard();
  const phase = getForegroundReadPhase();
  const check = () => { guard(); if (!foregroundReadPhaseCurrent(phase) || navigator.onLine === false) throw new Error('Keep Vybe open and online, then refresh deletion status.'); };
  check();
  const requestId = 'requestId' in input ? input.requestId : crypto.randomUUID();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_,reject) => { timer=setTimeout(()=>reject(new Error('The request timed out. Refresh status before trying again.')),15000); });
  try {
    const { data, error } = await Promise.race([invokeFunction<Record<string,unknown>>('manageAccount',{...input,requestId,...scope.fields}),timeout]);
    check(); if (error) throw new Error(error.message);
    if (!data || data.ok !== true || data.version !== 2 || data.ownerUid !== scope.fields.expectedOwnerUid || data.profileId !== scope.fields.expectedProfileId || data.accountCreatedAt !== scope.fields.expectedAccountCreatedAt || data.requestId !== requestId
      || data.automaticCleanup !== false || !['none','pending_review','cancelled','review_required','processing','completed'].includes(String(data.status))) throw invalid();
    const empty = ['none','review_required'].includes(String(data.status));
    if (empty ? data.revision !== null || data.requestedAt !== null || data.eligibleAfter !== null
      : typeof data.revision !== 'string' || !/^[a-f0-9]{48}$/.test(data.revision) || typeof data.requestedAt !== 'string' || typeof data.eligibleAfter !== 'string'
        || !Number.isFinite(Date.parse(data.requestedAt)) || Date.parse(data.eligibleAfter)-Date.parse(data.requestedAt) !== 30*86400000) throw invalid();
    if (input.action === 'request_delete' && data.status !== 'pending_review' || input.action === 'cancel_delete' && data.status !== 'cancelled') throw invalid();
    return {status:data.status as Status,revision:data.revision as string|null,requestedAt:data.requestedAt as string|null,eligibleAfter:data.eligibleAfter as string|null};
  } finally { clearTimeout(timer!); }
}

export function useAccountDeletion() {
  const scope = useVerifiedSettingsScope();
  const phase = useSyncExternalStore(subscribeForegroundReadPhase,getForegroundReadPhase,getServerReadPhase);
  const [state,setState] = useState<DeletionStatus | null>(null), [loading,setLoading] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState<string|null>(null);
  const [refresh,setRefresh] = useState(0);
  const active = useRef<symbol|null>(null), flight = useRef<symbol|null>(null), attempt = useRef<Attempt|null>(null);
  const key = [scope.account.epoch,scope.profileId,scope.creationTime].join(':');
  const [stateKey,setStateKey] = useState('');
  const previousKey = useRef(key);
  if (previousKey.current !== key) { previousKey.current=key; active.current=null; flight.current=null; attempt.current=null; }
  useEffect(() => {
    const lifetime=Symbol('deletion-view'); active.current=lifetime; flight.current=null;
    setState(null);setStateKey(key);setBusy(false);setError(null);setLoading(false);
    if (!scope.ready || !phase.foreground || navigator.onLine === false) return () => { if(active.current===lifetime)active.current=null; };
    let captured:Scope;
    try {captured=scope.capture();} catch {setError('Load your current profile before managing deletion.');return () => {if(active.current===lifetime)active.current=null;};}
    const guard = () => {captured.guard();if(active.current!==lifetime)throw new Error('Deletion view retired.');};
    setLoading(true);
    void checkedDeletionRequest(captured,{action:'deletion_status'},guard).then(value=>{guard();setState(value);},failure=>{try{guard();setError(failure instanceof Error ? failure.message:'Could not load deletion status.');}catch{/* Retired. */}}).finally(()=>{if(active.current===lifetime)setLoading(false);});
    return () => {if(active.current===lifetime){active.current=null;flight.current=null;}};
    // Scope capture is tied to these explicit verified account/phase fields.
  },[key,scope.ready,phase,refresh]);
  const current = stateKey===key && phase.foreground && scope.ready ? state:null;
  const mutate = async (action:Attempt['action']) => {
    if (flight.current || loading || !current || !active.current) throw new Error('Refresh deletion status before trying again.');
    const captured=scope.capture(), lifetime=active.current, token=Symbol('deletion-flight');
    const guard=()=>{captured.guard();if(active.current!==lifetime||flight.current!==token)throw new Error('Deletion view retired.');};
    const intent=attempt.current?.action===action && attempt.current.expectedRevision===current.revision ? attempt.current : {action,expectedRevision:current.revision,requestId:crypto.randomUUID()};
    attempt.current=intent;flight.current=token;setBusy(true);setError(null);
    try { const value=await checkedDeletionRequest(captured,intent,guard);guard();attempt.current=null;setState(value);return value; }
    catch(failure) {try{guard();setState(null);setError(failure instanceof Error ? failure.message:'Deletion request failed.');}catch{/* Retired. */}throw failure;}
    finally {if(flight.current===token){flight.current=null;setBusy(false);}}
  };
  return {state:current,loading,busy,error,ready:!!current&&!loading&&!busy,refresh:()=>setRefresh(value=>value+1),request:()=>mutate('request_delete'),cancel:()=>mutate('cancel_delete')};
}
