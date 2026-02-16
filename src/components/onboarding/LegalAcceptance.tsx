import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, FileText, CheckCircle2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface LegalAcceptanceProps {
  accepted: boolean;
  onChange: (accepted: boolean) => void;
}

export function LegalAcceptance({ accepted, onChange }: LegalAcceptanceProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">Almost There</h2>
        <p className="text-muted-foreground mt-2">Please review and accept our policies</p>
      </div>

      <div className="space-y-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-border bg-card/50 p-4 flex items-start gap-3"
        >
          <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <h3 className="font-medium text-foreground text-sm">Terms of Service</h3>
            <p className="text-xs text-muted-foreground mt-1">
              User responsibilities, content rules, moderation rights, monetization terms, and dispute resolution.
            </p>
            <Link to="/terms" target="_blank" className="text-xs text-primary hover:underline mt-1 inline-block">
              Read full Terms →
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-border bg-card/50 p-4 flex items-start gap-3"
        >
          <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <h3 className="font-medium text-foreground text-sm">Privacy Policy</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Data collection, AI processing, third-party sharing, your rights, and data retention.
            </p>
            <Link to="/privacy" target="_blank" className="text-xs text-primary hover:underline mt-1 inline-block">
              Read full Policy →
            </Link>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex items-start space-x-3 pt-2"
      >
        <Checkbox
          id="legal-accept"
          checked={accepted}
          onCheckedChange={(checked) => onChange(checked === true)}
          className="mt-0.5"
        />
        <label
          htmlFor="legal-accept"
          className="text-sm text-foreground cursor-pointer leading-relaxed"
        >
          I confirm I am at least <strong>13 years old</strong> and agree to VYBE's{' '}
          <Link to="/terms" target="_blank" className="text-primary hover:underline">Terms of Service</Link>{' '}
          and{' '}
          <Link to="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>, 
          including AI-assisted content analysis.
        </label>
      </motion.div>

      {accepted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-center gap-2 text-sm text-emerald-500"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>You're all set!</span>
        </motion.div>
      )}
    </div>
  );
}
