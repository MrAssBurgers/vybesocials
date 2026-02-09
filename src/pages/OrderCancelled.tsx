import { motion } from 'framer-motion';
import { XCircle, ArrowLeft, MessageCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

export default function OrderCancelled() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-destructive/5">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="liquid-glass-card overflow-hidden">
          <CardContent className="p-8 text-center space-y-6">
            {/* Cancelled Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center"
            >
              <XCircle className="h-10 w-10 text-muted-foreground" />
            </motion.div>

            {/* Message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Payment Cancelled</h1>
              <p className="text-muted-foreground">
                Your payment was cancelled. No charges were made to your account.
              </p>
            </div>

            {/* Info */}
            <div className="p-4 rounded-xl bg-muted/50">
              <p className="text-sm text-muted-foreground">
                The offer is still available if you'd like to try again.
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button 
                className="w-full gap-2"
                onClick={() => navigate('/messages')}
              >
                <MessageCircle className="h-4 w-4" />
                Return to Messages
              </Button>

              <Button 
                variant="outline"
                className="w-full gap-2"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
