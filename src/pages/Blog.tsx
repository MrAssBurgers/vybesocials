import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { POSTS } from '@/content/blogPosts';
import { usePageMeta } from '@/hooks/usePageMeta';

export default function BlogPage() {
  const navigate = useNavigate();

  usePageMeta({
    title: 'Blog | VYBE — Stories, updates, and design notes',
    description: 'The official VYBE blog. Product updates, safety announcements, design notes, and stories from the team building a more human social app.',
    canonicalPath: '/blog',
  });

  return (
    <div className="page-scroll-fix bg-background">
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold mb-3 bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">
            The VYBE Blog
          </h1>
          <p className="text-lg text-muted-foreground">
            Product updates, safety announcements, and design notes from the team building VYBE.
          </p>
        </motion.header>

        <section className="space-y-5">
          {POSTS.map((p, i) => (
            <motion.article
              key={p.slug}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-border bg-card p-6 hover:border-primary/40 transition-colors"
            >
              <Link to={`/blog/${p.slug}`} className="block group">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Calendar className="w-3 h-3" />
                  <time dateTime={p.date}>{new Date(p.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
                  <span>·</span>
                  <span>{p.readTime} min read</span>
                </div>
                <h2 className="text-2xl font-bold mb-2 group-hover:text-primary transition-colors">
                  {p.title}
                </h2>
                <p className="text-muted-foreground mb-3">{p.excerpt}</p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Read post <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </motion.article>
          ))}
        </section>

        <PublicFooter />
      </div>
    </div>
  );
}
