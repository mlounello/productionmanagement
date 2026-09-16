export const AUTH_CALLBACK_PATH = "/auth/callback";
export const PROFILE_AUTH_CALLBACK_PATH = "/auth/profile-access";
export const GMAIL_OAUTH_CALLBACK_PATH = "/api/integrations/gmail/callback";

export function shouldNormalizeAuthCallback(pathname: string, hasAuthCallbackParams: boolean) {
  return hasAuthCallbackParams &&
    pathname !== AUTH_CALLBACK_PATH &&
    pathname !== PROFILE_AUTH_CALLBACK_PATH &&
    pathname !== GMAIL_OAUTH_CALLBACK_PATH;
}

export function safeAuthDestination(requested: string | null | undefined, fallback: string) {
  return requested?.startsWith("/") && !requested.startsWith("//") ? requested : fallback;
}
