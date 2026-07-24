export const PRODUCTION_MANAGEMENT_FROM =
  "Production Management <production-management@mlounello.com>";

const BRAND_MARKER = 'data-pm-email-brand="siena"';

export function brandProductionManagementEmail(contentHtml: string) {
  if (contentHtml.includes(BRAND_MARKER)) return contentHtml;

  return `<div ${BRAND_MARKER} style="margin:0;padding:0;background:#eef3f0">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eef3f0">
    <tr>
      <td align="center" style="padding:28px 14px">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #d8e3de;border-radius:12px;overflow:hidden">
          <tr>
            <td style="padding:24px 34px;background:#164c3c;border-bottom:4px solid #f2c75c">
              <p style="margin:0 0 6px;color:#f2c75c;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Siena Theatre</p>
              <h1 style="margin:0;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:1.2">Production Management</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:34px;color:#263b35;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65">${contentHtml}</td>
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
