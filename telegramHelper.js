// telegramHelper.js
// Sends lead notifications to the business owner via Telegram Bot API
// No extra libraries needed — uses built-in fetch (Node 18+)

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = '8681013480'; // Brad's Telegram chat ID

/**
 * Returns true if the bot token is configured.
 */
function isTelegramConfigured() {
  return !!TELEGRAM_BOT_TOKEN;
}

/**
 * Sends a lead notification message to the owner's Telegram chat.
 *
 * @param {{ name: string, phone: string, city: string }} lead
 * @returns {Promise<boolean>}
 */
async function sendLeadToTelegram(lead) {
  if (!isTelegramConfigured()) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN is not set. Check your environment variables.');
    return false;
  }

  const text =
    `🔔 New lead from your website chatbot!\n\n` +
    `👤 Name: ${lead.name}\n` +
    `📞 Phone: ${lead.phone}\n` +
    `📍 City: ${lead.city}\n\n` +
    `Reached out via qualityspacare.com`;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text:    text,
        }),
      }
    );

    const data = await response.json();

    if (data.ok) {
      console.log(`📨  Lead sent to Telegram! Name: ${lead.name} | Phone: ${lead.phone} | City: ${lead.city}`);
      return true;
    } else {
      console.error('❌  Telegram API error:', data.description);
      return false;
    }

  } catch (err) {
    console.error('❌  Telegram fetch error:', err.message || err);
    return false;
  }
}

module.exports = { sendLeadToTelegram, isTelegramConfigured };
