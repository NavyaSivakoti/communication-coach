/* ==========================================================================
   settings.js  —  THE ONLY FILE YOU NEED TO EDIT TO TUNE SCORING
   --------------------------------------------------------------------------
   Every number the app uses to score you lives here. Nothing else does.
   Change a number, commit, and GitHub Pages redeploys in about 30 seconds.
   You can edit this straight from github.com on your phone.

   Scores are always 1 to 10. Anything called "pointsLost" or "penalty" is
   subtracted from 10.
   ========================================================================== */

export const SETTINGS = {
  settingsVersion: 4,

  /* ---------------------------------------------------------------- PROFILE
     Section 2 of the spec. Kept here (not hardcoded) so another user can
     have their own. */
  profile: {
    name: 'Navya',
    level: 'B1/B2',
    startingScore: 6.5,
    reminderTime: '12:15',
    currentChallengeId: 1,
  },

  /* ------------------------------------------------------------------- PACE
     Words per minute. Section 0 target is 130-160. */
  pace: {
    targetMin: 130,
    targetMax: 160,
    // One point comes off for every this-many wpm outside the target band.
    wpmPerPointLost: 8,
    // Below this, assume the recogniser dropped most of the audio and don't
    // punish you for it.
    ignoreBelowWords: 12,
  },

  /* ---------------------------------------------------------------- BREVITY
     Answer length vs the target for that task. Section 11: 10 if within
     target, lose points for every 10 seconds over. */
  brevity: {
    targets: {
      task1: { seconds: 60, graceSeconds: 10, words: 160 },  // 60-second answer
      task2: { seconds: 20, graceSeconds: 5,  words: 55  },  // spoken cut drill
      task3: { seconds: 45, graceSeconds: 10, words: 120 },  // real-life retell
    },
    pointsPerTenSecondsOver: 1.5,
    // Answering in a tenth of the target isn't brevity, it's not answering.
    tooShortRatio: 0.35,
    pointsPerTenSecondsUnder: 0.75,
  },

  /* ---------------------------------------------------------------- FILLERS
     Fillers per minute. 10 for zero, minus 2 per filler per minute.

     NOTE: "so" and "right?" are deliberately NOT in this list. They are
     tracked as PATTERNS instead (see overlapPolicy below), so one habit
     only costs you points once. Move them here if you change your mind.

     WARNING: phone speech recognition usually deletes "um" and "uh" before
     you ever see the transcript. Run Settings > Check my phone to see
     whether yours does. If it does, this score under-counts. */
  fillers: {
    list: [
      'um', 'uh', 'er', 'erm', 'hmm',
      'like', 'basically', 'actually', 'literally',
      'you know', 'i mean', 'kind of', 'sort of', 'stuff like that',
    ],
    penaltyPerFillerPerMinute: 2,
    // Only count a filler when it stands alone as a word. Stops "like" in
    // "I like the plan" from being counted.
    countOnlyStandalone: true,
    // Words that are real words too. These are only counted as fillers when
    // they sit at a sentence start or end, or next to a pause.
    contextSensitive: ['like', 'actually', 'literally'],
  },

  /* ------------------------------------------------------------ POINT FIRST
     Compares your Core (the 8-words-or-less point you said first) against
     your first sentence. Section 11. */
  pointFirst: {
    // Small words ignored when matching.
    stopwords: [
      'a','an','the','is','are','was','were','be','been','being','am',
      'i','my','me','we','our','you','your','it','its','they','them','their',
      'to','of','in','on','at','for','with','and','or','but','that','this',
      'so','if','as','by','from','have','has','had','do','does','did','will',
      'would','can','could','should','just','about','what','when','how','not',
    ],
    // Fraction of your Core's keywords that must land in sentence 1 for a 10.
    fullCreditCoverage: 0.6,
    // Each sentence later your point arrives costs this much.
    pointsLostPerLateSentence: 2.5,
    // Your core never shows up at all.
    neverAppearsScore: 1,
    // Match word stems, not exact words, so "reproducing" matches "reproduce".
    // This also softens accent-related mishearings.
    useStemMatching: true,
    stemMinLength: 4,
  },

  /* -------------------------------------------------------------- STRUCTURE
     Sentence count and average sentence length, plus "So" openers and
     "right?" endings. Section 11. */
  structure: {
    longSentenceWords: 25,
    pointsPerLongSentence: 1.5,
    maxSentences: { task1: 6, task2: 2, task3: 5 },
    pointsPerExtraSentence: 1,
    idealAvgSentenceWords: 18,
    pointsPerAvgWordOver: 0.15,
    // Cost of each "So" opener / "right?" ending found.
    pointsPerPatternHit: 1,
  },

  /* --------------------------------------------------------- OVERLAP POLICY
     Some habits appear in both the filler list (Section 11) and the pattern
     list (Section 5). This decides where each one is counted so you are
     never penalised twice for the same word.
       'pattern' = counts in Structure + Pattern Tracker (earns a green check)
       'filler'  = counts in the Fillers score only
       'both'    = counts in both. Harshest. */
  overlapPolicy: {
    'so': 'pattern',
    'right?': 'pattern',
  },

  /* ----------------------------------------------- MEASURED BUT NOT SCORED
     Section 11 says show these but don't score them until they prove
     reliable. Flip `scored` to true once you trust them. */
  longPauses: {
    thresholdSeconds: 3,
    scored: false,
  },
  timeToFirstPoint: {
    targetSeconds: 8,
    scored: false,
  },

  /* -------------------------------------------------------------- CORE STEP
     The 3C step: say your one point in 8 words or less, in 15 seconds. */
  coreStep: {
    seconds: 15,
    maxWords: 8,
    // Section 7 only puts the Core step in Task 1. Set this to true to be
    // asked for a core on Tasks 2 and 3 as well. Without a core there is
    // nothing to compare your first sentence against, so Point first is
    // left unscored on those tasks rather than guessed at.
    askOnAllTasks: true,
  },

  /* ---------------------------------------------------------------- OVERALL
     Overall = weighted average of the five. Set a weight to 0 to switch a
     score off entirely. */
  overall: {
    weights: {
      pointFirst: 1,
      brevity: 1,
      fillers: 1,
      pace: 1,
      structure: 1,
    },
    passScore: 8,
    passesToClearChallenge: 3,
  },

  /* --------------------------------------------------------------- PATTERNS
     Section 5. The detectors themselves live in patterns.js; these are the
     knobs. Set any id to false to stop tracking it. */
  patterns: {
    greenCheckDays: 7,
    enabled: {
      so_opener: true,
      right_ending: true,
      growing_sentence: true,
      trailing_ending: true,
      over_explaining: true,
      indian_english: true,
      word_mixup: true,
      too_casual: true,
    },
  },

  /* ------------------------------------------------------------ QUICK CHECK
     Section 8. Rule-based review of a message before you send it. */
  quickCheck: {
    maxWordsPerSentence: 25,
    maxSentences: 6,
    maxTotalWords: 120,
    // How often it asks "What would you change?" before showing results.
    // 0 = never, 1 = every time. Section 8 says "some messages, not every".
    askFirstChance: 0.4,
  },

  /* --------------------------------------------------------------- FEEDBACK
     One rule-based tip tied to your lowest score. Section 11 item 5.
     Add your own lines freely; the app picks one at random. */
  tips: {
    pointFirst: [
      'Your point arrived late. Next time, say your Core sentence first, word for word, then explain.',
      'Start with the answer, not the setup. Background is only useful after someone knows what you think.',
      'If your first sentence does not contain your Core, delete it and start there instead.',
    ],
    // Used when the answer ran long.
    brevity: [
      'You ran long. Point first, one example, stop. The example is optional.',
      'Cut the second example. One is enough to make a point land.',
      'When you feel yourself adding context, that is the moment to stop talking.',
    ],
    // Used when the answer was far under the target, which usually means the
    // question was not really answered.
    brevityShort: [
      'That was very short. Brevity is answering fully in few words, not answering less.',
      'You stopped before the point landed. Say the point, then one example.',
      'Too short reads as unsure. Give the point and one concrete detail.',
    ],
    fillers: [
      'Fillers cluster where you are thinking. Pause silently instead. Silence sounds more confident than "um".',
      'Replace the filler with a full stop. A short pause reads as control, not hesitation.',
      'You reach for fillers at sentence starts. Decide the sentence before you open your mouth.',
    ],
    // Fallback when the direction is not known.
    pace: [
      'Pace drifts when you are searching for the point. Fix the point, the pace follows.',
    ],
    // Used when you spoke faster than the target band.
    paceFast: [
      'You sped up. Slow to the pace you would use reading a sentence aloud to a child.',
      'Rushing hides the point. Say fewer words, more slowly.',
      'You talk faster when you are nervous. Breathe at the full stops.',
    ],
    // Used when you spoke slower than the target band.
    paceSlow: [
      'Too slow reads as unsure. Land each sentence and move on.',
      'You are thinking mid-sentence. Decide the sentence, then say it at full speed.',
      'Long gaps between words invite interruption. Keep the sentence moving.',
    ],
    structure: [
      'Your sentences kept growing. Decide the point, say it, stop, then start a new sentence.',
      'Cut every sentence over 25 words in half. Both halves will be clearer.',
      'You are using more sentences than this answer needs. Which two would you keep?',
    ],
  },

  /* ---------------------------------------------------------------- STORAGE
     Everything stays on your device. Recordings are the big files, so they
     are pruned first. */
  storage: {
    keepRecordingsDays: 14,
    maxSessionsKept: 500,
  },

  /* ----------------------------------------------------------------- SPEECH */
  speech: {
    lang: 'en-US',
    ttsRate: 0.95,
    ttsPitch: 1.0,
    // Try to record audio for playback alongside recognition. If your phone
    // cannot do both, the app keeps recognition and disables playback by
    // itself. You chose recognition over playback.
    tryPlayback: true,
    // Phone browsers stop listening after a silence. This restarts them.
    autoRestartRecognition: true,
    maxRecordSeconds: 180,
  },

  /* ----------------------------------------------------------------- REPORT
     Section 16. */
  report: {
    weekStartsOnSunday: true,
    includeSampleTranscripts: true,
  },

  /* ------------------------------------------- READY-MADE CLAUDE QUESTIONS
     Section 15. These go at the top of anything you copy out of the app. */
  claudePrompts: {
    quickCheck:
      'Review this message I’m about to send to [recipient]. Keep my meaning and tone, make it clear, natural US English, and shorter. Tell me the 2 or 3 things you changed. Don’t use em dashes.',
    singleAnswer:
      'Here’s a practice answer from my communication app, with my core point and scores. Tell me whether I led with the right point, give me a cleaner version about half the length, and name the one thing to fix.',
    weekly:
      'This is my weekly report from my communication coach app. Please tell me: (1) my biggest improvement this week, (2) the one habit I should focus on next week and a daily drill for it, (3) anything in my transcripts I’m not noticing, including new phrases to add to my Phrase Library, (4) cleaner versions of my weakest answers, and (5) based on my app notes, what should change in the app or its scoring settings.',
  },
};

