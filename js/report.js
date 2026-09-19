/* ==========================================================================
   report.js  —  weekly report (Section 16) and the week-over-week maths
   --------------------------------------------------------------------------
   Plain text with simple headings, so it pastes cleanly into any chat.
   The ready-made question sits at the top, so Claude knows what to do with it.
   ========================================================================== */

import { SETTINGS } from './settings.js';
import { PATTERNS, activePatterns } from './patterns.js';
import { getSessions, getNotes, getMeta, getReports } from './storage.js';
import { challengeById } from './questions.js';

const round1 = (n) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10);

/* ================================================================ DATES ==== */

export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function yesterdayKey(d = new Date()) {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  return dayKey(x);
}

/** The week containing `date`, starting Sunday (Section 16 says Sunday). */
export function weekBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const offset = SETTINGS.report.weekStartsOnSunday ? start.getDay() : (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end, key: dayKey(start) };
}

export function previousWeekBounds(date = new Date()) {
  const { start } = weekBounds(date);
  const prev = new Date(start);
  prev.setDate(prev.getDate() - 7);
  return weekBounds(prev);
}

function inRange(session, bounds) {
  const t = new Date(session.at).getTime();
  return t >= bounds.start.getTime() && t < bounds.end.getTime();
}

/* ========================================================== AGGREGATION ==== */

