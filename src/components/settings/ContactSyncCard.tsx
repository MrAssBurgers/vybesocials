import { Card } from '@/components/ui/card';
import { ContactDiscoveryPanel } from '@/components/contacts/ContactDiscoveryPanel';

export function ContactSyncCard() {
  return <Card className="p-4"><ContactDiscoveryPanel settings /></Card>;
}