export default SETTINGS;

/* ==========================================================================
   validateSettings()
   --------------------------------------------------------------------------
   You edit this file on github.com and the app picks it up on the next load.
   This checks the shape of what you wrote, so a typo shows up as a warning on
   the Settings screen instead of as silently wrong scores.
   ========================================================================== */

export function validateSettings(s = SETTINGS) {
  const problems = [];
  const num = (path, v, { min = -Infinity, max = Infinity } = {}) => {
    if (typeof v !== 'number' || Number.isNaN(v)) {
      problems.push(`${path} should be a number, got ${JSON.stringify(v)}`);
    } else if (v < min || v > max) {
      problems.push(`${path} is ${v}, expected between ${min} and ${max}`);
    }
  };

  num('pace.targetMin', s.pace.targetMin, { min: 40, max: 400 });
  num('pace.targetMax', s.pace.targetMax, { min: 40, max: 400 });
  if (s.pace.targetMin >= s.pace.targetMax) {
    problems.push('pace.targetMin must be lower than pace.targetMax');
  }
  num('pace.wpmPerPointLost', s.pace.wpmPerPointLost, { min: 0.5 });

  ['task1', 'task2', 'task3'].forEach((t) => {
    const target = s.brevity.targets[t];
    if (!target) { problems.push(`brevity.targets.${t} is missing`); return; }
    num(`brevity.targets.${t}.seconds`, target.seconds, { min: 5 });
    num(`brevity.targets.${t}.words`, target.words, { min: 5 });
    num(`brevity.targets.${t}.graceSeconds`, target.graceSeconds, { min: 0 });
  });
  num('brevity.tooShortRatio', s.brevity.tooShortRatio, { min: 0, max: 1 });

  if (!Array.isArray(s.fillers.list) || !s.fillers.list.length) {
    problems.push('fillers.list is empty, so nothing will be counted as a filler');
  }
  num('fillers.penaltyPerFillerPerMinute', s.fillers.penaltyPerFillerPerMinute, { min: 0 });

  num('pointFirst.fullCreditCoverage', s.pointFirst.fullCreditCoverage, { min: 0.1, max: 1 });
  num('pointFirst.pointsLostPerLateSentence', s.pointFirst.pointsLostPerLateSentence, { min: 0 });
  num('structure.longSentenceWords', s.structure.longSentenceWords, { min: 5 });
  num('coreStep.maxWords', s.coreStep.maxWords, { min: 1 });
  num('patterns.greenCheckDays', s.patterns.greenCheckDays, { min: 1 });

  const weightTotal = Object.values(s.overall.weights).reduce((a, b) => a + b, 0);
  if (weightTotal <= 0) problems.push('every score in overall.weights is 0, so nothing can be scored');

  Object.entries(s.overlapPolicy || {}).forEach(([word, where]) => {
    if (!['pattern', 'filler', 'both'].includes(where)) {
      problems.push(`overlapPolicy["${word}"] is "${where}", expected "pattern", "filler" or "both"`);
    }
  });

  ['pointFirst', 'brevity', 'fillers', 'pace', 'structure'].forEach((k) => {
    if (!Array.isArray(s.tips[k]) || !s.tips[k].length) {
      problems.push(`tips.${k} is empty, so no tip can be shown for that score`);
    }
  });

  return problems;
}

