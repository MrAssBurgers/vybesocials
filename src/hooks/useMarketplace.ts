import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  price: number;
  category: string;
  condition: string;
  location: string | null;
  images: string[];
  status: string;
  view_count: number;
  created_at: string;
  updated_at: string;
  seller?: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

export const LISTING_CATEGORIES = [
  { value: 'electronics', label: 'Electronics', icon: '📱' },
  { value: 'fashion', label: 'Fashion', icon: '👕' },
  { value: 'gaming', label: 'Gaming', icon: '🎮' },
  { value: 'home', label: 'Home', icon: '🏠' },
  { value: 'vehicles', label: 'Vehicles', icon: '🚗' },
  { value: 'services', label: 'Services', icon: '🔧' },
  { value: 'free', label: 'Free', icon: '🎁' },
];

export const LISTING_CONDITIONS = [
  { value: 'new', label: 'New' },
  { value: 'like-new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'used', label: 'Used' },
];

interface ListingsFilters {
  category?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
}

export function useListings(filters?: ListingsFilters) {
  return useQuery({
    queryKey: ['listings', filters],
    queryFn: async () => {
      let query = supabase
        .from('listings')
        .select(`
          *,
          seller:profiles!seller_id (
            id,
            username,
            avatar_url,
            is_verified
          )
        `)
        .eq('status', 'available')
        .order('created_at', { ascending: false });

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }
      if (filters?.condition) {
        query = query.eq('condition', filters.condition);
      }
      if (filters?.minPrice !== undefined) {
        query = query.gte('price', filters.minPrice);
      }
      if (filters?.maxPrice !== undefined) {
        query = query.lte('price', filters.maxPrice);
      }
      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Listing[];
    },
  });
}

export function useListing(id: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(`
          *,
          seller:profiles!seller_id (
            id,
            username,
            avatar_url,
            is_verified
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Listing;
    },
    enabled: !!id,
  });
}

export function useMyListings() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['my-listings', profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('seller_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Listing[];
    },
    enabled: !!profile,
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (listing: Omit<Listing, 'id' | 'seller_id' | 'created_at' | 'updated_at' | 'view_count' | 'seller'>) => {
      if (!profile) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('listings')
        .insert({
          ...listing,
          seller_id: profile.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
    },
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Listing> & { id: string }) => {
      const { data, error } = await supabase
        .from('listings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['listing', data.id] });
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
    },
  });
}

export function useDeleteListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('listings')
        .delete()
        .eq('id', id)
        .select('id');

      if (error) throw error;

      // If RLS prevents deletion, PostgREST returns 204 and data will be empty.
      if (!data || data.length === 0) {
        throw new Error('Not allowed to delete this listing');
      }

      return data[0];
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      queryClient.invalidateQueries({ queryKey: ['listing', id] });
    },
  });
}

export function useListingFavorites() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['listing-favorites', profile?.id],
    queryFn: async () => {
      if (!profile) return [];

      const { data, error } = await supabase
        .from('listing_favorites')
        .select(`
          id,
          listing:listings (
            *,
            seller:profiles!seller_id (
              id,
              username,
              avatar_url,
              is_verified
            )
          )
        `)
        .eq('user_id', profile.id);

      if (error) throw error;
      return data.map(d => d.listing) as Listing[];
    },
    enabled: !!profile,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ listingId, isFavorite }: { listingId: string; isFavorite: boolean }) => {
      if (!profile) throw new Error('Not authenticated');

      if (isFavorite) {
        const { error } = await supabase
          .from('listing_favorites')
          .delete()
          .eq('user_id', profile.id)
          .eq('listing_id', listingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('listing_favorites')
          .insert({ user_id: profile.id, listing_id: listingId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listing-favorites'] });
    },
  });
}

export function useSellerRating(sellerId: string) {
  return useQuery({
    queryKey: ['seller-rating', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seller_ratings')
        .select('rating')
        .eq('seller_id', sellerId);

      if (error) throw error;
      
      if (!data || data.length === 0) return { average: 0, count: 0 };
      
      const sum = data.reduce((acc, r) => acc + r.rating, 0);
      return { average: sum / data.length, count: data.length };
    },
    enabled: !!sellerId,
  });
}
