// NDA Signed Notification Service
// Sends email notification to manish@hushh.ai and ankit@hushh.ai when user signs NDA
// Uses Gmail API with Service Account (Domain-Wide Delegation)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { collectInlineAssets } from "../_shared/emailInlineAssets.ts";
import { base64urlEncode, createMixedEmailMessage, createRelatedEmailMessage } from "../_shared/emailMime.ts";
import { buildNDANotificationHtml, NDA_INLINE_ASSET_KEYS } from "./template.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Recipients for NDA notifications
const NDA_NOTIFICATION_RECIPIENTS = [
  'manish@hushh.ai',
  'ankit@hushh.ai',
  'neelesh1@hushh.ai'
];

interface NDANotificationPayload {
  signerName: string;
  signerEmail: string;
  signedAt: string;
  ndaVersion: string;
  signerIp?: string;
  pdfUrl?: string;
  pdfBase64?: string;
  userId?: string;
  documentsAcknowledged?: string[];
}

/**
 * Create a signed JWT for Google Service Account authentication
 */
async function createSignedJWT(
  serviceAccountEmail: string,
  privateKey: string,
  userToImpersonate: string,
  scopes: string[]
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccountEmail,
    sub: userToImpersonate,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: exp,
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
    "pkcs8",
    privateKeyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  const encodedSignature = base64urlEncode(new Uint8Array(signature));
  return `${signatureInput}.${encodedSignature}`;
}

/**
 * Get an access token using the Service Account JWT
 */
async function getAccessToken(
  serviceAccountEmail: string,
  privateKey: string,
  userToImpersonate: string
): Promise<string> {
  const scopes = ["https://www.googleapis.com/auth/gmail.send"];

  const signedJwt = await createSignedJWT(
    serviceAccountEmail,
    privateKey,
    userToImpersonate,
    scopes
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Create RFC 2822 formatted email with optional PDF attachment
 */
function createEmailMessage(
  from: string,
  recipients: string[],
  subject: string,
  htmlContent: string,
  pdfBase64?: string,
  pdfFileName?: string
): string {
  const inlineAssets = collectInlineAssets(NDA_INLINE_ASSET_KEYS);

  if (pdfBase64 && pdfFileName) {
    return createMixedEmailMessage({
      fromLabel: "Hushh NDA Notifications",
      fromEmail: from,
      recipients,
      subject,
      htmlContent,
      inlineAssets,
      attachments: [
        {
          filename: pdfFileName,
          mimeType: "application/pdf",
          base64Data: pdfBase64,
        },
      ],
    });
  }

  return createRelatedEmailMessage({
    fromLabel: "Hushh NDA Notifications",
    fromEmail: from,
    recipients,
    subject,
    htmlContent,
    inlineAssets,
  });
}

/**
 * Send email using Gmail API
 */
async function sendGmailEmail(
  recipients: string[],
  subject: string,
  htmlContent: string,
  pdfBase64?: string,
  pdfFileName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY");
    const senderEmail = Deno.env.get("GMAIL_SENDER_EMAIL") || "ankit@hushh.ai";

    if (!serviceAccountEmail || !privateKey) {
      return { success: false, error: "Missing Google Service Account credentials" };
    }

    const formattedPrivateKey = privateKey.replace(/\\n/g, "\n");

    console.log(`Sending NDA notification email from ${senderEmail} to ${recipients.join(", ")}`);

    const accessToken = await getAccessToken(
      serviceAccountEmail,
      formattedPrivateKey,
      senderEmail
    );

    const rawMessage = createEmailMessage(
      senderEmail,
      recipients,
      subject,
      htmlContent,
      pdfBase64,
      pdfFileName
    );

    const encodedMessage = base64urlEncode(rawMessage);

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encodedMessage }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Gmail API error:", error);
      return { success: false, error: `Gmail API error: ${error}` };
    }

    const result = await response.json();
    console.log(`NDA notification sent successfully, message ID: ${result.id}`);
    return { success: true, messageId: result.id };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: NDANotificationPayload = await req.json();
    
    const { 
      signerName, 
      signerEmail, 
      signedAt, 
      ndaVersion, 
      signerIp = 'Unknown',
      pdfUrl,
      pdfBase64,
      userId,
      documentsAcknowledged = []
    } = payload;

    if (!signerName || !signerEmail) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: signerName, signerEmail' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format the signed date
    const signedDate = new Date(signedAt).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'long',
    });

    const subject = `[Hushh NDA] Agreement Signed by ${signerName}`;
    const html = buildNDANotificationHtml({
      signerName,
      signerEmail,
      signedDate,
      ndaVersion,
      signerIp,
      pdfUrl,
      pdfBase64,
      userId,
      documentsAcknowledged,
    });

    // Prepare PDF attachment info
    let pdfFileName: string | undefined;
    if (pdfBase64) {
      const safeFileName = signerName.replace(/[^a-zA-Z0-9]/g, '_');
      pdfFileName = `NDA_${safeFileName}_${new Date().toISOString().split('T')[0]}.pdf`;
    }

    // Send email
    const result = await sendGmailEmail(
      NDA_NOTIFICATION_RECIPIENTS,
      subject,
      html,
      pdfBase64,
      pdfFileName
    );

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`NDA notification sent for: ${signerName} (${signerEmail})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `NDA notification sent to ${NDA_NOTIFICATION_RECIPIENTS.join(', ')}`,
        recipients: NDA_NOTIFICATION_RECIPIENTS,
        messageId: result.messageId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('NDA notification error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to send NDA notification' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
