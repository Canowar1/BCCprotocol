import OpenAI from "openai";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DriftResult {
  isDrift:     boolean;
  similarity:  number;
  alert:       string | null;
  epoch:       number;
  agentId:     string;
  riskDelta:   number;
}

// ── Cosine similarity ──────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Trigram fallback (no API needed) ───────────────────────────────────────────

function trigrams(text: string): Map<string, number> {
  const t = text.toLowerCase();
  const counts = new Map<string, number>();
  for (let i = 0; i <= t.length - 3; i++) {
    const tri = t.slice(i, i + 3);
    counts.set(tri, (counts.get(tri) ?? 0) + 1);
  }
  return counts;
}

function trigramSimilarity(a: string, b: string): number {
  const triA = trigrams(a);
  const triB = trigrams(b);
  const allKeys = new Set([...triA.keys(), ...triB.keys()]);

  const vecA: number[] = [];
  const vecB: number[] = [];
  for (const key of allKeys) {
    vecA.push(triA.get(key) ?? 0);
    vecB.push(triB.get(key) ?? 0);
  }
  return cosineSimilarity(vecA, vecB);
}

// ── DriftDetector ──────────────────────────────────────────────────────────────

export class DriftDetector {
  private threshold: number;
  private openai: OpenAI | null;

  constructor(threshold: number) {
    this.threshold = threshold;
    this.openai = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }

  async detect(
    prevIntentText:    string,
    currentIntentText: string,
    epoch:             number,
    agentId:           string,
    prevRisk:          number,
    _weight:           number
  ): Promise<DriftResult> {
    const similarity = this.openai
      ? await this.embeddingSimilarity(prevIntentText, currentIntentText)
      : trigramSimilarity(prevIntentText, currentIntentText);

    const isDrift = similarity < this.threshold;

    return {
      isDrift,
      similarity,
      alert:     isDrift ? `DRIFT_ALERT epoch=${epoch} similarity=${similarity.toFixed(4)}` : null,
      epoch,
      agentId,
      riskDelta: isDrift ? Math.round((1 - similarity) * 100) - prevRisk : 0,
    };
  }

  private async embeddingSimilarity(a: string, b: string): Promise<number> {
    const response = await this.openai!.embeddings.create({
      model: "text-embedding-3-small",
      input: [a, b],
    });

    const vecA = response.data[0]!.embedding;
    const vecB = response.data[1]!.embedding;
    return cosineSimilarity(vecA, vecB);
  }
}
