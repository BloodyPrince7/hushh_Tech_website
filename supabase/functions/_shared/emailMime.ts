import type { EmailInlineAsset } from "./emailInlineAssets.ts";

export interface EmailAttachmentPart {
  filename: string;
  mimeType: string;
  base64Data: string;
  disposition?: "attachment" | "inline";
  contentId?: string;
}

export interface RelatedEmailMessageOptions {
  fromLabel: string;
  fromEmail: string;
  recipients: string[];
  subject: string;
  htmlContent: string;
  inlineAssets?: readonly EmailInlineAsset[];
}

export interface MixedEmailMessageOptions extends RelatedEmailMessageOptions {
  attachments: readonly EmailAttachmentPart[];
}

function encodeToBase64(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function foldBase64Lines(base64: string): string {
  const lines: string[] = [];

  for (let index = 0; index < base64.length; index += 76) {
    lines.push(base64.slice(index, index + 76));
  }

  return lines.join("\r\n");
}

function encodeTextAsBase64(content: string): string {
  return foldBase64Lines(encodeToBase64(content));
}

export function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) {
    return subject;
  }

  return `=?UTF-8?B?${encodeToBase64(subject)}?=`;
}

export function base64urlEncode(data: Uint8Array | string): string {
  const base64 = encodeToBase64(data);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createBoundary(prefix: string): string {
  const randomToken = Math.random().toString(16).slice(2);
  return `${prefix}_${Date.now()}_${randomToken}`;
}

function createRelatedBody(htmlContent: string, inlineAssets: readonly EmailInlineAsset[], boundary: string): string {
  const bodyLines: string[] = [
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    encodeTextAsBase64(htmlContent),
  ];

  for (const asset of inlineAssets) {
    bodyLines.push(
      ``,
      `--${boundary}`,
      `Content-Type: ${asset.mimeType}; name="${asset.filename}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-ID: <${asset.contentId}>`,
      `Content-Disposition: inline; filename="${asset.filename}"`,
      ``,
      foldBase64Lines(asset.base64Data)
    );
  }

  bodyLines.push(``, `--${boundary}--`);
  return bodyLines.join("\r\n");
}

export function createRelatedEmailMessage({
  fromLabel,
  fromEmail,
  recipients,
  subject,
  htmlContent,
  inlineAssets = [],
}: RelatedEmailMessageOptions): string {
  const relatedBoundary = createBoundary("related");

  return [
    `From: ${fromLabel} <${fromEmail}>`,
    `To: ${recipients.join(", ")}`,
    `Subject: ${encodeSubject(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    ``,
    createRelatedBody(htmlContent, inlineAssets, relatedBoundary),
  ].join("\r\n");
}

export function createMixedEmailMessage({
  fromLabel,
  fromEmail,
  recipients,
  subject,
  htmlContent,
  inlineAssets = [],
  attachments,
}: MixedEmailMessageOptions): string {
  const mixedBoundary = createBoundary("mixed");
  const relatedBoundary = createBoundary("related");

  const emailLines: string[] = [
    `From: ${fromLabel} <${fromEmail}>`,
    `To: ${recipients.join(", ")}`,
    `Subject: ${encodeSubject(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    ``,
    `--${mixedBoundary}`,
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    ``,
    createRelatedBody(htmlContent, inlineAssets, relatedBoundary),
  ];

  for (const attachment of attachments) {
    emailLines.push(
      ``,
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      `Content-Transfer-Encoding: base64`,
      attachment.contentId ? `Content-ID: <${attachment.contentId}>` : "",
      `Content-Disposition: ${attachment.disposition ?? "attachment"}; filename="${attachment.filename}"`,
      ``,
      foldBase64Lines(attachment.base64Data)
    );
  }

  emailLines.push(``, `--${mixedBoundary}--`);

  return emailLines.filter((line, index, array) => !(line === "" && array[index - 1] === "")).join("\r\n");
}
