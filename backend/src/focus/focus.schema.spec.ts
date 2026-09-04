import {
  validateFocusMap,
  extractJson,
  buildMapPrompt,
  validateVerdict,
  isObviousBypass,
  buildCheckpointPrompt,
  PROMPT_VERSION,
} from "./focus.schema";

const validMap = {
  topic: "Photosynthesis",
  overview: "How plants turn light into chemical energy.",
  concepts: [
    {
      id: "photosynthesis",
      label: "Photosynthesis",
      kind: "topic",
      summary: "Overview",
      detail: "The overall process.",
    },
    {
      id: "chlorophyll",
      label: "Chlorophyll",
      kind: "component",
      summary: "Light-absorbing pigment",
      detail: "Captures light energy in chloroplasts.",
      prerequisites: ["photosynthesis"],
    },
    {
      id: "calvin-cycle",
      label: "Calvin Cycle",
      kind: "process",
      summary: "Carbon fixation",
      detail: "The light-independent stage producing glucose.",
      parents: ["photosynthesis"],
      examples: ["C3 plants"],
    },
  ],
};

describe("validateFocusMap", () => {
  it("accepts a structurally valid map and normalizes it", () => {
    const map = validateFocusMap(validMap, "Photosynthesis");
    expect(map).not.toBeNull();
    expect(map!.version).toBe("1.1");
    expect(map!.concepts).toHaveLength(3);
    expect(map!.concepts[2].prerequisites).toBeUndefined();
    expect(map!.concepts[2].examples).toEqual(["C3 plants"]);
  });

  it("rejects maps with fewer than 2 concepts", () => {
    const single = {
      topic: "X",
      overview: "o",
      concepts: [{ id: "a", label: "A", kind: "definition", summary: "s", detail: "d" }],
    };
    expect(validateFocusMap(single, "X")).toBeNull();
  });

  it("rejects non-object input and empty input", () => {
    expect(validateFocusMap(null, "X")).toBeNull();
    expect(validateFocusMap("{}", "X")).toBeNull();
    expect(validateFocusMap(42, "X")).toBeNull();
  });

  it("caps the number of concepts to MAX_CONCEPTS", () => {
    const many = {
      overview: "o",
      concepts: Array.from({ length: 20 }, (_, i) => ({
        id: `c${i}`,
        label: `Concept ${i}`,
        kind: "definition",
        summary: "s",
        detail: "d",
      })),
    };
    const map = validateFocusMap(many, "X");
    expect(map).not.toBeNull();
    expect(map!.concepts.length).toBeLessThanOrEqual(10);
  });

  it("de-duplicates concept ids and drops dangling prerequisite references", () => {
    const map = {
      overview: "o",
      concepts: [
        { id: "a", label: "A", kind: "definition", summary: "s", detail: "d", prerequisites: ["missing", "a"] },
        { id: "a", label: "A dup", kind: "definition", summary: "s", detail: "d" },
        { id: "b", label: "B", kind: "definition", summary: "s", detail: "d", parents: ["missing"] },
      ],
    };
    const parsed = validateFocusMap(map, "X");
    expect(parsed).not.toBeNull();
    expect(parsed!.concepts).toHaveLength(2);
    // Imports came from `prerequisite` type strings — sanitizeIds return "" for bad refs.
  });

  it("strips HTML from model-provided strings", () => {
    const dirty = {
      overview: "Safe <script>alert(1)</script>",
      concepts: [
        { id: "a", label: "<b>A</b>", kind: "definition", summary: "s", detail: "<p>x</p>" },
        { id: "b", label: "B", kind: "definition", summary: "s", detail: "d" },
      ],
    };
    const map = validateFocusMap(dirty, "X");
    expect(map).not.toBeNull();
    expect(map!.overview).not.toContain("<script>");
  });

  it("accepts a valid learning journey (stages) and partitions concepts", () => {
    const map = validateFocusMap(
      {
        ...validMap,
        stages: [
          { id: "basics", title: "The basics", objective: "Understand the light reaction.", conceptIds: ["photosynthesis", "chlorophyll"] },
          { id: "fixation", title: "Making sugar", objective: "Understand carbon fixation.", conceptIds: ["calvin-cycle"] },
        ],
      },
      "Photosynthesis",
    );
    expect(map).not.toBeNull();
    expect(map!.stages).toHaveLength(2);
    expect(map!.stages![0].conceptIds).toEqual(["photosynthesis", "chlorophyll"]);
    expect(map!.stages![1].conceptIds).toEqual(["calvin-cycle"]);
  });

  it("drops stages with unknown/duplicated concept ids instead of failing", () => {
    const map = validateFocusMap(
      {
        ...validMap,
        stages: [
          { id: "s1", title: "Bad", objective: "o", conceptIds: ["nope", "photosynthesis", "photosynthesis"] },
          { id: "s2", title: "", objective: "o", conceptIds: ["chlorophyll"] },
        ],
      },
      "Photosynthesis",
    );
    expect(map).not.toBeNull();
    // Unknown id dropped, duplicates dropped, empty-title stage skipped.
    expect(map!.stages).toHaveLength(1);
    expect(map!.stages![0].conceptIds).toEqual(["photosynthesis"]);
  });

  it("leaves stages undefined when the model provides none or garbage", () => {
    const noStages = validateFocusMap(validMap, "Photosynthesis");
    expect(noStages!.stages).toBeUndefined();
    const garbage = validateFocusMap(
      { ...validMap, stages: "not-an-array" },
      "Photosynthesis",
    );
    expect(garbage!.stages).toBeUndefined();
  });
});

