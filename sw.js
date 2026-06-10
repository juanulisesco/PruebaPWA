const CACHE_NAME = 'push-pwa-v5';
const ASSETS = ['/index.html', '/style.css', '/app.js', '/manifest.json'];

// Instalación: pre-cachear archivos estáticos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activación: eliminar caches viejos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// Fetch: responder desde cache, luego red
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
});

// Push: mostrar la notificación al recibir el evento
self.addEventListener('push', (event) => {
    let title = 'Push PWA';
    let body  = '¡Nueva notificación!';

    try {
        if (event.data) {
            const data = event.data.json();
            title = data.title || title;
            body  = data.body  || body;
        }
    } catch (e) {
        // Si el payload no es JSON válido, usar valores por defecto
    }

    // iOS requiere que se llame a showNotification *dentro* de event.waitUntil
    // y necesita que la promesa no se resuelva antes de mostrar la notificación.
    const options = {
        body: body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: '/' },
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Click en la notificación: abrir la app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});
