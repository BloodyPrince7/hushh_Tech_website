import { getInlineAssetCid, type EmailInlineAssetKey } from "./emailInlineAssets.ts";

export const EMAIL_COLORS = {
  black: "#0D0D0D",
  white: "#FFFFFF",
  gold: "#E9C349",
  cardBorder: "#E3E3E3",
  cardHeader: "#FAFAFA",
  bodyText: "#1A1A1A",
  mutedText: "#6A6A6A",
  fineText: "#A4A4A4",
  monoText: "#4A4A4A",
};

const FONT_HEADLINE = "Inter, Arial, Helvetica, sans-serif";
const FONT_BODY = "Inter, Arial, Helvetica, sans-serif";
const FONT_MONO = "SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

type ButtonVariant = "primary" | "secondary";

export interface KeyValueRow {
  label: string;
  value?: string;
  htmlValue?: string;
  monospace?: boolean;
  breakAll?: boolean;
}

export interface ActionButton {
  label: string;
  href: string;
  variant?: ButtonVariant;
}

export interface FeatureItem {
  glyph: string;
  title: string;
  description: string;
  icon?: FeatureIcon;
}

type FeatureIcon = Extract<
  EmailInlineAssetKey,
  "calendar" | "bank" | "shield" | "analytics" | "quiz" | "calendar-check"
>;

type SocialIcon = Extract<EmailInlineAssetKey, "home" | "x" | "youtube" | "linkedin" | "facebook">;

function renderImageIcon(src: string, width: number, height: number): string {
  return `<img src="${escapeAttribute(src)}" alt="" width="${width}" height="${height}" style="display:block;margin:0 auto;width:${width}px;height:${height}px;border:0;outline:none;text-decoration:none;" />`;
}

