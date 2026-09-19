/* ==========================================================================
   app.js  —  screens, the daily session, and all the wiring
   ========================================================================== */

import { SETTINGS, validateSettings, settingsSummary } from './settings.js';
import { PATTERNS, activePatterns } from './patterns.js';
import {
  CHALLENGES, challengeById, questionsForChallenge,
  CUT_DRILL_TEXTS, RETELL_PROMPTS, CLOSING_LINES,
} from './questions.js';
import * as store from './storage.js';
import * as speech from './speech.js';
import { scoreAnswer, quickCheck, highlightTranscript, tipForLowestScore, bestAndWorst } from './scoring.js';
import * as report from './report.js';

/* ============================================================== HELPERS === */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied. Paste it into your Claude chat.');
    return true;
  } catch (err) {
    // Safari refuses clipboard writes outside a direct tap sometimes.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    toast(ok ? 'Copied.' : 'Could not copy. Select the text and copy it by hand.');
    return ok;
  }
}

async function shareText(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return true; } catch (err) { return false; }
  }
  return copyText(text);
}

const scoreClass = (n) => (n === null || n === undefined ? 'na' : n >= 8 ? 'good' : n >= 5.5 ? 'mid' : 'low');
const fmt = (n, suffix = '') => (n === null || n === undefined || Number.isNaN(n) ? '–' : `${n}${suffix}`);

const SCORE_LABELS = {
  pointFirst: 'Point first',
  brevity: 'Brevity',
  fillers: 'Fillers',
  pace: 'Pace',
  structure: 'Structure',
};

/* ============================================================== ROUTING === */

const SCREENS = ['home', 'session', 'quick', 'progress', 'more', 'patterns', 'phrases', 'report', 'settings'];
const NAV_FOR = { patterns: 'more', phrases: 'more', report: 'more', settings: 'more' };
let currentScreen = 'home';

function show(name) {
  currentScreen = name;
  SCREENS.forEach((s) => {
    const el = $(`#screen-${s}`);
    if (el) el.classList.toggle('active', s === name);
  });
  const navTarget = NAV_FOR[name] || name;
  $$('nav button').forEach((b) => b.classList.toggle('active', b.dataset.screen === navTarget));
  window.scrollTo(0, 0);

  if (name === 'home') renderHome();
  if (name === 'progress') renderProgress();
  if (name === 'patterns') renderPatterns();
  if (name === 'phrases') renderPhrases();
  if (name === 'report') renderReport();
  if (name === 'settings') renderSettings();
  if (name === 'session' && !session.active) renderSessionIdle();
}

/* ================================================================= HOME === */

function renderHome() {
  const meta = store.getMeta();
  const wd = report.weekData();
  const profile = store.getProfile();

  $('#home-streak').textContent = meta.streak || 0;
  $('#home-streak-sub').textContent = (meta.streak === 1 ? 'day' : 'days') + ' in a row';
  $('#home-week-avg').textContent = fmt(wd.now.overall);

  // Challenge picker
  const sel = $('#home-challenge');
  if (!sel.options.length) {
    let group = '';
    CHALLENGES.forEach((c) => {
      if (c.group !== group) {
        group = c.group;
        const og = document.createElement('optgroup');
        og.label = group + ' challenges';
        og.id = 'og-' + group;
        sel.appendChild(og);
      }
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.id}. ${c.name}`;
      $(`#og-${c.group}`, sel).appendChild(opt);
    });
  }
  sel.value = profile.currentChallengeId;
  $('#home-challenge-goal').textContent = challengeById(profile.currentChallengeId).goal;

  // Phrase of the day: stable per day, so it does not reshuffle on every tap.
  const phrases = store.getPhrases();
  if (phrases.length) {
    const dayNumber = Math.floor(Date.now() / 86400000);
    const p = phrases[dayNumber % phrases.length];
    $('#home-phrase-from').textContent = p.from;
    $('#home-phrase-to').textContent = p.to ? `Better: ${p.to}` : p.category;
  }

  renderHomeBanners();
}

function renderHomeBanners() {
  const box = $('#home-banners');
  const out = [];

  if (!speech.support.secure) {
    out.push(`<div class="banner bad"><b>The microphone will not work here.</b>
      This page is not being served over https. Open the GitHub Pages link instead of a local file.</div>`);
  } else if (!speech.support.recognition) {
    const p = speech.platformName();
    out.push(`<div class="banner bad"><b>This browser cannot turn speech into text.</b>
      ${p === 'ios' ? 'Open this link in Safari on your iPhone.' : 'Open this link in Chrome.'}
      Firefox does not support speech recognition at all. You can still use Quick Check by typing.</div>`);
  }

  const device = store.getDeviceReport();
  if (!device && speech.support.recognition) {
    out.push(`<div class="banner info"><b>Run the phone check first.</b>
      It takes 15 seconds and tells you whether your phone keeps "um" and "uh" in transcripts.
      Without it, filler scores may be quietly wrong.
      <br><button class="sm" style="margin-top:.5rem" id="banner-device-check">Check my phone</button></div>`);
  } else if (device && device.fillersKept === false) {
    out.push(`<div class="banner warn"><b>Your phone deletes "um" and "uh".</b>
      Filler scores under-count because of it. "so", "like", "basically" and "actually" are still caught,
      and long pauses are shown as a stand-in.</div>`);
  }

  box.innerHTML = out.join('');
  const btn = $('#banner-device-check');
  if (btn) btn.addEventListener('click', () => { show('settings'); setTimeout(runDeviceCheck, 250); });
}

/* ============================================================== SESSION === */

const TASKS = {
  task1: {
    id: 'task1',
    label: 'The 60-second answer',
    blurb: 'Say your point in 8 words, then answer out loud.',
    coreRequired: true,
    innerEditor: true,
    allowRetry: true,
  },
  task2: {
    id: 'task2',
    label: 'Spoken cut drill',
    blurb: 'Listen to the rambling version. Say the same thing in 2 sentences, under 20 seconds.',
    coreRequired: false,
    innerEditor: false,
    allowRetry: true,
  },
  task3: {
    id: 'task3',
    label: 'Real-life retell',
    blurb: 'Describe something you actually said today.',
    coreRequired: false,
    innerEditor: true,
    allowRetry: false,
  },
};

