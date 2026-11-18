/**
 * Signing tests.
 *
 * The double-encoding rule below is not a hypothetical: signing the wire path
 * instead of the doubly-encoded one produced a 403 "signature does not match"
 * from Bedrock on the first live call, and nothing caught it earlier because
 * the Systems Manager client signs path "/", where the two forms are equal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalUri } from "../src/aws/sigv4.js";

test("a path with no special characters is unchanged", () => {
  assert.equal(canonicalUri("/"), "/");
  assert.equal(canonicalUri("/model/plain/converse"), "/model/plain/converse");
});

test("each path segment is encoded a second time", () => {
  // Wire path carries %3A; the canonical request must carry %253A.
  assert.equal(
    canonicalUri("/model/us.amazon.nova-pro-v1%3A0/converse"),
    "/model/us.amazon.nova-pro-v1%253A0/converse"
  );
});

test("separators survive, so the path structure is preserved", () => {
  assert.equal(canonicalUri("/a/b/c").split("/").length, 4);
});

test("characters encodeURIComponent leaves alone are still encoded", () => {
  // RFC 3986 unreserved is A-Za-z0-9-._~ — !'()* are not unreserved and AWS
  // expects them percent-encoded, which encodeURIComponent does not do.
  assert.equal(canonicalUri("/x!y"), "/x%21y");
  assert.equal(canonicalUri("/x*y"), "/x%2Ay");
  assert.equal(canonicalUri("/a-b_c.d~e"), "/a-b_c.d~e");
});

test("environment credentials win, and their absence is a loud, actionable error", async () => {
  const { resolveCredentials, forgetCachedCredentials } = await import("../src/aws/sigv4.js");
  const saved = { ...process.env };
  try {
    forgetCachedCredentials();
    process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLE";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    process.env.AWS_SESSION_TOKEN = "token";
    const c = await resolveCredentials("test");
    assert.equal(c.accessKeyId, "AKIAEXAMPLE");
    assert.equal(c.sessionToken, "token");

    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
    delete process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
    await assert.rejects(() => resolveCredentials("bedrock"), /No AWS credentials in the environment for bedrock/);
  } finally {
    for (const k of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"]) {
      if (saved[k]) process.env[k] = saved[k];
      else delete process.env[k];
    }
    forgetCachedCredentials();
  }
});

test("environment credentials are re-read, never cached across a rotation", async () => {
  // The expiry failure came from holding one copy of temporary credentials for
  // the length of a run. Reading them again each time is what makes rotation work.
  const { resolveCredentials, forgetCachedCredentials } = await import("../src/aws/sigv4.js");
  const saved = { ...process.env };
  try {
    forgetCachedCredentials();
    process.env.AWS_ACCESS_KEY_ID = "FIRST";
    process.env.AWS_SECRET_ACCESS_KEY = "s1";
    assert.equal((await resolveCredentials()).accessKeyId, "FIRST");
    process.env.AWS_ACCESS_KEY_ID = "SECOND";
    assert.equal((await resolveCredentials()).accessKeyId, "SECOND");
  } finally {
    for (const k of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
      if (saved[k]) process.env[k] = saved[k];
      else delete process.env[k];
    }
    forgetCachedCredentials();
  }
});
