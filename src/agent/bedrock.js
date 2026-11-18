/**
 * bedrock.js — Amazon Bedrock, through the Converse API.
 *
 * Signing lives in ../aws/sigv4.js, shared with the Systems Manager client so
 * there is exactly one signing implementation in the codebase.
 *
 * Why Converse rather than InvokeModel: InvokeModel takes a model-NATIVE body,
 * so every model family needs its own request builder and its own response
 * reader. Converse takes one shape for all of them. That stopped being a
 * stylistic preference the first time this ran against a real account: the
 * account had Amazon Nova enabled and Anthropic not, and switching families
 * was a change of one environment variable rather than a second adapter.
 *
 * Model ids are inference profiles (`us.amazon.nova-pro-v1:0`), not bare
 * foundation-model ids. Current Bedrock models are served cross-region and
 * reject the bare id.
 */
import { signedRequest } from "../aws/sigv4.js";

/**
 * One Converse call. Deterministic by default (temperature 0) because this
 * pipeline is evaluated on repeatability, not variety.
 *
 * @param {Object} o
 * @param {string} o.modelId    Inference profile id.
 * @param {string} o.prompt
 * @param {number} [o.maxTokens]
 * @param {string} [o.region]
 * @param {number} [o.timeoutMs]
 * @returns {Promise<object>} Raw Converse response.
 */
export async function converse({ modelId, prompt, maxTokens = 900, region, timeoutMs = 30_000 }) {
  const reg = region || process.env.AWS_REGION || "us-east-1";
  const { status, body: text } = await signedRequest({
    service: "bedrock",
    region: reg,
    host: `bedrock-runtime.${reg}.amazonaws.com`,
    path: `/model/${encodeURIComponent(modelId)}/converse`,
    payload: JSON.stringify({
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens, temperature: 0 },
    }),
    timeoutMs,
  });
  if (status >= 300) throw new Error(`Bedrock converse ${status}: ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Bedrock returned non-JSON: ${text.slice(0, 200)}`);
  }
}

/** The assistant's text, or a loud failure. Never a silent empty string. */
export function converseText(res) {
  const parts = res?.output?.message?.content;
  const t = Array.isArray(parts) ? parts.find((c) => typeof c?.text === "string")?.text : undefined;
  if (typeof t !== "string" || t.length === 0) {
    throw new Error(`Unrecognised Converse response: ${JSON.stringify(res).slice(0, 200)}`);
  }
  return t;
}

/**
 * Tokens the service itself reported. Used for the cost-per-incident figure,
 * so that number comes from AWS rather than from our own estimate.
 */
export const converseUsage = (res) => ({
  inputTokens: res?.usage?.inputTokens ?? 0,
  outputTokens: res?.usage?.outputTokens ?? 0,
});