const session = {
  active: false,
  queue: [],
  index: 0,
  step: 'brief',
  attempt: 1,
  taskId: null,
  question: '',
  promptToRead: '',
  core: '',
  capture: null,
  captureResult: null,
  scored: null,
  firstAttempt: null,
  innerEditor: '',
  audioId: null,
  audioUrl: null,
  completedThisRun: 0,
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function startSession(queue) {
  speech.unlockAudio();
  session.active = true;
  session.queue = queue;
  session.index = 0;
  session.completedThisRun = 0;
  show('session');
  loadTask(queue[0]);
}

function loadTask(taskId) {
  const profile = store.getProfile();
  session.taskId = taskId;
  session.step = 'brief';
  session.attempt = 1;
  session.core = '';
  session.innerEditor = '';
  session.captureResult = null;
  session.scored = null;
  session.firstAttempt = null;
  session.audioId = null;
  if (session.audioUrl) { URL.revokeObjectURL(session.audioUrl); session.audioUrl = null; }

  if (taskId === 'task1') {
    session.question = pick(questionsForChallenge(profile.currentChallengeId));
    session.promptToRead = session.question;
  } else if (taskId === 'task2') {
    session.question = pick(CUT_DRILL_TEXTS);
    session.promptToRead = session.question;
  } else {
    session.question = pick(RETELL_PROMPTS);
    session.promptToRead = session.question;
  }
  renderSession();
}

function renderSteps() {
  const order = ['brief', 'core', 'record', 'editor', 'feedback'];
  const task = TASKS[session.taskId];
  const applicable = order.filter((s) => {
    if (s === 'core' && !task.coreRequired && !SETTINGS.coreStep.askOnAllTasks) return false;
    if (s === 'editor' && !task.innerEditor) return false;
    return true;
  });
  const at = applicable.indexOf(session.step);
  $('#session-steps').innerHTML = applicable
    .map((s, i) => `<div class="step ${i < at ? 'done' : i === at ? 'now' : ''}"></div>`)
    .join('');
}

function renderSessionIdle() {
  $('#session-steps').innerHTML = '';
  $('#session-body').innerHTML = `
    <h1>Practice</h1>
    <p class="muted">Three voice tasks, about 15 minutes. Or pick one.</p>
    <div class="card tight"><button class="primary full" id="s-start-all">Start today's session</button></div>
    ${Object.values(TASKS).map((t) => `
      <div class="card">
        <h2>${esc(t.label)}</h2>
        <p class="muted small">${esc(t.blurb)}</p>
        <button class="ghost full sm" data-start-task="${t.id}">Start this task</button>
      </div>`).join('')}
  `;
  $('#s-start-all').addEventListener('click', () => startSession(['task1', 'task2', 'task3']));
  $$('[data-start-task]').forEach((b) => b.addEventListener('click', () => startSession([b.dataset.startTask])));
}

function renderSession() {
  renderSteps();
  const body = $('#session-body');
  const task = TASKS[session.taskId];
  const n = session.index + 1;
  const total = session.queue.length;
  const header = `<p class="muted small">Task ${n} of ${total} &middot; ${esc(task.label)}</p>`;

  if (session.step === 'brief') return renderBrief(body, header, task);
  if (session.step === 'core') return renderCore(body, header, task);
  if (session.step === 'record') return renderRecord(body, header, task);
  if (session.step === 'editor') return renderEditor(body, header, task);
  if (session.step === 'feedback') return renderFeedback(body, header, task);
  if (session.step === 'done') return renderSessionDone(body);
  return undefined;
}

/* ------------------------------------------------------------------ brief */

function renderBrief(body, header, task) {
  const isDrill = session.taskId === 'task2';
  body.innerHTML = `
    ${header}
    <div class="card">
      <h2>${isDrill ? 'Listen to this' : 'Your question'}</h2>
      <p style="font-size:1.1rem">${esc(session.question)}</p>
      <div class="row wrap-row">
        <button class="sm" id="s-replay">${speech.support.tts ? 'Read it again' : 'Text only'}</button>
        <button class="sm ghost" id="s-skip-question">Different one</button>
      </div>
      ${speech.support.tts ? '' : '<p class="tiny muted" style="margin-top:.5rem">This browser cannot read text out loud, so the question is shown instead.</p>'}
    </div>
    <div class="card tight">
      <p class="muted small">${esc(task.blurb)}</p>
      <button class="primary full" id="s-next">Continue</button>
    </div>
  `;
  $('#s-replay').addEventListener('click', () => speech.speak(session.promptToRead));
  $('#s-skip-question').addEventListener('click', () => loadTask(session.taskId));
  $('#s-next').addEventListener('click', () => {
    speech.stopSpeaking();
    session.step = (TASKS[session.taskId].coreRequired || SETTINGS.coreStep.askOnAllTasks) ? 'core' : 'record';
    renderSession();
  });
  // Read it out loud, like a real person asking.
  speech.speak(session.promptToRead);
}

/* ------------------------------------------------------------------- core */

let coreTimer = null;

function renderCore(body, header, task) {
  const secs = SETTINGS.coreStep.seconds;
  const optional = !task.coreRequired;
  body.innerHTML = `
    ${header}
    <div class="card">
      <h2>Your core point${optional ? ' <span class="badge">optional</span>' : ''}</h2>
      <p class="muted small">In ${secs} seconds, say or type your one point in ${SETTINGS.coreStep.maxWords} words or less. This is what the app checks your first sentence against.</p>
      <div class="timer center" id="core-timer">${secs}</div>
      <input type="text" id="core-input" placeholder="e.g. I test software so clients can ship safely" autocomplete="off">
      <p class="tiny muted" id="core-count">0 words</p>
      <div class="row wrap-row">
        <button class="sm" id="core-dictate" ${speech.support.recognition ? '' : 'disabled'}>Say it instead</button>
        <button class="primary grow" id="core-done">Done</button>
      </div>
      ${optional ? '<button class="ghost full sm" id="core-skip" style="margin-top:.5rem">Skip this step</button>' : ''}
    </div>
  `;

  const input = $('#core-input');
  const count = $('#core-count');
  input.addEventListener('input', () => {
    const w = input.value.trim().split(/\s+/).filter(Boolean).length;
    count.textContent = `${w} word${w === 1 ? '' : 's'}`;
    count.style.color = w > SETTINGS.coreStep.maxWords ? 'var(--bad)' : '';
  });

  let left = secs;
  const timerEl = $('#core-timer');
  clearInterval(coreTimer);
  coreTimer = setInterval(() => {
    left -= 1;
    timerEl.textContent = Math.max(0, left);
    if (left <= 5) timerEl.classList.add('over');
    if (left <= 0) {
      clearInterval(coreTimer);
      timerEl.classList.add('way-over');
      timerEl.textContent = 'time';
    }
  }, 1000);

  let dictating = null;
  $('#core-dictate').addEventListener('click', async () => {
    const btn = $('#core-dictate');
    if (dictating) {
      const r = await dictating.stop();
      dictating = null;
      btn.textContent = 'Say it instead';
      input.value = r.transcript || input.value;
      input.dispatchEvent(new Event('input'));
      return;
    }
    try {
      btn.textContent = 'Stop';
      dictating = await speech.startCapture({ onUpdate: (t) => { input.value = t; } });
    } catch (err) {
      btn.textContent = 'Say it instead';
      toast(err.friendly || 'Could not start the microphone.');
    }
  });

  const finish = () => {
    clearInterval(coreTimer);
    if (dictating) { dictating.cancel(); dictating = null; }
    session.core = input.value.trim();
    session.step = 'record';
    renderSession();
  };
  $('#core-done').addEventListener('click', finish);
  if ($('#core-skip')) $('#core-skip').addEventListener('click', () => { session.core = ''; finish(); });
  setTimeout(() => input.focus(), 120);
}

/* ----------------------------------------------------------------- record */

let recordTimer = null;

function renderRecord(body, header, task) {
  const target = SETTINGS.brevity.targets[session.taskId] || SETTINGS.brevity.targets.task1;
  const retryNote = session.attempt === 2
    ? '<div class="banner good"><b>Second try.</b> Use the feedback. Both scores are shown side by side afterwards.</div>'
    : '';

  body.innerHTML = `
    ${header}
    ${retryNote}
    <div class="card tight">
      <p class="muted small" style="margin:0">${esc(session.question)}</p>
    </div>
    ${session.core ? `<div class="card tight"><div class="muted tiny">YOUR CORE</div><div>${esc(session.core)}</div></div>` : ''}
    <div class="record-wrap">
      <button class="record" id="rec-btn">
        <span id="rec-label">Record</span>
        <span class="sub" id="rec-sub">target ${target.seconds}s</span>
      </button>
      <div class="timer" id="rec-timer">0:00</div>
    </div>
    <div class="card">
      <div class="muted tiny">WHAT THE PHONE IS HEARING</div>
      <div class="transcript live" id="rec-transcript">Tap record and start talking.</div>
    </div>
    <div id="rec-warning"></div>
    <div class="card tight">
      <button class="ghost full sm" id="rec-skip">Skip this task</button>
    </div>
  `;

  $('#rec-skip').addEventListener('click', () => {
    if (session.capture) { session.capture.cancel(); session.capture = null; }
    clearInterval(recordTimer);
    nextTask();
  });

  const btn = $('#rec-btn');
  const label = $('#rec-label');
  const sub = $('#rec-sub');
  const timerEl = $('#rec-timer');
  const trans = $('#rec-transcript');
  let recording = false;
  let startedAt = 0;

  btn.addEventListener('click', async () => {
    if (!recording) {
      try {
        speech.stopSpeaking();
        session.capture = await speech.startCapture({
          onUpdate: (text) => {
            trans.textContent = text || 'Listening…';
            trans.classList.toggle('has-text', Boolean(text));
          },
          onError: (code) => {
            $('#rec-warning').innerHTML = `<div class="banner warn"><b>Microphone problem: ${esc(code)}</b>
              ${code === 'not-allowed'
                ? 'Allow microphone access for this site in your browser settings, then reload.'
                : 'Keep talking. The app restarts listening by itself.'}</div>`;
          },
        });
      } catch (err) {
        $('#rec-warning').innerHTML = `<div class="banner bad"><b>Cannot record.</b> ${esc(err.friendly || err.message)}</div>`;
        return;
      }
      recording = true;
      startedAt = Date.now();
      btn.classList.add('recording');
      label.textContent = 'Stop';
      sub.textContent = 'tap when done';
      if (!session.capture.hasPlayback && SETTINGS.speech.tryPlayback) {
        $('#rec-warning').innerHTML = `<div class="banner info">Playback is off on this phone, because it cannot
          record and transcribe at the same time. Transcription is kept, which is what matters for scoring.</div>`;
      }
      clearInterval(recordTimer);
      recordTimer = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        timerEl.classList.toggle('over', s > target.seconds);
        timerEl.classList.toggle('way-over', s > target.seconds + target.graceSeconds);
      }, 250);
    } else {
      clearInterval(recordTimer);
      recording = false;
      btn.classList.remove('recording');
      btn.disabled = true;
      label.textContent = 'Scoring';
      sub.textContent = 'one moment';
      const result = await session.capture.stop();
      session.capture = null;
      await handleCaptureDone(result, Date.now() - startedAt);
    }
  });
}

