/* ==========================================================================
   scoring.js  —  the five scores, the voice measurements, the patterns
   --------------------------------------------------------------------------
   Section 11. Every number used here comes from settings.js. Nothing in this
   file needs editing to tune the scoring.

   Honest limit, repeated from the spec: these are signals, not judgments.
   They cannot tell whether your point was the RIGHT point. That is what the
   weekly Claude review is for.
   ========================================================================== */

import { SETTINGS } from './settings.js';
import { activePatterns, countPhrase } from './patterns.js';

const clamp = (n, lo = 1, hi = 10) => Math.max(lo, Math.min(hi, n));
const round1 = (n) => Math.round(n * 10) / 10;

/* ========================================================== TEXT PLUMBING == */

export function words(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Crude stemmer. Enough to match "reproducing" with "reproduce". */
export function stem(word) {
  if (!SETTINGS.pointFirst.useStemMatching) return word;
  const w = word.toLowerCase();
  if (w.length < SETTINGS.pointFirst.stemMinLength) return w;
  for (const suffix of ['ingly', 'edly', 'ing', 'ers', 'er', 'ed', 'es', 'ly', 's']) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      return w.slice(0, w.length - suffix.length);
    }
  }
  return w;
}

/**
 * Split a transcript into sentences.
 *
 * Phone speech recognition gives almost no punctuation on Android and only
 * some on iPhone, so we fall back to the recogniser's own phrase segments,
 * which it ends on every pause. That is closer to how you actually spoke
 * than guessing from text alone.
 */
export function splitSentences(text, segments = []) {
  const raw = (text || '').trim();
  if (!raw) return [];

  const byPunctuation = (raw.match(/[^.!?]+[.!?]*/g) || [raw])
    .map((x) => x.trim())
    .filter(Boolean);
  const bySegment = segments.map((x) => (x || '').trim()).filter(Boolean);

  // Prefer real punctuation, but only when it actually found sentence breaks.
  // A single trailing "?" is not a sentence split, and on Android there is
  // usually no punctuation at all, so the pause segments are all we have.
  let parts;
  if (byPunctuation.length > 1) parts = byPunctuation;
  else if (bySegment.length > 1) parts = bySegment;
  else parts = [raw];

  let cursor = 0;
  return parts
    .map((part) => {
      const t = part.trim();
      if (!t) return null;
      const start = raw.indexOf(t, cursor);
      const at = start === -1 ? cursor : start;
      cursor = at + t.length;
      return { text: t, words: words(t), start: at, end: at + t.length };
    })
    .filter(Boolean);
}

/* ================================================= OVERLAP: FILLER V PATTERN
   Some habits sit in both lists. settings.overlapPolicy decides where each
   one is counted, so you are never penalised twice for one habit. */

const OVERLAP_TO_PATTERN = { so: 'so_opener', 'right?': 'right_ending' };

function effectiveFillerList() {
  const policy = SETTINGS.overlapPolicy || {};
  return SETTINGS.fillers.list.filter((w) => {
    const p = policy[w.toLowerCase()];
    return p !== 'pattern';
  }).concat(
    // Anything the policy explicitly sends to 'filler' or 'both'.
    Object.keys(policy)
      .filter((w) => policy[w] === 'filler' || policy[w] === 'both')
      .filter((w) => !SETTINGS.fillers.list.includes(w)),
  );
}

function patternIsSuppressed(patternId) {
  const policy = SETTINGS.overlapPolicy || {};
  return Object.keys(policy).some(
    (w) => OVERLAP_TO_PATTERN[w] === patternId && policy[w] === 'filler',
  );
}

/* ========================================================= MEASUREMENTS ==== */

export function countFillers(text, sentences) {
  const list = effectiveFillerList();
  const sensitive = SETTINGS.fillers.contextSensitive || [];
  const lower = ' ' + (text || '').toLowerCase() + ' ';
  const found = [];

  list.forEach((filler) => {
    const f = filler.toLowerCase();
    if (sensitive.includes(f)) {
      // Real words too. Only count them at a sentence edge, where they are
      // doing filler work rather than carrying meaning.
      sentences.forEach((s) => {
        const sw = s.words;
        if (!sw.length) return;
        if (sw[0] === f) found.push(f);
        if (sw.length > 1 && sw[sw.length - 1] === f) found.push(f);
      });
    } else {
      const n = countPhrase(lower, f);
      for (let i = 0; i < n; i += 1) found.push(f);
    }
  });

  return { count: found.length, found };
}

