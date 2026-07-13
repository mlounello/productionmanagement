function slugPart(value) {
  return String(value).normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
}

export function generateGoogleGroupEmail(projectSlug, roleGroupSlug, options) {
  const domain = String(options.domain).trim().toLowerCase().replace(/^@/, "");
  const suffix = slugPart(options.suffix ?? "");
  const local = [slugPart(projectSlug), "production", slugPart(roleGroupSlug)].filter(Boolean).join("-");
  return `${local}${suffix ? `-${suffix}` : ""}@${domain}`;
}
