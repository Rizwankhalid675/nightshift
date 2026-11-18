/**
 * Test helpers.
 *
 * `withoutAwsCredentials` exists because several tests asserted "with no
 * credentials, this fails loudly" by deleting AWS_ACCESS_KEY_ID and
 * AWS_SECRET_ACCESS_KEY alone. Once the signer learned to fall back to the
 * container credential endpoint, that stopped meaning "no credentials"
 * anywhere with a task role — the tests passed on a laptop and on GitHub
 * Actions, and failed in AWS CloudShell, which is precisely where the code is
 * meant to work. A test that depends on the machine it runs on is not a test.
 */
import { forgetCachedCredentials } from "../src/aws/sigv4.js";

/** Every environment variable any credential source reads. */
const CREDENTIAL_VARS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN",
];

/**
 * Run `fn` with the whole credential chain neutralised, then restore it.
 * @template T @param {() => T | Promise<T>} fn @returns {Promise<T>}
 */
export async function withoutAwsCredentials(fn) {
  const saved = Object.fromEntries(CREDENTIAL_VARS.map((k) => [k, process.env[k]]));
  for (const k of CREDENTIAL_VARS) delete process.env[k];
  forgetCachedCredentials();
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    forgetCachedCredentials();
  }
}
