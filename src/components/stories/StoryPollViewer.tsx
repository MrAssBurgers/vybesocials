import { motion } from 'framer-motion';
import type { PollData } from './StoryPollEditor';

interface StoryPollViewerProps {
  storyId: string;
  pollData: PollData;
  isOwner: boolean;
}

/** Display the authored sticker without pretending to persist votes or answers. */
export function StoryPollViewer({ pollData }: StoryPollViewerProps) {
  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
    className="bg-black/60 backdrop-blur-md rounded-2xl p-4 mx-4 space-y-3">
    <p className="text-white font-semibold text-center text-sm">{pollData.question}</p>
    {pollData.type === 'poll' && <ul className="space-y-2" aria-label="Poll choices">
      {pollData.options.map((option, index) => <li key={index} className="px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white">{option}</li>)}
    </ul>}
    <p className="text-white/70 text-center text-xs">{pollData.type === 'poll' ? 'Poll voting is currently unavailable.' : 'Question responses are currently unavailable.'}</p>
  </motion.div>;
}
