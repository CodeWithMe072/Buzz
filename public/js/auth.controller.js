let AUTH_API_URL = "/auth"

async function createUser(data) {
  let response = await fetch(`${AUTH_API_URL}/register`, {
    method: "POST",
    headers: {
      "Content-type": "application/json"
    },
    body: JSON.stringify({ ...data })
  })
  let Responsedata = await response.json()
  
  // 🔥 Link Telegram after successful registration
  if (response.status === 201 && Responsedata.user?.extra) {
    await linkTelegramAccount(Responsedata.user.extra);
  }
  
  return {Data: Responsedata, code: response.status}
}

async function loginuser(data) {
  let response = await fetch(`${AUTH_API_URL}/login`, {
    method: "POST",
    headers: {
      "Content-type": "application/json"
    },
    body: JSON.stringify({ ...data })
  })
  let Responsedata = await response.json()
  
  // 🔥 Link Telegram after successful login
  if (response.status === 200 && Responsedata.user?.extra) {
    await linkTelegramAccount(Responsedata.user.extra);
  }
  
  return {Data: Responsedata, code: response.status}
}

async function alluser() {
  let response = await fetch(`${AUTH_API_URL}/users`, {
    method: "GET",
    headers: {
      "Content-type": "application/json"
    }
  })
  let Responsedata = await response.json()
  return {Data: Responsedata, code: response.status}
}

// 🔥 NEW FUNCTION - Link Telegram using 'extra' field
async function linkTelegramAccount(userExtra) {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      console.log('Not running in Telegram');
      return;
    }

    const chatId = tg.initDataUnsafe?.user?.id;
    if (!chatId) {
      console.log('Could not get Telegram chat ID');
      return;
    }

    const response = await fetch(`${AUTH_API_URL}/link-telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        telegramChatId: chatId,
        extra: userExtra
      })
    });

    const data = await response.json();
    if (response.status === 200) {
      console.log('✅ Telegram linked successfully');
    }
  } catch (error) {
    console.error('Error linking Telegram:', error);
  }
}