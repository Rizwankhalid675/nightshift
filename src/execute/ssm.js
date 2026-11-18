/**
 * ssm.js — AWS Systems Manager client.
 *
 * Two execution shapes cover almost every MSP remediation:
 *   SendCommand            run a document against instances (restart, rotate logs, re-run a job)
 *   StartAutomationExecution  run an Automation runbook (failover, scaling, multi-step)
 *
 * Both are polled to completion, because "I sent the command" is not the same
 * as "it worked", and the whole point of this system is not confusing the two.
 */
import { jsonApi } from "../aws/sigv4.js";

const region = () => process.env.AWS_REGION || "us-east-1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {Object} o
 * @param {string} o.documentName
 * @param {Record<string,string[]>} [o.parameters]
 * @param {{Key:string,Values:string[]}[]} [o.targets]
 * @param {string[]} [o.instanceIds]
 * @param {string} [o.comment]
 */
export async function sendCommand({ documentName, parameters = {}, targets, instanceIds, comment }) {
  const body = {
    DocumentName: documentName,
    Parameters: parameters,
    ...(instanceIds?.length ? { InstanceIds: instanceIds } : {}),
    ...(targets?.length ? { Targets: targets } : {}),
    ...(comment ? { Comment: comment.slice(0, 100) } : {}),
  };
  const res = await jsonApi({ service: "ssm", region: region(), target: "AmazonSSM.SendCommand", body });
  return res.Command;
}

/** @param {string} commandId @param {string} instanceId */
export function getCommandInvocation(commandId, instanceId) {
  return jsonApi({
    service: "ssm",
    region: region(),
    target: "AmazonSSM.GetCommandInvocation",
    body: { CommandId: commandId, InstanceId: instanceId },
  });
}

export async function startAutomation({ documentName, parameters = {} }) {
  const res = await jsonApi({
    service: "ssm",
    region: region(),
    target: "AmazonSSM.StartAutomationExecution",
    body: { DocumentName: documentName, Parameters: parameters },
  });
  return res.AutomationExecutionId;
}

export function getAutomationExecution(id) {
  return jsonApi({
    service: "ssm",
    region: region(),
    target: "AmazonSSM.GetAutomationExecution",
    body: { AutomationExecutionId: id },
  });
}

const TERMINAL = new Set(["Success", "Failed", "Cancelled", "TimedOut", "Cancelling"]);

/**
 * Poll an invocation until it reaches a terminal state or we run out of patience.
 * A remediation that never finishes is a failed remediation; it does not get to
 * hang the on-call loop.
 */
export async function waitForCommand(commandId, instanceId, { timeoutMs = 120_000, intervalMs = 3_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await getCommandInvocation(commandId, instanceId);
      if (TERMINAL.has(last.Status)) return last;
    } catch (e) {
      // InvocationDoesNotExist is normal for a second or two after SendCommand.
      if (!/InvocationDoesNotExist/.test(String(e.message))) throw e;
    }
    await sleep(intervalMs);
  }
  return { Status: "TimedOut", StandardErrorContent: `No terminal status within ${timeoutMs}ms`, ...(last ?? {}) };
}

export async function waitForAutomation(id, { timeoutMs = 300_000, intervalMs = 5_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await getAutomationExecution(id);
    const status = res.AutomationExecution?.AutomationExecutionStatus;
    if (status && TERMINAL.has(status)) return res.AutomationExecution;
    await sleep(intervalMs);
  }
  return { AutomationExecutionStatus: "TimedOut" };
}