/** Pauses of 3+ seconds mid-answer, estimated from when results arrived. */
export function findLongPauses(timeline) {
  const threshold = SETTINGS.longPauses.thresholdSeconds * 1000;
  const pauses = [];
  for (let i = 1; i < timeline.length; i += 1) {
    const gap = timeline[i].t - timeline[i - 1].t;
    if (gap >= threshold) pauses.push({ atMs: timeline[i - 1].t, lengthMs: gap });
  }
  return pauses;
}

/** Seconds until your core point showed up in the running transcript. */
export function timeToFirstPoint(timeline, coreStems) {
  if (!coreStems.length || !timeline.length) return null;
  const need = SETTINGS.pointFirst.fullCreditCoverage;
  for (const entry of timeline) {
    const said = new Set(words(entry.text).map(stem));
    const hit = coreStems.filter((k) => said.has(k)).length;
    if (hit / coreStems.length >= need) return round1(entry.t / 1000);
  }
  return null;
}

/* =============================================================== SCORES ==== */

export function scorePointFirst(core, sentences) {
  const stops = new Set(SETTINGS.pointFirst.stopwords);
  const coreStems = [...new Set(words(core).filter((w) => !stops.has(w)).map(stem))];

  if (!coreStems.length) {
    return { score: null, coreStems, coverageFirst: 0, landedAtSentence: null, reason: 'no core given' };
  }

  const coverageAt = (i) => {
    const said = new Set(sentences.slice(0, i + 1).flatMap((s) => s.words.map(stem)));
    return coreStems.filter((k) => said.has(k)).length / coreStems.length;
  };

  const need = SETTINGS.pointFirst.fullCreditCoverage;
  const coverageFirst = sentences.length ? coverageAt(0) : 0;

  if (coverageFirst >= need) {
    return { score: 10, coreStems, coverageFirst, landedAtSentence: 1 };
  }

  let landedIndex = -1;
  for (let i = 1; i < sentences.length; i += 1) {
    if (coverageAt(i) >= need) { landedIndex = i; break; }
  }

  if (landedIndex >= 0) {
    const score = clamp(10 - SETTINGS.pointFirst.pointsLostPerLateSentence * landedIndex);
    return { score: round1(score), coreStems, coverageFirst, landedAtSentence: landedIndex + 1 };
  }

  // Your point never fully arrived. Give partial credit for the pieces of it
  // that did, so a near miss does not score the same as saying nothing.
  const total = sentences.length ? coverageAt(sentences.length - 1) : 0;
  const base = SETTINGS.pointFirst.neverAppearsScore;
  const score = total === 0 ? base : clamp(base + (10 - base) * (total / need) * 0.4);
  return { score: round1(score), coreStems, coverageFirst, landedAtSentence: null };
}

export function scoreBrevity(seconds, wordCount, taskId) {
  const t = SETTINGS.brevity.targets[taskId] || SETTINGS.brevity.targets.task1;
  const limit = t.seconds + t.graceSeconds;

  let secondsScore = 10;
  if (seconds > limit) {
    secondsScore = 10 - SETTINGS.brevity.pointsPerTenSecondsOver * ((seconds - limit) / 10);
  } else if (seconds < t.seconds * SETTINGS.brevity.tooShortRatio) {
    const short = t.seconds * SETTINGS.brevity.tooShortRatio - seconds;
    secondsScore = 10 - SETTINGS.brevity.pointsPerTenSecondsUnder * (short / 10);
  }

  // Same idea for words: one "unit" of words is the same share of the target
  // that 10 seconds is of the time target.
  const unit = t.words / 6;
  let wordsScore = 10;
  if (wordCount > t.words) {
    wordsScore = 10 - SETTINGS.brevity.pointsPerTenSecondsOver * ((wordCount - t.words) / unit);
  }

  return {
    score: round1(clamp(Math.min(secondsScore, wordsScore))),
    targetSeconds: t.seconds,
    targetWords: t.words,
    overBy: round1(Math.max(0, seconds - limit)),
  };
}

