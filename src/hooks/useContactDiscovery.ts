import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

interface Contact {
  name: string;
  phoneNumber: string;
}

interface DiscoveredUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  phone_number: string;
}

export function useContactDiscovery() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [discoveredUsers, setDiscoveredUsers] = useState<DiscoveredUser[]>([]);

  const normalizePhoneNumber = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length > 10) {
      return `+${digits}`;
    }
    return `+1${digits}`;
  };

  const requestContacts = async (): Promise<Contact[]> => {
    // Check if Contact Picker API is available
    if (!('contacts' in navigator && 'ContactsManager' in window)) {
      return [];
    }

    try {
      const props = ['name', 'tel'];
      const opts = { multiple: true };
      
      // @ts-expect-error Contact Picker API types
      const contacts = await navigator.contacts.select(props, opts);
      
      return contacts.map((contact: any) => ({
        name: contact.name?.[0] || 'Unknown',
        phoneNumber: contact.tel?.[0] || '',
      })).filter((c: Contact) => c.phoneNumber);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Contact access error:', error);
      }
      return [];
    }
  };

  const discoverFriends = async (contacts?: Contact[]): Promise<DiscoveredUser[]> => {
    if (!profile?.id) return [];
    
    setLoading(true);
    
    try {
      // Get contacts from device if not provided
      const contactList = contacts || await requestContacts();
      
      if (contactList.length === 0) {
        setDiscoveredUsers([]);
        return [];
      }

      // Normalize phone numbers for search
      const phoneNumbers = contactList
        .map(c => normalizePhoneNumber(c.phoneNumber))
        .filter(Boolean);

      // Search for users with matching verified phone numbers (server-side RPC,
      // never exposes raw phone_number to the client).
      const { data: users, error } = await (supabase
        .rpc('discover_users_by_phone', { _phones: phoneNumbers }) as any);

      if (error) throw error;

      const filtered = (users || []).filter((u: any) => u.id !== profile.id);
      setDiscoveredUsers(filtered);
      return filtered;
    } catch (error: any) {
      console.error('Error discovering contacts:', error);
      toast.error('Failed to search contacts');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const isContactPickerSupported = () => {
    return 'contacts' in navigator && 'ContactsManager' in window;
  };

  return {
    loading,
    discoveredUsers,
    discoverFriends,
    isContactPickerSupported,
    requestContacts,
  };
}
