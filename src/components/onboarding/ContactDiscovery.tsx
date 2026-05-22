import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Users, Phone, UserPlus, Loader2, CheckCircle, X } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSendFriendRequest, useFriendshipStatus } from '@/hooks/useFriends';

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

interface ContactDiscoveryProps {
  onComplete?: () => void;
}

export function ContactDiscovery({ onComplete }: ContactDiscoveryProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [discoveredUsers, setDiscoveredUsers] = useState<DiscoveredUser[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());

  const sendFriendRequest = useSendFriendRequest();

  const requestContactsPermission = async (): Promise<Contact[]> => {
    // Check if Contact Picker API is available
    if (!('contacts' in navigator && 'ContactsManager' in window)) {
      toast.error('Contact access not supported on this device. Try on mobile!');
      return [];
    }

    try {
      const props = ['name', 'tel'];
      const opts = { multiple: true };
      
      // @ts-ignore - Contact Picker API types
      const contacts = await navigator.contacts.select(props, opts);
      
      return contacts.map((contact: any) => ({
        name: contact.name?.[0] || 'Unknown',
        phoneNumber: contact.tel?.[0] || '',
      })).filter((c: Contact) => c.phoneNumber);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Contact access error:', error);
        toast.error('Could not access contacts');
      }
      return [];
    }
  };

  const normalizePhoneNumber = (phone: string): string => {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    // If it starts with country code, keep it; otherwise assume US
    if (digits.length > 10) {
      return `+${digits}`;
    }
    return `+1${digits}`;
  };

  const handleFindFriends = async () => {
    setLoading(true);
    setHasSearched(true);

    try {
      const contacts = await requestContactsPermission();
      
      if (contacts.length === 0) {
        setDiscoveredUsers([]);
        setLoading(false);
        return;
      }

      // Normalize phone numbers for search
      const phoneNumbers = contacts
        .map(c => normalizePhoneNumber(c.phoneNumber))
        .filter(Boolean);

      // Server-side phone lookup; raw phone numbers never returned to client.
      const { data: usersRaw, error } = await (supabase as any)
        .rpc('discover_users_by_phone', { _phones: phoneNumbers });

      if (error) throw error;

      const users = (usersRaw || []).filter((u: any) => u.id !== (profile?.id || ''));
      setDiscoveredUsers(users);

      if (users.length > 0) {
        toast.success(`Found ${users.length} friends on VYBE!`);
      } else {
        toast.info('No friends found. Invite them to join!');
      }
    } catch (error: any) {
      console.error('Error discovering contacts:', error);
      toast.error('Failed to search contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (userId: string) => {
    try {
      await sendFriendRequest.mutateAsync(userId);
      setSentRequests(prev => new Set(prev).add(userId));
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">Find Your Friends</h2>
        <p className="text-muted-foreground mt-2">
          See which of your contacts are already on VYBE
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {!hasSearched ? (
          <>
            {/* Feature explanation */}
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">How it works</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    We'll check your contacts against our users with verified phone numbers. 
                    Your contacts are never stored on our servers.
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={handleFindFriends}
              disabled={loading}
              className="w-full gradient-animated"
              size="lg"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Users className="w-4 h-4 mr-2" />
              )}
              Find Friends from Contacts
            </Button>
          </>
        ) : (
          <>
            {discoveredUsers.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  {discoveredUsers.length} friend{discoveredUsers.length > 1 ? 's' : ''} found!
                </p>
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {discoveredUsers.map((user) => (
                    <ContactUserCard
                      key={user.id}
                      user={user}
                      onAdd={() => handleAddFriend(user.id)}
                      isSent={sentRequests.has(user.id)}
                      isLoading={sendFriendRequest.isPending}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="font-medium">No friends found yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Invite your friends to join VYBE!
                </p>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleFindFriends}
                disabled={loading}
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Search Again'
                )}
              </Button>
              <Button
                onClick={onComplete}
                className="flex-1 gradient-animated"
              >
                Continue
              </Button>
            </div>
          </>
        )}

        <p className="text-center text-sm text-muted-foreground">
          You can skip this step and find friends later
        </p>
      </motion.div>
    </div>
  );
}

function ContactUserCard({ 
  user, 
  onAdd, 
  isSent,
  isLoading 
}: { 
  user: DiscoveredUser; 
  onAdd: () => void;
  isSent: boolean;
  isLoading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border"
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={user.avatar_url || undefined} />
        <AvatarFallback>
          {(user.display_name || user.username).charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">
          {user.display_name || user.username}
        </p>
        <p className="text-xs text-muted-foreground">@{user.username}</p>
      </div>
      
      <Button
        size="sm"
        variant={isSent ? "outline" : "default"}
        onClick={onAdd}
        disabled={isSent || isLoading}
        className={isSent ? "" : "gradient-animated"}
      >
        {isSent ? (
          <>
            <CheckCircle className="w-3 h-3 mr-1" />
            Sent
          </>
        ) : (
          <>
            <UserPlus className="w-3 h-3 mr-1" />
            Add
          </>
        )}
      </Button>
    </motion.div>
  );
}