export function scoreFillers(fillerCount, seconds) {
  // A floor on the denominator, so one "um" in a four-second answer does not
  // read as 15 fillers a minute.
  const minutes = Math.max(seconds / 60, 0.25);
  const perMinute = fillerCount / minutes;
  const score = clamp(10 - SETTINGS.fillers.penaltyPerFillerPerMinute * perMinute);
  return { score: round1(score), perMinute: round1(perMinute), count: fillerCount };
}

export function scorePace(wordCount, seconds) {
  if (wordCount < SETTINGS.pace.ignoreBelowWords) {
    return { score: null, wpm: null, reason: 'too few words to judge pace' };
  }
  const wpm = Math.round(wordCount / Math.max(seconds / 60, 1 / 60));
  const { targetMin, targetMax, wpmPerPointLost } = SETTINGS.pace;
  if (wpm >= targetMin && wpm <= targetMax) return { score: 10, wpm };
  const distance = wpm < targetMin ? targetMin - wpm : wpm - targetMax;
  return { score: round1(clamp(10 - distance / wpmPerPointLost)), wpm };
}

export function scoreStructure(sentences, patternHits, taskId) {
  const s = SETTINGS.structure;
  let score = 10;
  const reasons = [];

  const longOnes = sentences.filter((x) => x.words.length > s.longSentenceWords);
  if (longOnes.length) {
    score -= longOnes.length * s.pointsPerLongSentence;
    reasons.push(`${longOnes.length} sentence${longOnes.length > 1 ? 's' : ''} over ${s.longSentenceWords} words`);
  }

  const max = s.maxSentences[taskId] || 6;
  if (sentences.length > max) {
    score -= (sentences.length - max) * s.pointsPerExtraSentence;
    reasons.push(`${sentences.length} sentences, target is ${max}`);
  }

  const totalWords = sentences.reduce((n, x) => n + x.words.length, 0);
  const avg = sentences.length ? totalWords / sentences.length : 0;
  if (avg > s.idealAvgSentenceWords) {
    score -= (avg - s.idealAvgSentenceWords) * s.pointsPerAvgWordOver;
    reasons.push(`average sentence ${Math.round(avg)} words`);
  }

  const structural = patternHits.filter((h) => h.countsToward === 'structure');
  const structuralCount = structural.reduce((n, h) => n + h.count, 0);
  if (structuralCount) {
    score -= structuralCount * s.pointsPerPatternHit;
    reasons.push(structural.map((h) => `${h.count}x ${h.label}`).join(', '));
  }

  return {
    score: round1(clamp(score)),
    sentenceCount: sentences.length,
    avgSentenceWords: round1(avg),
    longSentences: longOnes.length,
    reasons,
  };
}

/* ============================================================== PATTERNS === */

export function detectPatterns(ctx, customPhrases = []) {
  const hits = [];
  activePatterns().forEach((p) => {
    if (patternIsSuppressed(p.id)) return;
    let found;
    try {
      found = p.detect(ctx, customPhrases) || [];
    } catch (err) {
      console.warn('pattern detector failed', p.id, err);
      found = [];
    }
    if (found.length) {
      hits.push({
        id: p.id,
        label: p.label,
        better: p.better,
        countsToward: p.countsToward,
        count: found.length,
        examples: found.slice(0, 3).map((f) => f.text),
      });
    }
  });
  return hits;
}

/* ====================================================== SELF-CATCH RATE ==== */

/**
 * Did you name, in the inner editor step, the things the app also found?
 * Section 11: patterns you named that the app also found, over everything
 * the app found.
 */
export function selfCatchRate(innerEditorText, patternHits) {
  if (!patternHits.length) return { rate: null, caught: [], missed: [] };
  const said = (innerEditorText || '').toLowerCase();
  if (!said.trim()) return { rate: 0, caught: [], missed: patternHits.map((h) => h.id) };

  const caught = [];
  const missed = [];
  activePatterns().forEach((p) => {
    const hit = patternHits.find((h) => h.id === p.id);
    if (!hit) return;
    const named = (p.hints || []).some((h) => said.includes(h.toLowerCase()));
    if (named) caught.push(p.id); else missed.push(p.id);
  });

  return {
    rate: patternHits.length ? Math.round((caught.length / patternHits.length) * 100) / 100 : null,
    caught,
    missed,
  };
}

