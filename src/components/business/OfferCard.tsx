import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Package, DollarSign, Clock, RefreshCw, Check, X, 
  AlertCircle, CheckCircle2, XCircle, Loader2, CreditCard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { getPaymentClientContext, openCheckoutUrl } from '@/lib/platformPayments';

interface OfferCardProps {
  offer: {
    id: string;
    title: string;
    description?: string;
    price: number;
    delivery_days: number;
    revisions: number;
    status: string;
    expires_at?: string;
    created_at: string;
    sender_id: string;
    recipient_id: string;
    business_id: string;
  };
  currentProfileId: string;
  onStatusChange?: () => void;
}

export function OfferCard({ offer, currentProfileId, onStatusChange }: OfferCardProps) {
  const [loading, setLoading] = useState(false);
  const isRecipient = currentProfileId === offer.recipient_id;
  const isSender = currentProfileId === offer.sender_id;
  const isPending = offer.status === 'pending';
  const isExpired = offer.expires_at && new Date(offer.expires_at) < new Date();

  const handleAcceptAndPay = async () => {
    setLoading(true);
    try {
      // Create checkout session for this offer
      const { data, error } = await supabase.functions.invoke('create-business-checkout', {
        body: {
          businessId: offer.business_id,
          offerId: offer.id,
          items: [
            {
              title: offer.title,
              description: offer.description,
              price: offer.price,
              quantity: 1,
            }
          ],
          ...getPaymentClientContext(),
        }
      });

      if (error) throw error;
      if (!data?.url) throw new Error('No checkout URL returned');

      // Update offer status to accepted
      await supabase
        .from('business_offers')
        .update({ 
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', offer.id);

      toast.success('Redirecting to payment...');
      
      // Open the platform-aware checkout so mobile wallets stay in the app shell.
      openCheckoutUrl(data.url);
      onStatusChange?.();
    } catch (err: any) {
      console.error('Checkout error:', err);
      toast.error(err.message || 'Failed to process payment');
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('business_offers')
        .update({ 
          status: 'declined',
          declined_at: new Date().toISOString()
        })
        .eq('id', offer.id);

      if (error) throw error;
      toast.info('Offer declined');
      onStatusChange?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to decline offer');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('business_offers')
        .update({ status: 'cancelled' })
        .eq('id', offer.id);

      if (error) throw error;
      toast.info('Offer withdrawn');
      onStatusChange?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to withdraw offer');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = () => {
    const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
      pending: { color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30', icon: AlertCircle, label: 'Pending' },
      accepted: { color: 'bg-green-500/20 text-green-500 border-green-500/30', icon: CheckCircle2, label: 'Accepted' },
      declined: { color: 'bg-red-500/20 text-red-500 border-red-500/30', icon: XCircle, label: 'Declined' },
      expired: { color: 'bg-muted text-muted-foreground border-muted', icon: Clock, label: 'Expired' },
      completed: { color: 'bg-primary/20 text-primary border-primary/30', icon: Check, label: 'Completed' },
      cancelled: { color: 'bg-muted text-muted-foreground border-muted', icon: X, label: 'Cancelled' },
    };

    const status = isExpired && offer.status === 'pending' ? 'expired' : offer.status;
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant="outline" className={`${config.color} gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm"
    >
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Package className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Custom Offer</p>
                <h4 className="font-semibold text-sm">{offer.title}</h4>
              </div>
            </div>
            {getStatusBadge()}
          </div>

          {/* Description */}
          {offer.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {offer.description}
            </p>
          )}

          {/* Details */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-background/50">
              <DollarSign className="h-4 w-4 mx-auto text-green-500 mb-1" />
              <p className="font-bold text-sm">${offer.price}</p>
              <p className="text-[10px] text-muted-foreground">Price</p>
            </div>
            <div className="p-2 rounded-lg bg-background/50">
              <Clock className="h-4 w-4 mx-auto text-blue-500 mb-1" />
              <p className="font-bold text-sm">{offer.delivery_days}</p>
              <p className="text-[10px] text-muted-foreground">Days</p>
            </div>
            <div className="p-2 rounded-lg bg-background/50">
              <RefreshCw className="h-4 w-4 mx-auto text-purple-500 mb-1" />
              <p className="font-bold text-sm">{offer.revisions}</p>
              <p className="text-[10px] text-muted-foreground">Revisions</p>
            </div>
          </div>

          {/* Expiry */}
          {offer.expires_at && isPending && !isExpired && (
            <p className="text-xs text-muted-foreground text-center">
              Expires {formatDistanceToNow(new Date(offer.expires_at), { addSuffix: true })}
            </p>
          )}

          {/* Actions */}
          {isPending && !isExpired && (
            <div className="flex gap-2 pt-2">
              {isRecipient && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleDecline}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-1 gradient-animated"
                    onClick={handleAcceptAndPay}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    Pay ${offer.price}
                  </Button>
                </>
              )}
              {isSender && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleWithdraw}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Withdraw Offer'}
                </Button>
              )}
            </div>
          )}

          {/* Accepted status - show payment info */}
          {offer.status === 'accepted' && (
            <div className="pt-2 text-center">
              <p className="text-xs text-green-500">
                ✓ Payment received - Work in progress
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
