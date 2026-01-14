import { motion } from 'framer-motion';
import { DesignYourVybe } from './DesignYourVybe';
import { ThemeGallery } from './ThemeGallery';

export function ThemesSection() {
  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <DesignYourVybe />
      </motion.div>
      
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <ThemeGallery />
      </motion.div>
    </div>
  );
}