async function handleCaptureDone(result, wallClockMs) {
  session.captureResult = result;

  if (!result.transcript || !result.transcript.trim()) {
    $('#rec-warning').innerHTML = `<div class="banner bad"><b>Nothing was transcribed.</b>
      Check that the microphone permission is granted, try somewhere quieter, and speak a little closer to the phone.
      If it keeps failing, run Settings &rsaquo; Check my phone, or skip this task below.</div>`;
    const btn = $('#rec-btn');
    btn.disabled = false;
    btn.classList.remove('recording');
    $('#rec-label').textContent = 'Record';
    $('#rec-sub').textContent = 'try again';
    return;
  }

  // The wall clock is the honest duration. The recogniser's own clock can
  // drift when it restarts itself after a pause.
  const durationMs = wallClockMs || result.durationMs;

  if (result.audioBlob) {
    session.audioId = `a-${Date.now().toString(36)}`;
    await store.saveAudio(session.audioId, result.audioBlob);
    if (session.audioUrl) URL.revokeObjectURL(session.audioUrl);
    session.audioUrl = URL.createObjectURL(result.audioBlob);
  }

  session.scored = scoreAnswer({
    transcript: result.transcript,
    segments: result.segments || [],
    timeline: result.timeline || [],
    durationMs,
    core: session.core,
    taskId: session.taskId,
    innerEditor: '',
    customPhrases: store.customPhraseStrings(),
  });

  session.step = TASKS[session.taskId].innerEditor ? 'editor' : 'feedback';
  if (session.step === 'feedback') saveCurrentAnswer();
  renderSession();
}

/* ----------------------------------------------------------- inner editor */

