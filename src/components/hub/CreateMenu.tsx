import { CreateMenuLayer } from './CreateMenuLayer';

/** Compatibility entry point: share one accessible Create/Hub flow. */
export function CreateMenu({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return <CreateMenuLayer open={isOpen} onOpenChange={open => { if (!open) onClose(); }} />;
}
