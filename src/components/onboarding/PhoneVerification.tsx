import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Phone, Shield, CheckCircle } from 'lucide-react';
import { useState } from 'react';

interface PhoneVerificationProps {
  phoneNumber: string;
  onChange: (phone: string) => void;
}

export function PhoneVerification({ phoneNumber, onChange }: PhoneVerificationProps) {
  const { t } = useTranslation();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');

  const handleSendCode = () => {
    // Demo: Just simulate sending code
    setCodeSent(true);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">{t('onboarding.step5Title')}</h2>
        <p className="text-muted-foreground mt-2">{t('onboarding.step5Subtitle')}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Benefits */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: Shield, text: 'Account recovery' },
            { icon: CheckCircle, text: 'Verified badge' },
          ].map((benefit, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
              <benefit.icon className="w-5 h-5 text-primary" />
              <span className="text-sm">{benefit.text}</span>
            </div>
          ))}
        </div>

        {/* Phone Input */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={phoneNumber}
                onChange={(e) => onChange(e.target.value)}
                className="pl-10 bg-card border-border"
              />
            </div>
            <Button 
              onClick={handleSendCode}
              disabled={!phoneNumber || codeSent}
              className="gradient-animated"
            >
              {codeSent ? 'Sent!' : 'Send Code'}
            </Button>
          </div>

          {codeSent && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-2"
            >
              <p className="text-sm text-muted-foreground">
                Demo: Enter any 6-digit code
              </p>
              <Input
                type="text"
                placeholder="Enter 6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                className="bg-card border-border text-center text-2xl tracking-widest"
              />
            </motion.div>
          )}
        </div>

        {/* Skip notice */}
        <p className="text-center text-sm text-muted-foreground">
          This step is optional. You can add your phone number later in Settings.
        </p>
      </motion.div>
    </div>
  );
}