function renderEditor(body, header) {
  body.innerHTML = `
    ${header}
    <div class="card">
      <h2>Your inner editor</h2>
      <p class="muted small">${session.audioUrl
        ? 'Play it back. What would you fix? Say it before you see the scores.'
        : 'Read it back. What would you fix? Say it before you see the scores.'}</p>
      ${session.audioUrl ? `<audio controls src="${session.audioUrl}"></audio>` : ''}
      <div class="transcript" style="margin-top:.6rem">${esc(session.captureResult.transcript)}</div>
    </div>
    <div class="card">
      <label for="editor-input">What would you change?</label>
      <textarea id="editor-input" placeholder="I started with so, I rambled, my point came too late"></textarea>
      <div class="row wrap-row" style="margin-top:.6rem">
        <button class="sm" id="editor-dictate" ${speech.support.recognition ? '' : 'disabled'}>Say it instead</button>
        <button class="primary grow" id="editor-done">Show my scores</button>
      </div>
      <p class="tiny muted" style="margin-top:.5rem">This is what your self-catch rate is measured from. Naming a problem before the app does is the whole point.</p>
    </div>
  `;

  const input = $('#editor-input');
  let dictating = null;
  $('#editor-dictate').addEventListener('click', async () => {
    const btn = $('#editor-dictate');
    if (dictating) {
      const r = await dictating.stop();
      dictating = null;
      btn.textContent = 'Say it instead';
      input.value = r.transcript || input.value;
      return;
    }
    try {
      btn.textContent = 'Stop';
      dictating = await speech.startCapture({ onUpdate: (t) => { input.value = t; } });
    } catch (err) {
      btn.textContent = 'Say it instead';
      toast(err.friendly || 'Could not start the microphone.');
    }
  });

  $('#editor-done').addEventListener('click', () => {
    if (dictating) { dictating.cancel(); dictating = null; }
    session.innerEditor = input.value.trim();
    // Re-score so the self-catch rate can see what you named.
    session.scored = scoreAnswer({
      transcript: session.captureResult.transcript,
      segments: session.captureResult.segments || [],
      timeline: session.captureResult.timeline || [],
      durationMs: Math.round(session.scored.measurements.seconds * 1000),
      core: session.core,
      taskId: session.taskId,
      innerEditor: session.innerEditor,
      customPhrases: store.customPhraseStrings(),
    });
    saveCurrentAnswer();
    session.step = 'feedback';
    renderSession();
  });
}

/* --------------------------------------------------------------- feedback */

function saveCurrentAnswer() {
  const s = session.scored;
  const record = {
    id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    taskId: session.taskId,
    taskLabel: TASKS[session.taskId].label,
    challengeId: store.getProfile().currentChallengeId,
    question: session.question,
    core: session.core,
    transcript: session.captureResult.transcript,
    firstSentence: s.firstSentence,
    scores: s.scores,
    overall: s.overall,
    measurements: s.measurements,
    patterns: s.patterns,
    selfCatch: s.selfCatch,
    innerEditor: session.innerEditor,
    audioId: session.audioId,
    attempt: session.attempt,
  };
  store.saveSession(record);
  session.lastRecord = record;
  return record;
}

function scoreGridHtml(scores) {
  return `<div class="score-grid">${Object.entries(SCORE_LABELS).map(([k, label]) => `
    <div class="score ${scoreClass(scores[k])}">
      <div class="n">${scores[k] === null ? 'n/a' : scores[k]}</div>
      <div class="l">${label}</div>
    </div>`).join('')}</div>`;
}

