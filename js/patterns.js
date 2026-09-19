/* ==========================================================================
   patterns.js  —  Section 5 pattern detectors + Section 9 phrase library seed
   --------------------------------------------------------------------------
   Each pattern gets an id, a label, a detector, and hints used to work out
   your self-catch rate (did you name this yourself in the inner editor step?).

   Turn any pattern on or off in settings.js under `patterns.enabled`.
   Add phrases from the Phrase Library screen in the app; they become
   detectors automatically.
   ========================================================================== */

import { SETTINGS } from './settings.js';

/* Words that make a sentence sound like it faded out instead of landing. */
const TRAIL_WORDS = [
  'and', 'but', 'so', 'or', 'yeah', 'yes', 'no', 'like', 'etc', 'whatever',
  'something', 'anyway', 'basically', 'actually', 'though', 'then',
];

/* Section 5: Indian English to US English. These also seed the Phrase
   Library, and anything you add there is detected too. */
export const PHRASE_LIBRARY_SEED = [
  { category: 'Indian English to US English', from: 'new joiner',        to: 'new hire' },
  { category: 'Indian English to US English', from: 'out of home',       to: 'not home' },
  { category: 'Indian English to US English', from: 'do the needful',    to: 'please take care of it' },
  { category: 'Indian English to US English', from: 'revert back',       to: 'get back to you' },
  { category: 'Indian English to US English', from: 'prepone',           to: 'move up' },
  { category: 'Indian English to US English', from: 'kindly',            to: 'please' },
  { category: 'Indian English to US English', from: 'same same',         to: 'the same' },
  { category: 'Indian English to US English', from: 'passing out',       to: 'graduating' },
  { category: 'Indian English to US English', from: 'four point three years', to: 'a little over four years' },
  { category: 'Indian English to US English', from: 'i am having',       to: 'i have' },
  { category: 'Indian English to US English', from: 'discuss about',     to: 'discuss' },
  { category: 'Indian English to US English', from: 'today morning',     to: 'this morning' },

  { category: 'Filler word alternatives', from: 'basically',  to: 'say the point plainly, or say nothing' },
  { category: 'Filler word alternatives', from: 'actually',   to: 'drop it, it rarely adds anything' },
  { category: 'Filler word alternatives', from: 'you know',   to: 'a short silence' },
  { category: 'Filler word alternatives', from: 'i mean',     to: 'start the sentence again, properly' },

  { category: 'Meeting phrases', from: 'I think maybe we could possibly', to: 'I’d suggest' },
  { category: 'Meeting phrases', from: 'sorry to interrupt',              to: 'one thing to add' },
  { category: 'Meeting phrases', from: 'I just wanted to say',            to: 'say it' },

  { category: 'Clarification phrases', from: 'come again?',       to: 'Sorry, could you say that again?' },
  { category: 'Clarification phrases', from: 'I didn’t get', to: 'I want to make sure I follow. Can you walk me through it?' },
  { category: 'Clarification phrases', from: 'what?',             to: 'Sorry, I missed the last part.' },

  { category: 'Everyday social phrases', from: 'okayy',    to: 'Okay' },
  { category: 'Everyday social phrases', from: 'no issue', to: 'No problem' },
  { category: 'Everyday social phrases', from: 'myself Navya', to: 'I’m Navya' },

  { category: 'Word mix-ups', from: 'upscaling', to: 'upskilling' },
  { category: 'Word mix-ups', from: 'lose track', to: 'loose track' },
];

/* Phrases the "Indian English" detector looks for, built from the seed list
   plus anything you add in the app. */
const INDIAN_ENGLISH_SEEDS = PHRASE_LIBRARY_SEED
  .filter((p) => p.category === 'Indian English to US English')
  .map((p) => p.from);

const WORD_MIXUP_SEEDS = PHRASE_LIBRARY_SEED
  .filter((p) => p.category === 'Word mix-ups')
  .map((p) => p.from);

