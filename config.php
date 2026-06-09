<?php

// Claves VAPID — se leen desde variables de entorno de Railway.
// En Railway: Settings → Variables → agregar VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Para generar las claves: php setup.php (localmente, una sola vez)

return [
    'vapid_public_key'  => getenv('VAPID_PUBLIC_KEY')  ?: '',
    'vapid_private_key' => getenv('VAPID_PRIVATE_KEY') ?: '',
    'vapid_subject'     => getenv('VAPID_SUBJECT')     ?: 'mailto:admin@example.com',
];
