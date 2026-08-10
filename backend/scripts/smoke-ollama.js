/**
 * Live smoke test for the AiService -> Ollama path.
 * Mimics exactly what AiService.generateFromOllama sends, using the
 * model registered on this VM's Ollama server.
 */
const run = async () => {
  const model = process.env.OLLAMA_MODEL || "nemotron-3-super:cloud";
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";

  const started = Date.now();
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are Matriq, an AI study companion for Nigerian university students. " +
            "Answer using the provided study material context when relevant. Be concise.",
        },
        {
          role: "user",
          content:
            "Study material context:\n[BIO101] Photosynthesis happens in the chloroplasts of plant cells.\n---\n\nStudent question: Where does photosynthesis happen?",
        },
      ],
      stream: false,
    }),
  });

  console.log("HTTP status:", res.status);
  if (!res.ok) {
    console.error("FAILED:", await res.text());
    process.exit(1);
  }

  const data = await res.json();
  const content = (data.message?.content || "").trim();
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Model: ${data.model} (${elapsedSec}s)`);
  console.log("ANSWER:", content.slice(0, 400));
  console.log("---");
  console.log("SMOKE TEST:", content.length > 0 ? "PASS" : "FAIL");
  process.exit(content.length > 0 ? 0 : 1);
};

run().catch((err) => {
  console.error("SMOKE TEST FAIL:", err.message);
  process.exit(1);
});
