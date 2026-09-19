/* ==========================================================================
   speech.js  —  the phone's own voice and ears. No API, no key, no cost.
   --------------------------------------------------------------------------
   Text to speech : window.speechSynthesis
   Speech to text : window.SpeechRecognition / webkitSpeechRecognition
   Playback       : MediaRecorder (optional, see below)

   Two things phone browsers do that this file works around:

   1. Recognition stops on its own after a short silence, on both iOS and
      Android, whatever `continuous` is set to. We restart it until you tap
      stop, and stitch the pieces back together.

   2. Some phones cannot record audio and run recognition at the same time,
      because both want the microphone. You chose recognition. So we start
      recognition FIRST, then try the recorder; if recognition dies, we drop
      the recorder, remember that, and stop trying on this device.
   ========================================================================== */

import { SETTINGS } from './settings.js';
import { getDeviceReport, saveDeviceReport } from './storage.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

export const support = {
  recognition: Boolean(SR),
  tts: 'speechSynthesis' in window,
  mediaRecorder: typeof MediaRecorder !== 'undefined'
    && Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  secure: window.isSecureContext,
  standalone: window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true,
};

/** Rough platform read, only used to explain problems to you in plain words. */
export function platformName() {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/* ======================================================= TEXT TO SPEECH ==== */

let voicesReady = false;
let audioUnlocked = false;

/** iOS will not speak until speechSynthesis has been poked inside a real tap. */
export function unlockAudio() {
  if (audioUnlocked || !support.tts) return;
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    speechSynthesis.speak(u);
    speechSynthesis.getVoices();
    audioUnlocked = true;
  } catch (err) {
    console.warn('audio unlock failed', err);
  }
}

function pickVoice() {
  if (!support.tts) return null;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const lang = SETTINGS.speech.lang;
  return (
    voices.find((v) => v.lang === lang && /Samantha|Google US English|Aria/i.test(v.name))
    || voices.find((v) => v.lang === lang)
    || voices.find((v) => v.lang && v.lang.startsWith('en'))
    || voices[0]
  );
}

if (support.tts && typeof speechSynthesis.addEventListener === 'function') {
  speechSynthesis.addEventListener('voiceschanged', () => { voicesReady = true; });
}

/** Read text out loud. Resolves when finished (or immediately if unsupported). */
export function speak(text) {
  return new Promise((resolve) => {
    if (!support.tts || !text) { resolve(false); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SETTINGS.speech.lang;
      u.rate = SETTINGS.speech.ttsRate;
      u.pitch = SETTINGS.speech.ttsPitch;
      const v = pickVoice();
      if (v) u.voice = v;
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(true); } };
      u.onend = finish;
      u.onerror = finish;
      // Safety net: some browsers never fire onend for long text.
      setTimeout(finish, Math.max(4000, text.length * 90));
      speechSynthesis.speak(u);
    } catch (err) {
      console.warn('speak failed', err);
      resolve(false);
    }
  });
}

export function stopSpeaking() {
  if (support.tts) {
    try { speechSynthesis.cancel(); } catch (err) { /* nothing to do */ }
  }
}

/* ====================================================== SPEECH TO TEXT ===== */

/**
 * Wraps SpeechRecognition and keeps a timeline of when words arrived, which
 * is how we estimate pace, time to first point, and long pauses.
 */
class Listener {
  constructor() {
    this.rec = null;
    this.wanted = false;
    this.finals = [];
    this.interim = '';
    this.timeline = [];      // [{ t: msSinceStart, text: transcriptSoFar }]
    this.startedAt = 0;
    this.stoppedAt = 0;
    this.restarts = 0;
    this.lastError = null;
    this.onUpdate = null;    // (text, isFinal) => void
    this.onError = null;     // (code) => void
  }

  get transcript() {
    return (this.finals.join(' ') + ' ' + this.interim).replace(/\s+/g, ' ').trim();
  }

  start() {
    if (!SR) throw new Error('unsupported');
    this.wanted = true;
    this.finals = [];
    this.interim = '';
    this.timeline = [];
    this.restarts = 0;
    this.lastError = null;
    this.startedAt = performance.now();
    this._spawn();
  }

