type WelcomeEmailLayoutInput = {
  bodyHtml: string;
  templateSource: string;
  projectTitle: string;
  roleGroup: string;
  profileAccessUrl: string;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function title(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function profileAccessBlock(url: string) {
  const safeUrl = escapeHtml(url);
  return `<div style="margin:30px 0 24px;padding:24px;background:#f1f7f4;border-left:4px solid #0b6b4f;border-radius:8px">
    <h2 style="margin:0 0 12px;color:#173b31;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3">Complete Your Production Profile</h2>
    <p style="margin:0 0 16px;color:#344a43;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65">Review your contact information, add a reusable headshot, and prepare your show-specific biography for Playbill.</p>
    <p style="margin:0 0 16px"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0b6b4f;color:#ffffff;padding:12px 18px;border-radius:6px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700">Open My Production Profile</a></p>
    <p style="margin:0;color:#52665f;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55">This private link is already connected to the email address where this message was delivered. No account setup or email re-entry is required, and the link should not be shared.</p>
  </div>`;
}

export function insertBeforeEmailSignoff(bodyHtml: string, blockHtml: string) {
  const signoff = /<p\b[^>]*>\s*(?:Best|Sincerely|Warmly|Regards|Thank you|Thanks),?(?:\s|<br\s*\/?>|&nbsp;)/i;
  const match = signoff.exec(bodyHtml);
  if (!match || match.index < 0) return `${bodyHtml}${blockHtml}`;
  return `${bodyHtml.slice(0, match.index)}${blockHtml}${bodyHtml.slice(match.index)}`;
}

function styleBodyMarkup(bodyHtml: string) {
  let styled = bodyHtml
    .replace(/<p>/gi, '<p style="margin:0 0 18px;color:#263b35;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65">')
    .replace(/<h1>/gi, '<h1 style="margin:0 0 18px;color:#173b31;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.25">')
    .replace(/<h2>/gi, '<h2 style="margin:30px 0 12px;color:#173b31;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3">')
    .replace(/<h3>/gi, '<h3 style="margin:26px 0 10px;color:#173b31;font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:1.35">')
    .replace(/<ul>/gi, '<ul style="margin:0 0 22px;padding-left:24px;color:#263b35;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">')
    .replace(/<ol>/gi, '<ol style="margin:0 0 22px;padding-left:24px;color:#263b35;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">')
    .replace(/<li>/gi, '<li style="margin:0 0 8px;padding-left:3px">')
    .replace(/<blockquote>/gi, '<blockquote style="margin:24px 0;padding:18px 20px;background:#f1f7f4;border-left:4px solid #0b6b4f;color:#344a43">');

  styled = styled.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_full, attributes: string, label: string) => {
    const callToAction = /Open (?:Your Propared Production Book|My Production Profile|Production Book|Production Profile)/i.test(label.replace(/<[^>]+>/g, ""));
    const linkStyle = callToAction
      ? "display:inline-block;background:#0b6b4f;color:#ffffff;padding:12px 18px;border-radius:6px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700"
      : "color:#086348;text-decoration:underline;font-weight:600";
    return `<a${attributes} style="${linkStyle}">${label}</a>`;
  });
  return styled;
}

export function formatRoleGroupWelcomeEmail(input: WelcomeEmailLayoutInput) {
  const needsProfileBlock = !input.templateSource.includes("{{profile_access_url}}");
  const completedBody = needsProfileBlock
    ? insertBeforeEmailSignoff(input.bodyHtml, profileAccessBlock(input.profileAccessUrl))
    : input.bodyHtml;
  const styledBody = styleBodyMarkup(completedBody);
  const safeProject = escapeHtml(input.projectTitle);
  const safeGroup = escapeHtml(title(input.roleGroup));
  return `<div data-pm-email-brand="siena" style="margin:0;padding:0;background:#eef3f0">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eef3f0">
      <tr>
        <td align="center" style="padding:28px 14px">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #d8e3de;border-radius:12px;overflow:hidden">
            <tr>
              <td style="padding:26px 34px;background:#164c3c">
                <p style="margin:0 0 7px;color:#bfe0d3;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Siena Theatre</p>
                <h1 style="margin:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.2">${safeProject}</h1>
                <p style="margin:8px 0 0;color:#e2f0ea;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4">${safeGroup}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:34px">${styledBody}</td>
            </tr>
            <tr>
              <td style="padding:18px 34px;background:#f5f8f6;border-top:1px solid #d8e3de;color:#63766f;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5">
                Sent by Siena Theatre Production Management.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}
