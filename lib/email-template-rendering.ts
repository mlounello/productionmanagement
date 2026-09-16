export type TemplateVariables = Record<string, string>;
function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
export function renderTemplate(template: string, variables: TemplateVariables, html = false) {
  return template.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match, key: string) => html ? escapeHtml(variables[key] ?? "") : variables[key] ?? "");
}
