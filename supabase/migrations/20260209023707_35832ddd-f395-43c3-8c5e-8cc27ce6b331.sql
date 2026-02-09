-- Create business_offers table for Fiverr-style offers in chat
CREATE TABLE public.business_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  business_id UUID NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL,
  delivery_days INTEGER NOT NULL DEFAULT 3,
  revisions INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'completed', 'cancelled')),
  expires_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  declined_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.business_offers ENABLE ROW LEVEL SECURITY;

-- Create policies for business offers
CREATE POLICY "Users can view offers in their conversations"
ON public.business_offers
FOR SELECT
USING (
  sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR recipient_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Business owners can create offers"
ON public.business_offers
FOR INSERT
WITH CHECK (
  sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  AND business_id IN (
    SELECT id FROM business_profiles WHERE owner_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Offer participants can update offers"
ON public.business_offers
FOR UPDATE
USING (
  sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR recipient_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_business_offers_updated_at
BEFORE UPDATE ON public.business_offers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster queries
CREATE INDEX idx_business_offers_conversation ON public.business_offers(conversation_id);
CREATE INDEX idx_business_offers_business ON public.business_offers(business_id);
CREATE INDEX idx_business_offers_status ON public.business_offers(status);

-- Enable realtime for offers
ALTER PUBLICATION supabase_realtime ADD TABLE public.business_offers;