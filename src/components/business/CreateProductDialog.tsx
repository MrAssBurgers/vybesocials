import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Package, Upload, X } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { useCreateProduct, useUpdateProduct, BusinessProduct } from '@/hooks/useBusiness';

const productSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  price: z.number().min(0, 'Price must be positive'),
  compare_at_price: z.number().optional(),
  category: z.string().optional(),
  sku: z.string().optional(),
  inventory_count: z.number().min(0).default(0),
  is_digital: z.boolean().default(false),
  is_featured: z.boolean().default(false),
});

type ProductFormData = z.infer<typeof productSchema>;

interface CreateProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProduct?: BusinessProduct | null;
}

export function CreateProductDialog({ open, onOpenChange, editingProduct }: CreateProductDialogProps) {
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      title: '',
      description: '',
      price: 0,
      compare_at_price: undefined,
      category: '',
      sku: '',
      inventory_count: 0,
      is_digital: false,
      is_featured: false,
    },
  });

  useEffect(() => {
    if (editingProduct) {
      reset({
        title: editingProduct.title,
        description: editingProduct.description || '',
        price: editingProduct.price,
        compare_at_price: editingProduct.compare_at_price || undefined,
        category: editingProduct.category || '',
        sku: editingProduct.sku || '',
        inventory_count: editingProduct.inventory_count,
        is_digital: editingProduct.is_digital,
        is_featured: editingProduct.is_featured,
      });
    } else {
      reset({
        title: '',
        description: '',
        price: 0,
        compare_at_price: undefined,
        category: '',
        sku: '',
        inventory_count: 0,
        is_digital: false,
        is_featured: false,
      });
    }
  }, [editingProduct, reset]);

  const isDigital = watch('is_digital');
  const isFeatured = watch('is_featured');

  const onSubmit = async (data: ProductFormData) => {
    try {
      if (editingProduct) {
        await updateProduct.mutateAsync({ id: editingProduct.id, ...data });
      } else {
        await createProduct.mutateAsync(data);
      }
      onOpenChange(false);
      reset();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {editingProduct ? 'Edit Product' : 'Add New Product'}
          </DialogTitle>
          <DialogDescription>
            {editingProduct ? 'Update your product details' : 'Add a new product to your store'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Product Title *</Label>
            <Input
              id="title"
              placeholder="Product name"
              {...register('title')}
              className="liquid-glass-input"
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe your product..."
              {...register('description')}
              className="liquid-glass-input min-h-[100px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Price *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register('price', { valueAsNumber: true })}
                  className="liquid-glass-input pl-7"
                />
              </div>
              {errors.price && (
                <p className="text-sm text-destructive">{errors.price.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="compare_at_price">Compare at Price</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="compare_at_price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register('compare_at_price', { valueAsNumber: true })}
                  className="liquid-glass-input pl-7"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                placeholder="e.g. Electronics"
                {...register('category')}
                className="liquid-glass-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                placeholder="Product SKU"
                {...register('sku')}
                className="liquid-glass-input"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inventory_count">Inventory</Label>
            <Input
              id="inventory_count"
              type="number"
              min="0"
              placeholder="0"
              {...register('inventory_count', { valueAsNumber: true })}
              className="liquid-glass-input"
            />
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="is_digital">Digital Product</Label>
                <p className="text-sm text-muted-foreground">
                  No physical shipping required
                </p>
              </div>
              <Switch
                id="is_digital"
                checked={isDigital}
                onCheckedChange={(checked) => setValue('is_digital', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="is_featured">Featured Product</Label>
                <p className="text-sm text-muted-foreground">
                  Show prominently on your page
                </p>
              </div>
              <Switch
                id="is_featured"
                checked={isFeatured}
                onCheckedChange={(checked) => setValue('is_featured', checked)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="gradient-animated">
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingProduct ? 'Save Changes' : 'Add Product'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
