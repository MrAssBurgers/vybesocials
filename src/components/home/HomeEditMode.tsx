import { useState, useCallback, useEffect, useRef, createContext, useContext, type ReactNode, type PointerEvent } from 'react';
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
import { ArrowUp, ArrowDown, GripVertical, X, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useGridLayout, type GridWidgetState } from '@/hooks/useGridLayout';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { toast } from 'sonner';
import { navVisibility } from '@/lib/navVisibility';
import { scrollAppTo } from '@/lib/appScrollContainer';

interface EditModeCtx {
  isEditing: boolean;
  saving: boolean;
  localWidgets: GridWidgetState[];
  selectedWidget: string | null;
  setSelectedWidget: (id: string | null) => void;
  handleToggle: (id: string) => void;
  handleResize: (id: string, col: 1 | 2, row: 1 | 2) => void;
  orderedEnabledIds: string[];
  handleReorder: (id: string, index: number) => void;
  startDrag: (id: string, e: PointerEvent<HTMLButtonElement>) => void;
  dragId: string | null;
  dropId: string | null;
  gridRef: React.RefObject<HTMLDivElement | null>;
}
const EditModeContext = createContext<EditModeCtx>({
  isEditing: false, saving: false, localWidgets: [], selectedWidget: null,
  setSelectedWidget: () => {}, handleToggle: () => {}, handleResize: () => {},
  orderedEnabledIds: [], handleReorder: () => {}, startDrag: () => {},
  dragId: null, dropId: null, gridRef: { current: null },
});
export const useEditMode = () => useContext(EditModeContext);

function ordered(widgets: GridWidgetState[]) {
  return [...widgets].sort((a, b) => a.order - b.order);
}
function move(widgets: GridWidgetState[], id: string, index: number) {
  const enabled = ordered(widgets.filter(w => w.enabled));
  const from = enabled.findIndex(w => w.id === id);
  if (from < 0) return widgets;
  const [item] = enabled.splice(from, 1);
  enabled.splice(Math.max(0, Math.min(index, enabled.length)), 0, item);
  return [...enabled, ...ordered(widgets.filter(w => !w.enabled))].map((w, order) => ({ ...w, order }));
}

export function EditableWidgetWrapper({ widgetId, children, className }: {
  widgetId: string; children: ReactNode; className?: string;
}) {
  const ctx = useEditMode();
  const reducedMotion = useReducedMotion();
  const widget = ctx.localWidgets.find(w => w.id === widgetId);
  if (!ctx.isEditing || !widget) return <>{children}</>;
  const index = ctx.orderedEnabledIds.indexOf(widgetId);
  const selected = ctx.selectedWidget === widgetId;
  return (
    <motion.section
      layout={reducedMotion ? false : 'position'}
      data-widget-id={widgetId}
      aria-label={widget.label + ' widget'}
      transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      className={cn('relative min-w-0 rounded-2xl border bg-card/90 shadow-sm overflow-hidden',
        widget.colSpan === 2 ? 'col-span-2' : 'col-span-1',
        selected ? 'border-primary/70 ring-2 ring-primary/15' : 'border-border/60',
        ctx.dragId === widgetId && 'opacity-50',
        ctx.dropId === widgetId && 'ring-2 ring-primary', className)}
    >
      <div className="flex items-center gap-1 border-b border-border/40 p-1">
        <button type="button" aria-label={'Drag ' + widget.label} disabled={ctx.saving}
          onPointerDown={e => ctx.startDrag(widgetId, e)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}>
          <GripVertical className="h-5 w-5" />
        </button>
        <button type="button" disabled={ctx.saving} aria-pressed={selected}
          onClick={() => ctx.setSelectedWidget(selected ? null : widgetId)}
          className="min-w-0 flex-1 text-left text-sm font-semibold leading-tight py-3 focus-visible:ring-2 focus-visible:ring-primary rounded-lg">
          <span aria-hidden="true">{widget.icon} </span>{widget.label}
        </button>
        <button type="button" aria-label={'Remove ' + widget.label} disabled={ctx.saving}
          onClick={() => ctx.handleToggle(widgetId)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* A clipped, inert preview keeps editing fast and prevents accidental post actions. */}
      <div aria-hidden="true" ref={node => { if (node) node.setAttribute('inert', ''); }}
        className={cn('relative overflow-hidden pointer-events-none select-none p-2', widget.rowSpan === 2 ? 'h-48' : 'h-24')}>
        {children}
        <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card to-transparent" />
      </div>
      <div className="border-t border-border/40 p-2 space-y-2">
        <div className="flex gap-1" aria-label={widget.label + ' position'}>
          <Button type="button" variant="ghost" className="min-h-11 flex-1 px-1 gap-1 text-xs" disabled={ctx.saving || index === 0}
            aria-label={'Move ' + widget.label + ' up'} onClick={() => ctx.handleReorder(widgetId, index - 1)}>
            <ArrowUp className="h-4 w-4" />Up
          </Button>
          <Button type="button" variant="ghost" className="min-h-11 flex-1 px-1 gap-1 text-xs" disabled={ctx.saving || index === ctx.orderedEnabledIds.length - 1}
            aria-label={'Move ' + widget.label + ' down'} onClick={() => ctx.handleReorder(widgetId, index + 1)}>
            <ArrowDown className="h-4 w-4" />Down
          </Button>
        </div>
        <label className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
          Width
          <select aria-label={widget.label + ' width'} disabled={ctx.saving} value={widget.colSpan}
            onChange={e => ctx.handleResize(widgetId, Number(e.target.value) as 1 | 2, widget.rowSpan)}
            className="min-h-11 min-w-0 rounded-lg border border-border/60 bg-background px-2 text-foreground">
            <option value="1">Half</option><option value="2">Full</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
          Height
          <select aria-label={widget.label + ' height'} disabled={ctx.saving} value={widget.rowSpan}
            onChange={e => ctx.handleResize(widgetId, widget.colSpan, Number(e.target.value) as 1 | 2)}
            className="min-h-11 min-w-0 rounded-lg border border-border/60 bg-background px-2 text-foreground">
            <option value="1">Auto</option><option value="2">Tall</option>
          </select>
        </label>
      </div>
    </motion.section>
  );
}

