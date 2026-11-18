/**
 * bedrock.js — Amazon Bedrock InvokeModel.
 *
 * Signing lives in ../aws/sigv4.js, shared with the Systems Manager client so
 * there is exactly one signing implementation in the codebase.
 */
import { signedRequest } from "../aws/sigv4.js";

/**
 * Sign and send one InvokeModel call.
 * @param {Object} o
 * @param {string} o.modelId
 * @param {object} o.body     Model-native request body.
 * @param {string} [o.region]
 * @param {number} [o.timeoutMs]
 */
export async function invokeModel({ modelId, body, region, timeoutMs = 30_000 }) {
  const reg = region || process.env.AWS_REGION || "us-east-1";
  const { status, body: text } = await signedRequest({
    service: "bedrock",
    region: reg,
    host: `bedrock-runtime.${reg}.amazonaws.com`,
    path: `/model/${encodeURIComponent(modelId)}/invoke`,
    payload: JSON.stringify(body),
    timeoutMs,
  });
  if (status >= 300) throw new Error(`Bedrock ${status}: ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Bedrock returned non-JSON: ${text.slice(0, 200)}`);
  }
}

/**
 * Anthropic-on-Bedrock message request. Keeps the model-native shape in one
 * place so swapping model families is a single edit.
 * @param {string} prompt @param {number} maxTokens
 */
export const anthropicBody = (prompt, maxTokens = 900) => ({
  anthropic_version: "bedrock-2023-05-31",
  max_tokens: maxTokens,
  temperature: 0,
  messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
});

/** Pull the text out of whatever shape the model family returned. */
export function extractText(res) {
  if (typeof res?.content?.[0]?.text === "string") return res.content[0].text; // anthropic
  if (typeof res?.outputText === "string") return res.outputText; // titan
  if (typeof res?.generation === "string") return res.generation; // llama
  if (typeof res?.results?.[0]?.outputText === "string") return res.results[0].outputText;
  throw new Error(`Unrecognised Bedrock response shape: ${JSON.stringify(res).slice(0, 200)}`);
}
