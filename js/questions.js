/* ==========================================================================
   questions.js  —  what the app reads out loud
   --------------------------------------------------------------------------
   Task 1 pulls from your CURRENT challenge (Section 10). Set which challenge
   you are on in settings.js -> profile.currentChallengeId, or switch it from
   the Home screen.

   Edit these freely. They are just text.
   ========================================================================== */

/* Section 10. Version 1 does not lock or unlock these; you pick one and the
   daily question comes from it. Unlocking arrives in Version 2. */
export const CHALLENGES = [
  { id: 1,  group: 'Work',     name: 'Nail the intro',        goal: '30-second self-introduction, no preparation' },
  { id: 2,  group: 'Work',     name: 'Explain my job',        goal: 'What an FDE / QA engineer does, to a non-technical person, in 3 sentences' },
  { id: 3,  group: 'Work',     name: 'Standup update',        goal: 'Yesterday, today, blockers, under 45 seconds' },
  { id: 4,  group: 'Work',     name: 'Ask for clarity',       goal: 'Ask someone to repeat or explain without sounding lost' },
  { id: 5,  group: 'Work',     name: 'Bug reproduction call', goal: 'What you reproduced, what you need, what happens next' },
  { id: 6,  group: 'Work',     name: 'Disagree politely',     goal: 'Push back on a manager’s idea respectfully' },
  { id: 7,  group: 'Work',     name: 'Interview answer',      goal: 'AI testing or AI security experience in 60 seconds' },
  { id: 8,  group: 'Work',     name: 'Talk Q&A',              goal: 'Answer an audience question in under 45 seconds' },
  { id: 9,  group: 'Work',     name: 'Networking',            goal: 'Introduce yourself to someone senior and end with a clear ask' },
  { id: 10, group: 'Everyday', name: 'Didn’t catch that', goal: 'Ask someone to repeat in a noisy place, naturally' },
  { id: 11, group: 'Everyday', name: 'Service call',          goal: 'Handle a doctor’s office, store, or support call' },
  { id: 12, group: 'Everyday', name: 'Small talk',            goal: 'Keep a conversation going with a stranger for 2 minutes' },
  { id: 13, group: 'Everyday', name: 'Take the compliment',   goal: 'Respond to praise or encouragement naturally' },
];

/* TASK 1 — the 60-second answer. Grouped by challenge id. */
export const TASK1_QUESTIONS = {
  1: [
    'It’s your first day. Your new team is on a call and someone says: so, tell us about yourself.',
    'You join a project mid-way. The lead says: quick intro for the people who haven’t met you?',
    'You’re at a team offsite. Someone from another department asks who you are and what you do.',
    'A new manager joins and asks each person for a one-minute introduction. You’re first.',
    'You’re added to a client Slack channel. Introduce yourself in one spoken paragraph.',
  ],
  2: [
    'Your cousin asks what you actually do all day at work. She is not technical at all.',
    'A recruiter asks: what does a Forward Deployed Engineer do, exactly?',
    'A designer on your team asks what QA engineering involves. Keep it to three sentences.',
    'Someone at a party asks what your company does and what your part in it is.',
    'A friend’s parent asks what you do. They have heard of testing but not automation.',
  ],
  3: [
    'It’s standup. What did you do yesterday, what are you doing today, and what is blocking you?',
    'You missed yesterday’s standup. Give a two-day update in under 45 seconds.',
    'Your manager asks for a quick status on the client integration before a meeting.',
    'Standup, but you are blocked on something and need to say so without sounding stuck.',
    'Give your standup update on a day you got nothing done. Be honest and brief.',
  ],
  4: [
    'A client just explained a workflow and you missed half of it. Ask them to go again.',
    'Your manager used an acronym you don’t know, in front of the team. Ask.',
    'Someone gave you instructions on a call and you only caught the first step. Ask for the rest.',
    'A senior engineer explained an architecture decision too quickly. Ask them to slow down.',
    'You are on a client call and the audio cut out for ten seconds. Ask them to repeat.',
  ],
  5: [
    'Tell a client what you reproduced, what you need from them, and what happens next.',
    'A bug only shows up on the client’s environment. Explain the situation and your ask.',
    'You could not reproduce the bug the client reported. Tell them without blaming them.',
    'Explain a flaky test failure to a client who thinks the product is broken.',
    'The bug is fixed but the client has to redeploy. Tell them what to do.',
  ],
  6: [
    'Your manager wants to ship on Friday. You think the testing is not done. Say so.',
    'A senior engineer suggests an approach you think will not scale. Push back respectfully.',
    'Your team wants to skip regression testing this sprint. Disagree.',
    'A client asks for a feature you think will make their workflow worse. Say what you think.',
    'Your manager assigns you work that duplicates something another team is doing. Raise it.',
  ],
  7: [
    'Tell me about your AI testing or AI security experience.',
    'What is the hardest testing problem you have solved?',
    'Why are you moving from QA into a Forward Deployed Engineer role?',
    'Tell me about a time you found a bug nobody else could reproduce.',
    'What would you do in your first ninety days here?',
  ],
  8: [
    'You just gave your AI testing talk. Someone asks: how do you test something non-deterministic?',
    'An audience member asks whether AI will replace QA engineers. Answer in under 45 seconds.',
    'Someone asks what tooling you would recommend for a team just starting AI testing.',
    'A sceptical audience member says AI testing is just a buzzword. Respond.',
    'Someone asks what you would do differently if you started the project again.',
  ],
  9: [
    'You’re at a conference. The speaker you admire is free for a minute. Go.',
    'Introduce yourself to a hiring manager at a meetup and end with a clear ask.',
    'You meet a founder whose product you use daily. Introduce yourself and ask for something.',
    'Someone senior asks what brought you to this event. Answer and keep it going.',
    'You want an introduction to someone’s colleague. Ask for it out loud.',
  ],
  10: [
    'You’re in a loud cafe and the person opposite said something you missed. Ask.',
    'On a call with bad connection, you caught only half a sentence. Ask naturally.',
    'A stranger asked you a question on the street and you did not hear it. Respond.',
    'Someone said their name quickly at an event and you missed it. Ask again.',
    'At a restaurant the server listed the specials too fast. Ask them to repeat one.',
  ],
  11: [
    'Call a doctor’s office to move an appointment you booked for next Tuesday.',
    'You were charged twice by a store. Call and sort it out.',
    'Call an internet provider because your connection drops every evening.',
    'Ask a pharmacy whether a prescription is ready and what it will cost.',
    'Return something to a store without a receipt. Explain and ask.',
  ],
  12: [
    'You’re waiting in line next to someone who just spoke to you. Keep it going for two minutes.',
    'You’re seated next to a stranger at a work dinner. Start and sustain a conversation.',
    'Someone at the gym comments on the weather. Take it somewhere.',
    'You share an elevator with a neighbour you have never spoken to. Say something.',
    'At a wedding you know nobody at your table. Open a conversation.',
  ],
  13: [
    'Your manager says your work on the last release was excellent. Respond.',
    'A client tells your manager you were the most helpful person on the project. You hear it.',
    'Someone says your talk was the best one at the conference. Respond naturally.',
    'A teammate thanks you publicly in Slack for unblocking them. Reply out loud.',
    'Someone says: you explain things really clearly. Take it.',
  ],
};

