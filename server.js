// server.js
// Quality Spa Care and Repair — AI Chatbot Backend
// Node.js + Express + Anthropic Claude + Telegram Lead Capture

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT } = require('./systemPrompt');
const { sendLeadToTelegram, isTelegramConfigured } = require('./telegramHelper');

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://www.qualityspacare.com';

// Max messages to retain per session (keeps costs low, preserves context)
const MAX_HISTORY_LENGTH = 20; // 10 exchanges (user + assistant pairs)

// Auto-expire sessions after this many milliseconds of inactivity (1 hour)
const SESSION_TTL_MS = 60 * 60 * 1000;

// Regex to extract the hidden lead data tag Claude embeds in its response
// Matches: [LEAD_CAPTURED:{"name":"...","phone":"...","city":"..."}]
const LEAD_TAG_REGEX = /\[LEAD_CAPTURED:(\{[^}]+\})\]/;

if (!ANTHROPIC_API_KEY) {
  console.error('❌  ANTHROPIC_API_KEY is not set. Please check your .env file or environment variables.');
  process.exit(1);
}

// ─── Anthropic Client ─────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ─── Session Store ────────────────────────────────────────────────────────────
// In-memory store: { [sessionId]: { messages: [], lastActive: Date, leadCaptured: bool } }
// For production at scale, replace with Redis; for most small sites this is fine.

const sessions = new Map();

/**
 * Get or create a session's message history.
 */
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      messages: [],
      lastActive: Date.now(),
      leadCaptured: false,   // Ensures we only send the SMS once per visitor
    });
  }
  const session = sessions.get(sessionId);
  session.lastActive = Date.now();
  return session;
}

/**
 * Append a message to the session history and trim to max length.
 */
function addMessage(sessionId, role, content) {
  const session = getSession(sessionId);
  session.messages.push({ role, content });

  // Keep only the most recent MAX_HISTORY_LENGTH messages
  if (session.messages.length > MAX_HISTORY_LENGTH) {
    session.messages = session.messages.slice(session.messages.length - MAX_HISTORY_LENGTH);
  }
}

/**
 * Periodically clean up expired sessions to prevent memory leaks.
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActive > SESSION_TTL_MS) {
      sessions.delete(id);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹  Cleaned up ${cleaned} expired session(s). Active sessions: ${sessions.size}`);
  }
}, 15 * 60 * 1000); // Run cleanup every 15 minutes

// ─── Lead Tag Parsing ─────────────────────────────────────────────────────────

/**
 * Check if Claude's response contains the hidden [LEAD_CAPTURED:{...}] tag.
 * Returns the parsed lead object if found, or null if not present.
 *
 * @param {string} text - Raw assistant response text
 * @returns {{ name: string, phone: string, city: string } | null}
 */
function extractLeadFromText(text) {
  const match = text.match(LEAD_TAG_REGEX);
  if (!match) return null;

  try {
    const lead = JSON.parse(match[1]);
    // Only return if all three fields are present and non-empty
    if (lead.name && lead.phone && lead.city) {
      return lead;
    }
  } catch (e) {
    console.warn('⚠️  Failed to parse LEAD_CAPTURED tag JSON:', match[1]);
  }
  return null;
}

/**
 * Strip the hidden [LEAD_CAPTURED:{...}] tag from the text before sending to the user.
 * The customer should never see this technical marker.
 *
 * @param {string} text
 * @returns {string}
 */
function stripLeadTag(text) {
  return text.replace(LEAD_TAG_REGEX, '').trim();
}

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();

// CORS — allow requests from the Squarespace site (and localhost for testing)
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      ALLOWED_ORIGIN,
      'http://localhost:3000',
      'http://localhost:8080',
      'http://127.0.0.1:5500', // Live Server (VS Code)
    ];
    // Allow requests with no origin (e.g. Postman, server-to-server)
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: origin ${origin} is not allowed.`));
    }
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Quality Spa Care Chatbot API',
    version: '2.0.0',
    activeSessions: sessions.size,
    telegramConfigured: isTelegramConfigured(),
  });
});

// ─── POST /predict ────────────────────────────────────────────────────────────

/**
 * Main chat endpoint.
 *
 * Request body:  { sessionId: string, message: string }
 * Response body: { text: string }
 */
app.post('/predict', async (req, res) => {
  const { sessionId, message } = req.body;

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
    return res.status(400).json({ error: 'sessionId is required and must be a non-empty string.' });
  }

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'message is required and must be a non-empty string.' });
  }

  // Basic length guard — prevent abuse
  if (message.length > 2000) {
    return res.status(400).json({ error: 'message is too long (max 2000 characters).' });
  }

  const sanitizedSessionId = sessionId.trim().substring(0, 128);
  const sanitizedMessage   = message.trim();

  // ── Add user message to history ─────────────────────────────────────────────
  addMessage(sanitizedSessionId, 'user', sanitizedMessage);

  const session = getSession(sanitizedSessionId);

  try {
    // ── Call Claude ──────────────────────────────────────────────────────────
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',  // Fast + affordable; change to claude-sonnet-4-5-20250929 for more power
      max_tokens: 600,                    // Slightly higher to allow room for the LEAD_CAPTURED tag
      system: SYSTEM_PROMPT,
      messages: session.messages,         // Full conversation history for this session
    });

    const rawText = response.content[0]?.text ?? "I'm sorry, I couldn't generate a response. Please try again.";

    // ── Check for lead capture tag ───────────────────────────────────────────
    if (!session.leadCaptured) {
      const lead = extractLeadFromText(rawText);

      if (lead) {
        session.leadCaptured = true; // Mark session so we don't double-send
        console.log(`🎯  Lead captured! Name: ${lead.name} | Phone: ${lead.phone} | City: ${lead.city}`);

        // Fire to Telegram — non-blocking, we don't await this before responding
        sendLeadToTelegram(lead).catch(err =>
          console.error('Telegram send failed (non-fatal):', err.message)
        );
      }
    }

    // ── Strip the hidden tag before sending text to the user ─────────────────
    const cleanText = stripLeadTag(rawText);

    // ── Save assistant reply to history (store clean version) ───────────────
    addMessage(sanitizedSessionId, 'assistant', cleanText);

    console.log(`✅  [${sanitizedSessionId.substring(0, 8)}...] User: "${sanitizedMessage.substring(0, 60)}..." → ${cleanText.length} chars`);

    return res.json({ text: cleanText });

  } catch (err) {
    console.error('❌  Anthropic API error:', err.message || err);

    // Remove the user message we just added so the session stays clean
    session.messages.pop();

    // Return a friendly error to the frontend
    return res.status(502).json({
      error: 'The AI service is temporarily unavailable. Please try again in a moment.',
    });
  }
});

// ─── Optional: Clear a session ───────────────────────────────────────────────

app.post('/reset', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
    return res.json({ success: true, message: 'Session cleared.' });
  }
  return res.json({ success: false, message: 'Session not found.' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀  Quality Spa Care Chatbot API running on port ${PORT}`);
  console.log(`🌐  CORS allowed origin: ${ALLOWED_ORIGIN}`);
  console.log(`🔑  Anthropic API key:   ${ANTHROPIC_API_KEY ? '✅ loaded' : '❌ MISSING'}`);
  console.log(`📨  Telegram bot:        ${isTelegramConfigured() ? '✅ configured' : '⚠️  not configured (leads will log only)'}\n`);
});
