import {
  EMAIL_COLORS,
  renderBodySection,
  renderButtons,
  renderCard,
  renderEmailDocument,
  renderFeatureList,
  renderFooter,
  renderHeroSection,
  renderKeyValueRows,
} from "../_shared/emailTemplateChrome.ts";
import { EMAIL_FOOTER_INLINE_ASSET_KEYS, type EmailInlineAssetKey } from "../_shared/emailInlineAssets.ts";

export interface CoinsCreditTemplateData {
  recipientName: string;
  coinsAwarded: number;
  dateLabel: string;
}

export const COINS_CREDIT_INLINE_ASSET_KEYS: EmailInlineAssetKey[] = [
  ...EMAIL_FOOTER_INLINE_ASSET_KEYS,
  "calendar",
  "bank",
  "shield",
];

function formatUsdValue(coinsAwarded: number): string {
  return (coinsAwarded / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function buildCoinsCreditEmailHtml({
  recipientName,
  coinsAwarded,
  dateLabel,
}: CoinsCreditTemplateData): string {
  const amountLabel = coinsAwarded.toLocaleString("en-US");
  const usdValue = formatUsdValue(coinsAwarded);

  return renderEmailDocument(`
    ${renderHeroSection(`
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td align="center" style="font-family:Inter, Arial, Helvetica, sans-serif;font-size:18px;line-height:1.4;color:${EMAIL_COLORS.white};font-weight:400;padding:0 0 10px 0;">
            You've been credited.
          </td>
        </tr>
        <tr>
          <td align="center" style="font-family:Inter, Arial, Helvetica, sans-serif;font-size:64px;line-height:1;color:${EMAIL_COLORS.white};font-weight:700;letter-spacing:-0.04em;padding:0 0 8px 0;">
            ${amountLabel}
          </td>
        </tr>
        <tr>
          <td align="center" style="font-family:Inter, Arial, Helvetica, sans-serif;font-size:20px;line-height:1.3;color:${EMAIL_COLORS.gold};font-weight:600;padding:0;">
            Hushh Coins
          </td>
        </tr>
      </table>
    `)}
    ${renderBodySection(`
      <div style="padding-top:52px;padding-bottom:8px;">
        ${renderCard(
          "Transaction Details",
          renderKeyValueRows([
            { label: "Recipient", value: recipientName, monospace: true },
            { label: "Amount", value: `${amountLabel} HC`, monospace: true },
            { label: "Value", value: `$${usdValue}`, monospace: true },
            { label: "Date", value: dateLabel, monospace: true },
            { label: "Status", value: "COMPLETED", monospace: true },
          ])
        )}
      </div>
    `)}
    ${renderBodySection(`
      <div style="padding-top:42px;padding-bottom:10px;">
        <div style="font-family:Inter, Arial, Helvetica, sans-serif;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${EMAIL_COLORS.bodyText};padding-bottom:24px;">
          Your Exclusive Coin Rewards
        </div>
        ${renderFeatureList([
          {
            glyph: "C",
            icon: "calendar",
            title: "Book a Consultation",
            description: "Private 1:1 session with Manish Sainani.",
          },
          {
            glyph: "I",
            icon: "bank",
            title: "Investment Guidance",
            description: "Clear portfolio and strategy advice.",
          },
          {
            glyph: "OK",
            icon: "shield",
            title: "KYC Verified",
            description: "Identity verified and ready to trade.",
          },
        ])}
      </div>
    `)}
    ${renderBodySection(`
      <div style="padding-top:12px;padding-bottom:18px;">
        ${renderButtons([
          {
            label: "Activate Your Session",
            href: "https://hushhtech.com/onboarding/meet-ceo",
            variant: "primary",
          },
        ])}
      </div>
    `)}
    ${renderBodySection(`
      <div style="padding-top:22px;padding-bottom:54px;font-family:Inter, Arial, Helvetica, sans-serif;font-size:10px;line-height:1.7;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#B6B6B6;text-align:center;">
        Hushh Coins are for internal ecosystem use only.
      </div>
    `)}
    ${renderFooter()}
  `);
}
