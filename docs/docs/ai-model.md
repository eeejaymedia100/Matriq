# AI Study Companion — Self-Hosted Model

## Read this first: what "learns as it goes" actually means here

The request was: a local model, no third-party API, that learns from past questions and student
materials over time. That goal is achievable — but not literally as "the model on the phone
retrains its own weights while you use it." Here's why, and what you get instead that actually
delivers on the goal.

**Why not true on-device continuous learning:**
- Phones don't have the compute or battery budget to train (not just run) a language model.
  Inference and training have very different resource profiles; mobile hardware is built for the
  former.
- A model that updates its own weights from live, unmoderated user input is a direct
  data-poisoning and reliability risk (see `security.md`) — a single bad actor's input can
  degrade what every other student sees.
- Continuous online learning is not something any production system you'd recognize actually
  does, for these reasons. Even the largest AI companies retrain on a schedule with human review
  in the loop, not continuously and automatically.

**Why not literally "on the phone" at all, even for a static model:**
- A model capable of being genuinely useful for exam prep and course material Q&A is too large to
  ship inside an app bundle and run well on typical student phones without significant quality
  loss from aggressive quantization.
- Keeping the model server-side also means you can improve it (swap models, retrain, fix bad
  responses) without shipping a new app version through App Store/Play Store review every time.

**What "local" means in this project, and why it still satisfies the actual goal:**
"Local" = **self-hosted on your own GCP server**, not a third-party paid API (OpenAI, Anthropic,
etc.). You own the model, the data, the inference costs, and the behavior. That's the real
requirement underneath "I don't want to use an API" — full control, no per-token vendor billing,
no student data leaving your infrastructure. This is fully achievable.

**What "learns from past questions and student materials" becomes, concretely:**
1. **Retrieval (the primary mechanism, live/instant):** past questions and course materials are
   ingested, chunked, embedded, and stored in `pgvector`. Every student query retrieves the most
   relevant chunks and feeds them to the model as context before it answers — this is how the
   model "knows" about a specific course's past questions without ever being retrained on them.
   This updates the moment new content is ingested — no retraining needed for this part to feel
   like "learning."
2. **Periodic fine-tuning (the slower mechanism, scheduled, human-reviewed):** on a schedule
   (e.g., monthly) or after enough new moderated content accumulates, run a LoRA fine-tuning job
   on the base model using the curated, approved content. This is the part that could plausibly
   improve the model's actual behavior (tone, domain fluency) over time — deliberately not
   continuous, so a human reviews what goes in before it changes model behavior for everyone.

This gives you a system that visibly improves as more course content is added — which is what
was actually being asked for — without the failure modes of true unsupervised continuous
learning.

## Architecture

```
Student query (mobile app)
        │
        ▼
Backend API  ──► pgvector similarity search (top-k relevant chunks)
        │                                              │
        │◄─────────────────────────────────────────────┘
        ▼
Backend API constructs a prompt: [retrieved context] + [student query]
        │
        ▼
Ollama (private network) — runs the base model, returns a grounded answer
        │
        ▼
Backend API returns response to mobile app (with basic content sanitization
before rendering, per security.md)
```

## Model choice

**Current deployment (2026-08):** the backend queries whatever model is registered on the local
Ollama server, configured via `OLLAMA_MODEL` (default `nemotron-3-super:cloud`). On the current
VM, Ollama is configured with the `nemotron-3-super:cloud` model, which Ollama proxies to its
cloud — zero local GPU/RAM cost, at the price of a network dependency (see the
"Realistic expectations" section). `backend/scripts/smoke-ollama.js` verifies the full
backend → Ollama path. To switch to fully self-hosted inference, `ollama pull` a local model
(e.g. `llama3.2:3b` for this VM's 3.8GB RAM) and set `OLLAMA_MODEL` accordingly.

Start with a small, well-supported open-weight model that runs acceptably on CPU if the GCP VM
has no GPU, and well on GPU if you provision one:

- **Recommended starting point:** Llama 3.1 8B (Instruct) or Phi-3-mini, quantized (Q4_K_M or
  similar via Ollama's model library). Both run via Ollama with minimal setup.
- **If budget allows a GPU VM** (e.g., an L4 or T4 instance): a larger model (Llama 3.1 70B
  quantized, or similar) will meaningfully improve answer quality — but this is a real cost
  decision, not a default. Start small, measure whether quality is actually a problem for real
  student queries, then decide.

## Ingestion pipeline requirements

- **Moderation gate before anything reaches the vector store.** Uploaded past questions/materials
  are queued for review (automated checks — file type, size limits, basic content scanning —
  plus a lightweight human/executive approval step for anything from an unverified source)
  before being chunked and embedded.
- **Source attribution kept** — every chunk in the vector store retains which course, session,
  and (if applicable) which student/executive submitted it, so bad content can be traced and
  removed, and so retrieval can be scoped (e.g., a Forestry course query shouldn't surface an
  Economics past question).
- **Chunking and embedding** — use a consistent, documented chunking strategy (e.g., ~500 token
  chunks with overlap) and a local embedding model (Ollama also serves embedding models, e.g.
  `nomic-embed-text`) so embedding, like generation, stays fully self-hosted.

## What the mobile app actually talks to

The mobile app never calls Ollama directly and never calls any third-party AI API. It calls your
own backend's `/ai/query` endpoint (see `docs/backend-api.md`), which is authenticated,
rate-limited, and does the retrieval + generation orchestration server-side. This is both a
security requirement (`security.md`) and what keeps "no third-party API" actually true — the
mobile app has zero AI provider credentials of any kind.

## Realistic expectations to set with stakeholders

- Initial answer quality will depend heavily on how much course material has actually been
  ingested — an empty vector store means the model is answering from general pretraining
  knowledge only, which is fine as a fallback but isn't the "learns from our materials" pitch.
  Seeding real content early (Phase 4) matters more than model size.
- Fine-tuning cycles are a Phase 4+ nice-to-have, not a v1 launch blocker — retrieval alone
  delivers most of the perceived "it knows our stuff" value with far less operational risk.
- Budget for GPU compute honestly if answer latency on CPU turns out to be a real UX problem —
  don't silently eat multi-second response times as "good enough" without measuring it against
  actual usage.

## Optional future phase: offline on-device fallback

If offline Q&A becomes a real requirement later (e.g., for students with unreliable data), a
small distilled/quantized model can run fully on-device via `llama.cpp`/GGUF for basic,
non-retrieval-augmented answers when there's no connectivity. This is inference-only (no
learning happens on the device) and should be scoped as its own phase, not assumed as part of
v1.
