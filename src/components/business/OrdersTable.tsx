import { useState } from 'react';
import { format } from 'date-fns';
import { 
  Package, Clock, CheckCircle2, XCircle, Truck, 
  Eye, MoreVertical, Loader2 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBusinessOrders, useUpdateOrderStatus, BusinessOrder } from '@/hooks/useBusiness';

const ORDER_STATUSES = [
  { value: 'pending', label: 'Pending', icon: Clock, color: 'text-yellow-500' },
  { value: 'processing', label: 'Processing', icon: Package, color: 'text-blue-500' },
  { value: 'shipped', label: 'Shipped', icon: Truck, color: 'text-purple-500' },
  { value: 'delivered', label: 'Delivered', icon: CheckCircle2, color: 'text-green-500' },
  { value: 'cancelled', label: 'Cancelled', icon: XCircle, color: 'text-destructive' },
];

export function OrdersTable() {
  const { data: orders, isLoading } = useBusinessOrders();
  const updateStatus = useUpdateOrderStatus();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredOrders = orders?.filter(order => 
    statusFilter === 'all' || order.status === statusFilter
  );

  const getStatusBadge = (status: string) => {
    const config = ORDER_STATUSES.find(s => s.value === status);
    if (!config) return <Badge variant="secondary">{status}</Badge>;
    
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={`gap-1 ${config.color}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleStatusChange = (orderId: string, newStatus: string) => {
    updateStatus.mutate({ orderId, status: newStatus });
  };

  if (isLoading) {
    return (
      <Card className="liquid-glass-card">
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="liquid-glass-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Orders</CardTitle>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            {ORDER_STATUSES.map(status => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!filteredOrders || filteredOrders.length === 0 ? (
          <EmptyState
            icon={<Package className="h-12 w-12 text-muted-foreground" />}
            title="No orders yet"
            description="Orders will appear here once customers start purchasing"
          />
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                className="flex flex-col md:flex-row md:items-center gap-4 p-4 rounded-lg bg-muted/50 border border-border/50"
              >
                {/* Order Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-medium">{order.order_number}</span>
                    {getStatusBadge(order.status)}
                    <Badge variant={order.payment_status === 'paid' ? 'default' : 'secondary'}>
                      {order.payment_status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={order.customer?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {order.customer?.username?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span>{order.customer?.username}</span>
                    </div>
                    <span>•</span>
                    <span>{order.items.length} items</span>
                    <span>•</span>
                    <span>{format(new Date(order.created_at), 'MMM d, yyyy')}</span>
                  </div>
                </div>

                {/* Order Total */}
                <div className="text-right md:text-left">
                  <p className="text-lg font-bold">${order.total.toFixed(2)}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Select
                    value={order.status}
                    onValueChange={(value) => handleStatusChange(order.id, value)}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_STATUSES.map(status => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
