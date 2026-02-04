import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Calendar, Shield, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgeSetupProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  onAgeCalculated: (age: number) => void;
}

export function AgeSetup({ value, onChange, onAgeCalculated }: AgeSetupProps) {
  const { t } = useTranslation();
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  // Calculate age from date
  const calculatedAge = useMemo(() => {
    if (!day || !month || !year || year.length !== 4) return null;
    
    const birthDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }, [day, month, year]);

  // Update parent when date changes
  useEffect(() => {
    if (day && month && year && year.length === 4) {
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date.getTime())) {
        onChange(date);
        if (calculatedAge !== null) {
          onAgeCalculated(calculatedAge);
        }
      }
    }
  }, [day, month, year, calculatedAge, onChange, onAgeCalculated]);

  // Initialize from value
  useEffect(() => {
    if (value) {
      setDay(value.getDate().toString());
      setMonth((value.getMonth() + 1).toString());
      setYear(value.getFullYear().toString());
    }
  }, []);

  const isUnder13 = calculatedAge !== null && calculatedAge < 13;
  const isUnder16 = calculatedAge !== null && calculatedAge >= 13 && calculatedAge < 16;
  const isUnder18 = calculatedAge !== null && calculatedAge >= 16 && calculatedAge < 18;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center"
        >
          <Calendar className="w-10 h-10 text-primary" />
        </motion.div>
        <h2 className="text-2xl font-bold gradient-text">When's your birthday?</h2>
        <p className="text-muted-foreground mt-2">
          This helps us personalize your experience and ensure safety
        </p>
      </div>

      {/* Date of Birth Input */}
      <div className="space-y-4">
        <div className="flex gap-3 justify-center">
          {/* Day */}
          <div className="flex-1 max-w-[80px]">
            <label className="block text-xs text-muted-foreground mb-1.5 text-center">Day</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={day}
              onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))}
              placeholder="DD"
              className={cn(
                "w-full text-center py-3 px-2 rounded-xl border-2 bg-card text-lg font-medium transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-primary/50",
                day ? "border-primary/50" : "border-border"
              )}
            />
          </div>

          {/* Month */}
          <div className="flex-1 max-w-[80px]">
            <label className="block text-xs text-muted-foreground mb-1.5 text-center">Month</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={month}
              onChange={(e) => setMonth(e.target.value.replace(/\D/g, ''))}
              placeholder="MM"
              className={cn(
                "w-full text-center py-3 px-2 rounded-xl border-2 bg-card text-lg font-medium transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-primary/50",
                month ? "border-primary/50" : "border-border"
              )}
            />
          </div>

          {/* Year */}
          <div className="flex-1 max-w-[100px]">
            <label className="block text-xs text-muted-foreground mb-1.5 text-center">Year</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
              placeholder="YYYY"
              className={cn(
                "w-full text-center py-3 px-2 rounded-xl border-2 bg-card text-lg font-medium transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-primary/50",
                year.length === 4 ? "border-primary/50" : "border-border"
              )}
            />
          </div>
        </div>

        {/* Age display and warnings */}
        {calculatedAge !== null && calculatedAge > 0 && calculatedAge < 120 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="text-center py-2">
              <span className="text-2xl font-bold text-primary">{calculatedAge}</span>
              <span className="text-muted-foreground ml-2">years old</span>
            </div>

            {isUnder13 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 rounded-xl bg-destructive/10 border border-destructive/30"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-destructive">Age Requirement</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      You must be at least 13 years old to use VYBE. Please come back when you're older!
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {isUnder16 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30"
              >
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-600 dark:text-amber-400">Enhanced Safety</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      For your safety, some content settings will be restricted. You'll have access to protected content only.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {isUnder18 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 rounded-xl bg-primary/10 border border-primary/30"
              >
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-primary">Age-Appropriate Content</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Some mature content options will be limited until you turn 18.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>

      {/* Privacy note */}
      <p className="text-xs text-center text-muted-foreground">
        Your birthday is private and won't be shown to other users
      </p>
    </div>
  );
}
