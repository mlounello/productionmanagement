type PublicityReminderEmailInput = {
  bodyHtml: string;
  templateSource: string;
  projectTitle: string;
  profileAccessUrl: string;
  outstandingItems: string[];
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function styleBodyMarkup(bodyHtml: string) {
  let styled = bodyHtml
    .replace(/<p>/gi, '<p style="margin:0 0 18px;color:#263b35;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65">')
    .replace(/<h1>/gi, '<h1 style="margin:0 0 18px;color:#173b31;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.25">')
    .replace(/<h2>/gi, '<h2 style="margin:30px 0 12px;color:#173b31;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3">')
    .replace(/<h3>/gi, '<h3 style="margin:26px 0 10px;color:#173b31;font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:1.35">')
    .replace(/<ul>/gi, '<ul style="margin:0 0 22px;padding-left:24px;color:#263b35;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">')
    .replace(/<ol>/gi, '<ol style="margin:0 0 22px;padding-left:24px;color:#263b35;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">')
    .replace(/<li>/gi, '<li style="margin:0 0 8px;padding-left:3px">');
  styled = styled.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_full, attributes: string, label: string) =>
    `<a${attributes} style="color:#086348;text-decoration:underline;font-weight:700">${label}</a>`);
  return styled;
}

function workflowBlock(url: string, outstandingItems: string[]) {
  const safeUrl = escapeHtml(url);
  const needed = outstandingItems.map((item) => `<li style="margin:0 0 7px">${escapeHtml(item)}</li>`).join("");
  return `<div style="margin:28px 0 24px;padding:24px;background:#f1f7f4;border-left:4px solid #0b6b4f;border-radius:8px">
    <h2 style="margin:0 0 12px;color:#173b31;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3">Finish Your Publicity</h2>
    <p style="margin:0 0 10px;color:#344a43;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">Your secure profile will walk you through the items still needed:</p>
    <ul style="margin:0 0 18px;padding-left:22px;color:#344a43;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55">${needed}</ul>
    <p style="margin:0 0 12px;color:#344a43;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6"><strong>When your show bio is ready:</strong> review the live preview and choose <strong>Approve &amp; Submit to Playbill</strong>.</p>
    <p style="margin:0 0 18px;color:#344a43;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6"><strong>If this production does not need a bio from you:</strong> choose <strong>No bio needed for this production</strong>. That will stop future publicity reminders for this show.</p>
    <p style="margin:0 0 16px"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0b6b4f;color:#ffffff;padding:13px 19px;border-radius:6px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700">Review, Approve, or Skip My Bio</a></p>
    <p style="margin:0;color:#52665f;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55">No account or password is required. This private link is connected to the email address where this message was delivered and should not be shared.</p>
  </div>`;
}

export function formatPublicityReminderEmail(input: PublicityReminderEmailInput) {
  const escapedProfileUrl = input.profileAccessUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bodyWithoutTemplateButton = input.templateSource.includes("{{profile_access_url}}")
    ? input.bodyHtml.replace(new RegExp(`<p\\b[^>]*>\\s*<a\\b[^>]*href=["']${escapedProfileUrl}["'][^>]*>[\\s\\S]*?<\\/a>\\s*<\\/p>`, "i"), "")
    : input.bodyHtml;
  const styledBody = styleBodyMarkup(bodyWithoutTemplateButton);
  const safeProject = escapeHtml(input.projectTitle);
  return `<div style="margin:0;padding:0;background:#eef3f0">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eef3f0">
      <tr><td align="center" style="padding:28px 14px">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #d8e3de;border-radius:12px;overflow:hidden">
          <tr><td style="padding:26px 34px;background:#164c3c">
            <p style="margin:0 0 7px;color:#bfe0d3;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Siena Theatre · Production Management</p>
            <h1 style="margin:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.2">${safeProject}</h1>
            <p style="margin:8px 0 0;color:#e2f0ea;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4">Publicity reminder</p>
          </td></tr>
          <tr><td style="padding:34px">${styledBody}${workflowBlock(input.profileAccessUrl, input.outstandingItems)}</td></tr>
          <tr><td style="padding:18px 34px;background:#f5f8f6;border-top:1px solid #d8e3de;color:#63766f;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5">Sent by Siena Theatre Production Management. A completed, locked, or skipped production bio will not receive further reminders.</td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;
}
