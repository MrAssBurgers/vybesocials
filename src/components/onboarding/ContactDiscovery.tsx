import { ContactDiscoveryPanel } from '@/components/contacts/ContactDiscoveryPanel';

export function ContactDiscovery({ onComplete }: { onComplete?: () => void }) {
  return <ContactDiscoveryPanel onComplete={onComplete} />;
}
