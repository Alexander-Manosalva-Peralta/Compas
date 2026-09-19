/* =========================================================
   UNIFLOW — Service Worker (PWA / PWABuilder / Web Push)
   Manejo de caché offline, eventos push remotos y
   notificaciones nativas para Android / APK.
   ========================================================= */

const CACHE = 'uniflow-shell-v4';

const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/store.js',
  './js/smart.js',
  './js/notifications.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './screenshots/desktop.png',
  './screenshots/mobile.png'
];

/* 1. Instalación: precargar recursos esenciales */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(async (cache) => {
        for (const url of SHELL) {
          try {
            await cache.add(url);
          } catch (err) {
            console.warn('[SW] No se pudo cachear recurso durante install:', url, err);
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

/* 2. Activación: limpiar cachés antiguas y tomar control inmediato */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* 3. Estrategia de red: Red primero, respaldo en caché para offline */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const copy = response.clone();
        caches.open(CACHE).then((cache) => {
          cache.put(event.request, copy);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

/* 4. Evento PUSH (Recepción de notificaciones remotas estilo WhatsApp) */
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload = { title: 'UniFlow 🧭', body: event.data.text() };
    }
  }

  const title = payload.title || 'UniFlow 🧭 — Recordatorio';
  const options = {
    body: payload.body || 'Tienes un aviso académico pendiente.',
    icon: payload.icon || 'icons/icon-192.png',
    badge: payload.badge || 'icons/icon-192.png',
    vibrate: payload.vibrate || [200, 100, 200, 100, 200],
    tag: payload.tag || ('uniflow-' + Date.now()),
    renotify: true,
    requireInteraction: true,
    data: {
      url: payload.url || './index.html',
      taskId: payload.taskId || null,
      date: Date.now()
    },
    actions: [
      { action: 'view', title: '👀 Ver pendiente' },
      { action: 'close', title: 'Entendido' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* 5. Clic en la notificación */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || './index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si la ventana ya existe, enfocarla y avisar qué tarea abrir
      for (const client of windowClients) {
        if (client.url && client.url.includes('index.html') && 'focus' in client) {
          if (notifData.taskId) {
            client.postMessage({ type: 'COMPAS_HIGHLIGHT_TASK', taskId: notifData.taskId });
          }
          return client.focus();
        }
      }
      // Si está cerrada, abrir la app
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

/* 6. Mensajería local (Para pruebas o disparos inmediatos desde la app) */
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    const finalOptions = Object.assign({
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      vibrate: [200, 100, 200, 100, 200],
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: 'view', title: '👀 Abrir UniFlow' },
        { action: 'close', title: 'Descartar' }
      ]
    }, options);

    event.waitUntil(self.registration.showNotification(title, finalOptions));
  } else if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});