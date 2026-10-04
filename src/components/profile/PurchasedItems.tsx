import { Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTokenMarketplaceState } from '@/hooks/useTokenMarketplaceState';
import { useActivateBoost } from '@/hooks/useActiveBoosts';
import { useEquipItem } from '@/hooks/useLockerItems';
import { MARKETPLACE_EQUIP_MAP } from '@/lib/marketplaceEquip';

export function PurchasedItems() {
  const state = useTokenMarketplaceState();
  const activate = useActivateBoost();
  const equip = useEquipItem();
  if (state.isLoading) return <p role="status">Loading your verified inventory…</p>;
  if (state.isError || !state.data) return <div role="alert"><p>Your inventory is unavailable.</p><Button onClick={() => void state.refetch()}>Try again</Button></div>;
  const owned = state.data.inventory.filter(item => item.quantity > 0);
  return <div className="space-y-3">
    {state.data.legacy_review && <p role="status" className="text-sm text-muted-foreground">Earlier purchase history is retained for review. Only verified items appear as usable inventory.</p>}
    {owned.length === 0 ? <p className="rounded-xl border p-5 text-sm text-muted-foreground">No verified items in your inventory yet.</p> :
      <div className="grid grid-cols-2 gap-3">{owned.map(item => {
        const catalog = state.data.catalog.find(entry => entry.id === item.item_id);
        const spec = MARKETPLACE_EQUIP_MAP[item.item_id];
        const disabled = activate.isPending || equip.isPending || !catalog?.available;
        return <div key={item.item_id} className="rounded-xl border p-3 space-y-2">
          <Package className="h-5 w-5 text-primary" /><p className="font-medium text-sm">{catalog?.name || item.item_id}</p>
          <p className="text-xs text-muted-foreground">{item.kind === 'consumable' ? `${item.quantity} ready to use` : 'Owned'}</p>
          {item.kind === 'consumable' ? <Button size="sm" disabled={disabled} onClick={() => activate.mutate({ itemId: item.item_id, name: catalog?.name || 'Boost' })}>Activate one</Button> :
            spec && <Button size="sm" disabled={disabled} onClick={() => equip.mutate(spec)}>Equip</Button>}
        </div>;
      })}</div>}
  </div>;
}
