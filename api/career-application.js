const REQUIRED_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'collegeEmail',
  'officialEmail',
  'phone',
  'resumeLink',
  'college',
];

const ALLOWED_COLLEGES = new Set(['LPU', 'MIT']);

const sanitizeString = (value) =>
  typeof value === 'string' ? value.trim() : '';

const parseRequestBody = (body) => {
  if (!body) return {};

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error('Invalid JSON payload');
    }
  }

  return body;
};

// ✅ Email validation (global)
const isValidEmail = (email) => {
  const regex =
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;
  return regex.test(email);
};

// ✅ Phone validation (GLOBAL - E.164 format)
const isValidPhone = (phone) => {
  const cleaned = phone.replace(/\s|-/g, '');
  const regex = /^\+?[1-9]\d{7,14}$/;
  return regex.test(cleaned);
};

// ✅ URL validation
const isValidUrl = (value) => {
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol && parsed.host);
  } catch {
    return false;
  }
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = parseRequestBody(request.body);

    const sanitized = {
      firstName: sanitizeString(payload.firstName),
      lastName: sanitizeString(payload.lastName),
      email: sanitizeString(payload.email),
      collegeEmail: sanitizeString(payload.collegeEmail),
      officialEmail: sanitizeString(payload.officialEmail),
      phone: sanitizeString(payload.phone),
      resumeLink: sanitizeString(payload.resumeLink),
      college: sanitizeString(payload.college),
      collegeValue: sanitizeString(payload.collegeValue || payload.college),
      jobTitle: sanitizeString(payload.jobTitle),
      jobLocation: sanitizeString(payload.jobLocation),
      submittedAt: sanitizeString(payload.submittedAt),
    };

    // ✅ Required fields check
    const missingField = REQUIRED_FIELDS.find(
      (field) => !sanitized[field]
    );
    if (missingField) {
      return response
        .status(400)
        .json({ error: `Missing required field: ${missingField}` });
    }

    // ✅ College validation
    if (!ALLOWED_COLLEGES.has(sanitized.collegeValue)) {
      return response
        .status(400)
        .json({ error: 'Invalid college selection' });
    }

    // ✅ URL validation
    if (!isValidUrl(sanitized.resumeLink)) {
      return response
        .status(400)
        .json({ error: 'Invalid resume link' });
    }

    // ✅ Email validation
    if (!isValidEmail(sanitized.email)) {
      return response
        .status(400)
        .json({ error: 'Invalid personal email' });
    }

    if (!isValidEmail(sanitized.collegeEmail)) {
      return response
        .status(400)
        .json({ error: 'Invalid college email' });
    }

    if (!isValidEmail(sanitized.officialEmail)) {
      return response
        .status(400)
        .json({ error: 'Invalid official email' });
    }

    // ✅ Phone validation (GLOBAL)
    if (!isValidPhone(sanitized.phone)) {
      return response
        .status(400)
        .json({ error: 'Invalid phone number (use international format)' });
    }

    const submittedAt =
      sanitized.submittedAt || new Date().toISOString();

    const appsScriptUrl = sanitizeString(
      process.env.GOOGLE_APPS_SCRIPT_URL
    );

    if (!appsScriptUrl) {
      throw new Error('Missing GOOGLE_APPS_SCRIPT_URL');
    }

    const scriptResponse = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sanitized,
        submittedAt,
      }),
    });

    const responseText = await scriptResponse.text();
    let scriptResult;

    try {
      scriptResult = responseText
        ? JSON.parse(responseText)
        : null;
    } catch (parseError) {
      console.warn(
        'Unable to parse Apps Script response as JSON:',
        parseError
      );
    }

    const scriptSucceeded =
      scriptResponse.ok && (scriptResult?.success ?? true);

    if (!scriptSucceeded) {
      const message =
        scriptResult?.error ||
        scriptResult?.message ||
        (!scriptResponse.ok ? responseText : '') ||
        'Apps Script request failed';
      throw new Error(message);
    }

    return response.status(200).json({
      success: true,
      message: 'Application received and saved',
      data: {
        ...sanitized,
        submittedAt,
        appsScript: scriptResult,
      },
    });
  } catch (error) {
    console.error('Error processing application:', error);

    const message =
      error instanceof Error ? error.message : 'Unknown error';

    return response.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}