  _spawn() {
    const rec = new SR();
    rec.lang = SETTINGS.speech.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) this.finals.push(text.trim());
        else interim += text;
      }
      this.interim = interim;
      this.timeline.push({
        t: Math.round(performance.now() - this.startedAt),
        text: this.transcript,
      });
      if (this.onUpdate) this.onUpdate(this.transcript, interim === '');
    };

    rec.onerror = (event) => {
      this.lastError = event.error;
      // 'no-speech' and 'aborted' are normal on phones; let onend restart.
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        if (this.onError) this.onError(event.error);
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.wanted = false;
      }
    };

    rec.onend = () => {
      if (!this.wanted) return;
      if (!SETTINGS.speech.autoRestartRecognition) return;
      // Phones end the session on every pause. Pick it back up.
      // Anything final that arrived is already in this.finals.
      this.restarts += 1;
      if (this.restarts > 200) { this.wanted = false; return; }
      try {
        this._spawn();
      } catch (err) {
        console.warn('recognition restart failed', err);
        this.wanted = false;
      }
    };

    this.rec = rec;
    rec.start();
  }

  stop() {
    this.wanted = false;
    this.stoppedAt = performance.now();
    if (this.interim) {
      this.finals.push(this.interim.trim());
      this.interim = '';
    }
    try { this.rec && this.rec.stop(); } catch (err) { /* already stopped */ }
    return this.result();
  }

  result() {
    const durationMs = (this.stoppedAt || performance.now()) - this.startedAt;
    return {
      transcript: this.transcript,
      // Phone recognisers finalise a chunk on every pause, so these chunks
      // are the best sentence boundaries we get when punctuation is missing.
      segments: this.finals.slice(),
      timeline: this.timeline,
      durationMs: Math.round(durationMs),
      restarts: this.restarts,
      error: this.lastError,
    };
  }
}

/* ========================================================== RECORDING ====== */

class Recorder {
  constructor() {
    this.mr = null;
    this.stream = null;
    this.chunks = [];
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    const mime = ['audio/webm', 'audio/mp4', 'audio/aac', '']
      .find((t) => t === '' || (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)));
    this.mr = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
    this.mr.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.mr.start();
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.mr || this.mr.state === 'inactive') { this._release(); resolve(null); return; }
      this.mr.onstop = () => {
        const blob = this.chunks.length
          ? new Blob(this.chunks, { type: this.mr.mimeType || 'audio/webm' })
          : null;
        this._release();
        resolve(blob);
      };
      try { this.mr.stop(); } catch (err) { this._release(); resolve(null); }
    });
  }

  _release() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.mr = null;
  }
}

/* ================================================ CAPTURE (the real thing) = */

/** Has this device already proved it cannot do both at once? */
function playbackBlocked() {
  const d = getDeviceReport();
  return Boolean(d && d.simultaneous === false);
}

function rememberPlaybackBlocked() {
  const d = getDeviceReport() || {};
  saveDeviceReport({ ...d, simultaneous: false, decidedAt: new Date().toISOString() });
}

/**
 * Start capturing an answer.
 * Returns a handle with .stop() -> { transcript, timeline, durationMs, audioBlob }
 */
