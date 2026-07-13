declare module "@/lib/google-group-naming.mjs" {
  export function generateGoogleGroupEmail(
    projectSlug: string,
    roleGroupSlug: string,
    options: { domain: string; suffix: string }
  ): string;
}
