# Matriq Scroll Journey — Image Prompt Kit

Mobile-first, 9:16, one continuous world told across scenes. Generate the
**START** and **END** frames first (required), from the same style block.
The middle scenes are optional depth — each maps to a page section.

Story arc: **loss → guidance → order → power → communion → dawn.**

---

## 0. STYLE BLOCK — paste BEFORE every scene prompt

> Matriq brand world: an infinite dark void of matte charcoal-black
> (#0a0a0a), volumetric darkness, faint drifting dust. All light in the
> scene is a single electric lime chartreuse (#c6ff3d) — no other hue
> exists. Materials are organic-tech: matte charcoal paper with visible
> fiber grain, dry ink edges, and bioluminescent lime filaments like
> mycelium threads that glow softly and pulse like slow breathing.
> Everything looks both grown and filed — a living archive. Cinematic
> photography, shot on 35mm, f/2.0 shallow depth of field, soft volumetric
> fog, subtle film grain, gentle bloom on lime highlights, deep true
> blacks. Vertical 9:16 mobile composition: the subject sits in the
> central 60% of the frame; the top 20% and bottom 20% are quiet dark
> negative space reserved for text overlay. No purple, no blue, no neon
> city, no chrome, no readable text, no letters, no logos, no watermarks,
> no human faces.

**Negative prompt (if the tool takes one):**
`purple, blue, neon cityscape, cyberpunk, chrome, hologram HUD, text, letters, watermark, logo, faces, daylight, white background, clutter, oversaturation`

**Consistency rules:**
- Same seed / style-reference image across scenes if the tool supports it.
- Start + end first; treat them as the two ends of ONE camera journey.
- Keep the lime narrow and precious — it is the scarcest thing in every frame.

---

## 1. START — "The Last Page" → Hero (`#top`)

> A single sheet of matte charcoal paper — a worn university past-question
> page, edges soft with age — suspended alone in an immense black void,
> photographed from slightly below. Its surface carries faint embossed
> lines and diagrams (no readable letters), and one lime mycelium
> filament has just touched its corner, glowing at the point of contact,
> the light beginning to spread through the paper's fibers like ink
> soaking into blotting paper. Thousands of tiny dust motes drift around
> it, a few catching the lime glow. Far below, out of focus, a suggestion
> of vast depth — the page is the first thing falling into the archive.
> Mood: quiet, lonely, the moment before a journey. Camera: centered,
> slight low angle, the page small inside the enormous darkness.

**Image→video motion:** slow push-in toward the page; dust drifts upward
past camera; the lime glow spreads gradually through the paper fibers;
the paper trembles gently, like breathing; fog rolls softly.

**Overlay copy (existing):** "Your department's memory, in your pocket."

---

## 2. "The Tangle" → Why Matriq (`#why`) — *optional*

> Hundreds of loose papers — notes, handouts, past questions — scattered
> and tumbling through the black void in quiet chaos, drifting in
> contradictory directions, frayed, dim, charcoal on charcoal, barely
> visible. Between them, tangles of dead grey threads knot pages
> together and go nowhere. One single lime filament descends from the
> top of frame like a plumb line — straight, sure — its tip beginning to
> snag the nearest page. Mood: the confusion of searching, luck, wasted
> data — and the first thread arriving. Camera: medium-wide, slight dutch
> tilt, papers layered deep into the darkness.

**Motion:** papers tumble in weightless slow chaos; dead grey threads
slacken; the lime thread descends and lifts one page out of the drift;
foreground pages blur past.

**Overlay copy:** "Built for the campus, not the cloud."

---

## 3. "The Assembling" → How it works (`#how`) — *optional*

> The lime thread pulls pages into formation: dozens of charcoal paper
> sheets aligning edge-to-edge in mid-air, stacking themselves into the
> first visible architecture of a towering monolith — a honeycomb of
> paper cells, each niche holding a single glowing page. Lime filaments
> lace the joins like ligaments, light traveling along them from cell to
> cell as each page locks in. Several cells remain empty — dark voids
> awaiting their page. Mood: order emerging; many hands building one
> thing. Camera: low angle looking up the growing structure as it rises
> out of the top of frame.

**Motion:** pages fly in from off-frame and slot into the honeycomb;
light pulses travel the mycelium seams as each cell locks; camera tilts
slowly up; dust falls like slow snow.

**Overlay copy:** "Four steps. One semester. Changed."

---

## 4. "The Ignition" → Join / form (`#join`) — *optional*

> Deep inside the finished paper monolith, at its heart, a single page
> ignites — not burning, luminous: lime light blooms outward through
> every fiber of the surrounding paper cells, the seams glowing like
> veins, the interior a cathedral grown from paper and glow. The light
> is strongest at the core page and falls off into darkness at the frame
> edges. No wires, no plugs — the light is self-generated, born inside.
> Mood: the offline AI — power that lives in your pocket, not on a
> server. Camera: inside the structure, centered on the ignition core,
> perfectly symmetrical.

**Motion:** light blooms from the core in a slow wave through the paper
veins; filaments pulse like a heartbeat; heat-shimmer in the haze;
camera drifts forward toward the core.

**Overlay copy:** "Be first through the door."

---

## 5. "The Handoff" → Telegram community (`#telegram`) — *optional*

> Two hands in dark sleeves passing a single lime-edged page between
> them in the void — the receiving hand catching it as lime filaments
> begin to root from the page toward other dim pages floating nearby, a
> constellation slowly waking. Deep in the background, dozens of tiny
> warm sparks — other students, other pages — hint at a network forming.
> Faces never visible; only hands and forearms emerging from darkness.
> Mood: students feeding students; the archive stays alive because
> everyone adds one. Camera: close on the pass, shallow depth of field,
> background sparks as bokeh.

**Motion:** the page passes hand to hand; its filaments reach out and
root into nearby dim pages, which glow one by one; bokeh sparks twinkle
in the far dark.

**Overlay copy:** "The door is already open on Telegram."

---

## 6. END — "Dawn Over the Archive" → closing CTA / FAQ / footer

> The completed monolith — an immense, calm, monumental tower of stacked
> charcoal paper cells with lime light breathing in its seams — standing
> finished in the void, seen from a respectful distance. Above its crown,
> a horizon of first light: a thin band of lime dawn breaking across the
> top of the frame, fog parting. In the bottom third, the small dark
> silhouette of a phone held in one hand, its screen the only other lit
> surface, mirroring the tower. Everything is still, arrived, complete.
> Mood: dawn after the all-nighter; the smart way through semester; it
> exists now, and it is yours. Camera: wide, low, monumental, centered
> symmetry.

**Image→video motion:** the lime dawn spreads slowly across the horizon;
fog parts upward; the tower's seams breathe with light; the phone screen
glows a touch brighter; very slow pull-back.

**Overlay copy:** "The smart way through semester." + email form.

---

## Production spec (for the video → JPEG sequence)

- **Aspect:** 9:16. Generate at the tool's max (ideally 2160×3840), we
  downscale in build — crisper than upscaling.
- **Clips:** 4–6s per scene, 24 or 30 fps. Motion must be *gentle* —
  scrubbed frame sequences read best with slow camera drift, never fast
  action. Avoid whip pans, morphs, scene cuts inside one clip.
- **One clip per scene.** Do NOT ask the video tool to morph scene→scene;
  we crossfade/scrub in code between sections.
- **JPEG delivery:** 1080×1920, quality ~70–75, strip metadata. Budget:
  ~120–200 frames per transition, total page weight target **< 12 MB** on
  mobile. Name them `scene1_0001.jpg …` — I'll wire the scroll-scrub
  canvas engine (preload, IntersectionObserver-driven scrub, static end
  frame fallback for reduced-motion / no-JS / slow connections).