describe("isObviousBypass", () => {
  it("flags empty / punctuation-only / skip-style answers", () => {
    expect(isObviousBypass("")).toBe(true);
    expect(isObviousBypass("!!!")).toBe(true);
    expect(isObviousBypass("skip")).toBe(true);
    expect(isObviousBypass("next")).toBe(true);
    expect(isObviousBypass("idk")).toBe(true);
    expect(isObviousBypass("i don't know")).toBe(true);
    expect(isObviousBypass("no idea")).toBe(true);
    expect(isObviousBypass("pass")).toBe(true);
    expect(isObviousBypass("😅")).toBe(true);
  });

  it("never flags real (even rough) attempts", () => {
    expect(isObviousBypass("chlorophyll absorbs light energy in the chloroplasts")).toBe(false);
    expect(isObviousBypass("I think it turns sunlight into chemical energy")).toBe(false);
    expect(isObviousBypass("the calvin cycle fixes carbon")).toBe(false);
  });
});

describe("validateVerdict", () => {
  it("accepts a well-formed verdict", () => {
    const v = validateVerdict({
      passed: true,
      feedback: "Exactly right — light energy drives the reaction.",
      misconception: "",
      suggestion: "",
    });
    expect(v).toEqual({
      passed: true,
      feedback: "Exactly right — light energy drives the reaction.",
    });
  });

  it("rejects verdicts without a boolean or feedback", () => {
    expect(validateVerdict({ passed: "yes", feedback: "x" })).toBeNull();
    expect(validateVerdict({ passed: true, feedback: "" })).toBeNull();
    expect(validateVerdict(null)).toBeNull();
  });
});

describe("buildCheckpointPrompt", () => {
  it("carries topic, rubric and answer with strict judging instructions", () => {
    const prompt = buildCheckpointPrompt({
      topic: "Photosynthesis",
      stageTitle: "The basics",
      conceptLabel: "Chlorophyll",
      rubric: "Captures light energy in chloroplasts.",
      question: "Explain chlorophyll",
      answer: "It captures light energy.",
    });
    expect(prompt).toContain("Photosynthesis");
    expect(prompt).toContain("Captures light energy in chloroplasts.");
    expect(prompt).toContain("It captures light energy.");
    expect(prompt).toContain("Never accept irrelevant text");
    expect(prompt).toContain('"passed": true|false');
  });
});

describe("extractJson", () => {
  it("parses a JSON object from within fenced markdown", () => {
    const text = '```json\n{"topic":"T","concepts":[]}\n```';
    expect(extractJson(text)).toEqual({ topic: "T", concepts: [] });
  });

  it("parses JSON with leading prose", () => {
    expect(extractJson('Here you go: {"a":1} done')).toEqual({ a: 1 });
  });

  it("returns null for unparseable text", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("{")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});

describe("buildMapPrompt", () => {
  it("includes the topic and demands a structured JSON concept map", () => {
    const prompt = buildMapPrompt("Mitochondria");
    expect(prompt).toContain("Mitochondria");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("overview");
    expect(prompt).toContain("prerequisites");
  });

  it("keeps the schema version in sync", () => {
    expect(PROMPT_VERSION).toBe(2);
  });
});