import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { collectInlineAssets } from "../_shared/emailInlineAssets.ts";
import { base64urlEncode, createRelatedEmailMessage } from "../_shared/emailMime.ts";
import { buildCoinsCreditEmailHtml, COINS_CREDIT_INLINE_ASSET_KEYS } from "./template.ts";

/**
 * Coins Credit Notification — Sends NDA-style email when Hushh Coins are credited
 * Uses Gmail API with Service Account (Domain-Wide Delegation)
 * Same pattern as nda-signed-notification
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Gmail API Helpers (same as NDA notification) ───

async function createSignedJWT(
  serviceAccountEmail: string,
  privateKey: string,
  userToImpersonate: string,
  scopes: string[]
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccountEmail,
    sub: userToImpersonate,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: scopes.join(" "),
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
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  return `${signatureInput}.${base64urlEncode(new Uint8Array(signature))}`;
}

async function getAccessToken(
  serviceAccountEmail: string,
  privateKey: string,
  userToImpersonate: string
): Promise<string> {
  const signedJwt = await createSignedJWT(
    serviceAccountEmail, privateKey, userToImpersonate,
    ["https://www.googleapis.com/auth/gmail.send"]
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });

  if (!response.ok) throw new Error(`Failed to get access token: ${await response.text()}`);
  return (await response.json()).access_token;
}

async function sendGmailEmail(
  recipients: string[],
  subject: string,
  htmlContent: string
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
      inlineAssets: collectInlineAssets(COINS_CREDIT_INLINE_ASSET_KEYS),
    });

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: base64urlEncode(rawMessage) }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Gmail API error: ${error}` };
    }

    const result = await response.json();
    return { success: true, messageId: result.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ─── Main Handler ───

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { recipientEmail, recipientName, coinsAwarded } = await req.json();

    if (!recipientEmail || !coinsAwarded) {
      return new Response(JSON.stringify({ error: "Missing recipientEmail or coinsAwarded" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = recipientName || "Hushh User";
    const coins = Number(coinsAwarded) || 300000;
    const date = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const html = buildCoinsCreditEmailHtml({
      recipientName: name,
      coinsAwarded: coins,
      dateLabel: date,
    });
    const subject = `🪙 ${coins.toLocaleString()} Hushh Coins Credited to Your Account`;

    // Send to the recipient
    const result = await sendGmailEmail([recipientEmail], subject, html);

    if (!result.success) {
      console.error("❌ Coins credit email error:", result.error);
      return new Response(JSON.stringify({ error: result.error || "Failed to send email" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Coins email sent to ${recipientEmail}: ${coins} coins, messageId: ${result.messageId}`);

    return new Response(JSON.stringify({ success: true, message: "Coins credit email sent", messageId: result.messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("❌ Coins email error:", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to send email" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
