// Si la app está en una subcarpeta, ajustá esta ruta. Ej: '/mypwa/api'
const API_URL = '/api';

const statusEl  = document.getElementById('status');
const notifyBtn = document.getElementById('notify-btn');

let swRegistration = null;

async function init() {
    if (!('serviceWorker' in navigator)) {
        statusEl.textContent = 'Service Workers no soportados en este navegador.';
        return;
    }
    if (!('PushManager' in window)) {
        statusEl.textContent = 'Push API no soportada en este navegador.';
        return;
    }

    try {
        swRegistration = await navigator.serviceWorker.register('/sw.js');
        statusEl.textContent = 'Registrando suscripción...';
        await setupPush();
    } catch (err) {
        statusEl.textContent = 'Error al registrar el Service Worker.';
        console.error(err);
    }
}

async function getVapidPublicKey() {
    const res = await fetch(`${API_URL}/public-key`);
    if (!res.ok) throw new Error('No se pudo obtener la clave VAPID del servidor.');
    const data = await res.json();
    return data.publicKey;
}

async function setupPush() {
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
        statusEl.textContent = 'Permiso de notificaciones denegado.';
        return;
    }

    let subscription = await swRegistration.pushManager.getSubscription();

    if (!subscription) {
        const vapidPublicKey = await getVapidPublicKey();

        subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        const res = await fetch(`${API_URL}/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription),
        });

        if (!res.ok) {
            statusEl.textContent = 'Error al registrar la suscripción.';
            return;
        }
    }

    statusEl.textContent = '¡Listo! Presioná el botón para recibir una notificación.';
    notifyBtn.disabled = false;
}

notifyBtn.addEventListener('click', async () => {
    notifyBtn.disabled = true;
    notifyBtn.textContent = 'Enviando...';
    statusEl.textContent = '';

    try {
        const res = await fetch(`${API_URL}/notify`, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            statusEl.textContent = `Notificación enviada (${data.sent} dispositivo/s).`;
        } else {
            statusEl.textContent = data.error || 'Error al enviar la notificación.';
        }
    } catch (err) {
        statusEl.textContent = 'Error de red. Revisá la consola.';
        console.error(err);
    } finally {
        notifyBtn.disabled = false;
        notifyBtn.textContent = 'Enviar notificación';
    }
});

// Convierte la clave VAPID de base64url a Uint8Array (requerido por la Push API)
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const output  = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
        output[i] = rawData.charCodeAt(i);
    }
    return output;
}

init();
