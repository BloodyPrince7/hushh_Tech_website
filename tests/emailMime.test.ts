import { describe, expect, it } from "vitest";

import { collectInlineAssets } from "../supabase/functions/_shared/emailInlineAssets";
import { createMixedEmailMessage, createRelatedEmailMessage } from "../supabase/functions/_shared/emailMime";

describe("email MIME helpers", () => {
  it("builds multipart/related messages with inline CID assets", () => {
    const message = createRelatedEmailMessage({
      fromLabel: "Hushh Coins",
      fromEmail: "ankit@hushh.ai",
      recipients: ["test@example.com"],
      subject: "Coins Credited",
      htmlContent: '<html><body><img src="cid:hushh-icon-home" /></body></html>',
      inlineAssets: collectInlineAssets(["home", "calendar"]),
    });

    expect(message).toContain('Content-Type: multipart/related; boundary="related_');
    expect(message).toContain("Content-Type: text/html; charset=\"UTF-8\"");
    expect(message).toContain("Content-ID: <hushh-icon-home>");
    expect(message).toContain("Content-ID: <hushh-icon-calendar>");
    expect(message).toContain("Content-Disposition: inline; filename=\"home.png\"");
    expect(message).toContain("Content-Disposition: inline; filename=\"calendar.png\"");
  });

  it("builds multipart/mixed messages with nested related content and attachments", () => {
    const message = createMixedEmailMessage({
      fromLabel: "Hushh NDA Notifications",
      fromEmail: "ankit@hushh.ai",
      recipients: ["ankit@hushh.ai"],
      subject: "[Hushh NDA] Agreement Signed by Test User",
      htmlContent: '<html><body><img src="cid:hushh-icon-home" /></body></html>',
      inlineAssets: collectInlineAssets(["home"]),
      attachments: [
        {
          filename: "nda.pdf",
          mimeType: "application/pdf",
          base64Data: "ZmFrZS1wZGY=",
        },
      ],
    });

    expect(message).toContain('Content-Type: multipart/mixed; boundary="mixed_');
    expect(message).toContain('Content-Type: multipart/related; boundary="related_');
    expect(message).toContain("Content-ID: <hushh-icon-home>");
    expect(message).toContain("Content-Disposition: inline; filename=\"home.png\"");
    expect(message).toContain("Content-Type: application/pdf; name=\"nda.pdf\"");
    expect(message).toContain("Content-Disposition: attachment; filename=\"nda.pdf\"");
    expect(message).toContain("ZmFrZS1wZGY=");
  });
});
