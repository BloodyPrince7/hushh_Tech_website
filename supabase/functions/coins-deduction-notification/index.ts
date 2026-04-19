import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { collectInlineAssets } from "../_shared/emailInlineAssets.ts";
import { base64urlEncode, createRelatedEmailMessage } from "../_shared/emailMime.ts";
import { buildCoinsDeductionEmailHtml, COINS_DEDUCTION_INLINE_ASSET_KEYS } from "./template.ts";

/**
 * Coins Deduction Notification — Sends email when coins are used for meeting booking
 * Uses Gmail API with Service Account (Domain-Wide Delegation)
 * Same pattern as nda-signed-notification
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Gmail API Helpers ───

async function createSignedJWT(
  serviceAccountEmail: string, privateKey: string,
  userToImpersonate: string, scopes: string[]
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccountEmail, sub: userToImpersonate,
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600, scope: scopes.join(" "),
  };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const privateKeyPem = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const privateKeyBuffer = Uint8Array.from(atob(privateKeyPem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", privateKeyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signatureInput)
  );
  return `${signatureInput}.${base64urlEncode(new Uint8Array(signature))}`;
}

async function getAccessToken(
  serviceAccountEmail: string, privateKey: string, userToImpersonate: string
): Promise<string> {
  const signedJwt = await createSignedJWT(
    serviceAccountEmail, privateKey, userToImpersonate,
    ["https://www.googleapis.com/auth/gmail.send"]
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedJwt,
    }),
  });
  if (!response.ok) throw new Error(`Failed to get access token: ${await response.text()}`);
  return (await response.json()).access_token;
}

async function sendGmailEmail(
  recipients: string[], subject: string, htmlContent: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY");
    const senderEmail = Deno.env.get("GMAIL_SENDER_EMAIL") || "ankit@hushh.ai";
    if (!serviceAccountEmail || !privateKey) {
      return { success: false, error: "Missing Google Service Account credentials" };
    }
    const formattedPrivateKey = privateKey.replace(/\\n/g, "\n");
    const accessToken = await getAccessToken(serviceAccountEmail, formattedPrivateKey, senderEmail);
    const rawMessage = createRelatedEmailMessage({
      fromLabel: "Hushh Coins",
      fromEmail: senderEmail,
      recipients,
      subject,
      htmlContent,
      inlineAssets: collectInlineAssets(COINS_DEDUCTION_INLINE_ASSET_KEYS),
    });
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: base64urlEncode(rawMessage) }),
      }
    );
    if (!response.ok) return { success: false, error: `Gmail API error: ${await response.text()}` };
    const result = await response.json();
    return { success: true, messageId: result.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ─── Main Handler ───

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { recipientEmail, recipientName, coinsDeducted, meetingDate, meetingTime } = await req.json();
    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: "Missing recipientEmail" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const coins = Number(coinsDeducted) || 300000;
    const mDate = meetingDate || "TBD";
    const mTime = meetingTime || "TBD";
    const date = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const html = buildCoinsDeductionEmailHtml({
      coinsDeducted: coins,
      meetingDate: mDate,
      meetingTime: mTime,
      transactionDate: date,
    });
    const subject = `✅ Meeting Confirmed — ${coins.toLocaleString()} Hushh Coins Used`;

    const result = await sendGmailEmail([recipientEmail], subject, html);

    if (!result.success) {
      console.error("❌ Deduction email error:", result.error);
      return new Response(JSON.stringify({ error: result.error || "Failed to send email" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Deduction email sent to ${recipientEmail}: ${coins} coins, messageId: ${result.messageId}`);
    return new Response(JSON.stringify({ success: true, message: "Deduction email sent", messageId: result.messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("❌ Deduction email error:", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to send email" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
