import "server-only";

import { timingSafeEqual } from "node:crypto";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

export function hasIntegrationSecret(request: Request, expected: string | undefined) {
  const supplied = bearerToken(request);
  const configured = expected?.trim() ?? "";
  if (!supplied || !configured) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(configured);
  return left.length === right.length && timingSafeEqual(left, right);
}
