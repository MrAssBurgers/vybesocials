import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Store, Upload } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateBusiness, BUSINESS_CATEGORIES } from '@/hooks/useBusiness';
import { toast } from 'sonner';

const businessSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  category: z.string().min(1, 'Please select a category'),
  location: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
});

type BusinessFormData = z.infer<typeof businessSchema>;

interface CreateBusinessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBusinessDialog({ open, onOpenChange }: CreateBusinessDialogProps) {
  const navigate = useNavigate();
  const createBusiness = useCreateBusiness();
  
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<BusinessFormData>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      name: '',
      description: '',
      category: '',
      location: '',
      website: '',
      email: '',
      phone: '',
    },
  });

  const category = watch('category');

  const onSubmit = async (data: BusinessFormData) => {
    try {
      await createBusiness.mutateAsync(data);
      onOpenChange(false);
      // Navigate to Business Portal after successful creation
      toast.success('Business created! Redirecting to your portal...');
      setTimeout(() => {
        navigate('/business');
      }, 500);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            Create Your Business
          </DialogTitle>
          <DialogDescription>
            Set up your business profile to start selling on VYBE
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Business Name *</Label>
            <Input
              id="name"
              placeholder="Your Business Name"
              {...register('name')}
              className="liquid-glass-input"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select value={category} onValueChange={(v) => setValue('category', v)}>
              <SelectTrigger className="liquid-glass-input">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.icon} {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="text-sm text-destructive">{errors.category.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Tell customers about your business..."
              {...register('description')}
              className="liquid-glass-input min-h-[100px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="City, State"
                {...register('location')}
                className="liquid-glass-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="(555) 123-4567"
                {...register('phone')}
                className="liquid-glass-input"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Business Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="contact@yourbusiness.com"
              {...register('email')}
              className="liquid-glass-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              placeholder="https://yourbusiness.com"
              {...register('website')}
              className="liquid-glass-input"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createBusiness.isPending} className="gradient-animated">
              {createBusiness.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Business
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
