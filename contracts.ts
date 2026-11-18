/**
 * contracts.ts — FROZEN. Owned by the integrator.
 *
 * This file exists so that many agents can build in parallel without
 * colliding. Every lane imports from here. No lane edits it.
 *
 * Need a change? Ask the integrator. They change it once, then tell every lane.
 *
 * Write this BEFORE any feature. 30 minutes here buys 4 hours of parallelism.
 */

// ---------------------------------------------------------------- domain types

/** The one thing this product is about. Name it precisely. */
export interface Subject {
  id: string;
  createdAt: string; // ISO 8601
}

// --------------------------------------------------- evidence + determinism
// Any claim produced by a model must carry evidence a human can check.
// This is the pattern that survives judge questioning.

export interface Evidence {
  /** Where this came from: url, file path, table row, sensor id. */
  source: string;
  /** The exact text or value observed. Verbatim — never paraphrased. */
  observed: string;
  /** sha256 of the raw evidence, so the claim is tamper-evident. */
  digest: string;
  at: string; // ISO 8601
}

export interface Claim<T = unknown> {
  value: T;
  /** Who produced it: a rule, or a model (with its name). */
  producedBy: { kind: "deterministic"; rule: string } | { kind: "model"; model: string };
  evidence: Evidence[];
  /** Deterministic verdict. A model never sets this. */
  verified: boolean;
  /** Why it failed verification, if it did. */
  rejectedReason?: string;
}

// ------------------------------------------------------------------ api shapes

export interface ApiError {
  error: string;
  detail?: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

// --------------------------------------------------------------- the metric
// The one number that goes in the results table. Instrument it from hour 1.

export interface RunMetrics {
  runId: string;
  label: string;        // "v1 unguarded", "v3 policy in code"
  startedAt: string;
  finishedAt: string;
  /** The headline number. Name it after the real-world unit, not "score". */
  headline: { name: string; value: number; unit: string };
  passed: number;
  failed: number;
  costUsd?: number;
}
