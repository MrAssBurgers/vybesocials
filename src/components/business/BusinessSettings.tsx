import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Save, Upload, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useUpdateBusiness, BUSINESS_CATEGORIES, BusinessProfile } from '@/hooks/useBusiness';

const settingsSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

interface BusinessSettingsProps {
  business: BusinessProfile;
}

export function BusinessSettings({ business }: BusinessSettingsProps) {
  const updateBusiness = useUpdateBusiness();
  
  const { register, handleSubmit, setValue, watch, formState: { errors, isDirty } } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: business.name,
      description: business.description || '',
      category: business.category || '',
      location: business.location || '',
      website: business.website || '',
      email: business.email || '',
      phone: business.phone || '',
    },
  });

  const category = watch('category');

  const onSubmit = async (data: SettingsFormData) => {
    await updateBusiness.mutateAsync({ id: business.id, ...data });
  };

  return (
    <div className="space-y-6">
      {/* Profile Settings */}
      <Card className="liquid-glass-card">
        <CardHeader>
          <CardTitle>Business Profile</CardTitle>
          <CardDescription>Update your business information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Logo Section */}
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24 rounded-xl">
                <AvatarImage src={business.logo_url || undefined} />
                <AvatarFallback className="text-2xl rounded-xl bg-primary/20">
                  {business.name[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <Button type="button" variant="outline" className="gap-2 mb-2">
                  <Upload className="h-4 w-4" />
                  Upload Logo
                </Button>
                <p className="text-xs text-muted-foreground">
                  Recommended: 512x512px, PNG or JPG
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Business Name *</Label>
                <Input
                  id="name"
                  {...register('name')}
                  className="liquid-glass-input"
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={(v) => setValue('category', v, { shouldDirty: true })}>
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
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register('description')}
                className="liquid-glass-input min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  {...register('location')}
                  className="liquid-glass-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  {...register('phone')}
                  className="liquid-glass-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Business Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  className="liquid-glass-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  {...register('website')}
                  className="liquid-glass-input"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!isDirty || updateBusiness.isPending} className="gap-2">
                {updateBusiness.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions for your business</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <Trash2 className="h-4 w-4" />
                Delete Business
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your business profile, 
                  all products, and order history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground">
                  Delete Business
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