/* ============================================================ THE WHOLE JOB  */

/**
 * Score one spoken answer.
 *
 * @param {object} input
 *   transcript   string  what the recogniser heard
 *   segments     array   recogniser phrase chunks (sentence fallback)
 *   timeline     array   [{t, text}] when words arrived
 *   durationMs   number  how long you spoke
 *   core         string  your 8-words-or-less point from the Core step
 *   taskId       string  'task1' | 'task2' | 'task3'
 *   innerEditor  string  what you said you would fix
 *   customPhrases array  phrases you added to the Phrase Library
 */
export function scoreAnswer(input) {
  const {
    transcript = '', segments = [], timeline = [], durationMs = 0,
    core = '', taskId = 'task1', innerEditor = '', customPhrases = [],
  } = input;

  const seconds = Math.max(durationMs / 1000, 0.1);
  const sentences = splitSentences(transcript, segments);
  const allWords = words(transcript);
  const wordCount = allWords.length;

  const pointFirst = scorePointFirst(core, sentences);
  const coreLanded = pointFirst.score === null
    ? null
    : pointFirst.coverageFirst >= SETTINGS.pointFirst.fullCreditCoverage;

  const patternHits = detectPatterns(
    { sentences, words: allWords, text: transcript, taskId, coreLanded },
    customPhrases,
  );

  const fillers = countFillers(transcript, sentences);
  const fillerScore = scoreFillers(fillers.count, seconds);
  const brevity = scoreBrevity(seconds, wordCount, taskId);
  const pace = scorePace(wordCount, seconds);
  const structure = scoreStructure(sentences, patternHits, taskId);

  const scores = {
    pointFirst: pointFirst.score,
    brevity: brevity.score,
    fillers: fillerScore.score,
    pace: pace.score,
    structure: structure.score,
  };

  // Weighted average. Scores that came back null (no core given, too few
  // words to judge pace) are left out instead of counted as zero.
  const weights = SETTINGS.overall.weights;
  let sum = 0;
  let weightTotal = 0;
  Object.keys(scores).forEach((k) => {
    if (scores[k] === null || !weights[k]) return;
    sum += scores[k] * weights[k];
    weightTotal += weights[k];
  });
  const overall = weightTotal ? round1(sum / weightTotal) : null;

  const pauses = findLongPauses(timeline);
  const ttfp = timeToFirstPoint(timeline, pointFirst.coreStems);

  return {
    scores,
    overall,
    detail: { pointFirst, brevity, fillers: fillerScore, pace, structure },
    measurements: {
      wpm: pace.wpm,
      seconds: round1(seconds),
      wordCount,
      sentenceCount: sentences.length,
      timeToFirstPointSeconds: ttfp,
      longPauses: pauses.length,
      longPauseDetail: pauses,
      fillersPerMinute: fillerScore.perMinute,
      fillerCount: fillers.count,
      fillersFound: fillers.found,
    },
    patterns: patternHits,
    selfCatch: selfCatchRate(innerEditor, patternHits),
    firstSentence: sentences.length ? sentences[0].text : '',
    sentences: sentences.map((s) => s.text),
  };
}

/* ================================================================ TIPS ===== */

/**
 * One rule-based tip tied to your lowest score. Section 11, item 5.
 *
 * `measurements` is optional but worth passing: without it a pace tip is
 * picked at random and can tell you to slow down when you were too slow.
 */
export function tipForLowestScore(scores, measurements = null, taskId = 'task1') {
  const entries = Object.entries(scores).filter(([, v]) => v !== null);
  if (!entries.length) return null;
  entries.sort((a, b) => a[1] - b[1]);
  const [area] = entries[0];

  let key = area;

  if (area === 'pace' && measurements && typeof measurements.wpm === 'number') {
    if (measurements.wpm > SETTINGS.pace.targetMax) key = 'paceFast';
    else if (measurements.wpm < SETTINGS.pace.targetMin) key = 'paceSlow';
  }

  if (area === 'brevity' && measurements && typeof measurements.seconds === 'number') {
    const t = SETTINGS.brevity.targets[taskId] || SETTINGS.brevity.targets.task1;
    if (measurements.seconds < t.seconds * SETTINGS.brevity.tooShortRatio) key = 'brevityShort';
  }

  const pool = (SETTINGS.tips[key] && SETTINGS.tips[key].length)
    ? SETTINGS.tips[key]
    : SETTINGS.tips[area] || [];
  if (!pool.length) return null;
  return { area, text: pool[Math.floor(Math.random() * pool.length)] };
}

