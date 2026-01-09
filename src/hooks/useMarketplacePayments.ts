import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export type PaymentMethodType = 'paypal' | 'venmo' | 'cashapp';
export type OrderStatus = 'pending' | 'paid' | 'completed' | 'cancelled' | 'disputed';

export interface PaymentMethod {
  id: string;
  user_id: string;
  type: PaymentMethodType;
  handle: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  status: OrderStatus;
  payment_type: PaymentMethodType | 'platform' | null;
  created_at: string;
  updated_at: string;
  listing?: {
    id: string;
    title: string;
    images: string[] | null;
  };
  buyer?: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  seller?: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

export interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  actor_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

// Get user's payment methods
export function usePaymentMethods(userId?: string) {
  return useQuery({
    queryKey: ['payment-methods', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PaymentMethod[];
    },
    enabled: !!userId,
  });
}

// Get seller's enabled payment methods (for buyers to see)
export function useSellerPaymentMethods(sellerId?: string) {
  return useQuery({
    queryKey: ['seller-payment-methods', sellerId],
    queryFn: async () => {
      if (!sellerId) return [];
      
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', sellerId)
        .eq('is_enabled', true);

      if (error) throw error;
      return data as PaymentMethod[];
    },
    enabled: !!sellerId,
  });
}

// Create/update payment method
export function useSavePaymentMethod() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ type, handle, isEnabled = true }: { type: PaymentMethodType; handle: string; isEnabled?: boolean }) => {
      if (!profile) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('payment_methods')
        .upsert(
          {
            user_id: profile.id,
            type,
            handle,
            is_enabled: isEnabled,
          },
          { onConflict: 'user_id,type' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      toast.success('Payment method saved');
    },
    onError: () => {
      toast.error('Failed to save payment method');
    },
  });
}

// Delete payment method
export function useDeletePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payment_methods')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
      toast.success('Payment method removed');
    },
    onError: () => {
      toast.error('Failed to remove payment method');
    },
  });
}

// Get user's orders (as buyer or seller)
export function useOrders() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['orders', profile?.id],
    queryFn: async () => {
      if (!profile) return [];

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          listing:listings (id, title, images),
          buyer:profiles!buyer_id (id, username, avatar_url),
          seller:profiles!seller_id (id, username, avatar_url)
        `)
        .or(`buyer_id.eq.${profile.id},seller_id.eq.${profile.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Order[];
    },
    enabled: !!profile,
  });
}

// Get single order
export function useOrder(orderId?: string) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      if (!orderId) return null;

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          listing:listings (id, title, images),
          buyer:profiles!buyer_id (id, username, avatar_url),
          seller:profiles!seller_id (id, username, avatar_url)
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      return data as Order;
    },
    enabled: !!orderId,
  });
}

// Create order
export function useCreateOrder() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      listingId, 
      sellerId, 
      amount, 
      paymentType 
    }: { 
      listingId: string; 
      sellerId: string; 
      amount: number;
      paymentType: PaymentMethodType | 'platform';
    }) => {
      if (!profile) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('orders')
        .insert({
          listing_id: listingId,
          buyer_id: profile.id,
          seller_id: sellerId,
          amount,
          payment_type: paymentType,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      // Create order event
      await supabase.from('order_events').insert({
        order_id: data.id,
        event_type: 'order_created',
        actor_id: profile.id,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order created');
    },
    onError: () => {
      toast.error('Failed to create order');
    },
  });
}

// Update order status
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const { data, error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;

      // Create order event
      if (profile) {
        await supabase.from('order_events').insert({
          order_id: orderId,
          event_type: `status_${status}`,
          actor_id: profile.id,
        });
      }

      // If completed, update listing status
      if (status === 'completed') {
        await supabase
          .from('listings')
          .update({ status: 'sold' })
          .eq('id', data.listing_id);
      }

      return data;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      toast.success(`Order marked as ${status}`);
    },
    onError: () => {
      toast.error('Failed to update order');
    },
  });
}

// Get order events
export function useOrderEvents(orderId?: string) {
  return useQuery({
    queryKey: ['order-events', orderId],
    queryFn: async () => {
      if (!orderId) return [];

      const { data, error } = await supabase
        .from('order_events')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as OrderEvent[];
    },
    enabled: !!orderId,
  });
}

// Payment link generators
export function generatePaymentLink(type: PaymentMethodType, handle: string, amount: number): string {
  switch (type) {
    case 'paypal':
      // PayPal.me link
      return `https://paypal.me/${handle}/${amount}`;
    case 'venmo':
      // Venmo deep link (handle should not include @)
      const venmoHandle = handle.replace('@', '');
      return `https://venmo.com/${venmoHandle}?txn=pay&amount=${amount}`;
    case 'cashapp':
      // Cash App link (handle should include $)
      const cashTag = handle.startsWith('$') ? handle : `$${handle}`;
      return `https://cash.app/${cashTag}/${amount}`;
    default:
      return '';
  }
}
