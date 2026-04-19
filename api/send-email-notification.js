import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';

/* ---------------- REDIS ---------------- */
const redis = new Redis(process.env.REDIS_URL);

/* ---------------- CORS ---------------- */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* ---------------- RATE LIMIT ---------------- */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60; // seconds

async function rateLimit(ip) {
  const key = `rate:${ip}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW);
  }

  return count <= RATE_LIMIT_MAX;
}

/* ---------------- VALIDATION ---------------- */
const ALLOWED_TYPES = new Set(['profile_view', 'payment_received']);

function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-zA-Z0-9-_]{3,50}$/.test(slug);
}

/* ---------------- SUPABASE ---------------- */
function createSupabaseAdminClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function resolvePublicProfileOwner(slug) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from('investor_profiles')
    .select('email, name')
    .eq('slug', slug)
    .eq('is_public', true)
    .eq('user_confirmed', true)
    .maybeSingle();

  if (error || !data?.email) {
    throw new Error('Profile not found');
  }

  return {
    email: data.email,
    name: data.name || 'Your Profile',
  };
}

/* ---------------- EMAIL TEMPLATES ---------------- */

function profileViewTemplate(name, slug) {
  const viewTime = new Date().toLocaleString();

  return {
    subject: `👀 New Profile View - ${name}`,
    html: `
      <div style="font-family: sans-serif; max-width:600px;">
        <h2 style="color:#0A84FF;">👀 Someone viewed your profile</h2>

        <div style="background:#F8FAFC;padding:20px;border-radius:8px;">
          <p><strong>Profile:</strong> ${name}</p>
          <p><strong>Time:</strong> ${viewTime}</p>
          <p><strong>Visitor:</strong> Anonymous</p>
        </div>

        <a href="https://hushhtech.com/investor/${slug}" 
           style="display:inline-block;margin-top:15px;padding:10px 20px;
                  background:#0A84FF;color:white;text-decoration:none;border-radius:6px;">
          View Profile →
        </a>
      </div>
    `,
  };
}

function paymentTemplate(name, slug) {
  const time = new Date().toLocaleString();

  return {
    subject: `💰 Payment Received`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;">
        <h2 style="color:#34C759;">💰 Payment Received</h2>

        <div style="background:#F0F9FF;padding:20px;border-radius:8px;">
          <p><strong>Amount:</strong> $1.00</p>
          <p><strong>Profile:</strong> ${name}</p>
          <p><strong>Time:</strong> ${time}</p>
        </div>

        <a href="https://hushhtech.com/investor/${slug}" 
           style="display:inline-block;margin-top:15px;padding:10px 20px;
                  background:#34C759;color:white;text-decoration:none;border-radius:6px;">
          View Profile →
        </a>
      </div>
    `,
  };
}

/* ---------------- HANDLER ---------------- */
export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!(await rateLimit(ip))) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { type, slug, profileOwnerEmail, profileName, testEmail } = req.body;

    /* -------- VALIDATION -------- */
    if (!ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }

    if (!isValidSlug(slug)) {
      return res.status(400).json({ error: 'Invalid slug format' });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    /* -------- TEST EMAIL -------- */
    if (testEmail) {
      await transporter.sendMail({
        from: `"Hushh Notifications" <${process.env.GMAIL_USER}>`,
        to: testEmail,
        subject: 'Test Email',
        html: '<p>Email system working</p>',
      });

      return res.status(200).json({ success: true });
    }

    /* -------- RESOLVE USER -------- */
    let email = profileOwnerEmail;
    let name = profileName || 'Your Profile';

    if (!email) {
      const owner = await resolvePublicProfileOwner(slug);
      email = owner.email;
      name = owner.name;
    }

    /* -------- TEMPLATE SELECT -------- */
    let template;

    if (type === 'profile_view') {
      template = profileViewTemplate(name, slug);
    }

    if (type === 'payment_received') {
      template = paymentTemplate(name, slug);
    }

    /* -------- SEND EMAIL -------- */
    await transporter.sendMail({
      from: `"Hushh Notifications" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: template.subject,
      html: template.html,
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Email error:', error);

    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}