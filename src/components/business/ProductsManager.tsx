import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Package, Edit, Trash2, MoreVertical, Eye, EyeOff, Star, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMyBusinessProducts, useDeleteProduct, useUpdateProduct, BusinessProduct } from '@/hooks/useBusiness';
import { CreateProductDialog } from './CreateProductDialog';

export function ProductsManager() {
  const { data: products, isLoading } = useMyBusinessProducts();
  const deleteProduct = useDeleteProduct();
  const updateProduct = useUpdateProduct();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<BusinessProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<BusinessProduct | null>(null);

  const handleToggleActive = (product: BusinessProduct) => {
    updateProduct.mutate({
      id: product.id,
      is_active: !product.is_active,
    });
  };

  const handleToggleFeatured = (product: BusinessProduct) => {
    updateProduct.mutate({
      id: product.id,
      is_featured: !product.is_featured,
    });
  };

  const handleDelete = () => {
    if (deletingProduct) {
      deleteProduct.mutate(deletingProduct.id);
      setDeletingProduct(null);
    }
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
        <CardTitle>Products</CardTitle>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </CardHeader>
      <CardContent>
        {!products || products.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">No products yet</h3>
            <p className="text-muted-foreground mb-4">Add your first product to start selling</p>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {products.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                  className="relative group"
                >
                  <Card className={`overflow-hidden ${!product.is_active && 'opacity-60'}`}>
                    {/* Product Image */}
                    <div className="aspect-square relative bg-muted">
                      {product.images?.[0] ? (
                        <img
                          src={product.images[0]}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-12 w-12 text-muted-foreground" />
                        </div>
                      )}
                      
                      {/* Badges */}
                      <div className="absolute top-2 left-2 flex gap-1">
                        {product.is_featured && (
                          <Badge className="bg-yellow-500">
                            <Star className="h-3 w-3 mr-1 fill-white" />
                            Featured
                          </Badge>
                        )}
                        {!product.is_active && (
                          <Badge variant="secondary">Hidden</Badge>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="absolute top-2 right-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="secondary" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingProduct(product)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleActive(product)}>
                              {product.is_active ? (
                                <>
                                  <EyeOff className="h-4 w-4 mr-2" />
                                  Hide
                                </>
                              ) : (
                                <>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Show
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleFeatured(product)}>
                              <Star className={`h-4 w-4 mr-2 ${product.is_featured && 'fill-current'}`} />
                              {product.is_featured ? 'Unfeature' : 'Feature'}
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => setDeletingProduct(product)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Product Info */}
                    <CardContent className="p-4">
                      <h3 className="font-semibold truncate">{product.title}</h3>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-lg font-bold text-primary">
                          ${product.price.toFixed(2)}
                        </span>
                        {product.compare_at_price && product.compare_at_price > product.price && (
                          <span className="text-sm text-muted-foreground line-through">
                            ${product.compare_at_price.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <span>{product.inventory_count} in stock</span>
                        <span>•</span>
                        <span>{product.sold_count} sold</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </CardContent>

      <CreateProductDialog
        open={showCreateDialog || !!editingProduct}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditingProduct(null);
          }
        }}
        editingProduct={editingProduct}
      />

      <AlertDialog open={!!deletingProduct} onOpenChange={() => setDeletingProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingProduct?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
