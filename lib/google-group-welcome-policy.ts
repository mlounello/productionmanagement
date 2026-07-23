export type GoogleGroupWelcomeSettings = {
  google_group_sync_enabled?: boolean | null;
  active_google_group_email?: string | null;
};

export function requiresVerifiedGoogleMembership(settings: GoogleGroupWelcomeSettings) {
  return Boolean(settings.google_group_sync_enabled && String(settings.active_google_group_email ?? "").trim());
}

export function shouldHoldAutomaticWelcome(
  settings: GoogleGroupWelcomeSettings,
  membershipStatus: string,
) {
  return requiresVerifiedGoogleMembership(settings) && membershipStatus !== "verified";
}

export const AWAITING_GOOGLE_MEMBERSHIP_MESSAGE =
  "Welcome email is waiting until Google Group membership is verified.";
