import { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Check, AlertCircle, CreditCard, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  useSellerPaymentMethods,
  useCreateOrder,
  useUpdateOrderStatus,
  generatePaymentLink,
  PaymentMethodType,
} from '@/hooks/useMarketplacePayments';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

interface PaymentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: {
    id: string;
    title: string;
    price: number;
    seller_id: string;
    seller?: {
      username: string;
    };
  };
}

const PAYMENT_METHOD_ICONS: Record<PaymentMethodType, string> = {
  paypal: '💳',
  venmo: '💵',
  cashapp: '💸',
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  paypal: 'PayPal',
  venmo: 'Venmo',
  cashapp: 'Cash App',
};

const PAYMENT_METHOD_COLORS: Record<PaymentMethodType, string> = {
  paypal: 'bg-blue-500',
  venmo: 'bg-cyan-500',
  cashapp: 'bg-green-500',
};

export function PaymentSheet({ open, onOpenChange, listing }: PaymentSheetProps) {
  const { profile } = useAuth();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType | null>(null);
  const [step, setStep] = useState<'select' | 'pay' | 'confirm'>('select');
  const [orderId, setOrderId] = useState<string | null>(null);

  const { data: paymentMethods, isLoading } = useSellerPaymentMethods(listing.seller_id);
  const createOrder = useCreateOrder();
  const updateOrderStatus = useUpdateOrderStatus();

  const selectedPaymentMethod = paymentMethods?.find(pm => pm.type === selectedMethod);

  const handleProceed = async () => {
    if (!selectedMethod || !profile) return;

    try {
      const order = await createOrder.mutateAsync({
        listingId: listing.id,
        sellerId: listing.seller_id,
        amount: listing.price,
        paymentType: selectedMethod,
      });
      setOrderId(order.id);
      setStep('pay');
    } catch {
      // Error handled by mutation
    }
  };

  const handleOpenPaymentApp = () => {
    if (!selectedPaymentMethod) return;

    const paymentLink = generatePaymentLink(
      selectedPaymentMethod.type,
      selectedPaymentMethod.handle,
      listing.price
    );

    window.open(paymentLink, '_blank');
    setStep('confirm');
  };

  const handleConfirmPayment = async () => {
    if (!orderId) return;

    try {
      await updateOrderStatus.mutateAsync({ orderId, status: 'paid' });
      toast.success('Payment marked as sent! Waiting for seller confirmation.');
      onOpenChange(false);
      resetState();
    } catch {
      // Error handled by mutation
    }
  };

  const resetState = () => {
    setSelectedMethod(null);
    setStep('select');
    setOrderId(null);
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetState();
      onOpenChange(isOpen);
    }}>
      <SheetContent side="bottom" className="h-auto max-h-[90vh] rounded-t-3xl">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {step === 'select' && 'Choose Payment Method'}
            {step === 'pay' && 'Complete Payment'}
            {step === 'confirm' && 'Confirm Payment'}
          </SheetTitle>
          <SheetDescription>
            {step === 'select' && `Pay ${listing.price === 0 ? 'Free' : `$${listing.price.toFixed(2)}`} for "${listing.title}"`}
            {step === 'pay' && 'Open the payment app to complete your payment'}
            {step === 'confirm' && 'Confirm once you have completed the payment'}
          </SheetDescription>
        </SheetHeader>

        {step === 'select' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading payment methods...</div>
            ) : paymentMethods && paymentMethods.length > 0 ? (
              <RadioGroup value={selectedMethod || ''} onValueChange={(v) => setSelectedMethod(v as PaymentMethodType)}>
                <div className="space-y-3">
                  {paymentMethods.map((method) => (
                    <motion.div
                      key={method.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <Label
                        htmlFor={method.id}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          selectedMethod === method.type 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <RadioGroupItem value={method.type} id={method.id} />
                        <span className="text-2xl">{PAYMENT_METHOD_ICONS[method.type]}</span>
                        <div className="flex-1">
                          <p className="font-semibold">{PAYMENT_METHOD_LABELS[method.type]}</p>
                          <p className="text-sm text-muted-foreground">{method.handle}</p>
                        </div>
                        <Badge className={`${PAYMENT_METHOD_COLORS[method.type]} text-white`}>
                          {PAYMENT_METHOD_LABELS[method.type]}
                        </Badge>
                      </Label>
                    </motion.div>
                  ))}
                </div>
              </RadioGroup>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Seller has not set up payment methods</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try messaging them to arrange payment
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                className="flex-1" 
                disabled={!selectedMethod || createOrder.isPending}
                onClick={handleProceed}
              >
                {createOrder.isPending ? 'Creating Order...' : 'Continue'}
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'pay' && selectedPaymentMethod && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="p-4 bg-muted rounded-xl text-center">
              <p className="text-3xl font-bold">${listing.price.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Send to: <span className="font-medium">{selectedPaymentMethod.handle}</span>
              </p>
            </div>

            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-500">Important</p>
                  <p className="text-muted-foreground">
                    Include the item name "{listing.title}" in your payment note for the seller to identify your payment.
                  </p>
                </div>
              </div>
            </div>

            <Button 
              className={`w-full ${PAYMENT_METHOD_COLORS[selectedPaymentMethod.type]} text-white hover:opacity-90`}
              size="lg"
              onClick={handleOpenPaymentApp}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open {PAYMENT_METHOD_LABELS[selectedPaymentMethod.type]}
            </Button>

            <Button variant="outline" className="w-full" onClick={() => setStep('select')}>
              Choose Different Method
            </Button>
          </motion.div>
        )}

        {step === 'confirm' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="p-6 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
              <Check className="h-12 w-12 mx-auto text-green-500 mb-3" />
              <p className="font-semibold text-lg">Did you complete the payment?</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click "I Paid" once you've sent ${listing.price.toFixed(2)} to the seller
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleOpenPaymentApp}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Reopen App
              </Button>
              <Button 
                className="flex-1 bg-green-500 hover:bg-green-600"
                onClick={handleConfirmPayment}
                disabled={updateOrderStatus.isPending}
              >
                <Check className="h-4 w-4 mr-2" />
                {updateOrderStatus.isPending ? 'Confirming...' : 'I Paid'}
              </Button>
            </div>

            <Button variant="ghost" className="w-full" onClick={() => {
              onOpenChange(false);
              resetState();
            }}>
              Cancel Order
            </Button>
          </motion.div>
        )}
      </SheetContent>
    </Sheet>
  );
}
