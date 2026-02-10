import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export interface BusinessProfile {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  category: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  social_links: Record<string, string>;
  business_hours: Record<string, any> | null;
  is_verified: boolean;
  is_active: boolean;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  total_sales: number;
  total_revenue: number;
  rating_average: number;
  rating_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  owner?: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

export interface BusinessProduct {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  images: string[];
  category: string | null;
  sku: string | null;
  inventory_count: number;
  is_digital: boolean;
  digital_file_url: string | null;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  is_active: boolean;
  is_featured: boolean;
  view_count: number;
  sold_count: number;
  created_at: string;
  updated_at: string;
  business?: BusinessProfile;
}

export interface BusinessOrder {
  id: string;
  order_number: string;
  business_id: string;
  customer_id: string;
  items: any[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  status: string;
  payment_status: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  shipping_address: Record<string, any> | null;
  tracking_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  business?: BusinessProfile;
  customer?: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

export const BUSINESS_CATEGORIES = [
  { value: 'retail', label: 'Retail', icon: '🛍️' },
  { value: 'food', label: 'Food & Beverage', icon: '🍔' },
  { value: 'services', label: 'Services', icon: '🔧' },
  { value: 'digital', label: 'Digital Products', icon: '💻' },
  { value: 'art', label: 'Art & Crafts', icon: '🎨' },
  { value: 'fashion', label: 'Fashion', icon: '👗' },
  { value: 'tech', label: 'Technology', icon: '📱' },
  { value: 'health', label: 'Health & Wellness', icon: '💊' },
  { value: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { value: 'other', label: 'Other', icon: '📦' },
];

// Get user's business profile
export function useMyBusiness() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['my-business', profile?.id],
    queryFn: async () => {
      if (!profile) return null;

      const { data, error } = await supabase
        .from('business_profiles_public')
        .select('*')
        .eq('owner_id', profile.id)
        .maybeSingle();

      if (error) throw error;
      return data as BusinessProfile | null;
    },
    enabled: !!profile,
  });
}

// Get business by slug
export function useBusinessBySlug(slug: string) {
  return useQuery({
    queryKey: ['business', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_profiles')
        .select(`
          id, owner_id, name, slug, description, category, location, website,
          logo_url, banner_url, business_hours, social_links, is_active, is_verified,
          rating_average, rating_count, total_sales, view_count,
          stripe_onboarding_complete, created_at, updated_at,
          owner:profiles!owner_id (
            id,
            username,
            avatar_url
          )
        `)
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      return data as BusinessProfile;
    },
    enabled: !!slug,
  });
}

// Get all businesses
export function useBusinesses(category?: string) {
  return useQuery({
    queryKey: ['businesses', category],
    queryFn: async () => {
      let query = supabase
        .from('business_profiles')
        .select(`
          id, owner_id, name, slug, description, category, location, website,
          logo_url, banner_url, business_hours, social_links, is_active, is_verified,
          rating_average, rating_count, total_sales, view_count,
          stripe_onboarding_complete, created_at, updated_at,
          owner:profiles!owner_id (
            id,
            username,
            avatar_url
          )
        `)
        .eq('is_active', true)
        .order('rating_average', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as BusinessProfile[];
    },
  });
}

// Create business profile
export function useCreateBusiness() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (business: Partial<BusinessProfile>) => {
      if (!profile) throw new Error('Not authenticated');

      const slug = business.name
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `biz-${Date.now()}`;

      const { data, error } = await supabase
        .from('business_profiles')
        .insert({
          name: business.name || '',
          slug,
          owner_id: profile.id,
          description: business.description,
          category: business.category,
          location: business.location,
          website: business.website,
          email: business.email,
          phone: business.phone,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-business'] });
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      toast.success('Business profile created!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create business');
    },
  });
}

// Update business profile
export function useUpdateBusiness() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BusinessProfile> & { id: string }) => {
      const { data, error } = await supabase
        .from('business_profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-business'] });
      queryClient.invalidateQueries({ queryKey: ['business', data.slug] });
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      toast.success('Business updated!');
    },
    onError: () => {
      toast.error('Failed to update business');
    },
  });
}

// Get business products
export function useBusinessProducts(businessId?: string) {
  return useQuery({
    queryKey: ['business-products', businessId],
    queryFn: async () => {
      if (!businessId) return [];

      const { data, error } = await supabase
        .from('business_products')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as BusinessProduct[];
    },
    enabled: !!businessId,
  });
}

// Get my business products
export function useMyBusinessProducts() {
  const { data: business } = useMyBusiness();

  return useQuery({
    queryKey: ['my-business-products', business?.id],
    queryFn: async () => {
      if (!business) return [];

      const { data, error } = await supabase
        .from('business_products')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as BusinessProduct[];
    },
    enabled: !!business,
  });
}

// Create product
export function useCreateProduct() {
  const queryClient = useQueryClient();
  const { data: business } = useMyBusiness();

  return useMutation({
    mutationFn: async (product: Partial<BusinessProduct>) => {
      if (!business) throw new Error('No business profile');

      const { data, error } = await supabase
        .from('business_products')
        .insert({
          title: product.title || '',
          price: product.price || 0,
          business_id: business.id,
          description: product.description,
          category: product.category,
          sku: product.sku,
          inventory_count: product.inventory_count,
          is_digital: product.is_digital,
          is_featured: product.is_featured,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-products'] });
      queryClient.invalidateQueries({ queryKey: ['my-business-products'] });
      toast.success('Product created!');
    },
    onError: () => {
      toast.error('Failed to create product');
    },
  });
}

// Update product
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BusinessProduct> & { id: string }) => {
      const { data, error } = await supabase
        .from('business_products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-products'] });
      queryClient.invalidateQueries({ queryKey: ['my-business-products'] });
      toast.success('Product updated!');
    },
    onError: () => {
      toast.error('Failed to update product');
    },
  });
}

// Delete product
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('business_products')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-products'] });
      queryClient.invalidateQueries({ queryKey: ['my-business-products'] });
      toast.success('Product deleted');
    },
    onError: () => {
      toast.error('Failed to delete product');
    },
  });
}

// Get business orders
export function useBusinessOrders() {
  const { data: business } = useMyBusiness();

  return useQuery({
    queryKey: ['business-orders', business?.id],
    queryFn: async () => {
      if (!business) return [];

      const { data, error } = await supabase
        .from('business_orders')
        .select(`
          *,
          customer:profiles!customer_id (
            id,
            username,
            avatar_url
          )
        `)
        .eq('business_id', business.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as BusinessOrder[];
    },
    enabled: !!business,
  });
}

// Get my orders (as customer)
export function useMyOrders() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['my-orders', profile?.id],
    queryFn: async () => {
      if (!profile) return [];

      const { data, error } = await supabase
        .from('business_orders')
        .select(`
          *,
          business:business_profiles_public!business_id (
            id,
            name,
            slug,
            logo_url
          )
        `)
        .eq('customer_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as BusinessOrder[];
    },
    enabled: !!profile,
  });
}

// Update order status
export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { data, error } = await supabase
        .from('business_orders')
        .update({ status })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-orders'] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      toast.success('Order updated');
    },
    onError: () => {
      toast.error('Failed to update order');
    },
  });
}
