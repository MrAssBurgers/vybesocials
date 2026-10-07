import { useEffect, useId, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useProfileAccount } from './useProfileAccount';
import { useForegroundReadPhase, foregroundReadPhaseCurrent } from './useForegroundReadPhase';
import { reportAccountSnapshot } from '@/lib/reportModerationService';

/** Scope profile reads and auxiliary statistics to this viewer and foreground
 * visit. Display identity caches cannot establish current access. */
export function useProfileReadView(enabled: boolean) {
  const auth=useAuth(), account=useProfileAccount(), phase=useForegroundReadPhase(), mount=useId();
  const guest=auth.authReady && !auth.user && account.session.uid === undefined;
  const active=enabled && phase.foreground && (account.ready || guest);
  const toggle=useRef({enabled,epoch:0});
  if(toggle.current.enabled!==enabled)toggle.current={enabled,epoch:toggle.current.epoch+1};
  const epoch=phase.generation+toggle.current.epoch;
  const current=useRef({active,epoch});current.current={active,epoch};
  useEffect(()=>{current.current={active,epoch};return()=>{current.current.active=false;};},[]);
  const guard=(signal?:AbortSignal)=>{
    if(guest){const live=reportAccountSnapshot();if(live.uid!==undefined||live.epoch!==account.session.epoch)throw new Error('Profile viewer changed.');}
    else account.guard();
    if(!current.current.active || current.current.epoch!==epoch || !foregroundReadPhaseCurrent(phase) || signal?.aborted || navigator.onLine===false)throw new DOMException('Profile view interrupted. Reopen to retry.','AbortError');
  };
  return {active,guard,profile:account.ready ? account.profile:undefined,key:[account.session.uid,account.session.epoch,account.profile?.id,mount,epoch]};
}
