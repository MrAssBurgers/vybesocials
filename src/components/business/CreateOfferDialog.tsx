import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, Clock, RefreshCw, Send, X, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';

interface CreateOfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  recipientId: string;
  businessId: string;
  senderId: string;
  onOfferCreated?: (offer: any) => void;
}

export function CreateOfferDialog({
  open,
  onOpenChange,
  conversationId,
  recipientId,
  businessId,
  senderId,
  onOfferCreated,
}: CreateOfferDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    deliveryDays: '3',
    revisions: '1',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.price) {
      toast.error('Please fill in title and price');
      return;
    }

    setLoading(true);
    try {
      // Create the offer
      const { data: offer, error: offerError } = await db
        .from('business_offers')
        .insert({
          conversation_id: conversationId,
          business_id: businessId,
          sender_id: senderId,
          recipient_id: recipientId,
          title: formData.title,
          description: formData.description || null,
          price: parseFloat(formData.price),
          delivery_days: parseInt(formData.deliveryDays) || 3,
          revisions: parseInt(formData.revisions) || 1,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        })
        .select()
        .single();

      if (offerError) throw offerError;

      // Send a message with the offer
      const { error: msgError } = await db
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          content: `📦 **Custom Offer**\n\n**${formData.title}**\n${formData.description || ''}\n\n💰 **$${formData.price}**\n⏱️ ${formData.deliveryDays} day delivery\n🔄 ${formData.revisions} revision${parseInt(formData.revisions) > 1 ? 's' : ''}\n\n_This offer expires in 7 days_`,
          media_type: 'offer',
          media_url: offer.id,
        });

      if (msgError) throw msgError;

      toast.success('Offer sent successfully!');
      onOfferCreated?.(offer);
      onOpenChange(false);
      setFormData({ title: '', description: '', price: '', deliveryDays: '3', revisions: '1' });
    } catch (err: any) {
      toast.error(err.message || 'Failed to send offer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Create Custom Offer
          </DialogTitle>
          <DialogDescription>
            Send a custom pricing offer to this customer
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Offer Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Logo Design Package"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what's included in this offer..."
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="price" className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Price *
              </Label>
              <Input
                id="price"
                type="number"
                min="1"
                step="0.01"
                placeholder="99.00"
                value={formData.price}
                onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="delivery" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Delivery
              </Label>
              <Input
                id="delivery"
                type="number"
                min="1"
                placeholder="3"
                value={formData.deliveryDays}
                onChange={(e) => setFormData(prev => ({ ...prev, deliveryDays: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="revisions" className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                Revisions
              </Label>
              <Input
                id="revisions"
                type="number"
                min="0"
                placeholder="1"
                value={formData.revisions}
                onChange={(e) => setFormData(prev => ({ ...prev, revisions: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 gap-2">
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Offer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
