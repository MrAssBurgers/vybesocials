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
    title: 'How to use VYBE reporting and privacy controls',
    date: '2026-04-08',
    readTime: 3,
    excerpt: 'Report a post or message, manage unwanted contact, and check your location-sharing settings. Learn what these controls do and where their limits are.',
    body: [
      { type: 'p', text: 'VYBE has tools for reporting content, blocking unwanted contact, and managing what you share. Here is how to use them when a post, conversation, or location-sharing choice needs attention.' },
      { type: 'h2', text: 'Report the content involved' },
      { type: 'p', text: 'Open the report option for the post, account, or message involved. Choose the reason that best describes the problem, then select Submit Report. Reasons include spam, harassment, inappropriate content, hate or violence, and other concerns.' },
      { type: 'p', text: 'If submission fails, the form keeps your selected reason and offers another attempt. An error is not confirmation that your report was received. Report response times are not guaranteed.' },
      { type: 'h2', text: 'Understand what a message report shares' },
      { type: 'p', text: 'Reporting a message shares its available text and attachment details with the moderation team for review. Conversation membership controls access to direct and group messages, but VYBE DMs are not end-to-end encrypted. Messages are processed and stored by VYBE services. Read the Privacy Policy for data handling details.' },
      { type: 'h2', text: 'Manage unwanted contact' },
      { type: 'p', text: 'Use account or profile controls to block unwanted contact. If the account or its content also breaks the Community Guidelines, submit a report about what happened. Before posting or sending a message, check the audience and avoid sharing information you do not want a recipient to keep.' },
      { type: 'h2', text: 'Review location sharing separately' },
      { type: 'p', text: 'Open Privacy & Ghost Mode on VybeMap to review location sharing or turn it off. Wait for the saved state; if the app shows a privacy error, use Retry privacy check. Location permissions are also managed by your device or browser. Ghost Mode controls map sharing; it does not make your account activity anonymous.' },
      { type: 'h2', text: 'Content checks have limits' },
      { type: 'p', text: 'Automated checks in supported publishing flows do not guarantee that every file or message has been scanned or that harmful content will be caught. A visible post or a missing AI label is not proof that content is safe or authentic. Use reporting tools when something needs attention.' },
      { type: 'p', text: 'For account or safety questions, contact vybesocial.info@gmail.com with the account or content involved and what happened. Do not send passwords or verification codes. The support inbox is not an emergency service.' },
    ],
  },
  {
    slug: 'why-we-built-the-friend-map',
    title: 'Why we built the Friend Map (and Ghost Mode)',
    date: '2026-03-19',
    readTime: 4,
    excerpt: 'Explore the Friend Map and learn how to review location sharing, use Ghost Mode, and check that a privacy change has saved.',
    body: [
      { type: 'p', text: 'Remember when you would just bump into your friend at a coffee shop? Most modern social apps have replaced that kind of serendipity with infinite scroll. We wanted it back.' },
      { type: 'h2', text: 'What the Friend Map shows' },
      { type: 'p', text: 'When you open the Friend Map, you see your approved friends as little avatars on a map of your area. Each avatar shows their current weather (powered by Open-Meteo), their vibe status, and what they are doing. Tap one to start a chat or invite them somewhere.' },
      { type: 'h2', text: 'Review your sharing choices' },
      { type: 'list', items: ['Open Privacy & Ghost Mode to review whether location sharing is on.', 'Location sharing depends on device permissions and approved friend requests.', 'Choose Ghost to stop location access, then wait for the saved state.', 'If a privacy change fails, use Retry privacy check rather than assuming it saved.', 'Device or browser settings let you review or revoke location permission.'] },
      { type: 'h2', text: 'Live location and temporary Ghost Mode' },
      { type: 'p', text: 'Map locations can change while the map is open; they do not follow a fixed hourly refresh schedule. Temporary Ghost Mode offers a choice of durations. Its automatic return works while the app stays open; after reloading, review the sharing state before returning to Live.' },
      { type: 'p', text: 'Ghost Mode controls map sharing. It does not hide every other kind of account activity or make the app anonymous. Read the Privacy Policy for information about data handling, and check your sharing choices whenever you use the map.' },
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
        'Safety on VYBE: reporting, blocking, and privacy controls. Content checks have limits, and DMs are not end-to-end encrypted.',
      ] },
      { type: 'h2', text: 'Reshare is where BeReal falls short' },
      { type: 'p', text: 'One of the most-searched BeReal queries is literally "bereal reshare" — because the app does not really let you. That is a signal. People want to take something from a social app and put it somewhere else: a story, a group chat, a wall.' },
      { type: 'p', text: 'VYBE was built for this. Your DNA card is a first-class shareable artifact. Your Aura theme is a link anyone can preview and try on. Your Friend Map moments become clips you can share out to iMessage, WhatsApp, or Instagram in two taps. If reshareable identity is what you actually want from a modern social app, VYBE is the one designed around it.' },
      { type: 'h2', text: 'Which one is right for you?' },
      { type: 'p', text: 'If you want a low-commitment daily habit with a small friend group, BeReal is a fine choice. If you want a social app that reflects who you are, adapts as you evolve, and gives you real creative surface to express and share that identity — VYBE is built for you.' },
      { type: 'p', text: 'Try VYBE free at vybehub.app. Your DNA starts forming the moment you sign up.' },
    ],
  },
  {
    slug: 'gen-z-social-media-trends',
    title: 'Gen Z social media trends 2026 — Digital Auras, DNA, and the shift beyond aesthetics',
    date: '2026-06-14',
    readTime: 6,
    excerpt: 'Gen Z is done curating grids. The next wave of social media aesthetics is a living Digital Aura — a personal DNA that shifts as you do. Here is what is trending, what is dying, and how VYBE fits in.',
    body: [
      { type: 'p', text: 'For a decade, Gen Z social media trends have been about aesthetics — coquette, cleangirl, dark academia, coastal grandmother. Vibes on rotation, curated grids, static moodboards. In 2026, that is finally shifting. The new trend is not another aesthetic. It is a Digital Aura: a personalized, evolving identity layer that lives on top of the feed itself.' },
      { type: 'h2', text: 'From aesthetics to Auras' },
      { type: 'p', text: 'An aesthetic is a costume. An Aura is a fingerprint. Gen Z users on TikTok, Discord, and now VYBE are talking less about "what look am I going for this month" and more about "what does my profile actually feel like when someone lands on it." Colors, motion, sound, layout — all coded to you, not to a trend cycle.' },
      { type: 'h2', text: 'Personal DNA is replacing the static bio' },
      { type: 'p', text: 'The bio field — three lines of copy and some emoji — is 2010s technology. Gen Z wants identity that updates itself. VYBE DNA is a 30-day behavioral vector: the moods you engage with, the sounds you save, the creators you return to, the communities you belong to. It renders as a live card you can share as an image or link, and it shifts as you shift.' },
      { type: 'h2', text: 'What is trending in 2026' },
      { type: 'list', items: [
        'Digital Auras — full-app theming (colors, motion, layout) that reflects your identity, not a template.',
        'Living DNA cards — shareable identity artifacts that update themselves as you evolve.',
        'Ephemeral by default — snaps, stories, and vanish-mode DMs over permanent grids.',
        'Friend Maps and local discovery — real-life proximity as a feature, not a privacy leak.',
        'Collaborative posts — multi-author credit and split analytics on shared moments.',
        'Sound-first expression — signature sounds and audio identity, not just captions.',
      ] },
      { type: 'h2', text: 'What is dying' },
      { type: 'list', items: [
        'Static grids curated for months of aesthetic consistency.',
        'One-size-fits-all feeds ranked by a black-box engagement model.',
        'Bio fields as identity — three lines and an emoji do not scale.',
        'Public-by-default everything — Gen Z wants ephemeral, encrypted, and friend-scoped.',
      ] },
      { type: 'h2', text: 'Why VYBE is built for this shift' },
      { type: 'p', text: 'VYBE was designed from the start around Digital Auras and Personal DNA. Your Aura theme changes the entire app UI to match your vibe. Your DNA card is a first-class shareable artifact. Your Friend Map, Local feed, and collaborative posts are wired to the way Gen Z actually wants to socialize in 2026 — evolving, ephemeral, and identity-first.' },
      { type: 'p', text: 'Try VYBE free at vybehub.app. Your Digital Aura starts forming the moment you sign up.' },
    ],
  },
];
