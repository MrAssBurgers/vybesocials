import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Warning {
  id: string;
  reason: string;
  created_at: string;
  acknowledged: boolean;
}

export function WarningPopup() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: unacknowledgedWarning } = useQuery({
    queryKey: ['unacknowledged-warning', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data, error } = await db
        .from('user_warnings')
        .select('id, reason, created_at, acknowledged')
        .eq('user_id', profile.id)
        .eq('acknowledged', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching warnings:', error);
        return null;
      }
      return data as Warning | null;
    },
    enabled: !!profile?.id,
    refetchInterval: 30000,
  });

  const acknowledgeWarning = useMutation({
    mutationFn: async (warningId: string) => {
      const { error } = await db
        .from('user_warnings')
        .update({ 
          acknowledged: true, 
          acknowledged_at: new Date().toISOString() 
        })
        .eq('id', warningId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unacknowledged-warning'] });
    },
  });

  if (!unacknowledgedWarning) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      >
        <motion.div 
          initial={{ y: -50 }}
          animate={{ y: 0 }}
          className="relative w-full max-w-md overflow-hidden rounded-2xl border-2 border-yellow-500/50 bg-yellow-500 shadow-2xl shadow-yellow-500/30 pointer-events-auto"
        >
          {/* Animated background */}
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 via-yellow-500 to-amber-600" />
          
          {/* Warning stripes pattern */}
          <div className="absolute inset-0 opacity-10">
            <div 
              className="h-full w-full"
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, black 10px, black 20px)',
              }}
            />
          </div>
          
          {/* Content */}
          <div className="relative p-6 text-center">
            <motion.div
              animate={{ 
                rotate: [0, -10, 10, -10, 10, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                duration: 0.5,
                repeat: 3,
                repeatDelay: 2
              }}
              className="flex justify-center mb-4"
            >
              <div className="rounded-full bg-yellow-600/30 p-3">
                <AlertTriangle className="h-10 w-10 text-yellow-900" />
              </div>
            </motion.div>
            
            <h3 className="text-xl font-bold text-yellow-900">
              ⚠️ You Have Been Warned!
            </h3>
            
            <p className="mt-3 text-sm font-medium text-yellow-800 bg-yellow-600/20 rounded-lg p-3">
              {unacknowledgedWarning.reason}
            </p>
            
            <p className="mt-4 text-sm font-semibold text-yellow-900 bg-yellow-600/30 rounded-lg p-2">
              ⚠️ If you get 2 more warnings you will receive a temporary ban!
            </p>
            
            <p className="mt-3 text-xs text-yellow-700">
              Please follow our community guidelines to avoid further action.
            </p>
            
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                acknowledgeWarning.mutate(unacknowledgedWarning.id);
              }}
              disabled={acknowledgeWarning.isPending}
              className="mt-5 w-full bg-yellow-900 hover:bg-yellow-950 text-yellow-100 font-semibold py-3 cursor-pointer z-50 relative"
            >
              {acknowledgeWarning.isPending ? 'Acknowledging...' : 'I Understand'}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}