export function bestAndWorst(scores) {
  const entries = Object.entries(scores).filter(([, v]) => v !== null);
  if (!entries.length) return { best: null, worst: null };
  entries.sort((a, b) => b[1] - a[1]);
  return { best: entries[0], worst: entries[entries.length - 1] };
}

/* ========================================================== QUICK CHECK ==== */

/** Section 8. Same rules, applied to typed or dictated text instead. */
export function quickCheck(text, customPhrases = []) {
  const q = SETTINGS.quickCheck;
  const sentences = splitSentences(text, []);
  const allWords = words(text);
  const fillers = countFillers(text, sentences);
  const patternHits = detectPatterns(
    { sentences, words: allWords, text, taskId: 'task1', coreLanded: null },
    customPhrases,
  );

  const issues = [];
  sentences.forEach((s, i) => {
    if (s.words.length > q.maxWordsPerSentence) {
      issues.push({ kind: 'long-sentence', text: `Sentence ${i + 1} is ${s.words.length} words. Cut it in half.` });
    }
  });
  if (sentences.length > q.maxSentences) {
    issues.push({ kind: 'too-many', text: `${sentences.length} sentences. Aim for ${q.maxSentences} or fewer.` });
  }
  if (allWords.length > q.maxTotalWords) {
    issues.push({ kind: 'too-long', text: `${allWords.length} words. Aim for under ${q.maxTotalWords}.` });
  }
  if (fillers.count) {
    issues.push({ kind: 'fillers', text: `${fillers.count} filler${fillers.count > 1 ? 's' : ''}: ${[...new Set(fillers.found)].join(', ')}.` });
  }
  patternHits.forEach((h) => {
    issues.push({ kind: 'pattern', text: `${h.label} (${h.count}x). Better: ${h.better}.` });
  });

  return {
    issues,
    fillers,
    patterns: patternHits,
    stats: {
      words: allWords.length,
      sentences: sentences.length,
      avgWordsPerSentence: sentences.length ? round1(allWords.length / sentences.length) : 0,
    },
  };
}

/* ========================================================= HIGHLIGHTING ==== */

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Wrap fillers and pattern phrases in <mark> so you can see them in your own
 * transcript. Section 11, feedback item 4.
 */
export function highlightTranscript(text, patternHits, customPhrases = []) {
  let html = escapeHtml(text || '');

  const fillerWords = effectiveFillerList();
  const patternWords = [];
  patternHits.forEach((h) => {
    if (h.id === 'indian_english' || h.id === 'word_mixup' || h.id === 'too_casual') {
      h.examples.forEach((e) => patternWords.push(e));
    }
  });
  customPhrases.forEach((p) => patternWords.push(p));

  const wrap = (list, cls) => {
    list
      .filter(Boolean)
      .sort((a, b) => b.length - a.length) // longest first, so "you know" beats "know"
      .forEach((w) => {
        const re = new RegExp(`(^|[^a-zA-Z0-9>])(${escapeRegex(w)})(?![^<]*>)([^a-zA-Z0-9<]|$)`, 'gi');
        html = html.replace(re, (m, pre, hit, post) => `${pre}<mark class="${cls}">${hit}</mark>${post}`);
      });
  };

  wrap(patternWords, 'hl-pattern');
  wrap(fillerWords, 'hl-filler');

  // Sentence-level patterns are marked at the start of the sentence.
  if (patternHits.some((h) => h.id === 'so_opener')) {
    html = html.replace(/(^|[.!?]\s+)(so)\b/gi, (m, pre, hit) => `${pre}<mark class="hl-pattern">${hit}</mark>`);
  }
  if (patternHits.some((h) => h.id === 'right_ending')) {
    html = html.replace(/\b(right\s*\?)/gi, '<mark class="hl-pattern">$1</mark>');
  }

  return html;
}
