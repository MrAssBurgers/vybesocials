-- Make media bucket public so listing images can be viewed
UPDATE storage.buckets SET public = true WHERE id = 'media';

-- Create marketplace payment methods table
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('paypal', 'venmo', 'cashapp')),
  handle TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, type)
);

-- Create marketplace orders table
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'completed', 'cancelled', 'disputed')),
  payment_type TEXT CHECK (payment_type IN ('paypal', 'venmo', 'cashapp', 'platform')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order events table for tracking order history
CREATE TABLE IF NOT EXISTS public.order_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

-- Payment methods policies
CREATE POLICY "Users can view their own payment methods"
ON public.payment_methods FOR SELECT
USING (user_id = public.current_profile_id());

CREATE POLICY "Users can view enabled payment methods of sellers"
ON public.payment_methods FOR SELECT
USING (is_enabled = true);

CREATE POLICY "Users can create their own payment methods"
ON public.payment_methods FOR INSERT
WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "Users can update their own payment methods"
ON public.payment_methods FOR UPDATE
USING (user_id = public.current_profile_id());

CREATE POLICY "Users can delete their own payment methods"
ON public.payment_methods FOR DELETE
USING (user_id = public.current_profile_id());

-- Orders policies
CREATE POLICY "Users can view their own orders"
ON public.orders FOR SELECT
USING (buyer_id = public.current_profile_id() OR seller_id = public.current_profile_id());

CREATE POLICY "Buyers can create orders"
ON public.orders FOR INSERT
WITH CHECK (buyer_id = public.current_profile_id());

CREATE POLICY "Participants can update orders"
ON public.orders FOR UPDATE
USING (buyer_id = public.current_profile_id() OR seller_id = public.current_profile_id());

-- Order events policies
CREATE POLICY "Participants can view order events"
ON public.order_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o 
    WHERE o.id = order_id 
    AND (o.buyer_id = public.current_profile_id() OR o.seller_id = public.current_profile_id())
  )
);

CREATE POLICY "Participants can create order events"
ON public.order_events FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o 
    WHERE o.id = order_id 
    AND (o.buyer_id = public.current_profile_id() OR o.seller_id = public.current_profile_id())
  )
);

-- Add triggers for updated_at
CREATE TRIGGER update_payment_methods_updated_at
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();