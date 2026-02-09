import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Store, Package, ShoppingCart, TrendingUp, Settings, Plus,
  DollarSign, Users, Star, Eye, BarChart3, ArrowUpRight,
  Loader2, AlertCircle, CheckCircle2, CreditCard, Wallet
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMyBusiness, useMyBusinessProducts, useBusinessOrders, BUSINESS_CATEGORIES } from '@/hooks/useBusiness';
import { useAuth } from '@/lib/auth';
import { CreateBusinessDialog } from '@/components/business/CreateBusinessDialog';
import { ProductsManager } from '@/components/business/ProductsManager';
import { OrdersTable } from '@/components/business/OrdersTable';
import { BusinessSettings } from '@/components/business/BusinessSettings';
import { PaymentsSetup } from '@/components/business/PaymentsSetup';

export default function BusinessPortal() {
  const { profile } = useAuth();
  const { data: business, isLoading: loadingBusiness } = useMyBusiness();
  const { data: products } = useMyBusinessProducts();
  const { data: orders } = useBusinessOrders();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  if (!profile) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <EmptyState
            icon={<Store className="h-12 w-12 text-muted-foreground" />}
            title="Sign in required"
            description="Please sign in to access the Business Portal"
          />
        </div>
      </AppLayout>
    );
  }

  if (loadingBusiness) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!business) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-8"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 mb-4">
              <Store className="h-10 w-10 text-primary" />
            </div>
            
            <div>
              <h1 className="text-3xl font-bold mb-2">Start Your Business on VYBE</h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                Create your business profile to sell products, accept payments, and grow your brand with the VYBE community.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
              <Card className="liquid-glass-card">
                <CardContent className="pt-6 text-center">
                  <Package className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-1">List Products</h3>
                  <p className="text-sm text-muted-foreground">
                    Add unlimited products with photos, pricing, and inventory
                  </p>
                </CardContent>
              </Card>

              <Card className="liquid-glass-card">
                <CardContent className="pt-6 text-center">
                  <CreditCard className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-1">Accept Payments</h3>
                  <p className="text-sm text-muted-foreground">
                    Secure payments via Stripe with instant payouts
                  </p>
                </CardContent>
              </Card>

              <Card className="liquid-glass-card">
                <CardContent className="pt-6 text-center">
                  <TrendingUp className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-1">Grow Your Brand</h3>
                  <p className="text-sm text-muted-foreground">
                    Reach the VYBE community and track your analytics
                  </p>
                </CardContent>
              </Card>
            </div>

            <Button 
              size="lg" 
              className="gradient-animated"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-5 w-5 mr-2" />
              Create Business Profile
            </Button>

            <p className="text-xs text-muted-foreground">
              By creating a business, you agree to our Terms of Service and Business Policies
            </p>
          </motion.div>

          <CreateBusinessDialog 
            open={showCreateDialog} 
            onOpenChange={setShowCreateDialog}
          />
        </div>
      </AppLayout>
    );
  }

  const category = BUSINESS_CATEGORIES.find(c => c.value === business.category);
  const totalRevenue = business.total_revenue || 0;
  const totalOrders = orders?.length || 0;
  const pendingOrders = orders?.filter(o => o.status === 'pending').length || 0;
  const activeProducts = products?.filter(p => p.is_active).length || 0;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Business Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="liquid-glass-card p-6 mb-6"
        >
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <Avatar className="h-20 w-20 rounded-xl">
              <AvatarImage src={business.logo_url || undefined} />
              <AvatarFallback className="text-2xl rounded-xl bg-primary/20">
                {business.name[0]}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold">{business.name}</h1>
                {business.is_verified && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mb-2">{business.description}</p>
              <div className="flex items-center gap-4 text-sm">
                {category && (
                  <Badge variant="outline">
                    {category.icon} {category.label}
                  </Badge>
                )}
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                  {business.rating_average.toFixed(1)} ({business.rating_count} reviews)
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Eye className="h-4 w-4" />
                  {business.view_count} views
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Link to={`/business/${business.slug}`}>
                <Button variant="outline" className="gap-2">
                  <Eye className="h-4 w-4" />
                  View Page
                </Button>
              </Link>
              {business.stripe_onboarding_complete && (
                <Badge variant="outline" className="bg-success/10 text-success border-success/30 h-9 px-3 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Payments Active
                </Badge>
              )}
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="liquid-glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="h-5 w-5 text-success" />
                <ArrowUpRight className="h-4 w-4 text-success" />
              </div>
              <p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
            </CardContent>
          </Card>

          <Card className="liquid-glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                {pendingOrders > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {pendingOrders} pending
                  </Badge>
                )}
              </div>
              <p className="text-2xl font-bold">{totalOrders}</p>
              <p className="text-sm text-muted-foreground">Total Orders</p>
            </CardContent>
          </Card>

          <Card className="liquid-glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Package className="h-5 w-5 text-accent" />
              </div>
              <p className="text-2xl font-bold">{activeProducts}</p>
              <p className="text-sm text-muted-foreground">Active Products</p>
            </CardContent>
          </Card>

          <Card className="liquid-glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <Users className="h-5 w-5 text-warning" />
              </div>
              <p className="text-2xl font-bold">{business.total_sales}</p>
              <p className="text-sm text-muted-foreground">Customers</p>
            </CardContent>
          </Card>
        </div>

        {/* Stripe Onboarding Alert */}
        {!business.stripe_onboarding_complete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6"
          >
            <Card className="border-warning/50 bg-warning/10">
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <AlertCircle className="h-6 w-6 text-warning" />
                  <div className="flex-1">
                    <p className="font-medium">Complete payment setup to start selling</p>
                    <p className="text-sm text-muted-foreground">
                      Go to the Payments tab to connect your Stripe account
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Main Tabs */}
        <Tabs defaultValue={!business.stripe_onboarding_complete ? "payments" : "products"} className="space-y-6">
          <TabsList className="liquid-glass w-full justify-start overflow-x-auto">
            <TabsTrigger value="products" className="gap-2">
              <Package className="h-4 w-4" />
              Products
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Orders
              {pendingOrders > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs">
                  {pendingOrders}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-2">
              <Wallet className="h-4 w-4" />
              Payments
              {!business.stripe_onboarding_complete && (
                <Badge variant="secondary" className="ml-1 text-xs bg-warning/20 text-warning">
                  Setup
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="products">
            <ProductsManager />
          </TabsContent>

          <TabsContent value="orders">
            <OrdersTable />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentsSetup 
              businessId={business.id}
              stripeAccountId={business.stripe_account_id}
              stripeOnboardingComplete={business.stripe_onboarding_complete}
            />
          </TabsContent>

          <TabsContent value="analytics">
            <Card className="liquid-glass-card">
              <CardHeader>
                <CardTitle>Analytics</CardTitle>
                <CardDescription>Track your business performance</CardDescription>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={<BarChart3 className="h-12 w-12 text-muted-foreground" />}
                  title="Coming Soon"
                  description="Detailed analytics will be available once you start making sales"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <BusinessSettings business={business} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
