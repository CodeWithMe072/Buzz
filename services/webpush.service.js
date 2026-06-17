import webpush from 'web-push';
import fs from 'fs';
import path from 'path';

let publicKey = process.env.VAPID_PUBLIC_KEY;
let privateKey = process.env.VAPID_PRIVATE_KEY;

if (publicKey) publicKey = publicKey.trim().replace(/^['"]|['"]$/g, '');
if (privateKey) privateKey = privateKey.trim().replace(/^['"]|['"]$/g, '');

if (!publicKey || !privateKey) {
  console.log('[WebPush] VAPID keys not found in environment. Generating new keys...');
  const keys = webpush.generateVAPIDKeys();
  publicKey = keys.publicKey;
  privateKey = keys.privateKey;

  try {
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    if (!envContent.includes('VAPID_PUBLIC_KEY')) {
      const newLines = `\n\n# VAPID Keys for Web Push Notifications\nVAPID_PUBLIC_KEY="${publicKey}"\nVAPID_PRIVATE_KEY="${privateKey}"\n`;
      fs.appendFileSync(envPath, newLines, 'utf8');
      console.log('[WebPush] Saved generated VAPID keys to .env');
    }
  } catch (err) {
    console.error('[WebPush] Failed to write VAPID keys to .env:', err.message);
  }

  process.env.VAPID_PUBLIC_KEY = publicKey;
  process.env.VAPID_PRIVATE_KEY = privateKey;
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@buzzchat.app',
  publicKey,
  privateKey
);

export const webpushService = {
  getPublicKey() {
    return publicKey;
  },

  async sendNotification(subscription, payload) {
    if (!subscription) return { success: false };
    try {
      const payloadString = typeof payload === 'object' ? JSON.stringify(payload) : payload;
      await webpush.sendNotification(subscription, payloadString);
      return { success: true };
    } catch (error) {
      console.error('[WebPush] Error sending notification:', error.message || error);
      if (error.statusCode) {
        console.error(`[WebPush] Service Response Code: ${error.statusCode}`);
        console.error(`[WebPush] Service Response Body: ${error.body}`);
      }
      return {
        success: false,
        statusCode: error.statusCode,
        shouldRemove: error.statusCode === 410 || error.statusCode === 404
      };
    }
  },

  formatMessageNotification(senderName, messageType, preview) {
    let typeIcon = '💬';
    if (messageType === 'image') typeIcon = '📷';
    if (messageType === 'video') typeIcon = '🎥';
    if (messageType === 'audio') typeIcon = '🎵';
    if (messageType === 'file') typeIcon = '📎';

    return {
      title: `New message from ${senderName}`,
      body: preview,
      icon: '/images/flag.jpg',
      badge: '/images/flag.jpg',
      data: {
        senderName,
        type: messageType,
        icon: typeIcon
      }
    };
  },

  formatCallNotification(senderName, callType) {
    const icon = callType === 'video' ? '📹' : '📞';
    return {
      title: `Incoming ${callType} call`,
      body: `${icon} Incoming ${callType} call from ${senderName}. Tap to answer.`,
      icon: '/images/flag.jpg',
      badge: '/images/flag.jpg',
      data: {
        senderName,
        type: 'call',
        callType
      }
    };
  }
};
