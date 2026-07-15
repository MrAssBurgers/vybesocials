import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Image, Camera, X, Zap, MapPin } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { VYBEHub } from './VYBEHub';
import { openSnapCamera } from '@/contexts/cameraOverlayActions';
import { useCameraOverlay } from '@/contexts/cameraOverlaySafe';

interface CreateMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateMenu({ isOpen, onClose }: CreateMenuProps) {
  const navigate = useNavigate();
  const [showHub, setShowHub] = useState(false);
  const { openCamera } = useCameraOverlay();

  const handleAction = (action: 'post' | 'camera' | 'hub' | 'map') => {
    triggerHaptic('medium');
    playSound('pop');
    
    switch (action) {
      case 'post':
        onClose();
        navigate('/upload');
        break;
      case 'camera':
        onClose();
        // Create flow: destination chosen before capture (post composer).
        void openSnapCamera(openCamera, { source: 'create', defaultDestination: 'post' });
        break;
      case 'hub':
        onClose();
        setShowHub(true);
        break;
      case 'map':
        onClose();
        navigate('/map');
        break;
    }
  };

  const menuItems = [
    { 
      id: 'post' as const, 
      icon: Image, 
      label: 'Create Post', 
      description: 'Share a photo or video',
      gradient: 'from-rose-500 via-pink-500 to-fuchsia-500',
    },
    { 
      id: 'camera' as const, 
      icon: Camera, 
      label: 'Camera', 
      description: 'Capture a moment',
      gradient: 'from-cyan-500 via-blue-500 to-indigo-500',
    },
    { 
      id: 'hub' as const, 
      icon: Zap, 
      label: 'VYBE Hub', 
      description: 'Marketplace, Events & More',
      gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
    },
  ];

  return (
    <>
      {/* VYBE Hub Modal */}
      <VYBEHub isOpen={showHub} onClose={() => setShowHub(false)} />

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop with blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md"
              style={{ zIndex: 2147483646, willChange: 'opacity' }}
              onClick={onClose}
            />

            {/* Menu Container - Centered */}
            <div className="fixed inset-0 flex items-center justify-center pointer-events-none p-4" style={{ zIndex: 2147483647 }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ 
                  type: 'tween',
                  duration: 0.2,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                className="relative w-full max-w-sm pointer-events-auto"
                style={{ willChange: 'transform, opacity' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Glow effect behind card */}
                <div className="absolute -inset-4 bg-gradient-to-br from-primary/30 via-accent/20 to-primary/30 rounded-[40px] blur-2xl opacity-60" />
                
                {/* Main Card */}
                <div className="relative bg-card/95 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-2xl overflow-hidden">
                  {/* Animated gradient border */}
                  <div className="absolute inset-0 rounded-3xl p-px bg-gradient-to-br from-primary/50 via-transparent to-accent/50 pointer-events-none" />
                  
                  {/* Map button - top right */}
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.15 }}
                    onClick={() => handleAction('map')}
                    whileTap={{ scale: 0.9 }}
                    className="absolute top-4 right-4 z-10 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow"
                  >
                    <MapPin className="h-5 w-5 text-white" />
                  </motion.button>

                  {/* Header */}
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-center mb-6 pr-10"
                  >
                    <div className="inline-flex items-center gap-2 mb-2">
                      <div>
                        <Zap className="w-5 h-5 text-primary" />
                      </div>
                      <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                        Create
                      </h2>
                    </div>
                    <p className="text-sm text-muted-foreground">What do you want to share?</p>
                  </motion.div>

                  {/* Menu Items */}
                  <div className="space-y-3">
                    {menuItems.map((item, index) => (
                      <motion.button
                        key={item.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 + index * 0.03, duration: 0.2 }}
                        onClick={() => handleAction(item.id)}
                        whileTap={{ scale: 0.98 }}
                        className="w-full p-4 rounded-2xl bg-muted/50 hover:bg-muted/80 border border-border/30 hover:border-border/50 flex items-center gap-4 transition-colors group"
                        style={{ willChange: 'transform, opacity' }}
                      >
                        {/* Icon with gradient background */}
                        <div 
                          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow`}
                        >
                          <item.icon className="h-6 w-6 text-white" />
                        </div>
                        
                        {/* Text */}
                        <div className="text-left flex-1">
                          <span className="font-semibold text-base block group-hover:text-primary transition-colors">
                            {item.label}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {item.description}
                          </span>
                        </div>
                        
                        {/* Arrow indicator */}
                        <motion.div
                          initial={{ opacity: 0, x: -5 }}
                          whileHover={{ opacity: 1, x: 0 }}
                          className="text-muted-foreground"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </motion.div>
                      </motion.button>
                    ))}
                  </div>

                  {/* Close Button */}
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    onClick={onClose}
                    whileTap={{ scale: 0.95 }}
                    className="w-full mt-5 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
