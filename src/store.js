/**
 * store.js — durable record of human decisions.
 *
 * Approvals are the one piece of state that must not evaporate. An operator
 * approving a restart at 04:00 and the console forgetting it on the next deploy
 * is exactly the kind of thing that makes an MSP stop trusting the tool.
 *
 * This is a small append-then-rewrite JSON file, written atomically (temp file
 * + rename) so a crash mid-write cannot leave a truncated store. Zero
 * dependencies, which keeps the "clone and run" property.
 *
 * Swapping it for DynamoDB is one file: keep `read`, `recordApproval` and
 * `approvalsFor`, make them async over the table, and nothing else changes.
 * The server already awaits them.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_PATH = process.env.APPROVAL_STORE || ".runtime/approvals.json";

/** @typedef {Object} ApprovalRecord
 * @property {string} tenantId
 * @property {string} incidentId
 * @property {string} remediationId
 * @property {string} approvedBy
 * @property {string} at
 * @property {string} [decisionDigest]  Ties the approval to what was shown at the time.
 * @property {string} [executionStatus]
 */

export class ApprovalStore {
  /** @param {string} [path] */
  constructor(path = DEFAULT_PATH) {
    this.path = path;
  }

  /** @returns {ApprovalRecord[]} */
  read() {
    try {
      if (!existsSync(this.path)) return [];
      const raw = readFileSync(this.path, "utf8").trim();
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      // A corrupt store must not take the console down with it. Say so loudly
      // and carry on with nothing rather than crashing on boot.
      console.error(`  ! approval store at ${this.path} is unreadable (${e.message}); continuing empty`);
      return [];
    }
  }

  /** @param {ApprovalRecord[]} records */
  write(records) {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(records, null, 2));
    renameSync(tmp, this.path); // atomic on the same filesystem
  }

  /**
   * Record one approval. Idempotent per (tenant, incident): approving twice
   * keeps the first decision and its timestamp.
   * @param {ApprovalRecord} record
   */
  recordApproval(record) {
    const all = this.read();
    const existing = all.find((a) => a.tenantId === record.tenantId && a.incidentId === record.incidentId);
    if (existing) return existing;
    all.push(record);
    this.write(all);
    return record;
  }

  /** @param {string} tenantId @returns {Map<string, ApprovalRecord>} incidentId -> record */
  approvalsFor(tenantId) {
    return new Map(this.read().filter((a) => a.tenantId === tenantId).map((a) => [a.incidentId, a]));
  }

  clear() {
    try {
      if (existsSync(this.path)) unlinkSync(this.path);
    } catch {
      /* nothing to clear */
    }
  }
}

export const defaultStore = new ApprovalStore();
