import { enhanceTopic } from "./focus.prompt";

describe("enhanceTopic", () => {
  it("expands a spaced course code into a subject title", () => {
    const out = enhanceTopic("CHM 101", { level: "100", department: "Chemistry", faculty: "Science" });
    expect(out.title).toBe("CHM 101 — Chemistry");
    expect(out.courseDetected).toBe(true);
    expect(out.prompt).toContain("course code CHM 101, Chemistry");
    expect(out.prompt).toContain("Student level: 100");
    expect(out.prompt).toContain("what is actually covered at this level");
  });

  it("expands a compressed course code (no space)", () => {
    const out = enhanceTopic("CSC201");
    expect(out.title).toBe("CSC 201 — Computer Science");
    expect(out.courseDetected).toBe(true);
  });

  it("normalizes a hyphenated course code", () => {
    const out = enhanceTopic("mth-111");
    expect(out.title).toBe("MTH 111 — Mathematics");
    expect(out.courseDetected).toBe(true);
  });

  it("keeps an unknown course code but flags it as a course", () => {
    const out = enhanceTopic("XYZ 999");
    expect(out.title).toBe("XYZ 999");
    expect(out.courseDetected).toBe(true);
  });

  it("adds first-principles framing to a terse topic", () => {
    const out = enhanceTopic("osmosis");
    expect(out.courseDetected).toBe(false);
    expect(out.prompt).toContain("Explain it from first principles");
    expect(out.prompt).toContain("define every term");
  });

  it("adds deep-understanding framing to a fuller topic", () => {
    const out = enhanceTopic("photosynthesis and cellular respiration");
    expect(out.prompt).toContain("deep understanding");
    expect(out.prompt).not.toContain("first principles");
  });

  it("frames a coding topic for builders, not exam-takers", () => {
    const out = enhanceTopic("React state management with hooks");
    expect(out.prompt).toContain("programming / coding topic");
    expect(out.prompt).toContain("common pitfalls");
    expect(out.prompt).toContain("real projects");
    expect(out.prompt).not.toContain("course topic");
  });

  it("frames a single-word coding concept correctly", () => {
    const out = enhanceTopic("recursion");
    expect(out.prompt).toContain("programming / coding topic");
    expect(out.prompt).not.toContain("first principles");
  });

  it("keeps non-coding framing for a plain academic topic", () => {
    const out = enhanceTopic("chemical bonding and molecular structure");
    expect(out.prompt).not.toContain("programming / coding topic");
    expect(out.prompt).toContain("deep understanding");
  });

  it("gives a two-word academic topic first-principles framing", () => {
    const out = enhanceTopic("chemical bonding");
    expect(out.prompt).not.toContain("programming / coding topic");
    expect(out.prompt).toContain("first principles");
  });

  it("injects department/faculty and level framing when present", () => {
    const out = enhanceTopic("gravitation", {
      level: "200",
      department: "Physics",
      faculty: "Science",
    });
    expect(out.prompt).toContain("Student level: 200");
    expect(out.prompt).toContain("Student department: Physics (Science)");
  });

  it("handles missing profile fields gracefully", () => {
    const out = enhanceTopic("kinetics", { level: null, department: null, faculty: null });
    expect(out.prompt).not.toContain("Student level:");
    expect(out.prompt).not.toContain("Student department:");
    expect(out.title).toBe("kinetics");
  });

  it("keeps the raw topic intact for plain inputs", () => {
    const out = enhanceTopic("  waves   ");
    expect(out.title).toBe("waves");
  });
});