function renderFeedback(body, header, task) {
  const s = session.scored;
  const m = s.measurements;
  const tip = tipForLowestScore(s.scores, s.measurements, session.taskId);
  const { best, worst } = bestAndWorst(s.scores);
  const paceOk = m.wpm !== null && m.wpm >= SETTINGS.pace.targetMin && m.wpm <= SETTINGS.pace.targetMax;
  const target = SETTINGS.brevity.targets[session.taskId] || SETTINGS.brevity.targets.task1;
  const landed = s.detail.pointFirst.landedAtSentence;

  const compare = session.firstAttempt ? `
    <div class="card">
      <h2>Before and after</h2>
      <div class="kv"><span>Overall</span><span class="v">${fmt(session.firstAttempt.overall)} → ${fmt(s.overall)}</span></div>
      ${Object.entries(SCORE_LABELS).map(([k, label]) => `
        <div class="kv"><span>${label}</span><span class="v">${fmt(session.firstAttempt.scores[k])} → ${fmt(s.scores[k])}</span></div>`).join('')}
    </div>` : '';

  body.innerHTML = `
    ${header}
    <div class="card">
      <div class="overall">
        <div class="n" style="color:var(--${scoreClass(s.overall) === 'good' ? 'good' : scoreClass(s.overall) === 'mid' ? 'warn' : 'bad'})">${fmt(s.overall)}</div>
        <div class="l">overall, out of 10</div>
      </div>
      ${scoreGridHtml(s.scores)}
      ${s.scores.pointFirst === null ? '<p class="tiny muted" style="margin-top:.6rem">Point first needs a core. Skipping the core step means this one cannot be scored, so it is left out of the average.</p>' : ''}
    </div>

    ${compare}

    <div class="card">
      <h2>What worked, what to fix</h2>
      ${best ? `<p class="small"><b style="color:var(--good)">Best:</b> ${SCORE_LABELS[best[0]]} at ${best[1]}/10.</p>` : ''}
      ${worst ? `<p class="small"><b style="color:var(--bad)">Lowest:</b> ${SCORE_LABELS[worst[0]]} at ${worst[1]}/10.</p>` : ''}
      ${tip ? `<div class="banner info" style="margin:.5rem 0 0"><b>One thing to try</b>${esc(tip.text)}</div>` : ''}
    </div>

    <div class="card">
      <h2>Voice measurements</h2>
      <div class="pills">
        <span class="pill ${paceOk ? 'ok' : 'warn'}">Pace <b>${fmt(m.wpm, ' wpm')}</b></span>
        <span class="pill ${m.seconds <= target.seconds + target.graceSeconds && m.seconds >= target.seconds * SETTINGS.brevity.tooShortRatio ? 'ok' : 'warn'}">Length <b>${fmt(m.seconds, 's')}</b> / ${target.seconds}s</span>
        <span class="pill">Time to point <b>${fmt(m.timeToFirstPointSeconds, 's')}</b></span>
        <span class="pill ${m.fillerCount === 0 ? 'ok' : 'warn'}">Fillers <b>${m.fillerCount}</b></span>
        <span class="pill">Long pauses <b>${m.longPauses}</b></span>
        <span class="pill">Words <b>${m.wordCount}</b></span>
      </div>
      <p class="tiny muted" style="margin-top:.6rem">Long pauses and time to first point are estimated from when words reached the app, so treat them as rough. They are shown, not scored.</p>
    </div>

    <div class="card">
      <h2>Your core next to your first sentence</h2>
      <div class="compare">
        <div class="box"><div class="l">My core</div>${esc(session.core) || '<span class="muted">(skipped)</span>'}</div>
        <div class="box ${landed === 1 ? 'hit' : 'miss'}"><div class="l">My first sentence</div>${esc(s.firstSentence) || '<span class="muted">(none)</span>'}</div>
      </div>
      <p class="small" style="margin-top:.55rem">${
        s.scores.pointFirst === null ? 'No core given, so there is nothing to compare.'
        : landed === 1 ? 'You led with your point. That is the whole game.'
        : landed ? `Your point arrived in sentence ${landed}. Move it to the front.`
        : 'Your point never fully arrived. Say the core sentence first, word for word, then explain.'}</p>
    </div>

    ${session.audioUrl ? `<div class="card"><h2>Hear yourself</h2><audio controls src="${session.audioUrl}"></audio></div>` : ''}

    <div class="card">
      <h2>Your transcript</h2>
      <div class="transcript">${highlightTranscript(session.captureResult.transcript, s.patterns, store.customPhraseStrings())}</div>
      <p class="tiny muted" style="margin-top:.5rem">
        <mark class="hl-filler">yellow</mark> fillers &middot; <mark class="hl-pattern">red</mark> patterns
      </p>
    </div>

    <div class="card">
      <h2>Patterns found</h2>
      ${s.patterns.length ? `<ul class="list">${s.patterns.map((p) => `
        <li><div class="grow"><div class="from">${esc(p.label)} <span class="badge red">${p.count}x</span></div>
        <div class="to">Better: ${esc(p.better)}</div></div></li>`).join('')}</ul>`
        : '<p class="muted small">None. Good.</p>'}
      ${s.selfCatch.rate !== null ? `<p class="small" style="margin-top:.6rem">
        <b>Self-catch rate: ${Math.round(s.selfCatch.rate * 100)}%</b> — you named ${s.selfCatch.caught.length} of ${s.patterns.length} before the app showed you.</p>` : ''}
    </div>

    <div class="row wrap-row">
      ${task.allowRetry && session.attempt === 1 ? '<button class="primary grow" id="fb-retry">Record again with this feedback</button>' : ''}
      <button class="grow" id="fb-next">${session.index + 1 < session.queue.length ? 'Next task' : 'Finish session'}</button>
    </div>
    <div class="card tight" style="margin-top:.6rem">
      <button class="ghost full sm" id="fb-claude">Copy this answer for Claude</button>
    </div>
  `;

  if ($('#fb-retry')) {
    $('#fb-retry').addEventListener('click', () => {
      session.firstAttempt = { overall: s.overall, scores: { ...s.scores } };
      session.attempt = 2;
      session.step = 'record';
      renderSession();
    });
  }
  $('#fb-next').addEventListener('click', nextTask);
  $('#fb-claude').addEventListener('click', () => {
    copyText(report.buildAnswerExport(session.lastRecord));
  });
}

function nextTask() {
  session.completedThisRun += 1;
  if (session.index + 1 < session.queue.length) {
    session.index += 1;
    loadTask(session.queue[session.index]);
  } else {
    store.touchStreak(report.dayKey(), report.yesterdayKey());
    session.step = 'done';
    session.active = false;
    renderSteps();
    renderSessionDone($('#session-body'));
  }
}

function renderSessionDone(body) {
  const line = pick(CLOSING_LINES);
  const meta = store.getMeta();
  body.innerHTML = `
    <div class="card center">
      <h1>Done</h1>
      <p class="muted">${session.completedThisRun} task${session.completedThisRun === 1 ? '' : 's'} today.</p>
      <div class="streak-big" style="margin:.5rem 0">${meta.streak}</div>
      <p class="muted small">day streak</p>
    </div>
    <div class="card">
      <h2>One thing to remember today</h2>
      <p style="font-size:1.15rem">${esc(line)}</p>
    </div>
    <div class="card tight"><button class="primary full" id="done-progress">See my progress</button></div>
    <div class="card tight"><button class="ghost full" id="done-again">Practise again</button></div>
  `;
  $('#done-progress').addEventListener('click', () => show('progress'));
  $('#done-again').addEventListener('click', () => { session.active = false; renderSessionIdle(); });
  speech.speak(line);
}

/* ========================================================== QUICK CHECK === */

let quickDictation = null;
let quickAskedThisTime = false;

function setupQuickCheck() {
  $('#btn-quick-run').addEventListener('click', runQuickCheck);
  $('#btn-quick-clear').addEventListener('click', () => {
    $('#quick-input').value = '';
    $('#quick-result').innerHTML = '';
  });
  $('#btn-quick-dictate').addEventListener('click', async () => {
    const btn = $('#btn-quick-dictate');
    const input = $('#quick-input');
    if (quickDictation) {
      const r = await quickDictation.stop();
      quickDictation = null;
      btn.textContent = 'Dictate';
      btn.classList.remove('primary');
      input.value = r.transcript || input.value;
      return;
    }
    try {
      speech.unlockAudio();
      btn.textContent = 'Stop';
      btn.classList.add('primary');
      quickDictation = await speech.startCapture({ onUpdate: (t) => { input.value = t; } });
    } catch (err) {
      btn.textContent = 'Dictate';
      btn.classList.remove('primary');
      toast(err.friendly || 'Could not start the microphone.');
    }
  });
}

function runQuickCheck() {
  const text = $('#quick-input').value.trim();
  if (!text) { toast('Paste or dictate a message first.'); return; }

  // Section 8 guardrail: sometimes ask what YOU would change first, so the
  // app trains your inner editor instead of replacing it.
  if (!quickAskedThisTime && Math.random() < SETTINGS.quickCheck.askFirstChance) {
    quickAskedThisTime = true;
    $('#quick-result').innerHTML = `
      <div class="card">
        <h2>Before I show you</h2>
        <p class="muted small">What would you change about this message? Answer first, then see what the rules found.</p>
        <textarea id="quick-guess" placeholder="too long, I hedged at the start, I said basically twice"></textarea>
        <div class="row wrap-row" style="margin-top:.6rem">
          <button class="primary grow" id="quick-guess-done">Now show me</button>
          <button class="ghost sm" id="quick-guess-skip">Skip</button>
        </div>
      </div>`;
    $('#quick-guess-done').addEventListener('click', showQuickResult);
    $('#quick-guess-skip').addEventListener('click', showQuickResult);
    return;
  }
  showQuickResult();
}

