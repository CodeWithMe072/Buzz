// services/telegram.service.js

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE_URL || "https://api.telegram.org";

export const telegramService = {
  // Send notification to user with retry logic to handle ECONNRESET / network hiccups
  async sendNotification(telegramChatId, message, retries = 2) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.warn('[Telegram] Cannot send notification: TELEGRAM_BOT_TOKEN is not configured.');
      return false;
    }

    if (!telegramChatId) {
      return false;
    }

    const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Connection': 'close' // Avoid stale keep-alive socket reuse (prevents ECONNRESET on idle connections)
          },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: message,
            parse_mode: 'HTML'
          }),
          signal: AbortSignal.timeout(10000) // 10s timeout
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.ok) {
          console.error(`[Telegram] Send failed (attempt ${attempt}):`, data.description || response.statusText);
          // If Telegram API returned a 4xx client error (e.g., bot blocked by user, chat not found), don't retry
          if (response.status >= 400 && response.status < 500) {
            return false;
          }
        } else {
          return true;
        }
      } catch (error) {
        const isReset = error.code === 'ECONNRESET' || error.message?.includes('ECONNRESET');
        if (attempt <= retries) {
          console.warn(`[Telegram] Send attempt ${attempt} failed (${error.code || error.message}), retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          continue;
        }
        console.error('Telegram notification error:', error.message || error);
        return false;
      }
    }

    return false;
  },

  // Format notification message
  formatMessageNotification(senderName, messageType, preview) {
    let typeIcon = '💬';
    if (messageType === 'image') typeIcon = '📷';
    if (messageType === 'video') typeIcon = '🎥';
    if (messageType === 'audio') typeIcon = '🎵';
    if (messageType === 'file') typeIcon = '📎';

    return `${typeIcon} <b>New message from ${senderName}</b>\n\n${preview}`;
  }
};
