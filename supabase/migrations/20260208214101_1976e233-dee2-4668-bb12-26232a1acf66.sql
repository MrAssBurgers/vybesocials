-- =============================================
-- BUSINESS PROFILES SYSTEM
-- Full-featured business pages for marketplace
-- =============================================

-- Business Profiles Table
CREATE TABLE public.business_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  category TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  social_links JSONB DEFAULT '{}',
  business_hours JSONB,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  stripe_account_id TEXT,
  stripe_onboarding_complete BOOLEAN DEFAULT false,
  total_sales INTEGER DEFAULT 0,
  total_revenue NUMERIC(10,2) DEFAULT 0,
  rating_average NUMERIC(2,1) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for business_profiles
CREATE POLICY "Anyone can view active business profiles"
  ON public.business_profiles FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can create their own business profile"
  ON public.business_profiles FOR INSERT
  WITH CHECK (owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own business profile"
  ON public.business_profiles FOR UPDATE
  USING (owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their own business profile"
  ON public.business_profiles FOR DELETE
  USING (owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Business Products Table (extension of listings for businesses)
CREATE TABLE public.business_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  compare_at_price NUMERIC(10,2),
  images TEXT[] DEFAULT '{}',
  category TEXT,
  sku TEXT,
  inventory_count INTEGER DEFAULT 0,
  is_digital BOOLEAN DEFAULT false,
  digital_file_url TEXT,
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  sold_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.business_products ENABLE ROW LEVEL SECURITY;

-- RLS Policies for business_products
CREATE POLICY "Anyone can view active business products"
  ON public.business_products FOR SELECT
  USING (is_active = true);

CREATE POLICY "Business owners can manage their products"
  ON public.business_products FOR ALL
  USING (
    business_id IN (
      SELECT id FROM public.business_profiles 
      WHERE owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Business Orders Table
CREATE TABLE public.business_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(10,2) NOT NULL,
  tax NUMERIC(10,2) DEFAULT 0,
  shipping NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  stripe_payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  shipping_address JSONB,
  tracking_number TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.business_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for business_orders
CREATE POLICY "Customers can view their own orders"
  ON public.business_orders FOR SELECT
  USING (customer_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Business owners can view their business orders"
  ON public.business_orders FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.business_profiles 
      WHERE owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Customers can create orders"
  ON public.business_orders FOR INSERT
  WITH CHECK (customer_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Business owners can update their orders"
  ON public.business_orders FOR UPDATE
  USING (
    business_id IN (
      SELECT id FROM public.business_profiles 
      WHERE owner_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Business Reviews Table
CREATE TABLE public.business_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.business_orders(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  content TEXT,
  images TEXT[] DEFAULT '{}',
  is_verified_purchase BOOLEAN DEFAULT false,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(business_id, reviewer_id, order_id)
);

-- Enable RLS
ALTER TABLE public.business_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for business_reviews
CREATE POLICY "Anyone can view business reviews"
  ON public.business_reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can create reviews for businesses they ordered from"
  ON public.business_reviews FOR INSERT
  WITH CHECK (reviewer_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own reviews"
  ON public.business_reviews FOR UPDATE
  USING (reviewer_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their own reviews"
  ON public.business_reviews FOR DELETE
  USING (reviewer_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Function to generate order number
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'VYBE-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));
END;
$$;

-- Trigger to set order number
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_order_number
  BEFORE INSERT ON public.business_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_number();

-- Function to update business rating
CREATE OR REPLACE FUNCTION public.update_business_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avg_rating NUMERIC(2,1);
  review_count INTEGER;
BEGIN
  SELECT AVG(rating)::NUMERIC(2,1), COUNT(*) INTO avg_rating, review_count
  FROM public.business_reviews
  WHERE business_id = COALESCE(NEW.business_id, OLD.business_id);
  
  UPDATE public.business_profiles
  SET 
    rating_average = COALESCE(avg_rating, 0),
    rating_count = review_count,
    updated_at = now()
  WHERE id = COALESCE(NEW.business_id, OLD.business_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trigger_update_business_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.business_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_business_rating();

-- Create indexes for performance
CREATE INDEX idx_business_profiles_owner ON public.business_profiles(owner_id);
CREATE INDEX idx_business_profiles_slug ON public.business_profiles(slug);
CREATE INDEX idx_business_profiles_category ON public.business_profiles(category);
CREATE INDEX idx_business_products_business ON public.business_products(business_id);
CREATE INDEX idx_business_products_category ON public.business_products(category);
CREATE INDEX idx_business_orders_business ON public.business_orders(business_id);
CREATE INDEX idx_business_orders_customer ON public.business_orders(customer_id);
CREATE INDEX idx_business_orders_status ON public.business_orders(status);
CREATE INDEX idx_business_reviews_business ON public.business_reviews(business_id);

-- Add updated_at trigger
CREATE TRIGGER update_business_profiles_updated_at
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_business_products_updated_at
  BEFORE UPDATE ON public.business_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_business_orders_updated_at
  BEFORE UPDATE ON public.business_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();