function escapeLineBreaks(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br/>");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

export function renderEmailDocument(contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Hushh Email</title>
  <style>
    :root {
      color-scheme: light;
      supported-color-schemes: light;
    }
    body, table, td, div, p, a, span {
      color-scheme: light;
    }
  </style>
</head>
<body bgcolor="${EMAIL_COLORS.white}" style="margin:0;padding:0;background-color:${EMAIL_COLORS.white};font-family:${FONT_BODY};-webkit-font-smoothing:antialiased;color:${EMAIL_COLORS.bodyText};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLORS.white}" style="width:100%;background-color:${EMAIL_COLORS.white};border-collapse:collapse;">
    <tr>
      <td align="center" bgcolor="${EMAIL_COLORS.white}" style="padding:0;background-color:${EMAIL_COLORS.white};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLORS.white}" style="width:100%;max-width:600px;border-collapse:collapse;background-color:${EMAIL_COLORS.white};">
          ${contentHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderBrandBadge(): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="border-collapse:collapse;">
      <tr>
        <td style="font-size:12px;line-height:1;color:${EMAIL_COLORS.gold};padding-right:6px;">&#129323;</td>
        <td style="font-family:${FONT_HEADLINE};font-size:12px;line-height:12px;font-weight:700;letter-spacing:0.32em;color:${EMAIL_COLORS.gold};text-transform:uppercase;">
          HUSHH
        </td>
      </tr>
    </table>
  `;
}

export function renderHeroSection(contentHtml: string): string {
  return `
    <tr>
      <td bgcolor="${EMAIL_COLORS.black}" style="background-color:${EMAIL_COLORS.black};padding:30px 38px 40px 38px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td align="right">
              ${renderBrandBadge()}
            </td>
          </tr>
          <tr>
            <td style="padding-top:42px;">
              ${contentHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

export function renderBodySection(contentHtml: string, padding = "0 38px"): string {
  return `
    <tr>
      <td bgcolor="${EMAIL_COLORS.white}" style="background-color:${EMAIL_COLORS.white};padding:${padding};">
        ${contentHtml}
      </td>
    </tr>
  `;
}

export function renderTextBlock(text: string, opts?: { centered?: boolean; uppercase?: boolean; muted?: boolean }): string {
  return `
    <p style="margin:0;font-family:${FONT_BODY};font-size:13px;line-height:1.75;color:${opts?.muted ? EMAIL_COLORS.mutedText : EMAIL_COLORS.bodyText};text-align:${opts?.centered ? "center" : "left"};${opts?.uppercase ? "text-transform:uppercase;letter-spacing:0.16em;font-size:9px;font-weight:700;" : ""}">
      ${escapeLineBreaks(text)}
    </p>
  `;
}

export function renderCard(title: string, bodyHtml: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLORS.white}" style="width:100%;border:1px solid ${EMAIL_COLORS.cardBorder};border-radius:14px;overflow:hidden;border-collapse:separate;border-spacing:0;background-color:${EMAIL_COLORS.white};">
      <tr>
        <td bgcolor="${EMAIL_COLORS.cardHeader}" style="padding:13px 18px;background-color:${EMAIL_COLORS.cardHeader};border-bottom:1px solid ${EMAIL_COLORS.cardBorder};">
          <div style="font-family:${FONT_HEADLINE};font-size:11px;line-height:1.2;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_COLORS.fineText};">
            ${escapeHtml(title)}
          </div>
        </td>
      </tr>
      <tr>
        <td bgcolor="${EMAIL_COLORS.white}" style="padding:0;background-color:${EMAIL_COLORS.white};">
          ${bodyHtml}
        </td>
      </tr>
    </table>
  `;
}

export function renderKeyValueRows(rows: KeyValueRow[]): string {
  const renderedRows = rows
    .map((row, index) => {
      const borderBottom =
        index === rows.length - 1 ? "" : `border-bottom:1px solid ${EMAIL_COLORS.cardBorder};`;
      const valueHtml =
        row.htmlValue ??
        `<span style="font-family:${row.monospace ? FONT_MONO : FONT_BODY};font-size:${row.monospace ? "13px" : "13px"};line-height:1.5;font-weight:${row.monospace ? "700" : "600"};color:${row.monospace ? EMAIL_COLORS.monoText : EMAIL_COLORS.bodyText};${row.breakAll ? "word-break:break-word;overflow-wrap:anywhere;" : ""}">${escapeLineBreaks(
          row.value ?? ""
        )}</span>`;

      return `
        <tr>
          <td style="padding:0;${borderBottom}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
              <tr>
                <td valign="top" style="width:34%;padding:18px 20px 18px 20px;font-family:${FONT_BODY};font-size:11px;line-height:1.45;font-weight:600;color:${EMAIL_COLORS.bodyText};">
                  ${escapeHtml(row.label)}
                </td>
                <td valign="top" style="padding:18px 20px 18px 0;">
                  ${valueHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
      ${renderedRows}
    </table>
  `;
}

export function renderButtons(buttons: ActionButton[]): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
      ${buttons
        .map((button, index) => {
          const variant = button.variant ?? "primary";
          const isPrimary = variant === "primary";

          return `
            <tr>
              <td style="padding:${index === 0 ? "0" : "14px"} 0 0 0;">
                <a href="${escapeAttribute(button.href)}" style="display:block;width:100%;box-sizing:border-box;padding:18px 20px;border-radius:12px;border:${isPrimary ? "1px solid " + EMAIL_COLORS.black : "1px solid " + EMAIL_COLORS.cardBorder};background-color:${isPrimary ? EMAIL_COLORS.black : EMAIL_COLORS.white};color:${isPrimary ? EMAIL_COLORS.white : EMAIL_COLORS.bodyText};font-family:${FONT_HEADLINE};font-size:12px;line-height:1.2;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;text-align:center;text-decoration:none;">
                  ${escapeHtml(button.label)}
                </a>
              </td>
            </tr>
          `;
        })
        .join("")}
    </table>
  `;
}

export function renderFeatureList(items: FeatureItem[]): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
      ${items
        .map(
          (item, index) => `
            <tr>
              <td style="padding:${index === 0 ? "0" : "14px"} 0 0 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td valign="top" style="width:58px;padding-right:18px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:44px;height:44px;border:1px solid ${EMAIL_COLORS.cardBorder};border-radius:22px;border-collapse:separate;">
                        <tr>
                          <td align="center" valign="middle" style="font-family:${FONT_HEADLINE};font-size:15px;line-height:1;font-weight:700;color:${EMAIL_COLORS.bodyText};">
                            ${item.icon ? renderFeatureIcon(item.icon) : escapeHtml(item.glyph)}
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td valign="middle">
                      <div style="font-family:${FONT_HEADLINE};font-size:14px;line-height:1.3;font-weight:700;color:${EMAIL_COLORS.bodyText};margin:0 0 4px 0;">
                        ${escapeHtml(item.title)}
                      </div>
                      <div style="font-family:${FONT_BODY};font-size:11px;line-height:1.55;color:${EMAIL_COLORS.mutedText};">
                        ${escapeHtml(item.description)}
                      </div>
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

function renderFeatureIcon(icon: FeatureIcon): string {
  return renderImageIcon(getInlineAssetCid(icon), 18, 18);
}

function renderSocialLink(label: string, url: string, icon: SocialIcon): string {
  const iconHtml = renderImageIcon(getInlineAssetCid(icon), 18, 18);
  const cellLineHeight = "0";

  return `
    <td align="center" style="padding:0 8px 0 8px;">
      <a href="${escapeAttribute(url)}" title="${escapeAttribute(label)}" style="display:inline-block;text-decoration:none;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:40px;height:40px;border:1px solid #2D2D2D;border-radius:20px;border-collapse:separate;background-color:#171717;">
          <tr>
            <td align="center" valign="middle" style="width:40px;height:40px;line-height:${cellLineHeight};">
              ${iconHtml}
            </td>
          </tr>
        </table>
      </a>
    </td>
  `;
}

export function renderFooter(): string {
  const currentYear = new Date().getFullYear();

  return `
    <tr>
      <td bgcolor="${EMAIL_COLORS.black}" style="background-color:${EMAIL_COLORS.black};padding:44px 38px 52px 38px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  ${renderSocialLink("Hushh Main Site", "https://www.hushh.ai", "home")}
                  ${renderSocialLink("X", "https://twitter.com/hushh_ai", "x")}
                  ${renderSocialLink("YouTube", "https://www.youtube.com/@hushhai", "youtube")}
                  ${renderSocialLink("LinkedIn", "https://www.linkedin.com/company/hushh-ai/", "linkedin")}
                  ${renderSocialLink("Facebook", "https://www.facebook.com/hushhaiplatform", "facebook")}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:34px;">
              <div style="font-family:${FONT_BODY};font-size:11px;line-height:1.7;color:${EMAIL_COLORS.white};">
                <a href="https://www.hushh.ai/about" style="color:${EMAIL_COLORS.white};text-decoration:underline;">About Us</a>
                <span style="color:${EMAIL_COLORS.gold};padding:0 10px;">|</span>
                <a href="https://hushhtech.com/faq" style="color:${EMAIL_COLORS.white};text-decoration:underline;">Help Center</a>
                <span style="color:${EMAIL_COLORS.gold};padding:0 10px;">|</span>
                <a href="https://hushhtech.com/privacy-policy" style="color:${EMAIL_COLORS.white};text-decoration:underline;">Privacy Policy</a>
                <span style="color:${EMAIL_COLORS.gold};padding:0 10px;">|</span>
                <a href="mailto:support@hushh.ai?subject=Email%20Preferences" style="color:${EMAIL_COLORS.white};text-decoration:underline;">Unsubscribe</a>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:26px;font-family:${FONT_BODY};">
              <div style="font-size:11px;line-height:1.5;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL_COLORS.gold};">
                Sent by Hushh Technologies Pte Ltd.
              </div>
              <div style="padding-top:8px;font-size:11px;line-height:1.5;color:${EMAIL_COLORS.white};">
                &copy; ${currentYear} Hushh. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}
