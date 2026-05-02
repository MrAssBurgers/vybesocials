import { motion } from 'framer-motion';
import { Coins, TrendingUp, ArrowUpRight, ArrowDownRight, Sparkles, ShoppingBag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTokenBalance, useTokenTransactions, TOKEN_RATES } from '@/hooks/useVybeTokens';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { WatchAndEarnCard } from '@/components/tokens/WatchAndEarnCard';
import { AppLayout } from '@/components/layout/AppLayout';

function TransactionItem({ amount, type, description, created_at }: {
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}) {
  const isEarning = amount > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center",
          isEarning ? "bg-emerald-500/20" : "bg-red-500/20"
        )}>
          {isEarning ? (
            <ArrowUpRight className="w-5 h-5 text-emerald-500" />
          ) : (
            <ArrowDownRight className="w-5 h-5 text-red-500" />
          )}
        </div>
        <div>
          <p className="font-medium text-sm">{description || type}</p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(created_at), { addSuffix: true })}
          </p>
        </div>
      </div>
      <span className={cn(
        "font-bold",
        isEarning ? "text-emerald-500" : "text-red-500"
      )}>
        {isEarning ? '+' : ''}{amount}
      </span>
    </motion.div>
  );
}

function EarnRate({ action, rate }: { action: string; rate: number }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground capitalize">{action.replace(/_/g, ' ')}</span>
      <span className="font-medium text-primary">+{rate} 💎</span>
    </div>
  );
}

export default function TokenWallet() {
  const { data: balance, isLoading: balanceLoading } = useTokenBalance();
  const { data: transactions = [], isLoading: txLoading } = useTokenTransactions();
  const navigate = useNavigate();

  const purchases = transactions.filter(tx => tx.transaction_type === 'purchase');

  return (
    <AppLayout>
      <div className="p-4">
        <div className="max-w-lg mx-auto space-y-6">
        {/* Balance Card */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6">
            <div className="text-center">
              <p className="text-muted-foreground text-sm mb-2">Your Balance</p>
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center justify-center gap-2"
              >
                <Coins className="w-8 h-8 text-primary" />
                <span className="text-5xl font-bold">
                  {balanceLoading ? '...' : (balance?.balance || 0).toLocaleString()}
                </span>
              </motion.div>
              <p className="text-primary font-medium mt-2">VYBE Tokens</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-border/30">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Lifetime Earned</p>
                <p className="text-lg font-semibold text-emerald-500">
                  {(balance?.lifetime_earned || 0).toLocaleString()}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Lifetime Spent</p>
                <p className="text-lg font-semibold text-orange-500">
                  {(balance?.lifetime_spent || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Watch & Earn — rewarded ads */}
        <WatchAndEarnCard />

        {/* Quick Actions */}
        <Button
          onClick={() => navigate('/marketplace')}
          className="w-full gradient-animated text-primary-foreground font-semibold h-12 rounded-xl"
        >
          <ShoppingBag className="h-5 w-5 mr-2" />
          Visit Token Shop
        </Button>

        {/* How to Earn */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              How to Earn
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/50">
            {Object.entries(TOKEN_RATES).map(([action, rate]) => (
              <EarnRate key={action} action={action} rate={rate} />
            ))}
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {txLoading ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No transactions yet. Start earning tokens!
              </p>
            ) : (
              <div>
                {transactions.map((tx) => (
                  <TransactionItem 
                    key={tx.id} 
                    amount={tx.amount}
                    type={tx.transaction_type}
                    description={tx.description}
                    created_at={tx.created_at}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Purchase History */}
        {purchases.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                Purchase History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {purchases.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  amount={tx.amount}
                  type={tx.transaction_type}
                  description={tx.description}
                  created_at={tx.created_at}
                />
              ))}
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </AppLayout>
  );
}
