# Matriq — Waitlist Site, Growth Strategy & Launch Ads

## 1. Audit: what's actually on matriq.com.ng right now

Pulled the live page directly rather than going on memory. The complaint is accurate and specific:

- **Headline is "The operating system for Nigerian student associations."** Every section — "For executives," "For members," "We set up your association" — is written to an association executive deciding whether to adopt a tool for their group, not to an individual student deciding whether they want the app. That's the old dues-first vision, still live.
- **Six section icons are literal emoji** (📋 💸 🎭 📢 🧾 📚), not a designed icon set — reads as a template, not the premium/hype positioning the rest of this project has been built around.
- **On not showing up on Google:** the page does have real meta tags and server-rendered content (unlike the old NSG site's blank loading shell audited earlier — this isn't that problem). A brand-new domain with no backlinks yet genuinely takes real time to get crawled and ranked, even when everything technical is correct — that's not a bug, just where a new site starts. Worth checking regardless, since these are quick and free: confirm `robots.txt` isn't blocking crawlers, submit the site and a sitemap to Google Search Console directly rather than waiting to be found, and confirm there's no accidental `noindex` tag left over from staging. None of that guarantees ranking first for a competitive term — that takes sustained content and real backlinks over time — but it's the correct checklist, not a guess.

---

## 2. New pitch — rewritten for students, not associations

**Hero**
- Headline: **The Smart Way to Get Through Semester.**
- Subhead: *Past questions, offline AI, and the tools you actually reach for daily — one app, built for how Nigerian students actually study.*
- Email capture: name (optional) + email, button labeled **Join the waitlist**.
- Immediately under the form: *You'll also get an invite to our Telegram, where we're building this with the people actually using it.* — links straight to the group (`t.me/+Bk-Wbby2_Cc3Njk0`).
- Trust row: 🇳🇬 Built for Nigerian campuses · 📶 Works on bad data · 🤖 Offline AI, zero data cost

**"The old way is exhausting" → reframed to student pain, not exec pain**
- Past questions scattered across a dozen forgotten WhatsApp chats.
- Data too expensive to burn re-downloading a 200MB PDF for the third time.
- ChatGPT doesn't know what your lecturer actually asked last year.
- "What do I even read first" panic, every single exam week.
- No signal in the hall, no access to anything you need.

**"Everything you need" → the actual daily tools**
- **The Vault** — past questions and materials from students who came before you, searchable by course code.
- **Offline AI** — download once, ask anything after, zero data, zero signal required.
- **Tools** — CGPA calculator built for the Nigerian grading scale, a predictor that tells you exactly what you need to hit your target, OCR, document conversion, straight to your school portal.
- **Built for bad data** — light versions of every document, downloaded once, usable all semester.

One line near the bottom, not a headline: *If your department or faculty association is on Matriq too, dues and verified membership live right there in Settings.* — present, not the pitch.

**How it works**
1. Join the waitlist above.
2. Get invited as we roll out.
3. Download, verify, and you're in.

**Closing CTA:** *Be first in line.* Same email form, repeated.

---

## 3. Turning the waitlist into a growth engine

**Add two light fields to the signup form**, not just name/email:
- *"What's the single most annoying part of studying right now?"* — open text, optional. This is the insight-gathering Julius asked for, collected at zero extra friction, and it's honest market research from the exact people the product is for.
- *"Do you hold a position in a class, department, or faculty association?"* — yes/no, with a follow-up for level, department, and faculty if yes. This is how the executives needed for real-time class/timetable updates (Section 2 of the fixes doc) actually get identified, rather than recruited separately later.

