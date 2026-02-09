import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Package, ArrowRight, MessageCircle, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function OrderSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/messages');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="liquid-glass-card overflow-hidden">
          <CardContent className="p-8 text-center space-y-6">
            {/* Success Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center"
            >
              <CheckCircle2 className="h-10 w-10 text-green-500" />
            </motion.div>

            {/* Message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Payment Successful!</h1>
              <p className="text-muted-foreground">
                Your order has been placed. The seller has been notified and will start working on your request.
              </p>
            </div>

            {/* Order Info */}
            <div className="p-4 rounded-xl bg-muted/50 space-y-2">
              <div className="flex items-center justify-center gap-2 text-sm">
                <Package className="h-4 w-4 text-primary" />
                <span>Order confirmed</span>
              </div>
              {sessionId && (
                <p className="text-xs text-muted-foreground font-mono">
                  Session: {sessionId.slice(0, 20)}...
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button 
                className="w-full gap-2 gradient-animated"
                onClick={() => navigate('/messages')}
              >
                <MessageCircle className="h-4 w-4" />
                View Messages
                <ArrowRight className="h-4 w-4" />
              </Button>

              <Button 
                variant="outline"
                className="w-full"
                onClick={() => navigate('/')}
              >
                <Home className="h-4 w-4 mr-2" />
                Back to Home
              </Button>

              <p className="text-xs text-muted-foreground">
                Redirecting to messages in {countdown}s...
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
