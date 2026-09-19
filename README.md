# Communication Coach

A voice-first daily speaking practice app. It reads a question out loud, listens to your
answer, scores how you spoke, and tracks whether your habits are changing.

This is **version 1** — Section 12 of the spec, and nothing beyond it.

**It costs nothing to run.** No AI API, no paid services, no server, no accounts, no keys.
Scoring is rule-based and happens in your phone's browser. Deep coaching happens in your own
Claude chat, by pasting in the report the app generates.

---

## Put it on your phone

### 1. Push this to GitHub

The repo must be **public** — GitHub Pages does not serve private repos on the free plan.

### 2. Turn on Pages

Repo → **Settings** → **Pages** → under *Build and deployment*, set **Source** to
*Deploy from a branch*, pick your branch and the `/ (root)` folder, then **Save**.

A minute later your app is live at:

```
https://<your-username>.github.io/communication-coach/
```

That address is https, which is what the microphone requires. It will not work from a
`file://` path on your computer.

### 3. Add it to your home screen

- **iPhone:** open the link in **Safari** → Share → *Add to Home Screen*
- **Android:** open the link in **Chrome** → menu → *Install app* / *Add to Home screen*

### 4. Run the phone check first

Open **More → Settings → Check my phone** and follow the prompt. It takes about 15 seconds
and tells you two things that decide whether your scores mean anything:

1. whether your phone keeps `um` and `uh` in transcripts
2. whether it can record audio and transcribe at the same time

Do this before you trust any filler score.

---

## Tuning the scoring

**Every number lives in [`js/settings.js`](js/settings.js). Nothing else needs editing.**

Targets, point deductions, the filler list, pattern toggles, the tip text, how long
recordings are kept — all of it is in that one file, commented.

You can edit it entirely from your phone:

1. Open the repo on github.com and tap `js/settings.js`
2. Tap the pencil icon, change a number, tap **Commit changes**
3. Wait ~30 seconds, reload the app
4. Open **Settings → Scoring settings in use** and confirm the number changed

That screen also validates the file, so a typo shows up as a warning instead of as silently
wrong scores.

The spec says to tune after the first week of real use. That's the intended workflow.

---

## What's in version 1

| Spec section | Built |
|---|---|
| 0 | Voice loop: question read aloud, Core step, record, transcript, playback |
| 0 | Voice measurements: pace, time to first point, length, long pauses, fillers |
| 7 | Daily screen with all three voice tasks |
| 7 | Inner editor step before feedback, plus one re-record with before/after |
| 8 | Quick Check with rule-based highlights and a "Send to Claude" copy button |
| 11 | The five rule-based scores, in an editable settings file |
| 5 | Pattern counter with the 7-day green check |
| 9 | Phrase library; anything you add is detected from then on |
| 11 | Progress screen: streak, trend, top 3 patterns, self-catch rate, pace and filler trends |
| 16 | Weekly report export with copy and share buttons |
| 0 | Data and recordings stored on the device only |

**Not built yet, by design.** Version 2 is the diagnostic with 30-day retakes, the challenge
unlock system, and the diagnostic export. Version 3 is the live Situation Simulator. The
challenge list is in the app so you can pick which one today's question comes from, but
challenges do not lock or unlock yet.

---

## Honest limits

These matter more than the feature list.

- **Your phone may delete your fillers.** Both Apple's and Google's speech engines clean up
  transcripts before handing them over, and `um` and `uh` are usually the first to go.
  `so`, `like`, `basically`, `actually` and `right?` survive, because they are ordinary
  words. Run the phone check. If your fillers are being eaten, the Fillers score under-counts
  and the app says so on the home screen rather than pretending otherwise.
- **Recording and transcribing may not work at once.** Recognition is started first and keeps
  the microphone; if the recorder loses the fight, playback switches itself off and stays off
  on that device. Transcription is what scoring needs, so it wins.
- **Timing is approximate.** The speech API gives no real timestamps. Time to first point and
  long pauses are inferred from when results arrived, so they are shown but not scored.
- **Transcription needs a connection.** It is free and needs no key, but the audio is sent to
  Apple or Google to be transcribed. Your recordings, transcripts and scores never leave the
  device. Everything except transcription works offline.
- **Firefox will not work.** It has no speech recognition. Use Safari on iPhone, Chrome on
  Android.
- **Scores are signals, not judgments.** They cannot tell whether your point was the *right*
  point, or whether your phrasing sounds natural. That is what the weekly Claude review is for.

---

## Your data

Everything is stored on the device, in `localStorage` (scores, transcripts, notes) and
IndexedDB (audio). There is no server to store it on. Clearing your browser data deletes it,
so use **Settings → Export backup** if you care about the history. Recordings are pruned
automatically after 14 days, which you can change in the settings file.

---

## Files

```
index.html               one page, screens swapped in JS
css/app.css
js/settings.js           ← every scoring number, the only file to tune
js/patterns.js           Section 5 pattern detectors, Section 9 phrase seeds
js/questions.js          what the app reads out loud
js/speech.js             text-to-speech, recognition, recording, phone check
js/scoring.js            the five scores, measurements, highlighting
js/storage.js            localStorage and IndexedDB, all on-device
js/report.js             weekly report and the week-over-week maths
js/app.js                screens and wiring
sw.js                    offline shell
manifest.webmanifest     makes it installable
tools/make-icons.py      regenerates the icons, no dependencies
```

No build step, no dependencies, no package.json. What is in the repo is what runs in the
browser, which is also what makes editing `settings.js` on github.com work.

After changing any file, bump `CACHE_VERSION` in `sw.js` so phones that already installed the
app pick up the new version.
