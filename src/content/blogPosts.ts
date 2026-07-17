export type Block =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'list'; items: string[] };

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  readTime: number;
  body: Block[];
}

export const POSTS: BlogPost[] = [
  {
    slug: 'introducing-vybe-dna',
    title: 'Introducing VYBE DNA — a feed that actually evolves with you',
    date: '2026-04-22',
    readTime: 5,
    excerpt: 'Most social apps run a black-box engagement model. VYBE DNA is a transparent, editable personality vector that ranks your feed based on how you actually behave — and you can see it.',
    body: [
      { type: 'p', text: 'For more than a decade, social feeds have been ranked by hidden engagement models. You have no idea why a post showed up. You have no idea why something you actually wanted to see did not. We thought there had to be a better way.' },
      { type: 'p', text: 'VYBE DNA is our answer. It is a 30-day rolling personality vector built from the things you actually do — reactions, comments, saves, shares, watch time, and the creators you return to. It powers the ranking of your home feed, your local discovery, and your recommended friends and communities.' },
      { type: 'h2', text: 'Why a vector, and why 30 days?' },
      { type: 'p', text: 'A 30-day window is long enough to capture your real taste, short enough to evolve as you do. We weight recent actions more heavily and decay older ones. The result is a feed that adapts to a new hobby in a few days instead of haunting you with old interests for months.' },
      { type: 'h2', text: 'Engagement weights' },
      { type: 'p', text: 'Not every action carries the same signal. Here is exactly how we weigh them:' },
      { type: 'list', items: ['Shares — 5 points', 'Saves — 4 points', 'Comments — 3 points', 'Likes / reactions — 1 point', 'Views — 0.1 points'] },
      { type: 'p', text: 'A share is a strong signal that you found something worth passing on. A view, on its own, says almost nothing.' },
      { type: 'h2', text: 'You can see it. You can edit it.' },
      { type: 'p', text: 'Open your VYBE DNA tab any time. You will see the tags, moods, sounds, and creator clusters that define you right now. You can dial them up, dial them down, or remove them entirely. Your feed updates within seconds.' },
      { type: 'p', text: 'This is what a transparent algorithm looks like. We hope you like what you find.' },
    ],
  },
  {
    slug: 'how-vybe-keeps-you-safe',
    title: 'How VYBE keeps you safe — without a moderation team of thousands',
    date: '2026-04-08',
    readTime: 6,
    excerpt: 'Real-time AI scanning, encrypted DMs, and protections built in from day one. Here is the engineering behind our safety stack.',
    body: [
      { type: 'p', text: 'When you build a social app in 2026, safety is not a checkbox you tick before launch. It is the foundation. Here is exactly how we keep VYBE a place worth being.' },
      { type: 'h2', text: 'Every upload gets scanned in real time' },
      { type: 'p', text: 'Photos, videos, and audio are scanned by Google Gemini Flash plus Google SafeSearch before they go live. If our models flag explicit material with high confidence, the upload is blocked at the source. If something is borderline, it is sent for human review.' },
      { type: 'h2', text: 'AI-generated media is auto-detected' },
      { type: 'p', text: 'We scan video frames at the 25% mark of every clip looking for AI-generation artifacts. When we find them, we attach a glassmorphic 🤖 watermark so viewers always know what they are seeing.' },
      { type: 'h2', text: 'Direct messages are encrypted at rest' },
      { type: 'p', text: 'Every DM is AES-256 encrypted on our servers. Plaintext only ever lives on your device. Voice notes and call media are isolated in a Content Lifecycle Stream so even our admins cannot browse them.' },
      { type: 'h2', text: 'Stronger protections for under-18 users' },
      { type: 'list', items: ['Users under 13 are not permitted on VYBE.', 'Users 13–17 get stricter AI safety filters by default.', 'Explicit music tracks are hidden from users under 13.', 'Personalized advertising is disabled for everyone under 13, in line with COPPA.', 'Parents can set a 4-digit PIN and screen-time intervals.'] },
      { type: 'h2', text: 'Two-tap blocking, anywhere' },
      { type: 'p', text: 'You can block, mute, or report any user from any context — feed, DM, profile, comment thread — in two taps. Reports are reviewed within 24 hours. Repeat offenders are removed from the platform.' },
      { type: 'p', text: 'Safety is not done. It is a system we keep tuning. If you ever feel unsafe on VYBE, email us at vybesocial.info@gmail.com.' },
    ],
  },
  {
    slug: 'why-we-built-the-friend-map',
    title: 'Why we built the Friend Map (and Ghost Mode)',
    date: '2026-03-19',
    readTime: 4,
    excerpt: 'Social apps killed serendipity. The Friend Map is our attempt to bring it back — without sacrificing your privacy.',
    body: [
      { type: 'p', text: 'Remember when you would just bump into your friend at a coffee shop? Most modern social apps have replaced that kind of serendipity with infinite scroll. We wanted it back.' },
      { type: 'h2', text: 'What the Friend Map shows' },
      { type: 'p', text: 'When you open the Friend Map, you see your approved friends as little avatars on a map of your area. Each avatar shows their current weather (powered by Open-Meteo), their vibe status, and what they are doing. Tap one to start a chat or invite them somewhere.' },
      { type: 'h2', text: 'Privacy by default' },
      { type: 'list', items: ['Your location is only ever shared with friends you have approved.', 'Locations refresh once an hour, not in real time, to prevent stalking patterns.', 'Ghost Mode lets you go invisible at any moment with one tap.', 'You can hide your exact location and only show your city.', 'Your location history is never stored long-term — only the most recent point.'] },
      { type: 'h2', text: 'Why one hour?' },
      { type: 'p', text: 'A one-hour TTL gives you the upside of serendipity (you can see your friend is at the park) without the downside of being tracked in real time. It is a deliberate, opinionated trade-off we made for safety.' },
      { type: 'p', text: 'The Friend Map is one of the most-loved features in our beta. Try it, and turn on Ghost Mode whenever you want a quiet hour. We will not even know you logged in.' },
    ],
  },
  {
    slug: 'vybe-vs-bereal-comparison',
    title: 'VYBE vs. BeReal: Which Social App Actually Reflects You?',
    date: '2026-05-14',
    readTime: 6,
    excerpt: 'BeReal chases authenticity through timing. VYBE chases it through a personality engine you can see and edit. Here is how the two apps really compare — and why reshareable identity beats a two-minute window.',
    body: [
      { type: 'p', text: 'If you have ever tried BeReal, you know the pitch: a random daily notification, two minutes to post a front-and-back photo, no filters, no edits. It is a clever constraint. But after a year of using it, a lot of people are asking the same question — is a two-minute window really the most authentic thing a social app can offer? We do not think so. Here is how VYBE approaches the same problem from a completely different angle.' },
      { type: 'h2', text: 'Authenticity through timing vs. authenticity through identity' },
      { type: 'p', text: 'BeReal locks authenticity to a moment: whatever you are doing when the notification hits. That is fun, but it is also shallow. It says nothing about who you are the other 23 hours and 58 minutes of the day.' },
      { type: 'p', text: 'VYBE takes the opposite approach. Our Personality Engine — VYBE DNA — is a transparent, editable vector built from how you actually behave over 30 rolling days. Your reactions, your saves, the creators you return to, the moods you engage with. It is authenticity as a fingerprint, not a snapshot.' },
      { type: 'h2', text: 'Side-by-side' },
      { type: 'list', items: [
        'Posting: BeReal — 2-minute daily window. VYBE — post anytime, with Clips, photos, sounds, stories, and collaborative posts.',
        'Ranking: BeReal — chronological only. VYBE — ranked by your own editable DNA vector, with a transparent scoring model.',
        'Customization: BeReal — none. VYBE — full Aura (colors, motion, layout), shareable themes, bento-grid profiles.',
        'Identity: BeReal — a photo. VYBE — a living DNA card you can share as an image or link.',
        'Discovery: BeReal — friends only. VYBE — Friend Map, VYBE Local (25-mile radius), Communities, Spaces, and Roulette.',
        'Safety: BeReal — basic reporting. VYBE — real-time Gemini + SafeSearch scans, encrypted DMs, stricter filters for 13–17.',
      ] },
      { type: 'h2', text: 'Reshare is where BeReal falls short' },
      { type: 'p', text: 'One of the most-searched BeReal queries is literally "bereal reshare" — because the app does not really let you. That is a signal. People want to take something from a social app and put it somewhere else: a story, a group chat, a wall.' },
      { type: 'p', text: 'VYBE was built for this. Your DNA card is a first-class shareable artifact. Your Aura theme is a link anyone can preview and try on. Your Friend Map moments become clips you can share out to iMessage, WhatsApp, or Instagram in two taps. If reshareable identity is what you actually want from a modern social app, VYBE is the one designed around it.' },
      { type: 'h2', text: 'Which one is right for you?' },
      { type: 'p', text: 'If you want a low-commitment daily habit with a small friend group, BeReal is a fine choice. If you want a social app that reflects who you are, adapts as you evolve, and gives you real creative surface to express and share that identity — VYBE is built for you.' },
      { type: 'p', text: 'Try VYBE free at vybehub.app. Your DNA starts forming the moment you sign up.' },
    ],
  },
];
