// public/sw.js

self.addEventListener('push', function(event) {
      console.log(event.data);

  if (!event.data) {
    console.log('[Service Worker] Push event received but had no data.');
    return;
  }

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'New Notification',
      body: event.data.text()
    };
  }

  const title = data.title || 'New Message';
  const options = {
    body: data.body || 'You have a new alert.',
    icon: data.icon || '/images/flag.jpg',
    badge: data.badge || '/images/flag.jpg',
    data: data.data || {},
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'Open App' }
    ]
  };

  if (self.Notification.permission !== 'granted') {
    console.warn('[Service Worker] Push event received, but notification permission is not granted.');
    return;
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        // Focus existing app instance
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
