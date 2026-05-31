export class SetupFailure extends Error {}
export class SmokeFailure extends Error {}
export class BlockerFailure extends Error {}

export function assertEqual(actual, expected, path, FailureClass = SmokeFailure) {
  if (actual !== expected) {
    throw new FailureClass(`${path} expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}`);
  }
}

export function assertArrayIncludes(actual, expected, path, FailureClass = SmokeFailure) {
  if (!Array.isArray(actual) || !actual.includes(expected)) {
    throw new FailureClass(`${path} expected to include ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}`);
  }
}

export function assertArrayEmpty(actual, path, FailureClass = SmokeFailure) {
  if (!Array.isArray(actual) || actual.length !== 0) {
    throw new FailureClass(`${path} expected an empty array but received ${JSON.stringify(actual)}`);
  }
}

export function assertArrayNotEmpty(actual, path, FailureClass = SmokeFailure) {
  if (!Array.isArray(actual) || actual.length === 0) {
    throw new FailureClass(`${path} expected a non-empty array but received ${JSON.stringify(actual)}`);
  }
}

export function assertLocalAgentSetup(body, FailureClass = SmokeFailure) {
  assertEqual(body.localAgents?.noteAgentSchema?.ok, true, 'body.localAgents.noteAgentSchema.ok', FailureClass);
  assertEqual(
    body.localAgents?.workspaceBrainSchema?.ok,
    true,
    'body.localAgents.workspaceBrainSchema.ok',
    FailureClass,
  );
}

export function parseJsonResponse(text, label, FailureClass = SmokeFailure) {
  try {
    return JSON.parse(text);
  } catch {
    throw new FailureClass(`${label} response body must be JSON`);
  }
}

export function classifySmokeError(error) {
  if (error instanceof SetupFailure) {
    return { prefix: 'setup failure', exitCode: 2 };
  }
  if (error instanceof BlockerFailure) {
    return { prefix: 'blocked', exitCode: 3 };
  }
  if (error instanceof SmokeFailure) {
    return { prefix: 'smoke failure', exitCode: 1 };
  }
  return { prefix: 'unexpected failure', exitCode: 1 };
}
