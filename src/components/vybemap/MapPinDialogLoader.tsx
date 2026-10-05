import { lazy, Suspense } from 'react';
const Dialog = lazy(() => import('./MapPinDialog').then(module => ({ default: module.MapPinDialog })));
export function MapPinDialogLoader(props: { kind: 'post' | 'clip'; sourceId: string; onClose: () => void }) {
  return <Suspense fallback={<div role="status">Loading map sharing… <button type="button" onClick={props.onClose}>Cancel</button></div>}><Dialog {...props} /></Suspense>;
}
