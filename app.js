// Si la app está en una subcarpeta, ajustá esta ruta. Ej: '/mypwa/api'
const API_URL = '/api';

const statusEl         = document.getElementById('status');
const subscribeBtn     = document.getElementById('subscribe-btn');
const notifyBtn        = document.getElementById('notify-btn');
const subscribeGroupEl = document.getElementById('subscribe-group');
const senderNameEl     = document.getElementById('sender-name');

let currentGroup = null;

let swRegistration = null;

// Detecta si el usuario está en iOS
function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Detecta si la PWA está instalada (añadida a la pantalla de inicio)
function isInstalledPWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
}

async function init() {
    if (!('serviceWorker' in navigator)) {
        statusEl.textContent = 'Service Workers no soportados en este navegador.';
        return;
    }
    if (!('PushManager' in window)) {
        if (isIOS() && !isInstalledPWA()) {
            statusEl.innerHTML =
                '📱 <strong>iPhone:</strong> Para recibir notificaciones push tenés que ' +
                'primero <strong>agregar esta app a la pantalla de inicio</strong>: ' +
                'tocá el botón Compartir (⎙) → "Agregar a pantalla de inicio".';
        } else {
            statusEl.textContent = 'Push API no soportada en este navegador.';
        }
        return;
    }

    try {
        await navigator.serviceWorker.register('/sw.js');
        swRegistration = await navigator.serviceWorker.ready;
        statusEl.textContent = 'Elegí tu grupo y activá las notificaciones.';
        subscribeGroupEl.disabled = false;
        subscribeBtn.disabled = false;
        senderNameEl.disabled = false;
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

async function setupPush(groupName) {
    const permission = await Notification.requestPermission();

    if (permission === 'denied') {
        statusEl.textContent = 'Permiso denegado. Andá a Ajustes → [nombre de la app] → Notificaciones y activalo.';
        return false;
    }

    if (permission !== 'granted') {
        statusEl.textContent = 'No se otorgó el permiso de notificaciones.';
        return false;
    }

    try {
        const reg = await navigator.serviceWorker.ready;

        let subscription = null;
        try {
            subscription = await reg.pushManager.getSubscription();
        } catch (_) {
            // Estado inconsistente: se descarta y se crea una suscripción nueva
            subscription = null;
        }

        if (!subscription) {
            const vapidPublicKey = await getVapidPublicKey();
            subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
            });
        }

        const subData = JSON.parse(JSON.stringify(subscription));
        const res = await fetch(`${API_URL}/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...subData, groupName }),
        });

        if (!res.ok) {
            statusEl.textContent = 'Error al registrar la suscripción en el servidor.';
            return false;
        }
    } catch (err) {
        statusEl.textContent = `Error al suscribirse: ${err.message}`;
        console.error(err);
        return false;
    }

    currentGroup = groupName;
    const label = { rojo: '🔴 Rojo', azul: '🔵 Azul', verde: '🟢 Verde' }[groupName] ?? groupName;
    statusEl.textContent = `✓ Suscripto al grupo ${label}.`;
    notifyBtn.disabled = false;
    return true;
}

subscribeBtn.addEventListener('click', async () => {
    const groupName = subscribeGroupEl.value;
    subscribeBtn.disabled = true;
    subscribeBtn.textContent = 'Activando...';
    statusEl.textContent = '';
    const ok = await setupPush(groupName);
    subscribeBtn.disabled = false;
    subscribeBtn.textContent = 'Activar notificaciones';
    if (!ok && !statusEl.textContent) statusEl.textContent = 'No se pudo suscribir.';
});

notifyBtn.addEventListener('click', async () => {
    if (!currentGroup) {
        statusEl.textContent = 'Primero suscribite a un grupo.';
        return;
    }
    const groupName = currentGroup;
    notifyBtn.disabled = true;
    notifyBtn.textContent = 'Enviando...';
    statusEl.textContent = '';

    try {
        const subscription = await swRegistration.pushManager.getSubscription();
        const senderName = senderNameEl.value.trim() || 'Alguien';
        const res = await fetch(`${API_URL}/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                groupName,
                senderName,
                senderEndpoint: subscription ? subscription.endpoint : null,
            }),
        });
        let data;
        try {
            data = await res.json();
        } catch {
            const text = await res.text().catch(() => '(sin respuesta)');
            statusEl.textContent = `Error del servidor (${res.status}): ${text.substring(0, 150)}`;
            return;
        }

        if (res.ok) {
            const label = { rojo: '🔴 Rojo', azul: '🔵 Azul', verde: '🟢 Verde' }[groupName] ?? groupName;
            const detail = data.details ? data.details.join(' | ') : '';
            statusEl.textContent = `Enviada al grupo ${label} (${data.sent} ok, ${data.failed} fail) ${detail}`;
        } else {
            statusEl.textContent = data.error || 'Error al enviar la notificación.';
        }
    } catch (err) {
        statusEl.textContent = `Error de red: ${err.message}`;
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
