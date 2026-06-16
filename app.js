// Si la app está en una subcarpeta, ajustá esta ruta. Ej: '/mypwa/api'
const API_URL = '/api';

const statusEl         = document.getElementById('status');
const activateBtn      = document.getElementById('activate-btn');
const joinGroupBtn     = document.getElementById('join-group-btn');
const notifyBtn        = document.getElementById('notify-btn');
const subscribeGroupEl = document.getElementById('subscribe-group');
const senderNameEl     = document.getElementById('sender-name');

let currentGroup       = null;
let deferredInstall    = null;
let swRegistration     = null;

// Captura el evento de instalación (Android/Chrome)
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    const section = document.getElementById('install-section');
    const btn     = document.getElementById('install-btn');
    if (section && btn) {
        section.style.display = '';
        btn.style.display     = '';
    }
});

// Oculta el botón si el usuario ya instaló la app
window.addEventListener('appinstalled', () => {
    const section = document.getElementById('install-section');
    if (section) section.style.display = 'none';
    deferredInstall = null;
});

const installBtn = document.getElementById('install-btn');
if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredInstall) return;
        deferredInstall.prompt();
        const { outcome } = await deferredInstall.userChoice;
        if (outcome === 'accepted') {
            const section = document.getElementById('install-section');
            if (section) section.style.display = 'none';
        }
        deferredInstall = null;
    });
}

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
            // Muestra instrucciones de instalación iOS
            const section  = document.getElementById('install-section');
            const iosMsg   = document.getElementById('install-ios');
            const installB = document.getElementById('install-btn');
            if (section) section.style.display = '';
            if (iosMsg)  iosMsg.style.display   = '';
            if (installB) installB.style.display = 'none';
            statusEl.textContent = 'Instalá la app para recibir notificaciones.';
        } else {
            statusEl.textContent = 'Push API no soportada en este navegador.';
        }
        return;
    }

    try {
        await navigator.serviceWorker.register('/sw.js');
        swRegistration = await navigator.serviceWorker.ready;
        subscribeGroupEl.disabled = false;
        senderNameEl.disabled = false;

        // Restaurar estado si la suscripción sigue activa
        let existingSub = null;
        try { existingSub = await swRegistration.pushManager.getSubscription(); } catch (_) {}
        const savedGroup = localStorage.getItem('currentGroup');

        if (existingSub) {
            // Notificaciones ya activas: ocultar botón de activar
            document.getElementById('activate-section').style.display = 'none';
            joinGroupBtn.disabled = false;
            if (savedGroup) {
                currentGroup = savedGroup;
                const label = { rojo: '🔴 Rojo', azul: '🔵 Azul', verde: '🟢 Verde' }[savedGroup] ?? savedGroup;
                statusEl.textContent = `✓ Suscripto al grupo ${label}.`;
                notifyBtn.disabled = false;
            } else {
                statusEl.textContent = 'Elegí tu grupo para continuar.';
            }
        } else {
            activateBtn.disabled = false;
            statusEl.textContent = 'Primero activá las notificaciones.';
        }
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

async function activatePush() {
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
        try { subscription = await reg.pushManager.getSubscription(); } catch (_) {}
        if (subscription) {
            try { await subscription.unsubscribe(); } catch (_) {}
        }

        const vapidPublicKey = await getVapidPublicKey();
        let freshReg = reg;
        try {
            await freshReg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
            });
        } catch (_) {
            await freshReg.unregister();
            await navigator.serviceWorker.register('/sw.js');
            freshReg = await navigator.serviceWorker.ready;
            await freshReg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
            });
        }
    } catch (err) {
        statusEl.textContent = `Error al activar notificaciones: ${err.message}`;
        console.error(err);
        return false;
    }

    // Ocultar botón de activar y habilitar selector de grupo
    document.getElementById('activate-section').style.display = 'none';
    joinGroupBtn.disabled = false;
    statusEl.textContent = '✓ Notificaciones activadas. Ahora elegí un grupo.';
    return true;
}

async function joinGroup(groupName) {
    try {
        const reg = await navigator.serviceWorker.ready;
        const subscription = await reg.pushManager.getSubscription();

        if (!subscription) {
            statusEl.textContent = 'Primero activá las notificaciones.';
            return false;
        }

        const subData = JSON.parse(JSON.stringify(subscription));
        const res = await fetch(`${API_URL}/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...subData, groupName }),
        });

        if (!res.ok) {
            statusEl.textContent = 'Error al unirse al grupo.';
            return false;
        }
    } catch (err) {
        statusEl.textContent = `Error al unirse al grupo: ${err.message}`;
        console.error(err);
        return false;
    }

    currentGroup = groupName;
    localStorage.setItem('currentGroup', groupName);
    const label = { rojo: '🔴 Rojo', azul: '🔵 Azul', verde: '🟢 Verde' }[groupName] ?? groupName;
    statusEl.textContent = `✓ Unido al grupo ${label}.`;
    notifyBtn.disabled = false;
    return true;
}

activateBtn.addEventListener('click', async () => {
    activateBtn.disabled = true;
    activateBtn.textContent = 'Activando...';
    statusEl.textContent = '';
    const ok = await activatePush();
    if (!ok) {
        activateBtn.disabled = false;
        activateBtn.textContent = 'Activar notificaciones';
    }
});

joinGroupBtn.addEventListener('click', async () => {
    const groupName = subscribeGroupEl.value;
    joinGroupBtn.disabled = true;
    joinGroupBtn.textContent = 'Uniéndome...';
    statusEl.textContent = '';
    const ok = await joinGroup(groupName);
    joinGroupBtn.disabled = false;
    joinGroupBtn.textContent = 'Unirme al grupo';
    if (!ok && !statusEl.textContent) statusEl.textContent = 'No se pudo unir al grupo.';
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