function showQuickResult() {
  const text = $('#quick-input').value.trim();
  const guessEl = $('#quick-guess');
  const guess = guessEl ? guessEl.value.trim() : '';
  const result = quickCheck(text, store.customPhraseStrings());
  quickAskedThisTime = false;

  const caught = guess
    ? result.patterns.filter((p) => {
      const def = PATTERNS.find((x) => x.id === p.id);
      return def && (def.hints || []).some((h) => guess.toLowerCase().includes(h.toLowerCase()));
    }).length
    : null;

  $('#quick-result').innerHTML = `
    ${guess ? `<div class="banner ${caught ? 'good' : 'info'}">
      <b>You said: "${esc(guess)}"</b>
      ${caught !== null && result.patterns.length
        ? `You spotted ${caught} of the ${result.patterns.length} pattern${result.patterns.length === 1 ? '' : 's'} the rules found.`
        : 'Compare that with what the rules found below.'}</div>` : ''}

    <div class="card">
      <h2>${result.issues.length ? `${result.issues.length} thing${result.issues.length === 1 ? '' : 's'} to look at` : 'Nothing flagged'}</h2>
      <div class="pills" style="margin-bottom:.6rem">
        <span class="pill">Words <b>${result.stats.words}</b></span>
        <span class="pill">Sentences <b>${result.stats.sentences}</b></span>
        <span class="pill">Avg <b>${result.stats.avgWordsPerSentence}</b> per sentence</span>
      </div>
      ${result.issues.length
        ? `<ul class="list">${result.issues.map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul>`
        : '<p class="muted small">No fillers, no patterns, and it is inside the length targets. Send it.</p>'}
    </div>

    <div class="card">
      <h2>Your message, marked up</h2>
      <div class="transcript">${highlightTranscript(text, result.patterns, store.customPhraseStrings())}</div>
      <p class="tiny muted" style="margin-top:.5rem"><mark class="hl-filler">yellow</mark> fillers &middot; <mark class="hl-pattern">red</mark> patterns</p>
    </div>

    <div class="card">
      <label for="quick-recipient">Who is it for? (optional, goes into the question for Claude)</label>
      <input type="text" id="quick-recipient" placeholder="my manager">
      <button class="primary full" id="btn-quick-claude" style="margin-top:.6rem">Send to Claude</button>
      <p class="tiny muted" style="margin-top:.5rem">Copies your message plus a ready-made review question. Paste it into your own Claude chat. The app never calls Claude itself.</p>
    </div>
  `;

  $('#btn-quick-claude').addEventListener('click', () => {
    copyText(report.buildQuickCheckExport(text, $('#quick-recipient').value.trim()));
  });
}

/* ============================================================= PROGRESS === */

function sparkHtml(points, max) {
  const top = max || Math.max(10, ...points.map((p) => p.value || 0));
  return `
    <div class="spark">
      ${points.map((p) => (p.value === null
        ? '<div class="bar empty" style="height:3px"></div>'
        : `<div class="bar" style="height:${Math.max(4, (p.value / top) * 100)}%" title="${p.label}: ${p.value}"></div>`)).join('')}
    </div>
    <div class="axis"><span>${points[0] ? points[0].label : ''}</span><span>${points[points.length - 1] ? points[points.length - 1].label : ''}</span></div>`;
}

function deltaBadge(now, prev, lowerIsBetter = false) {
  if (now === null || prev === null || now === undefined || prev === undefined) return '';
  const d = Math.round((now - prev) * 10) / 10;
  if (d === 0) return '<span class="badge">same</span>';
  const good = lowerIsBetter ? d < 0 : d > 0;
  return `<span class="badge ${good ? 'down' : 'up'}">${d > 0 ? '+' : ''}${d}</span>`;
}

function renderProgress() {
  const wd = report.weekData();
  const meta = store.getMeta();
  const checks = report.greenChecks();
  const improved = report.mostImproved();
  const trend = report.dailyTrend(14);
  const paceTrend = report.metricTrend('wpm', 14);
  const fillerTrend = report.metricTrend('fillersPerMinute', 14);

  const topPatterns = Object.entries(wd.now.patternCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  $('#progress-body').innerHTML = `
    <div class="card">
      <div class="row">
        <div class="grow center">
          <div class="streak-big">${meta.streak || 0}</div>
          <div class="muted small">day streak</div>
        </div>
        <div class="grow center">
          <div class="streak-big">${fmt(wd.now.overall)}</div>
          <div class="muted small">this week ${deltaBadge(wd.now.overall, wd.prev.overall)}</div>
        </div>
        <div class="grow center">
          <div class="streak-big">${wd.now.answers}</div>
          <div class="muted small">answers</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Overall score, last 14 days</h2>
      ${sparkHtml(trend, 10)}
    </div>

    <div class="card">
      <h2>Each score, this week vs last</h2>
      ${Object.entries(SCORE_LABELS).map(([k, label]) => `
        <div class="kv">
          <span>${label}</span>
          <span class="v">${fmt(wd.now.scores[k])} ${deltaBadge(wd.now.scores[k], wd.prev.scores[k])}</span>
        </div>`).join('')}
      ${improved ? `<p class="small" style="margin-top:.6rem">Most improved: <b>${SCORE_LABELS[improved.area]}</b>, ${improved.gain > 0 ? '+' : ''}${improved.gain}.</p>` : ''}
    </div>

    <div class="card">
      <h2>Top 3 patterns, this week vs last</h2>
      ${topPatterns.length ? `<ul class="list">${topPatterns.map(([id, n]) => {
        const def = PATTERNS.find((p) => p.id === id);
        const was = wd.prev.patternCounts[id] || 0;
        return `<li><div class="grow"><div class="from">${esc(def ? def.label : id)}</div>
          <div class="to">${n}x this week, ${was}x last week</div></div>
          ${deltaBadge(n, was, true)}</li>`;
      }).join('')}</ul>` : '<p class="muted small">No patterns detected this week.</p>'}
    </div>

    <div class="card">
      <h2>Green checks</h2>
      <p class="muted small">Clear for ${SETTINGS.patterns.greenCheckDays} days or more.</p>
      ${checks.filter((c) => c.green).length
        ? `<ul class="list">${checks.filter((c) => c.green).map((c) => `<li><span class="badge green">✓</span> <span class="grow">${esc(c.label)}</span></li>`).join('')}</ul>`
        : '<p class="muted small">None yet. Keep going.</p>'}
    </div>

    <div class="card">
      <h2>Self-catch rate</h2>
      <div class="kv"><span>This week</span><span class="v">${wd.now.selfCatch === null ? '–' : wd.now.selfCatch + '%'} ${deltaBadge(wd.now.selfCatch, wd.prev.selfCatch)}</span></div>
      <div class="kv"><span>Last week</span><span class="v">${wd.prev.selfCatch === null ? '–' : wd.prev.selfCatch + '%'}</span></div>
      <p class="tiny muted" style="margin-top:.5rem">How many of the patterns the app found, you had already named yourself.</p>
    </div>

    <div class="card">
      <h2>Speaking pace, last 14 days</h2>
      <p class="muted small">Target ${SETTINGS.pace.targetMin}–${SETTINGS.pace.targetMax} wpm. This week ${fmt(wd.now.voice.wpm, ' wpm')} ${deltaBadge(wd.now.voice.wpm, wd.prev.voice.wpm)}</p>
      ${sparkHtml(paceTrend, 220)}
    </div>

    <div class="card">
      <h2>Fillers per minute, last 14 days</h2>
      <p class="muted small">This week ${fmt(wd.now.voice.fillersPerMinute)} ${deltaBadge(wd.now.voice.fillersPerMinute, wd.prev.voice.fillersPerMinute, true)}</p>
      ${sparkHtml(fillerTrend, 12)}
    </div>

    <div class="card">
      <h2>Voice measurements this week</h2>
      <div class="kv"><span>Time to first point</span><span class="v">${fmt(wd.now.voice.timeToFirstPoint, 's')} ${deltaBadge(wd.now.voice.timeToFirstPoint, wd.prev.voice.timeToFirstPoint, true)}</span></div>
      <div class="kv"><span>Answer length</span><span class="v">${fmt(wd.now.voice.seconds, 's')}</span></div>
      <div class="kv"><span>Long pauses per answer</span><span class="v">${fmt(wd.now.voice.longPauses)}</span></div>
      <div class="kv"><span>Fillers per answer</span><span class="v">${fmt(wd.now.voice.fillersPerAnswer)}</span></div>
    </div>

    <div class="card tight"><button class="primary full" id="progress-report">Weekly report</button></div>
  `;
  $('#progress-report').addEventListener('click', () => show('report'));
}

/* ============================================================= PATTERNS === */

function renderPatterns() {
  $('#patterns-days').textContent = SETTINGS.patterns.greenCheckDays;
  const wd = report.weekData();
  const checks = report.greenChecks();

  $('#patterns-body').innerHTML = `
    <div class="card">
      <ul class="list">
        ${activePatterns().map((p) => {
          const now = wd.now.patternCounts[p.id] || 0;
          const prev = wd.prev.patternCounts[p.id] || 0;
          const check = checks.find((c) => c.id === p.id);
          return `<li>
            <div class="grow">
              <div class="from">${esc(p.label)} ${check && check.green ? '<span class="badge green">✓ clear</span>' : ''}</div>
              <div class="to">Better: ${esc(p.better)}</div>
              <div class="to">${now}x this week &middot; ${prev}x last week</div>
            </div>
            ${deltaBadge(now, prev, true)}
          </li>`;
        }).join('')}
      </ul>
    </div>
    <div class="card">
      <h2>Adding your own</h2>
      <p class="muted small">Add phrases in the Phrase Library and they are detected from then on. Turn any built-in pattern off in <span class="mono">js/settings.js</span> under <span class="mono">patterns.enabled</span>.</p>
      <button class="ghost full sm" id="patterns-to-phrases">Open Phrase Library</button>
    </div>
  `;
  $('#patterns-to-phrases').addEventListener('click', () => show('phrases'));
}

/* ============================================================== PHRASES === */

function renderPhrases() {
  const phrases = store.getPhrases();
  const cats = [...new Set(phrases.map((p) => p.category))];
  $('#phrase-cats').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');

  $('#phrases-body').innerHTML = cats.map((cat) => `
    <div class="card">
      <h2>${esc(cat)}</h2>
      <ul class="list">
        ${phrases.filter((p) => p.category === cat).map((p) => `
          <li>
            <div class="grow">
              <div class="from">${esc(p.from)}</div>
              ${p.to ? `<div class="to">→ ${esc(p.to)}</div>` : ''}
            </div>
            ${p.addedAt ? `<button class="sm ghost" data-del-phrase="${esc(p.id)}">Remove</button>` : ''}
          </li>`).join('')}
      </ul>
    </div>`).join('');

  $$('[data-del-phrase]').forEach((b) => b.addEventListener('click', () => {
    store.removePhrase(b.dataset.delPhrase);
    renderPhrases();
    toast('Removed.');
  }));
}

function setupPhrases() {
  $('#btn-add-phrase').addEventListener('click', () => {
    const from = $('#phrase-from').value.trim();
    if (!from) { toast('Type the phrase you want to catch.'); return; }
    store.addPhrase({
      from,
      to: $('#phrase-to').value.trim(),
      category: $('#phrase-cat').value.trim() || 'My phrases',
    });
    $('#phrase-from').value = '';
    $('#phrase-to').value = '';
    renderPhrases();
    toast('Added. The app will catch it from now on.');
  });
}

/* =============================================================== REPORT === */

let currentReport = null;
let notesTimer = null;

function renderReport() {
  const { key } = report.weekBounds();
  const notes = store.getNotes(key);
  $('#notes-self').value = notes.self || '';
  $('#notes-app').value = notes.app || '';
  refreshReport();
  renderReportHistory();
}

function refreshReport() {
  currentReport = report.buildWeeklyReport();
  $('#report-text').textContent = currentReport.text;
  store.saveReport(currentReport);
}

function renderReportHistory() {
  const all = store.getReports().slice().sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  $('#report-history').innerHTML = all.length
    ? `<ul class="list">${all.map((r) => `
        <li><div class="grow"><div class="from">Week of ${esc(r.weekKey)}</div>
        <div class="to">Saved ${new Date(r.generatedAt).toLocaleDateString()}</div></div>
        <button class="sm ghost" data-copy-report="${esc(r.weekKey)}">Copy</button></li>`).join('')}</ul>`
    : '<p class="muted small">Reports are saved here automatically so you can compare months later.</p>';

  $$('[data-copy-report]').forEach((b) => b.addEventListener('click', () => {
    const r = store.getReports().find((x) => x.weekKey === b.dataset.copyReport);
    if (r) copyText(r.text);
  }));
}

function setupReport() {
  const save = () => {
    const { key } = report.weekBounds();
    store.saveNotes(key, { self: $('#notes-self').value, app: $('#notes-app').value });
    $('#notes-saved').textContent = 'Saved.';
    setTimeout(() => { $('#notes-saved').textContent = 'Saved automatically.'; }, 1500);
  };
  ['#notes-self', '#notes-app'].forEach((sel) => {
    $(sel).addEventListener('input', () => {
      clearTimeout(notesTimer);
      notesTimer = setTimeout(save, 600);
    });
  });

  $('#btn-report-refresh').addEventListener('click', () => { refreshReport(); toast('Rebuilt from this week’s answers.'); });
  $('#btn-report-copy').addEventListener('click', () => { refreshReport(); copyText(currentReport.text); });
  $('#btn-report-share').addEventListener('click', () => {
    refreshReport();
    shareText('My weekly communication report', currentReport.text);
  });
}

/* ============================================================= SETTINGS === */

function renderSettings() {
  $('#keep-days').textContent = SETTINGS.storage.keepRecordingsDays;
  $('#about-version').textContent = `Settings version ${SETTINGS.settingsVersion} · ${store.getSessions().length} answers stored on this device.`;

  const rows = [
    ['Secure connection (https)', speech.support.secure],
    ['Speech to text', speech.support.recognition],
    ['Text to speech', speech.support.tts],
    ['Audio recording', speech.support.mediaRecorder],
    ['Installed to home screen', speech.support.standalone],
  ];
  $('#support-body').innerHTML = rows.map(([label, ok]) => `
    <div class="kv"><span>${label}</span><span class="v" style="color:var(--${ok ? 'good' : 'bad'})">${ok ? 'yes' : 'no'}</span></div>`).join('')
    + `<div class="kv"><span>Phone</span><span class="v">${speech.platformName()}</span></div>`;

  const device = store.getDeviceReport();
  if (device) renderDeviceReport(device);

  const sessions = store.getSessions();
  $('#storage-stats').textContent = `${sessions.length} answers, ${store.getReports().length} saved reports, ${store.getPhrases().length} phrases.`;

  // What the app is actually scoring with right now. After editing
  // settings.js on GitHub, reload and check these numbers changed.
  const problems = validateSettings();
  $('#settings-live').innerHTML = `
    ${problems.length
      ? `<div class="banner bad"><b>${problems.length} problem${problems.length === 1 ? '' : 's'} in settings.js</b>
         ${problems.map((x) => esc(x)).join('<br>')}</div>`
      : '<div class="banner good"><b>settings.js looks valid.</b> These are the numbers in use right now.</div>'}
    ${settingsSummary().map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}`;
}

function renderDeviceReport(r) {
  $('#device-result').innerHTML = `
    <div class="banner ${r.fillersKept === false ? 'warn' : r.fillersKept ? 'good' : 'info'}">
      <b>Checked ${new Date(r.at).toLocaleString()}</b>
      ${r.heard ? `Heard: "${esc(r.heard)}"` : 'Nothing was heard.'}
    </div>
    <ul class="list">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
}

async function runDeviceCheck() {
  const btn = $('#btn-device-check');
  btn.disabled = true;
  speech.unlockAudio();
  $('#device-result').innerHTML = '<div class="banner info"><b>Getting ready…</b></div>';

  try {
    await speech.speak('Say this out loud, normally. Um, uh, so, like, basically, I think so.');
    $('#device-result').innerHTML = `<div class="banner info"><b>Listening for 9 seconds.</b>
      Say: "um, uh, so, like, basically, I think so"</div>`;
    const r = await speech.runDeviceCheck({});
    renderDeviceReport(r);
    renderHomeBanners();
  } catch (err) {
    $('#device-result').innerHTML = `<div class="banner bad"><b>The check could not run.</b> ${esc(err.friendly || err.message)}</div>`;
  } finally {
    btn.disabled = false;
  }
}

function setupSettings() {
  $('#btn-device-check').addEventListener('click', runDeviceCheck);

  $('#btn-export-data').addEventListener('click', () => {
    const blob = new Blob([store.exportAllData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `communication-coach-backup-${report.dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Backup downloaded. Recordings are not included.');
  });

  $('#btn-import-data').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      store.importAllData(await file.text());
      toast('Backup restored.');
      renderSettings();
    } catch (err) {
      toast('That file could not be read.');
    }
    e.target.value = '';
  });

  $('#btn-clear-data').addEventListener('click', () => {
    if (!confirm('Delete every answer, score, recording and note on this device? This cannot be undone.')) return;
    if (!confirm('Really delete everything? Export a backup first if you might want it.')) return;
    store.clearAllData();
    toast('Everything deleted.');
    renderSettings();
    show('home');
  });
}

