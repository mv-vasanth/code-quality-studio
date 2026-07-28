import { AUDIT_STACKS, DEFAULT_STACK_ID } from "./definitions.js";

export function getAuditStack(stackId) {
  return AUDIT_STACKS[stackId] ?? AUDIT_STACKS[DEFAULT_STACK_ID];
}

export function isFileAllowedForStack(filename, stackId) {
  const stack = getAuditStack(stackId);
  return stack.filePattern.test(filename);
}
