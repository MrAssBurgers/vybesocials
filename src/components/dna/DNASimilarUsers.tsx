import { memo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Users, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useSimilarDNAUsers } from '@/hooks/useSimilarDNAUsers';

export const DNASimilarUsers = memo(function DNASimilarUsers() {
  const { data: users, isLoading } = useSimilarDNAUsers(12);

  if (isLoading || !users || users.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <Card className="border-border/50 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold">Similar DNA Matches</h3>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20">
              AI Matched
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            People who share your vibe and personality traits
          </p>

          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-1">
              {users.map((person, i) => (
                <motion.div
                  key={person.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.04 }}
                >
                  <Link
                    to={`/u/${person.username}`}
                    className="flex flex-col items-center w-[76px] group"
                  >
                    <div className="relative">
                      <Avatar className="h-14 w-14 ring-2 ring-primary/20 group-hover:ring-primary/50 transition-all">
                        <AvatarImage src={person.avatar_url || undefined} />
                        <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                          {(person.display_name || person.username)?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {/* Similarity badge */}
                      <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-md">
                        {person.similarity}%
                      </div>
                    </div>
                    <p className="text-xs font-medium mt-1.5 truncate w-full text-center">
                      {person.display_name || person.username}
                    </p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      {person.dominant_trait}
                    </p>
                  </Link>
                </motion.div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>
    </motion.div>
  );
});
