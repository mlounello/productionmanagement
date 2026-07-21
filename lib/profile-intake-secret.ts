type IntakeEnvironment = Record<string, string | undefined>;

export function profileIntakeHmacSecret(env: IntakeEnvironment) {
  const configured = env.PROFILE_INTAKE_HMAC_SECRET?.trim();
  if (configured) {
    if (Buffer.byteLength(configured, "utf8") < 32) {
      throw new Error("PROFILE_INTAKE_HMAC_SECRET must contain at least 32 bytes.");
    }
    return configured;
  }

  if (env.NODE_ENV === "production") {
    throw new Error("PROFILE_INTAKE_HMAC_SECRET is required in production.");
  }

  return "local-intake-development-secret";
}
