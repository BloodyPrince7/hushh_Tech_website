import {
  ActionButton,
  EMAIL_COLORS,
  escapeAttribute,
  escapeHtml,
  renderBodySection,
  renderButtons,
  renderCard,
  renderEmailDocument,
  renderFooter,
  renderHeroSection,
  renderKeyValueRows,
} from "../_shared/emailTemplateChrome.ts";
import { EMAIL_FOOTER_INLINE_ASSET_KEYS, type EmailInlineAssetKey } from "../_shared/emailInlineAssets.ts";

export interface NDATemplateData {
  signerName: string;
  signerEmail: string;
  signedDate: string;
  ndaVersion: string;
  signerIp: string;
  pdfUrl?: string;
  pdfBase64?: string;
  userId?: string;
  documentsAcknowledged?: string[];
}

export const NDA_INLINE_ASSET_KEYS: EmailInlineAssetKey[] = [...EMAIL_FOOTER_INLINE_ASSET_KEYS];

function renderSimpleCardBody(contentHtml: string): string {
  return `
    <div style="padding:18px 20px;font-family:Inter, Arial, Helvetica, sans-serif;font-size:13px;line-height:1.7;color:${EMAIL_COLORS.mutedText};">
      ${contentHtml}
    </div>
  `;
}

function renderDocumentsList(documentsAcknowledged: string[]): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
      ${documentsAcknowledged
        .map(
          (doc, index) => `
            <tr>
              <td style="padding:0;${index === documentsAcknowledged.length - 1 ? "" : `border-bottom:1px solid ${EMAIL_COLORS.cardBorder};`}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td valign="top" style="width:44px;padding:16px 0 16px 20px;font-family:Inter, Arial, Helvetica, sans-serif;font-size:14px;line-height:1;color:${EMAIL_COLORS.bodyText};font-weight:700;">
                      OK
                    </td>
                    <td valign="top" style="padding:16px 20px 16px 0;font-family:Inter, Arial, Helvetica, sans-serif;font-size:13px;line-height:1.55;color:${EMAIL_COLORS.monoText};font-weight:600;">
                      ${escapeHtml(doc)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          `
        )
        .join("")}
    </table>
  `;
}

export function buildNDANotificationHtml({
  signerName,
  signerEmail,
  signedDate,
  ndaVersion,
  signerIp,
  pdfUrl,
  pdfBase64,
  userId,
  documentsAcknowledged = [],
}: NDATemplateData): string {
  const signerRows = [
    { label: "Name", value: signerName, monospace: true },
    {
      label: "Email",
      htmlValue: `<a href="mailto:${escapeAttribute(
        signerEmail
      )}" style="font-family:SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;font-size:13px;line-height:1.55;font-weight:700;color:${EMAIL_COLORS.monoText};text-decoration:none;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(
        signerEmail
      )}</a>`,
    },
    { label: "Signed At", value: signedDate, monospace: true, breakAll: true },
    { label: "NDA Version", value: ndaVersion, monospace: true },
    { label: "IP Address", value: signerIp, monospace: true },
    ...(userId
      ? [{ label: "User ID", value: userId, monospace: true, breakAll: true }]
      : []),
  ];

  const actionButtons: ActionButton[] = userId
    ? [
        {
          label: "View This User's NDA",
          href: `https://hushhtech.com/nda-admin?highlight=${encodeURIComponent(userId)}`,
          variant: "primary",
        },
        {
          label: "View All NDA Agreements",
          href: "https://hushhtech.com/nda-admin",
          variant: "secondary",
        },
      ]
    : [
        {
          label: "View All NDA Agreements",
          href: "https://hushhtech.com/nda-admin",
          variant: "primary",
        },
      ];

  const extraSections = [
    pdfUrl
      ? renderCard(
          "Signed NDA Document",
          renderSimpleCardBody(
            `A signed NDA PDF has been stored for this user.<br/><br/><a href="${escapeAttribute(
              pdfUrl
            )}" style="color:${EMAIL_COLORS.bodyText};font-weight:700;text-decoration:underline;">View / Download PDF</a>`
          )
        )
      : "",
    pdfBase64
      ? renderCard(
          "Attachment Notice",
          renderSimpleCardBody("The signed NDA PDF is attached to this email.")
        )
      : "",
    documentsAcknowledged.length > 0
      ? renderCard("Fund Documents Acknowledged", renderDocumentsList(documentsAcknowledged))
      : "",
  ]
    .filter(Boolean)
    .join('<div style="height:18px;line-height:18px;">&nbsp;</div>');

  return renderEmailDocument(`
    ${renderHeroSection(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td align="center" style="font-family:Inter, Arial, Helvetica, sans-serif;font-size:50px;line-height:1;color:${EMAIL_COLORS.white};font-weight:700;padding:0 0 12px 0;">
            NDA Agreement Signed
          </td>
        </tr>
        <tr>
          <td align="center" style="font-family:Inter, Arial, Helvetica, sans-serif;font-size:11px;line-height:1.4;color:${EMAIL_COLORS.gold};font-weight:500;letter-spacing:0.26em;text-transform:uppercase;">
            Internal Notification
          </td>
        </tr>
      </table>
    `)}
    ${renderBodySection(`
      <div style="padding-top:44px;">
        <p style="margin:0;font-family:Inter, Arial, Helvetica, sans-serif;font-size:13px;line-height:1.95;color:${EMAIL_COLORS.mutedText};">
          A new user has signed the Non-Disclosure Agreement on the Hushh platform. This signature has been cryptographically logged and stored within the secure estate.
        </p>
      </div>
    `)}
    ${renderBodySection(`
      <div style="padding-top:22px;padding-bottom:6px;">
        ${renderCard("Signer Information", renderKeyValueRows(signerRows))}
      </div>
    `)}
    ${
      extraSections
        ? renderBodySection(`
            <div style="padding-top:12px;padding-bottom:6px;">
              ${extraSections}
            </div>
          `)
        : ""
    }
    ${renderBodySection(`
      <div style="padding-top:18px;padding-bottom:0;">
        ${renderButtons(actionButtons)}
      </div>
    `)}
    ${renderBodySection(`
      <div style="padding-top:46px;padding-bottom:54px;">
        <div style="border-top:1px solid #EFEFEF;padding-top:30px;font-family:Inter, Arial, Helvetica, sans-serif;font-size:12px;line-height:1.9;color:${EMAIL_COLORS.mutedText};">
          <strong style="color:${EMAIL_COLORS.bodyText};font-weight:600;">Confidentiality Notice:</strong>
          This internal notification contains sensitive legal data. Please keep this confidential. Unauthorized disclosure is strictly prohibited.
        </div>
      </div>
    `)}
    ${renderFooter()}
  `);
}
