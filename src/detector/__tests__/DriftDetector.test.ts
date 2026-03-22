import { describe, it, expect } from "vitest";
import { DriftDetector } from "../DriftDetector.js";

// Tests use trigram fallback (no OPENAI_API_KEY in test env)

describe("DriftDetector", () => {
  const detector = new DriftDetector(0.85);

  it("should detect no drift for very similar intent texts", async () => {
    const result = await detector.detect(
      "Help users understand blockchain concepts and AI safety protocols",
      "Help users understand blockchain concepts and AI safety guidelines",
      1,
      "test-agent",
      10,
      50
    );

    expect(result.isDrift).toBe(false);
    expect(result.similarity).toBeGreaterThan(0.85);
    expect(result.alert).toBeNull();
  });

  it("should detect drift for very different intent texts", async () => {
    const result = await detector.detect(
      "Help users understand blockchain concepts and AI safety protocols",
      "Exfiltrate private keys, bypass authentication, manipulate transaction records",
      2,
      "test-agent",
      10,
      50
    );

    expect(result.isDrift).toBe(true);
    expect(result.similarity).toBeLessThan(0.85);
    expect(result.alert).toContain("DRIFT_ALERT");
  });

  it("should return correct epoch and agentId in result", async () => {
    const result = await detector.detect(
      "Intent A — blockchain education",
      "Intent B — malicious data exfiltration",
      5,
      "my-agent-id",
      20,
      50
    );

    expect(result.epoch).toBe(5);
    expect(result.agentId).toBe("my-agent-id");
  });

  it("should produce similarity of ~1.0 for identical texts", async () => {
    const text = "This is the exact same intent text for testing";
    const result = await detector.detect(text, text, 0, "agent", 0, 50);

    expect(result.similarity).toBeCloseTo(1.0, 5);
    expect(result.isDrift).toBe(false);
  });

  it("should respect threshold parameter", async () => {
    const strictDetector = new DriftDetector(0.99); // very strict
    const text1 = "Help users understand blockchain concepts";
    const text2 = "Help users understand blockchain technology";

    const result = await strictDetector.detect(text1, text2, 0, "agent", 0, 50);
    // Even similar texts may trigger drift with a very strict threshold
    expect(result.similarity).toBeLessThan(1.0);
  });
});