export async function startCapture({ onUpdate, onError } = {}) {
  if (!support.recognition) {
    const err = new Error('no-recognition');
    err.friendly = 'This browser cannot turn speech into text. On iPhone use Safari, on Android use Chrome.';
    throw err;
  }

  const listener = new Listener();
  listener.onUpdate = onUpdate || null;
  listener.onError = onError || null;
  listener.start();

  // Recognition goes first and keeps the microphone if there is a fight.
  let recorder = null;
  const wantPlayback = SETTINGS.speech.tryPlayback
    && support.mediaRecorder
    && !playbackBlocked();

  if (wantPlayback) {
    try {
      recorder = new Recorder();
      await recorder.start();
      // Give recognition a moment to fall over if the recorder stole the mic.
      await new Promise((r) => setTimeout(r, 600));
      if (listener.lastError === 'audio-capture' || !listener.wanted) {
        await recorder.stop();
        recorder = null;
        rememberPlaybackBlocked();
        // Recognition is the one that matters. Start it cleanly again.
        listener.start();
      }
    } catch (err) {
      console.warn('recorder unavailable, continuing with recognition only', err);
      if (recorder) { try { await recorder.stop(); } catch (e) { /* ignore */ } }
      recorder = null;
    }
  }

  const hardStop = setTimeout(() => {
    if (listener.wanted) listener.stop();
  }, SETTINGS.speech.maxRecordSeconds * 1000);

  return {
    hasPlayback: Boolean(recorder),
    get transcript() { return listener.transcript; },
    async stop() {
      clearTimeout(hardStop);
      const result = listener.stop();
      let audioBlob = null;
      if (recorder) {
        try { audioBlob = await recorder.stop(); } catch (err) { audioBlob = null; }
      }
      return { ...result, audioBlob };
    },
    cancel() {
      clearTimeout(hardStop);
      try { listener.stop(); } catch (err) { /* ignore */ }
      if (recorder) recorder.stop();
    },
  };
}

/* ================================================= ONE-SHOT DICTATION ====== */

/** Short dictation for the Core step, the inner editor, and Quick Check. */
export async function dictateOnce({ onUpdate } = {}) {
  const capture = await startCapture({ onUpdate });
  return capture;
}

/* ================================================== CHECK MY PHONE ========= */

/**
 * Section 0 says to test the two risky things early. This is that test.
 * It is run from Settings > Check my phone.
 */
export async function runDeviceCheck({ onStep } = {}) {
  const step = (msg) => { if (onStep) onStep(msg); };
  const report = {
    at: new Date().toISOString(),
    platform: platformName(),
    standalone: support.standalone,
    secure: support.secure,
    recognition: support.recognition,
    tts: support.tts,
    mediaRecorder: support.mediaRecorder,
    fillersKept: null,
    simultaneous: null,
    heard: '',
    notes: [],
  };

  if (!support.secure) {
    report.notes.push('This page is not on https, so the microphone will not work. Open the GitHub Pages link.');
  }
  if (!support.recognition) {
    report.notes.push('No speech recognition in this browser. Use Safari on iPhone or Chrome on Android. Firefox does not support it.');
    saveDeviceReport(report);
    return report;
  }

  // Test 1: do "um" and "uh" survive the transcript?
  step('Say this out loud, normally: "um, uh, so, like, basically, I think so"');
  const capture = await startCapture({});
  report.simultaneous = capture.hasPlayback;

  await new Promise((r) => setTimeout(r, 9000));
  const result = await capture.stop();
  const heard = (result.transcript || '').toLowerCase();
  report.heard = result.transcript || '';

  if (!heard.trim()) {
    report.notes.push('Nothing was transcribed. Check the microphone permission, then try again in a quiet room.');
    report.fillersKept = null;
  } else {
    const keptUm = /\bum\b/.test(heard) || /\buh\b/.test(heard) || /\berm\b/.test(heard);
    report.fillersKept = keptUm;
    if (keptUm) {
      report.notes.push('Good news: your phone keeps "um" and "uh" in the transcript, so filler scores will be accurate.');
    } else {
      report.notes.push('Your phone deletes "um" and "uh" before the app sees them. Filler scores will under-count. "so", "like", "basically" and "actually" are still caught. Long pauses are shown instead, as a stand-in.');
    }
  }

  if (report.simultaneous) {
    report.notes.push('This phone can record and transcribe at the same time, so playback works.');
  } else {
    report.notes.push('This phone cannot record and transcribe at once. Transcription is kept and playback is off, which is what you asked for.');
  }

  if (report.platform === 'ios' && report.standalone) {
    report.notes.push('You are running the installed home-screen app on iPhone. If recording is unreliable here, open the same link in Safari instead. Everything else works the same.');
  }

  saveDeviceReport(report);
  return report;
}