const TOO_CASUAL_SEEDS = ['okayy', 'okkk', 'yaa', 'yeahh', 'hmmm', 'k thanks', 'ya sure'];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Count standalone occurrences of a phrase in a lowercased string. */
export function countPhrase(text, phrase) {
  const p = escapeRegex(phrase.toLowerCase().trim());
  if (!p) return 0;
  // \b does not work before/after punctuation like "right?" so handle both.
  const re = new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`, 'gi');
  let n = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    n += 1;
    re.lastIndex = m.index + 1; // allow overlapping matches
  }
  return n;
}

/* --------------------------------------------------------------------------
   The detectors.

   Each receives { sentences, words, text, taskId, coreLanded } and returns
   an array of { text, index } — one entry per hit, used for highlighting.
   -------------------------------------------------------------------------- */

export const PATTERNS = [
  {
    id: 'so_opener',
    label: '"So" opener',
    better: 'Start with the point',
    hints: ['so', 'opener', 'started with so', 'begin'],
    countsToward: 'structure',
    detect({ sentences }) {
      const hits = [];
      sentences.forEach((s, i) => {
        if (/^\s*so\b/i.test(s.text)) hits.push({ text: s.text.trim().split(/\s+/)[0], index: s.start });
      });
      return hits;
    },
  },

  {
    id: 'right_ending',
    label: '"right?" ending',
    better: 'End with a period',
    hints: ['right', 'approval', 'asking for agreement', 'checking'],
    countsToward: 'structure',
    detect({ sentences }) {
      const hits = [];
      sentences.forEach((s) => {
        if (/\b(right|no|correct|yeah)\s*\?\s*$/i.test(s.text.trim())) {
          hits.push({ text: s.text.trim().slice(-8), index: s.end - 6 });
        }
      });
      return hits;
    },
  },

  {
    id: 'growing_sentence',
    label: 'Growing sentences',
    better: 'Decide the point, then speak',
    hints: ['long sentence', 'kept going', 'rambled', 'growing', 'run on', 'never stopped'],
    countsToward: 'structure',
    detect({ sentences }) {
      const limit = SETTINGS.structure.longSentenceWords;
      return sentences
        .filter((s) => s.words.length > limit)
        .map((s) => ({ text: s.text.trim().slice(0, 60) + '…', index: s.start }));
    },
  },

  {
    id: 'trailing_ending',
    label: 'Trailing endings',
    better: 'Land the last word',
    hints: ['trailed off', 'faded', 'no ending', 'did not finish', 'trailing'],
    countsToward: 'structure',
    detect({ sentences }) {
      const hits = [];
      sentences.forEach((s) => {
        const last = s.words[s.words.length - 1];
        if (!last) return;
        if (TRAIL_WORDS.includes(last.toLowerCase().replace(/[^a-z]/g, ''))) {
          hits.push({ text: last, index: s.end - last.length });
        }
      });
      return hits;
    },
  },

  {
    id: 'over_explaining',
    label: 'Over-explaining',
    better: 'Point first, detail only if asked',
    hints: ['too much', 'over explained', 'background', 'extra detail', 'dumped', 'rambled'],
    countsToward: 'brevity',
    /* Fires when your point did NOT land in the first sentence and the answer
       still ran long. That is the information-dumping shape from Section 3. */
    detect({ sentences, coreLanded, taskId }) {
      const max = SETTINGS.structure.maxSentences[taskId] || 6;
      if (coreLanded === true) return [];
      if (sentences.length <= Math.ceil(max / 2)) return [];
      return [{ text: sentences.slice(0, 2).map((s) => s.text).join(' ').slice(0, 70) + '…', index: 0 }];
    },
  },

  {
    id: 'indian_english',
    label: 'Indian English phrases',
    better: 'Use the US English version',
    hints: ['indian english', 'phrase', 'new joiner', 'out of home', 'wording'],
    countsToward: 'patternOnly',
    detect({ text }, extraPhrases = []) {
      const list = INDIAN_ENGLISH_SEEDS.concat(extraPhrases);
      const hits = [];
      list.forEach((phrase) => {
        const n = countPhrase(text, phrase);
        for (let i = 0; i < n; i += 1) hits.push({ text: phrase, index: text.toLowerCase().indexOf(phrase.toLowerCase()) });
      });
      return hits;
    },
  },

  {
    id: 'word_mixup',
    label: 'Word mix-ups',
    better: 'Use the word you meant',
    hints: ['wrong word', 'mixed up', 'upscaling', 'upskilling', 'mispronounced'],
    countsToward: 'patternOnly',
    detect({ text }, extraPhrases = []) {
      const list = WORD_MIXUP_SEEDS.concat(extraPhrases);
      const hits = [];
      list.forEach((phrase) => {
        const n = countPhrase(text, phrase);
        for (let i = 0; i < n; i += 1) hits.push({ text: phrase, index: text.toLowerCase().indexOf(phrase.toLowerCase()) });
      });
      return hits;
    },
  },

  {
    id: 'too_casual',
    label: 'Too casual with seniors',
    better: '"Okay" or "Got it"',
    hints: ['casual', 'informal', 'okayy', 'tone', 'too friendly'],
    countsToward: 'patternOnly',
    detect({ text }) {
      const hits = [];
      TOO_CASUAL_SEEDS.forEach((phrase) => {
        const n = countPhrase(text, phrase);
        for (let i = 0; i < n; i += 1) hits.push({ text: phrase, index: text.toLowerCase().indexOf(phrase.toLowerCase()) });
      });
      return hits;
    },
  },
];

export function patternById(id) {
  return PATTERNS.find((p) => p.id === id);
}

/** Patterns that are switched on in settings.js. */
export function activePatterns() {
  return PATTERNS.filter((p) => SETTINGS.patterns.enabled[p.id] !== false);
}