export function EditableWidgetList({ children }: { children: ReactNode }) {
  const { gridRef } = useEditMode();
  return <LayoutGroup><div ref={gridRef} className="grid grid-cols-2 items-start gap-3 px-3 pb-8">{children}</div></LayoutGroup>;
}
export function WidgetGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 px-3" style={{ gridAutoRows: 'minmax(56px, auto)' }}>{children}</div>;
}

export function HomeEditModeProvider({ editing, onEditingChange, children }: {
  editing: boolean; onEditingChange: (value: boolean) => void; children: ReactNode;
}) {
  const { config, variant, saveGridLayout, preferences } = useGridLayout();
  const session = useReportAccountSession();
  const [localWidgets, setLocalWidgets] = useState(config.widgets);
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const cleanupDrag = useRef<(() => void) | null>(null);
  const draftKey = useRef('');
  const key = session.uid + ':' + session.epoch + ':' + variant;
  const ready = preferences.isSuccess && !preferences.isPlaceholderData && !preferences.isError;
  const latest = useRef({ config, key, editing, localWidgets });
  latest.current = { config, key, editing, localWidgets };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!editing) { draftKey.current = ''; setAddOpen(false); return; }
    if (draftKey.current && draftKey.current !== key) {
      cleanupDrag.current?.(); busy.current = false; setSaving(false); setAddOpen(false);
      draftKey.current = '';
    }
    if (ready && draftKey.current !== key) {
      setLocalWidgets(latest.current.config.widgets);
      setSelectedWidget(null);
      draftKey.current = key;
    }
  }, [editing, key, ready]);

  useEffect(() => {
    navVisibility.setInEditMode(editing);
    return () => { navVisibility.setInEditMode(false); cleanupDrag.current?.(); };
  }, [editing]);

  const orderedEnabledIds = ordered((editing ? localWidgets : config.widgets).filter(w => w.enabled)).map(w => w.id);
  const handleToggle = useCallback((id: string) => {
    if (busy.current) return;
    setLocalWidgets(prev => {
      const target = prev.find(w => w.id === id);
      if (!target) return prev;
      const next = prev.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w);
      // Every addition is inserted above the existing layout, including the feed.
      return target.enabled ? next : move(next, id, 0);
    });
    setSelectedWidget(id);
  }, []);
  const handleResize = useCallback((id: string, colSpan: 1 | 2, rowSpan: 1 | 2) => {
    if (!busy.current) setLocalWidgets(prev => prev.map(w => w.id === id ? { ...w, colSpan, rowSpan } : w));
  }, []);
  const handleReorder = useCallback((id: string, index: number) => {
    if (!busy.current) setLocalWidgets(prev => move(prev, id, index));
  }, []);
  const startDrag = useCallback((id: string, event: PointerEvent<HTMLButtonElement>) => {
    if (busy.current || event.button !== 0) return;
    event.preventDefault();
    cleanupDrag.current?.();
    const pointerId = event.pointerId;
    const startX = event.clientX, startY = event.clientY;
    let targetId: string | null = null;
    let moved = false;
    const onMove = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6 && !moved) return;
      moved = true;
      setDragId(id);
      const nodes = gridRef.current?.querySelectorAll<HTMLElement>('[data-widget-id]');
      let distance = Infinity;
      targetId = null;
      nodes?.forEach(node => {
        const rect = node.getBoundingClientRect();
        const d = Math.hypot(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
        if (d < distance) { distance = d; targetId = node.dataset.widgetId!; }
      });
      setDropId(targetId === id ? null : targetId);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      cleanupDrag.current = null;
      setDragId(null); setDropId(null);
    };
    const onUp = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (moved && targetId && targetId !== id) {
        const ids = ordered(latest.current.localWidgets.filter(w => w.enabled)).map(w => w.id);
        handleReorder(id, ids.indexOf(targetId));
      }
      cleanup();
    };
    const onCancel = (e: globalThis.PointerEvent) => { if (e.pointerId === pointerId) cleanup(); };
    cleanupDrag.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }, [handleReorder]);

  const handleSave = async () => {
    if (busy.current || !ready || draftKey.current !== key) return;
    cleanupDrag.current?.();
    busy.current = true; setSaving(true);
    const startedKey = key;
    try {
      await saveGridLayout({ widgets: localWidgets }, true);
      if (!mounted.current || latest.current.key !== startedKey || !latest.current.editing) return;
      toast.success('Home layout saved on all devices');
      onEditingChange(false);
    } catch (error) {
      if (mounted.current && latest.current.key === startedKey && latest.current.editing) {
        toast.error(error instanceof Error ? error.message : 'Could not save your layout. Your changes are still here—try again.');
      }
    } finally {
      if (mounted.current && latest.current.key === startedKey) { busy.current = false; setSaving(false); }
    }
  };
  const hidden = localWidgets.filter(w => !w.enabled);
  return (
    <EditModeContext.Provider value={{
      isEditing: editing, saving, localWidgets: editing ? localWidgets : config.widgets,
      selectedWidget, setSelectedWidget, handleToggle, handleResize, orderedEnabledIds,
      handleReorder, startDrag, dragId, dropId, gridRef,
    }}>
      {editing && <>
        <div className="fixed inset-x-0 top-0 z-[100] border-b border-border/50 bg-card/95 backdrop-blur-xl px-3 pt-[max(var(--sat,0px),8px)] pb-3 shadow-lg">
          <div className="mx-auto max-w-xl space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" disabled={saving} onClick={() => onEditingChange(false)} className="min-h-11">Cancel</Button>
              <span className="font-semibold text-sm">Your Home</span>
              <Button type="button" disabled={saving || !ready} onClick={handleSave} className="min-h-11 gap-1.5 gradient-animated text-white">
                <Check className="h-4 w-4" />{saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Drag the grip or use Up / Down.<br />Changes apply to all devices.</p>
              <Button type="button" variant="outline" disabled={saving || !ready || hidden.length === 0} onClick={() => setAddOpen(true)} className="min-h-11 shrink-0 gap-1.5 rounded-xl">
                <Plus className="h-4 w-4" />Add widget
              </Button>
            </div>
            {!ready && <p role="status" className="text-xs text-muted-foreground">
              {preferences.isError ? <>Could not load your layout. <button type="button" className="underline" onClick={() => preferences.refetch()}>Try again</button></> : 'Loading your saved layout…'}
            </p>}
          </div>
        </div>
        <div className="h-24" />
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent onEscapeKeyDown={() => setAddOpen(false)} onPointerDownOutside={() => setAddOpen(false)}>
            <DialogTitle>Add to your Home</DialogTitle>
            <DialogDescription className="mt-1 mb-4">New widgets appear at the top. Arrange them however you like.</DialogDescription>
            <div className="space-y-2">
              {hidden.map(w => <button key={w.id} type="button" aria-label={'Add ' + w.label}
                onClick={() => { handleToggle(w.id); setAddOpen(false); scrollAppTo(0, 'smooth'); }}
                className="flex w-full min-h-16 items-center gap-3 rounded-2xl border border-border/50 p-3 text-left hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-xl" aria-hidden="true">{w.icon}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{w.label}</span><span className="block text-xs text-muted-foreground">{w.description}</span></span>
                <Plus className="h-4 w-4 shrink-0 text-primary" />
              </button>)}
            </div>
          </DialogContent>
        </Dialog>
      </>}
      {editing && !ready && !draftKey.current ? null : children}
      {editing && orderedEnabledIds.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted-foreground">Start with Add widget to build your Home.</p>}
    </EditModeContext.Provider>
  );
}
