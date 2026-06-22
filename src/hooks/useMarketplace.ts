import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

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
      const { data, error } = await db
        .from('listings')
        .select('*')
        .limit(200);

      if (error) throw error;
      let rows = ((data as Listing[]) || []).filter(
        (l) => !l.status || l.status === 'available' || l.status === 'active',
      );

      if (filters?.category) {
        rows = rows.filter((l) => l.category === filters.category);
      }
      if (filters?.condition) {
        rows = rows.filter((l) => l.condition === filters.condition);
      }
      if (filters?.minPrice !== undefined) {
        rows = rows.filter((l) => l.price >= (filters.minPrice as number));
      }
      if (filters?.maxPrice !== undefined) {
        rows = rows.filter((l) => l.price <= (filters.maxPrice as number));
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        rows = rows.filter(
          (l) =>
            l.title?.toLowerCase().includes(q) ||
            l.description?.toLowerCase().includes(q),
        );
      }

      rows.sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
      rows = rows.slice(0, 100);

      const sellerIds = [...new Set(rows.map((r) => r.seller_id).filter(Boolean))];
      const sellerMap = new Map<string, Listing['seller']>();
      for (let i = 0; i < sellerIds.length; i += 10) {
        const chunk = sellerIds.slice(i, i + 10);
        const { data: sellers } = await db
          .from('profiles')
          .select('id, username, avatar_url, is_verified')
          .in('id', chunk);
        for (const s of sellers || []) {
          sellerMap.set(s.id, s as Listing['seller']);
        }
      }

      return rows.map((row) => ({
        ...row,
        seller: sellerMap.get(row.seller_id) || undefined,
      }));
    },
    networkMode: 'always',
    placeholderData: (prev) => prev,
  });
}

export function useListing(id: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: async () => {
      const { data, error } = await db
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
  const profileId = useAuthProfileId();
  
  return useQuery({
    queryKey: ['my-listings', profileId],
    queryFn: async () => {
      if (!profileId) return [];
      
      const { data, error } = await db
        .from('listings')
        .select('*')
        .eq('seller_id', profileId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Listing[];
    },
    enabled: !!profileId,
    networkMode: 'always',
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (listing: Omit<Listing, 'id' | 'seller_id' | 'created_at' | 'updated_at' | 'view_count' | 'seller'>) => {
      if (!profile) throw new Error('Not authenticated');

      const { data, error } = await db
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
      const { data, error } = await db
        .from('listings')
        .update(updates as never)
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
      const { data, error } = await db
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
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['listing-favorites', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data: favRows, error: favError } = await db
        .from('listing_favorites')
        .select('listing_id')
        .eq('user_id', profileId);

      if (favError) throw favError;

      const listingIds = [
        ...new Set(
          (favRows || [])
            .map((row) => row.listing_id as string)
            .filter(Boolean),
        ),
      ];
      if (!listingIds.length) return [];

      const listings: Listing[] = [];
      for (let i = 0; i < listingIds.length; i += 10) {
        const chunk = listingIds.slice(i, i + 10);
        const { data: rows, error } = await db
          .from('listings')
          .select('*')
          .in('id', chunk);
        if (error) throw error;
        if (rows?.length) listings.push(...(rows as Listing[]));
      }

      const sellerIds = [...new Set(listings.map((r) => r.seller_id).filter(Boolean))];
      const sellerMap = new Map<string, Listing['seller']>();
      for (let i = 0; i < sellerIds.length; i += 10) {
        const chunk = sellerIds.slice(i, i + 10);
        const { data: sellers } = await db
          .from('profiles')
          .select('id, username, avatar_url, is_verified')
          .in('id', chunk);
        for (const s of sellers || []) {
          sellerMap.set(s.id, s as Listing['seller']);
        }
      }

      return listings.map((row) => ({
        ...row,
        seller: sellerMap.get(row.seller_id) || undefined,
      }));
    },
    enabled: !!profileId,
    networkMode: 'always',
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ listingId, isFavorite }: { listingId: string; isFavorite: boolean }) => {
      if (!profile) throw new Error('Sign in to save favorites');

      if (isFavorite) {
        const { error } = await db
          .from('listing_favorites')
          .delete()
          .eq('user_id', profile.id)
          .eq('listing_id', listingId);
        if (error) throw error;
      } else {
        const { error } = await db
          .from('listing_favorites')
          .insert({ user_id: profile.id, listing_id: listingId });
        if (error && !/duplicate|already exists|23505/i.test(error.message || '')) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listing-favorites'] });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Could not update favorite';
      toast.error(msg);
    },
  });
}

export function useSellerRating(sellerId: string) {
  return useQuery({
    queryKey: ['seller-rating', sellerId],
    queryFn: async () => {
      const { data, error } = await db
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
