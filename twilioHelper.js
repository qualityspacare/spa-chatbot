// twilioHelper.js
// Handles sending SMS notifications via Twilio when a lead is captured

const twilio = require('twilio');

const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER  = process.env.TWILIO_FROM_NUMBER;  // Your Twilio phone number
const OWNER_PHONE_NUMBER  = process.env.OWNER_PHONE_NUMBER;  // Brad's cell phone

/**
 * Returns true if all required Twilio env vars are configured.
 */
function isTwilioConfigured() {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER && OWNER_PHONE_NUMBER);
}

/**
 * Sends an SMS to the business owner with the captured lead info.
 *
 * @param {object} lead - { name, phone, city }
 * @returns {Promise<boolean>} true on success, false on failure
 */
async function sendLeadSMS(lead) {
  if (!isTwilioConfigured()) {
    console.warn('⚠️  Twilio is not configured. Skipping SMS. Check your .env file.');
    return false;
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  const messageBody =
    `🔔 New lead from your website chatbot!\n\n` +
    `👤 Name: ${lead.name}\n` +
    `📞 Phone: ${lead.phone}\n` +
    `📍 City: ${lead.city}\n\n` +
    `They reached out via the Quality Spa Care chatbot on qualityspacare.com`;

  try {
    const msg = await client.messages.create({
      body: messageBody,
      from: TWILIO_FROM_NUMBER,
      to:   OWNER_PHONE_NUMBER,
    });

    console.log(`📱  Lead SMS sent to owner. SID: ${msg.sid} | Name: ${lead.name} | City: ${lead.city}`);
    return true;

  } catch (err) {
    console.error('❌  Twilio SMS error:', err.message || err);
    return false;
  }
}

module.exports = { sendLeadSMS, isTwilioConfigured };
