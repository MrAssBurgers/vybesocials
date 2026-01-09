import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, Camera, X, Sparkles } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { VYBEHub } from './VYBEHub';
import { Camera as CameraComponent } from '@/components/camera';

interface CreateMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateMenu({ isOpen, onClose }: CreateMenuProps) {
  const navigate = useNavigate();
  const [showHub, setShowHub] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const handleAction = (action: 'post' | 'camera' | 'hub') => {
    triggerHaptic('medium');
    playSound('pop');
    
    switch (action) {
      case 'post':
        onClose();
        navigate('/upload');
        break;
      case 'camera':
        onClose();
        setShowCamera(true);
        break;
      case 'hub':
        onClose();
        setShowHub(true);
        break;
    }
  };

  const menuItems = [
    { 
      id: 'post' as const, 
      icon: Image, 
      label: 'Create Post', 
      description: 'Share a photo or video',
      color: 'from-pink-500 to-rose-500',
      delay: 0.05,
    },
    { 
      id: 'camera' as const, 
      icon: Camera, 
      label: 'Camera', 
      description: 'Capture a moment',
      color: 'from-cyan-500 to-blue-500',
      delay: 0.1,
    },
    { 
      id: 'hub' as const, 
      icon: Sparkles, 
      label: 'VYBE Hub', 
      description: 'Marketplace, Events & More',
      color: 'from-violet-500 to-purple-600',
      delay: 0.15,
    },
  ];

  return (
    <>
      {/* VYBE Hub Modal */}
      <VYBEHub isOpen={showHub} onClose={() => setShowHub(false)} />

      {/* Camera Fullscreen */}
      {showCamera && (
        <CameraComponent onClose={() => setShowCamera(false)} />
      )}

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
              onClick={onClose}
            />

            {/* Menu - Centered */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none"
            >
              <div 
                className="liquid-glass overflow-hidden rounded-3xl p-4 w-[90vw] max-w-xs pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="text-center mb-4">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.05 }}
                  >
                    <h2 className="text-lg font-bold gradient-text">Create</h2>
                    <p className="text-xs text-muted-foreground">What do you want to share?</p>
                  </motion.div>
                </div>

                {/* Menu Items */}
                <div className="space-y-2">
                  {menuItems.map((item) => (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: item.delay }}
                      onClick={() => handleAction(item.id)}
                      className="w-full p-3 rounded-2xl liquid-glass-button flex items-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-transform"
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                        <item.icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="text-left">
                        <span className="font-medium text-sm block">{item.label}</span>
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                      </div>
                    </motion.button>
                  ))}
                </div>

                {/* Close Button */}
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  onClick={onClose}
                  className="w-full mt-4 p-2 rounded-xl text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

