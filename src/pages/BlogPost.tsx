import { Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { POSTS } from '@/content/blogPosts';
import { usePageMeta } from '@/hooks/usePageMeta';

export default function BlogPostPage() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const post = POSTS.find((p) => p.slug === slug);

  usePageMeta({
    title: post ? `${post.title} | VYBE Blog` : 'VYBE Blog',
    description: post?.excerpt ?? 'Product updates and stories from the VYBE team.',
    canonicalPath: post ? `/blog/${post.slug}` : '/blog',
    ogType: 'article',
    jsonLd: post ? {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      author: { '@type': 'Organization', name: 'VYBE' },
      publisher: { '@type': 'Organization', name: 'VYBE', url: 'https://vybehub.app' },
      mainEntityOfPage: `https://vybehub.app/blog/${post.slug}`,
    } : undefined,
  });

  if (!post) return <Navigate to="/blog" replace />;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <Calendar className="w-3 h-3" />
            <time dateTime={post.date}>{new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
            <span>·</span>
            <span>{post.readTime} min read</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-6 leading-tight">{post.title}</h1>

          <div className="prose prose-invert max-w-none text-foreground">
            {post.body.map((block, i) => {
              if (block.type === 'h2') return <h2 key={i} className="text-2xl font-bold mt-8 mb-3">{block.text}</h2>;
              if (block.type === 'h3') return <h3 key={i} className="text-xl font-semibold mt-6 mb-2">{block.text}</h3>;
              if (block.type === 'list') return (
                <ul key={i} className="list-disc list-inside space-y-1.5 mb-4 text-muted-foreground">
                  {block.items.map((it, j) => <li key={j}>{it}</li>)}
                </ul>
              );
              return <p key={i} className="text-base text-muted-foreground leading-relaxed mb-4">{block.text}</p>;
            })}
          </div>

          <div className="mt-12 pt-6 border-t border-border flex items-center justify-between text-sm">
            <Link to="/blog" className="text-primary hover:underline">← All posts</Link>
            <Link to="/?signup=true" className="text-primary hover:underline">Try VYBE →</Link>
          </div>
        </motion.article>

        <PublicFooter />
      </div>
    </div>
  );
}
