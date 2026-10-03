import type { MiniAppSource } from './model';

const baseCss = `* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #11111b; color: #f5f3ff; font-family: system-ui, sans-serif; }
main { width: 100%; max-width: 420px; text-align: center; }
h1 { font-size: clamp(28px, 7vw, 44px); letter-spacing: -0.04em; }
p { color: #c4bedb; line-height: 1.6; }
button { border: 0; border-radius: 20px; padding: 18px 28px; font: inherit; font-weight: 700; background: #be9dff; color: #211138; cursor: pointer; min-height: 48px; transition: transform .15s; }
button:active { transform: scale(.97); }
button:focus-visible { outline: 3px solid white; outline-offset: 4px; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`;

export const MINI_APP_TEMPLATES: Array<{ id: string; label: string; source: MiniAppSource }> = [
  {
    id: 'tap', label: 'Tap game', source: {
      title: 'Tap rush', description: 'How many taps can you land in ten seconds?', category: 'game',
      html: `<main><p>YOUR NEXT HIGH SCORE STARTS HERE</p><h1>Tap rush</h1><p id="status" role="status" aria-live="polite">10 seconds. One button. Go.</p><button id="tap">Start round</button><p id="score">0 taps</p></main>`,
      css: baseCss,
      javascript: `let score = 0;
let deadline = 0;
let timer;
const button = document.getElementById('tap');
const status = document.getElementById('status');
button.addEventListener('click', () => {
  if (!deadline) {
    score = 0;
    document.getElementById('score').textContent = '0 taps';
    deadline = Date.now() + 10000;
    button.textContent = 'TAP!';
    timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      status.textContent = remaining + ' seconds left';
      if (!remaining) {
        clearInterval(timer);
        deadline = 0;
        status.textContent = 'Round complete: ' + score + ' taps!';
        button.textContent = 'Play again';
      }
    }, 100);
  } else if (Date.now() < deadline) {
    document.getElementById('score').textContent = ++score + ' taps';
  }
});`,
    },
  },
  {
    id: 'prompt', label: 'Idea picker', source: {
      title: 'Spark a post', description: 'A little inspiration for your next creation.', category: 'tool',
      html: `<main><p>A LITTLE CREATIVE SPARK</p><h1>What will you make?</h1><p id="idea" role="status" aria-live="polite">Tap below for a fresh idea.</p><button id="pick">Give me a spark</button></main>`,
      css: baseCss,
      javascript: `const ideas = ['Capture something that made you smile.', 'Share a trick you wish you knew sooner.', 'Show your favorite place from a new angle.', 'Make a ten-second story using three objects.', 'Teach your friends one tiny thing.'];
let previous = -1;
document.getElementById('pick').addEventListener('click', () => {
  let next = Math.floor(Math.random() * (ideas.length - 1));
  if (next >= previous) next += 1;
  previous = next;
  document.getElementById('idea').textContent = ideas[next];
});`,
    },
  },
  {
    id: 'art', label: 'Color studio', source: {
      title: 'Color waves', description: 'Mix your own pocket-sized gradient.', category: 'art',
      html: `<main><p>MAKE SOMETHING THAT FEELS LIKE YOU</p><h1>Color waves</h1><div id="art" aria-label="Gradient artwork"></div><p><label for="hue">Pick your hue</label></p><input id="hue" type="range" min="0" max="360" value="270" style="width:100%;min-height:44px" /></main>`,
      css: baseCss + `\n#art { aspect-ratio: 1; border-radius: 32px; background: linear-gradient(135deg, hsl(270 90% 70%), hsl(350 95% 60%), hsl(70 90% 70%)); }`,
      javascript: `document.getElementById('hue').addEventListener('input', event => {
  const hue = Number(event.target.value);
  document.getElementById('art').style.background = 'linear-gradient(135deg, hsl(' + hue + ' 90% 70%), hsl(' + (hue + 80) + ' 95% 60%), hsl(' + (hue + 160) + ' 90% 70%))';
});`,
    },
  },
];