**From the pool, form a small named group** — call it the **Matriq Founding Circle** (or similar; naming it matters, "the waitlist" isn't something anyone feels part of) — pulled from whoever gave the most thoughtful survey answers plus a spread of the identified class reps/executives across different levels, departments, and faculties, so feature decisions aren't accidentally skewed toward one course of study. This group gets: earliest access, a direct line in the Telegram (a pinned or separate channel once the main group gets large), and a real seat in prioritizing what gets built next — not just a badge, actual input that shows up in shipped features.

---

## 4. Launch ads — four frameworks, ~45 seconds each

Brief across all of them: no corporate language, pitch without selling, CTA is always *join the waitlist*, built for Remotion assembly so each is broken into clean, discrete scenes/cuts rather than one continuous shot.

### Framework A — "A Day In The Life" (fast-cut, documentary-real)

```
[0:00–0:04] Phone alarm. Bleary face. Text on screen: "6:47am."
[0:04–0:09] Scrolling a chaotic WhatsApp group looking for a past question — 500+ unread, nothing found. VO (flat, real): "Somewhere in here is the CHM101 past question. Good luck."
[0:09–0:14] Cut: opens Matriq, types "CHM101," results appear instantly. On-screen text: "The Vault. Searchable. Actually organized."
[0:14–0:19] Danfo/bus, no signal bars. VO: "No signal, no wahala." Cut: asks the offline AI a question, gets an answer anyway. On-screen text: "Offline AI. Zero data."
[0:19–0:26] Lecture hall, phone screen shows CGPA predictor being filled in. VO: "You already know your CGPA. Now know what it takes to fix it." Cut: result appears — "3 A's, rest B's → 3.5 next semester."
[0:26–0:33] Fast montage: OCR scanning a note, a document compressing, flashcards flicking past. VO: "Everything you already do. Just faster."
[0:33–0:40] Full-screen logo reveal, glow, tagline builds in: "The Smart Way." 
[0:40–0:45] CTA card: "Join the waitlist — link in bio." Telegram icon + handle.
```

### Framework B — "POV" (native short-form, text-on-screen led, near-silent until the hook)

```
[0:00–0:05] POV shot, staring at a blank search bar. On-screen text only: "POV: it's 11pm and the past question you need doesn't exist online."
[0:05–0:10] Cut to Vault search, results load. Text: "It does now."
[0:10–0:16] Quick cuts, text-driven, one beat each: "POV: your data don finish." → offline AI answers anyway. "POV: CGPA wahala." → predictor gives a real number.
[0:16–0:24] Cut to a group of students actually laughing at something on a phone screen — no VO, just a needle-drop beat and real reactions.
[0:24–0:32] Text: "Built by a Nigerian student. For Nigerian students." Quick logo/brand moment.
[0:32–0:40] Text: "Not out yet. But you can be first." Waitlist screen shown on-phone.
[0:40–0:45] CTA card, Telegram handle, done.
```

### Framework C — Epic trailer style, with a post-credit scene

```
[0:00–0:03] Black screen. Low rumble builds. 
[0:03–0:08] Deep trailer-voice narration over a slow push-in on a phone screen: "Every semester… the questions repeat." Fast flash: an old exam paper.
[0:08–0:13] "Every naira of data… wasted, searching." Fast flash: a spinning loading wheel, no signal icon.
[0:13–0:18] Music swells, cuts get faster. "Every student… fighting the same war. Alone." Flash: chaotic WhatsApp groups, a student staring at a blank Google result.
[0:18–0:24] Sudden silence. One beat. Then: the Vault, the offline AI, the CGPA predictor, flashing in rapid, powerful cuts, each accompanied by a hard hit of music.
[0:24–0:30] Narrator, full power: "One app. Built for the fight you're already in." Full brand reveal — logo, glow, tagline slams in: "THE SMART WAY."
[0:30–0:36] Rapid-fire final montage, one frame each: Vault, Offline AI, Tools, a student smiling at their phone.
[0:36–0:40] CTA card: "Join the waitlist." Telegram handle. Music cuts hard to silence.
[0:40–0:45] POST-CREDIT SCENE, tone shift — lighter, almost comedic. A phone screen lights up in the dark. A single notification: "Your association just joined Matriq." Text on screen, deadpan: "...dues dashboard coming soon." Small logo sting. Cut to black.
```

### Framework D — "Myth vs. Reality" (quick, punchy, comparison-driven)

```
[0:00–0:06] Text: "What people think studying smart looks like:" — quick clip of an overly polished, unrealistic "productivity influencer" aesthetic (soft piano, perfect desk).
[0:06–0:08] Hard record-scratch cut.
[0:08–0:14] Text: "What it actually looks like:" — real, messy: a student on a bus, cracked screen, one earbud in, using Matriq's offline AI between stops.
[0:14–0:20] Same pattern, second beat: "Myth: you need perfect data." Cut. "Reality: you need zero." — offline AI demo.
[0:20–0:26] Third beat: "Myth: past questions are impossible to find." Cut. "Reality: they're searchable." — Vault demo.
[0:26–0:34] Fast, real montage of the tools in actual use, no gloss.
[0:34–0:40] Logo, tagline: "The Smart Way."
[0:40–0:45] CTA card, Telegram handle.
```
