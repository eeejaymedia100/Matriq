import {
  validateClarifyQuestions,
  buildClarifyPrompt,
  buildAnswersContext,
  sanitizeAnswers,
  MAX_ANSWER_CHARS,
} from "./focus.schema";

describe("validateClarifyQuestions", () => {
  const goodSet = {
    questions: [
      {
        id: "goal",
        text: "What's the goal for this topic?",
        options: ["Exam prep", "Assignment", "General understanding"],
        type: "single",
        allowCustom: true,
        why: "Shapes the whole map",
      },
      {
        id: "style",
        text: "How should it be taught?",
        options: ["Definitions first", "Worked examples", "Exam drills"],
        type: "multi",
        allowCustom: true,
      },
    ],
  };

  it("accepts a valid question set and normalizes fields", () => {
    const set = validateClarifyQuestions(goodSet);
    expect(set).not.toBeNull();
    expect(set!.questions).toHaveLength(2);
    expect(set!.questions[0].id).toBe("goal");
    expect(set!.questions[0].type).toBe("single");
    expect(set!.questions[1].type).toBe("multi");
    expect(set!.questions[1].why).toBeUndefined();
  });

  it("accepts a bare array (model returned the list without a wrapper)", () => {
    const set = validateClarifyQuestions(goodSet.questions);
    expect(set).not.toBeNull();
    expect(set!.questions).toHaveLength(2);
  });

  it("rejects questions with fewer than 2 real options (not tap-able)", () => {
    const set = validateClarifyQuestions({
      questions: [
        { id: "a", text: "One option only?", options: ["Yes"] },
        { id: "b", text: "Two options?", options: ["Yes", "No"] },
      ],
    });
    expect(set).not.toBeNull();
    expect(set!.questions).toHaveLength(1);
    expect(set!.questions[0].id).toBe("b");
  });

  it("rejects questions with no text", () => {
    const set = validateClarifyQuestions({
      questions: [{ id: "x", text: "", options: ["a", "b"] }],
    });
    expect(set).toBeNull();
  });

  it("dedupes ids and caps the question count", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: i === 7 ? "q1" : `q${i}`, // last one duplicates id q1
      text: `Question ${i}?`,
      options: ["a", "b", "c"],
    }));
    const set = validateClarifyQuestions({ questions: many });
    expect(set).not.toBeNull();
    expect(set!.questions.length).toBeLessThanOrEqual(4);
    const ids = set!.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("strips HTML and overlong strings from every field", () => {
    const set = validateClarifyQuestions({
      questions: [
        {
          id: "clean",
          text: "<b>What is this about?</b>",
          options: ["<i>Option one</i>", "Option two", `${"x".repeat(200)}`],
          why: "<script>alert(1)</script>",
        },
      ],
    });
    expect(set).not.toBeNull();
    const q = set!.questions[0];
    expect(q.text).toBe("What is this about?");
    expect(q.options[0]).toBe("Option one");
    expect(q.options[2].length).toBeLessThanOrEqual(80);
    expect(q.why).not.toContain("<script>");
  });

  it("returns null for garbage input", () => {
    expect(validateClarifyQuestions(null)).toBeNull();
    expect(validateClarifyQuestions("nope")).toBeNull();
    expect(validateClarifyQuestions({ questions: "nope" })).toBeNull();
    expect(validateClarifyQuestions({ questions: [] })).toBeNull();
  });
});

describe("sanitizeAnswers", () => {
  it("clamps value length and drops empty entries", () => {
    const out = sanitizeAnswers({
      goal: "Exam prep",
      empty: "",
      junk: `${"y".repeat(2000)}`,
    });
    expect(out.goal).toBe("Exam prep");
    expect(out.empty).toBeUndefined();
    expect(out.junk.length).toBe(MAX_ANSWER_CHARS);
  });

  it("caps entry count", () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 20; i++) many[`q${i}`] = `answer ${i}`;
    const out = sanitizeAnswers(many);
    expect(Object.keys(out).length).toBeLessThanOrEqual(8);
  });
});

describe("buildAnswersContext", () => {
  const questions = validateClarifyQuestions({
    questions: [
      { id: "goal", text: "What's the goal?", options: ["Exam prep", "Assignment"] },
      { id: "depth", text: "How deep?", options: ["First exposure", "Revision"] },
    ],
  })!;

  it("pairs answers with their question text as an obey-this block", () => {
    const ctx = buildAnswersContext(questions.questions, {
      goal: "Exam prep",
      depth: "Revision",
    });
    expect(ctx).toContain("What's the goal?: Exam prep");
    expect(ctx).toContain("How deep?: Revision");
    expect(ctx).toContain("obey these");
  });

  it("matches answers to questions case-insensitively by id", () => {
    const ctx = buildAnswersContext(questions.questions, {
      GOAL: "Exam prep",
    });
    expect(ctx).toContain("What's the goal?: Exam prep");
  });

  it("returns empty string when there are no usable answers", () => {
    expect(buildAnswersContext(questions.questions, {})).toBe("");
    expect(buildAnswersContext(questions.questions, { goal: "   " })).toBe("");
  });

  it("includes unknown-id answers as raw lines (never lost, never trusted)", () => {
    const ctx = buildAnswersContext(questions.questions, {
      mystery: "I have a test on Friday",
    });
    expect(ctx).toContain("mystery: I have a test on Friday");
  });
});

describe("buildClarifyPrompt", () => {
  it("embeds the topic and forbids typing-required questions", () => {
    const p = buildClarifyPrompt("Political Apathy");
    expect(p).toContain("Political Apathy");
    expect(p).toContain("Never require typing");
    expect(p).toContain("2 to 3 SHORT questions");
  });

  it("includes profile lines and forbids asking what the profile already says", () => {
    const p = buildClarifyPrompt("Osmosis", {
      level: "300",
      department: "Computer Science",
      faculty: "Science",
    });
    expect(p).toContain("Level: 300");
    expect(p).toContain("Department: Computer Science");
    expect(p).toContain("do NOT ask what you can infer");
  });
});