/* ================================================================= INIT === */

function setupNav() {
  $$('nav button').forEach((b) => b.addEventListener('click', () => {
    speech.unlockAudio();
    if (b.dataset.screen === 'session' && session.active) { show('session'); return; }
    show(b.dataset.screen);
  }));

  $$('[data-more]').forEach((b) => b.addEventListener('click', () => show(b.dataset.more)));

  $('#btn-start-session').addEventListener('click', () => startSession(['task1', 'task2', 'task3']));
  $$('[data-task]').forEach((b) => b.addEventListener('click', () => startSession([b.dataset.task])));
  $('#btn-quick-from-home').addEventListener('click', () => show('quick'));

  $('#home-challenge').addEventListener('change', (e) => {
    store.saveProfile({ currentChallengeId: Number(e.target.value) });
    $('#home-challenge-goal').textContent = challengeById(Number(e.target.value)).goal;
    toast('Task 1 questions now come from this challenge.');
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('service worker failed', err));
  });
}

function init() {
  setupNav();
  setupQuickCheck();
  setupPhrases();
  setupReport();
  setupSettings();
  renderHome();
  store.pruneAudio();
  registerServiceWorker();

  // Leaving mid-answer would otherwise leave the microphone open.
  window.addEventListener('pagehide', () => {
    if (session.capture) session.capture.cancel();
    speech.stopSpeaking();
  });
}

init();