/* TASK 2 — spoken cut drill. The app reads one of these long, rambling
   answers out loud. You say the same thing in 2 sentences, under 20 seconds.
   These are deliberately written in the information-dumping shape from
   Section 3, so they sound like something you would say. */
export const CUT_DRILL_TEXTS = [
  'So basically what happened was, I was looking at the test suite yesterday, and I noticed that a few of the tests were failing, but not all the time, sometimes they pass and sometimes they fail, and I thought maybe it was the environment, because we had a deployment on Tuesday, or it could have been Wednesday, and then I checked the logs and there were some timeout errors, which usually means something is slow, so I think the API is slow, right?',
  'Actually the thing with the client is, they sent an email on Monday saying the export feature is broken, and I tried to reproduce it on my machine, and it worked fine for me, so then I thought maybe it is a data issue, because their data is much bigger than ours, and I asked them for a sample, and they sent it, and with that data it actually does break, so basically we need to handle large files better.',
  'So my role, I mean, I started as a QA engineer about four point three years ago, and I was doing manual testing first, and then I moved into automation, and I learned Selenium and then Playwright, and now at ContextQA I am a Forward Deployed Engineer which means I work directly with the clients, so I do a bit of everything really, testing and also talking to customers and sometimes writing the integration code.',
  'Basically the reason I think we should not ship on Friday is that, you know, we have about twelve open bugs right now, and some of them are minor, but three of them are in the payment flow, and the payment flow is the thing customers actually use, and we have not done a full regression since last sprint, and the team is also short two people this week because of holidays, so realistically I think Monday is safer, right?',
  'So the way the new onboarding works is, when a user signs up they get an email, and the email has a link, and the link takes them to a setup page where they connect their repository, and then after they connect it we run an initial scan, which takes a few minutes depending on the size, and then they see the dashboard, but the problem is that a lot of people drop off at the repository step because it asks for permissions and they get nervous.',
  'Actually I wanted to ask about the architecture decision from the meeting, because you mentioned we are moving to the queue-based approach, and I understand the reasoning I think, it is about handling spikes, but I was wondering how that affects the tests we already have, because right now they assume things happen immediately, and if it becomes asynchronous then basically all of those tests would need rewriting, so I was not sure what the plan is there.',
];

/* TASK 3 — real-life retell prompts. */
export const RETELL_PROMPTS = [
  'Describe something you said in a meeting today. Say it the way you said it.',
  'Retell a Slack message you sent your manager today, out loud.',
  'Describe a moment in a client call today where you were not sure you were clear.',
  'Tell me about something you explained to someone today. Explain it to me the same way.',
  'Describe a question someone asked you today and the answer you gave.',
  'Retell the last thing you said on a call before you hung up.',
  'Describe something you wrote today that took you more than one draft.',
  'Tell me one thing that happened at work today, the way you would tell a friend.',
];

/* Section 7: one thing to remember, shown at the end of a session. */
export const CLOSING_LINES = [
  'Point first. One example. Stop.',
  'The pause you are afraid of sounds like confidence to everyone else.',
  'If you cannot say it in eight words, you have not decided what it is yet.',
  'Your first sentence is the whole answer. The rest is optional.',
  'Nobody is waiting for your background. They are waiting for your point.',
  'You think in paragraphs. Conversations need one clear point.',
  'Stop talking one sentence earlier than feels natural.',
  'Land the last word. Do not let it fade.',
];

export function challengeById(id) {
  return CHALLENGES.find((c) => c.id === id) || CHALLENGES[0];
}

export function questionsForChallenge(id) {
  return TASK1_QUESTIONS[id] || TASK1_QUESTIONS[1];
}
