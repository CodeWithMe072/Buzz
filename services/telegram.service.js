// services/telegram.service.js
import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

export const telegramService = {
  // Send notification to user
  async sendNotification(telegramChatId, message) {
    try {
      await bot.sendMessage(telegramChatId, message, {
        parse_mode: 'HTML'
      });
      return true;
    } catch (error) {

      
      console.error('Telegram notification error:', error);
      return false;
    }
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