function mean(list) {
  const nums = list.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Roll up a set of answers into the numbers the report and the progress
 * screen both need.
 */
export function aggregate(sessions) {
  // Re-records count as practice but would flatter the averages, so the
  // headline numbers use first attempts only. Re-records are reported
  // separately as the before/after gain.
  const firstAttempts = sessions.filter((s) => s.attempt !== 2);

  const patternCounts = {};
  sessions.forEach((s) => {
    (s.patterns || []).forEach((p) => {
      patternCounts[p.id] = (patternCounts[p.id] || 0) + p.count;
    });
  });

  const selfCatchValues = sessions
    .map((s) => (s.selfCatch ? s.selfCatch.rate : null))
    .filter((r) => typeof r === 'number');

  const days = new Set(sessions.map((s) => dayKey(new Date(s.at))));

  return {
    count: sessions.length,
    answers: firstAttempts.length,
    daysPractised: days.size,
    overall: round1(mean(firstAttempts.map((s) => s.overall))),
    scores: {
      pointFirst: round1(mean(firstAttempts.map((s) => s.scores && s.scores.pointFirst))),
      brevity: round1(mean(firstAttempts.map((s) => s.scores && s.scores.brevity))),
      fillers: round1(mean(firstAttempts.map((s) => s.scores && s.scores.fillers))),
      pace: round1(mean(firstAttempts.map((s) => s.scores && s.scores.pace))),
      structure: round1(mean(firstAttempts.map((s) => s.scores && s.scores.structure))),
    },
    voice: {
      wpm: round1(mean(firstAttempts.map((s) => s.measurements && s.measurements.wpm))),
      timeToFirstPoint: round1(mean(firstAttempts.map((s) => s.measurements && s.measurements.timeToFirstPointSeconds))),
      seconds: round1(mean(firstAttempts.map((s) => s.measurements && s.measurements.seconds))),
      longPauses: round1(mean(firstAttempts.map((s) => s.measurements && s.measurements.longPauses))),
      fillersPerAnswer: round1(mean(firstAttempts.map((s) => s.measurements && s.measurements.fillerCount))),
      fillersPerMinute: round1(mean(firstAttempts.map((s) => s.measurements && s.measurements.fillersPerMinute))),
    },
    patternCounts,
    selfCatch: selfCatchValues.length ? round1(mean(selfCatchValues) * 100) : null,
    sessions,
  };
}

export function weekData(date = new Date()) {
  const all = getSessions();
  const thisWeek = weekBounds(date);
  const lastWeek = previousWeekBounds(date);
  return {
    bounds: thisWeek,
    lastBounds: lastWeek,
    now: aggregate(all.filter((s) => inRange(s, thisWeek))),
    prev: aggregate(all.filter((s) => inRange(s, lastWeek))),
  };
}

/* ========================================================= GREEN CHECKS ==== */

/**
 * A pattern earns a green check when it has not appeared for N days in a
 * row, and you have actually practised in that window. Section 5.
 */
export function greenChecks(date = new Date()) {
  const days = SETTINGS.patterns.greenCheckDays;
  const cutoff = new Date(date);
  cutoff.setDate(cutoff.getDate() - days);
  const all = getSessions();
  const recent = all.filter((s) => new Date(s.at) >= cutoff);

  return activePatterns().map((p) => {
    const seenRecently = recent.some((s) => (s.patterns || []).some((h) => h.id === p.id));
    const everSeen = all.some((s) => (s.patterns || []).some((h) => h.id === p.id));
    const lastSeen = all
      .filter((s) => (s.patterns || []).some((h) => h.id === p.id))
      .map((s) => s.at)
      .sort()
      .pop() || null;
    return {
      id: p.id,
      label: p.label,
      better: p.better,
      green: everSeen && !seenRecently && recent.length > 0,
      neverSeen: !everSeen,
      lastSeen,
    };
  });
}

/* ============================================================ FORMATTING === */

function delta(now, prev, opts = {}) {
  if (now === null || now === undefined) return 'no data';
  if (prev === null || prev === undefined) return `${now}${opts.unit || ''} (no last week to compare)`;
  const diff = round1(now - prev);
  const sign = diff > 0 ? '+' : '';
  const arrow = diff === 0 ? 'same' : `${sign}${diff}`;
  return `${now}${opts.unit || ''} (last week ${prev}${opts.unit || ''}, ${arrow})`;
}

function line(label, value) {
  return `${label}: ${value}`;
}

/* ====================================================== THE WEEKLY REPORT == */

export function buildWeeklyReport(date = new Date()) {
  const { bounds, lastBounds, now, prev } = weekData(date);
  const notes = getNotes(bounds.key);
  const meta = getMeta();
  const checks = greenChecks(date);
  const profile = { ...SETTINGS.profile };
  const challenge = challengeById(profile.currentChallengeId);

  const L = [];
  const fmtDate = (d) => d.toDateString();

  /* 1. The ready-made question */
  L.push('WEEKLY COMMUNICATION REPORT');
  L.push(`Week of ${fmtDate(bounds.start)} to ${fmtDate(new Date(bounds.end.getTime() - 86400000))}`);
  L.push('');
  L.push(SETTINGS.claudePrompts.weekly);
  L.push('');
  L.push('----------------------------------------');
  L.push('');

  /* 2. Week summary */
  L.push('1. WEEK SUMMARY');
  L.push(line('Sessions completed', `${now.answers} answers across ${now.daysPractised} days`));
  L.push(line('Current streak', `${meta.streak || 0} days (longest ${meta.longestStreak || 0})`));
  L.push(line('Overall score average', delta(now.overall, prev.overall)));
  L.push(line('Current challenge', `${challenge.name} — ${challenge.goal}`));
  L.push('');

  /* 3. Five delivery scores */
  L.push('2. DELIVERY SCORES (1-10, this week vs last week)');
  L.push(line('Point first', delta(now.scores.pointFirst, prev.scores.pointFirst)));
  L.push(line('Brevity    ', delta(now.scores.brevity, prev.scores.brevity)));
  L.push(line('Fillers    ', delta(now.scores.fillers, prev.scores.fillers)));
  L.push(line('Pace       ', delta(now.scores.pace, prev.scores.pace)));
  L.push(line('Structure  ', delta(now.scores.structure, prev.scores.structure)));
  L.push('');

  /* 4. Voice measurements */
  L.push('3. VOICE MEASUREMENTS');
  L.push(line('Speaking pace', `${delta(now.voice.wpm, prev.voice.wpm, { unit: ' wpm' })} — target ${SETTINGS.pace.targetMin}-${SETTINGS.pace.targetMax}`));
  L.push(line('Time to first point', delta(now.voice.timeToFirstPoint, prev.voice.timeToFirstPoint, { unit: 's' })));
  L.push(line('Answer length', delta(now.voice.seconds, prev.voice.seconds, { unit: 's' })));
  L.push(line('Long pauses per answer', `${delta(now.voice.longPauses, prev.voice.longPauses)} — shown, not scored`));
  L.push(line('Fillers per answer', delta(now.voice.fillersPerAnswer, prev.voice.fillersPerAnswer)));
  L.push(line('Fillers per minute', delta(now.voice.fillersPerMinute, prev.voice.fillersPerMinute)));
  L.push('');

  /* 5. Patterns */
  L.push('4. PATTERNS');
  const ids = [...new Set([...Object.keys(now.patternCounts), ...Object.keys(prev.patternCounts)])];
  if (!ids.length) {
    L.push('No patterns detected this week.');
  } else {
    ids
      .sort((a, b) => (now.patternCounts[b] || 0) - (now.patternCounts[a] || 0))
      .forEach((id) => {
        const p = PATTERNS.find((x) => x.id === id);
        const label = p ? p.label : id;
        const n = now.patternCounts[id] || 0;
        const o = prev.patternCounts[id] || 0;
        const change = n - o;
        const changeText = o === 0 ? 'new this week' : `${change > 0 ? '+' : ''}${change} vs last week`;
        L.push(`- ${label}: ${n}x (${changeText})`);
      });
  }
  const earned = checks.filter((c) => c.green);
  L.push('');
  L.push(line('Green checks', earned.length
    ? earned.map((c) => c.label).join(', ') + ` (clear for ${SETTINGS.patterns.greenCheckDays}+ days)`
    : 'none yet'));
  const neverSeen = checks.filter((c) => c.neverSeen);
  if (neverSeen.length) {
    L.push(line('Never detected', neverSeen.map((c) => c.label).join(', ')));
  }
  L.push('');

  /* 6. Self-catch rate */
  L.push('5. SELF-CATCH RATE');
  L.push('(how many of the patterns the app found, I had already named myself in the inner editor step)');
  L.push(line('This week', now.selfCatch === null ? 'no data' : `${now.selfCatch}%`));
  L.push(line('Last week', prev.selfCatch === null ? 'no data' : `${prev.selfCatch}%`));
  L.push('');

  /* 7. Challenges */
  L.push('6. CHALLENGES');
  const passes = now.sessions.filter((s) => s.taskId === 'task1' && s.overall >= SETTINGS.overall.passScore).length;
  L.push(line('Current challenge', challenge.name));
  L.push(line(`Answers at ${SETTINGS.overall.passScore}/10 or above this week`, `${passes} (need ${SETTINGS.overall.passesToClearChallenge} to pass a challenge)`));
  L.push('');

  /* 8. Sample transcripts */
  L.push('7. SAMPLE TRANSCRIPTS');
  if (SETTINGS.report.includeSampleTranscripts && now.sessions.length) {
    const scored = now.sessions.filter((s) => typeof s.overall === 'number').sort((a, b) => b.overall - a.overall);
    const best = scored[0];
    const worst = scored[scored.length - 1];

    const sample = (label, s) => {
      if (!s) return;
      L.push(`--- ${label} (${s.overall}/10) ---`);
      L.push(line('Task', s.taskLabel || s.taskId));
      if (s.question) L.push(line('Question', s.question));
      L.push(line('My core point', s.core || '(none given)'));
      L.push(line('My first sentence', s.firstSentence || '(none)'));
      L.push('Transcript:');
      L.push(s.transcript || '(empty)');
      L.push(line('Scores', Object.entries(s.scores || {})
        .map(([k, v]) => `${k} ${v === null ? 'n/a' : v}`).join(', ')));
      L.push('');
    };

    sample('BEST ANSWER', best);
    if (worst && best && worst.id !== best.id) sample('WEAKEST ANSWER', worst);
  } else {
    L.push('No answers recorded this week.');
    L.push('');
  }

  /* 9 and 10. Notes */
  L.push('8. MY NOTES ON MYSELF');
  L.push(notes.self ? notes.self : '(nothing written this week)');
  L.push('');
  L.push('9. MY NOTES ON THE APP');
  L.push(notes.app ? notes.app : '(nothing written this week)');
  L.push('');
  L.push('----------------------------------------');
  L.push(`Scoring settings version ${SETTINGS.settingsVersion}. All scores are rule-based and calculated on my phone. No AI was used to produce them.`);

  return {
    weekKey: bounds.key,
    generatedAt: new Date().toISOString(),
    text: L.join('\n'),
  };
}

/* ================================================== SINGLE ANSWER EXPORT === */

/** Section 15: the optional per-answer button. */
export function buildAnswerExport(session) {
  const L = [];
  L.push(SETTINGS.claudePrompts.singleAnswer);
  L.push('');
  L.push('----------------------------------------');
  L.push(line('Task', session.taskLabel || session.taskId));
  if (session.question) L.push(line('Question I was asked', session.question));
  L.push(line('My core point (8 words or less)', session.core || '(none given)'));
  L.push(line('My first sentence', session.firstSentence || '(none)'));
  L.push('');
  L.push('My answer:');
  L.push(session.transcript || '(empty)');
  L.push('');
  L.push(line('Scores', Object.entries(session.scores || {})
    .map(([k, v]) => `${k} ${v === null ? 'n/a' : v}`).join(', ')));
  L.push(line('Overall', session.overall === null ? 'n/a' : `${session.overall}/10`));
  const m = session.measurements || {};
  L.push(line('Pace', m.wpm ? `${m.wpm} wpm` : 'n/a'));
  L.push(line('Length', m.seconds ? `${m.seconds}s` : 'n/a'));
  L.push(line('Fillers', m.fillerCount || 0));
  if ((session.patterns || []).length) {
    L.push(line('Patterns found', session.patterns.map((p) => `${p.label} (${p.count}x)`).join(', ')));
  }
  if (session.innerEditor) {
    L.push(line('What I said I would fix', session.innerEditor));
  }
  return L.join('\n');
}

/* ===================================================== QUICK CHECK EXPORT == */

export function buildQuickCheckExport(message, recipient) {
  const prompt = SETTINGS.claudePrompts.quickCheck.replace('[recipient]', recipient || '[recipient]');
  return `${prompt}\n\n----------------------------------------\n${message}`;
}

/* ============================================================== TRENDS ===== */

/** Last N days of overall scores, for the sparkline on the Progress screen. */
export function dailyTrend(days = 14) {
  const all = getSessions().filter((s) => s.attempt !== 2 && typeof s.overall === 'number');
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    const forDay = all.filter((s) => dayKey(new Date(s.at)) === key);
    out.push({
      key,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      value: forDay.length ? round1(mean(forDay.map((s) => s.overall))) : null,
    });
  }
  return out;
}

export function metricTrend(metric, days = 14) {
  const all = getSessions().filter((s) => s.attempt !== 2);
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    const forDay = all.filter((s) => dayKey(new Date(s.at)) === key);
    out.push({
      key,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      value: forDay.length ? round1(mean(forDay.map((s) => s.measurements && s.measurements[metric]))) : null,
    });
  }
  return out;
}

export function mostImproved(date = new Date()) {
  const { now, prev } = weekData(date);
  const areas = Object.keys(now.scores);
  let best = null;
  areas.forEach((a) => {
    if (now.scores[a] === null || prev.scores[a] === null) return;
    const gain = now.scores[a] - prev.scores[a];
    if (best === null || gain > best.gain) best = { area: a, gain: round1(gain) };
  });
  return best;
}

export function hasReportForThisWeek(date = new Date()) {
  const { key } = weekBounds(date);
  return getReports().some((r) => r.weekKey === key);
}