/** The numbers worth eyeballing on the phone after an edit. */
export function settingsSummary(s = SETTINGS) {
  return [
    ['Pace target', `${s.pace.targetMin}–${s.pace.targetMax} wpm`],
    ['Task 1 target', `${s.brevity.targets.task1.seconds}s / ${s.brevity.targets.task1.words} words`],
    ['Task 2 target', `${s.brevity.targets.task2.seconds}s / ${s.brevity.targets.task2.words} words`],
    ['Task 3 target', `${s.brevity.targets.task3.seconds}s / ${s.brevity.targets.task3.words} words`],
    ['Filler penalty', `${s.fillers.penaltyPerFillerPerMinute} per filler per minute`],
    ['Fillers counted', `${s.fillers.list.length} words`],
    ['Point-first threshold', `${Math.round(s.pointFirst.fullCreditCoverage * 100)}% of core in sentence 1`],
    ['Late-point penalty', `${s.pointFirst.pointsLostPerLateSentence} per sentence`],
    ['Long sentence', `over ${s.structure.longSentenceWords} words`],
    ['Core step', `${s.coreStep.seconds}s, ${s.coreStep.maxWords} words max`],
    ['Green check after', `${s.patterns.greenCheckDays} clear days`],
    ['Pass score', `${s.overall.passScore}/10`],
    ['"so" counts as', s.overlapPolicy.so === 'pattern' ? 'a pattern' : s.overlapPolicy.so === 'filler' ? 'a filler' : 'both'],
    ['"right?" counts as', s.overlapPolicy['right?'] === 'pattern' ? 'a pattern' : s.overlapPolicy['right?'] === 'filler' ? 'a filler' : 'both'],
    ['Recordings kept', `${s.storage.keepRecordingsDays} days`],
  ];
}
