<?php

// Claves VAPID — se leen desde variables de entorno de Railway.
// En Railway: Settings → Variables → agregar VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Para generar las claves: php setup.php (localmente, una sola vez)

// MySQL — Railway inyecta automáticamente MYSQLDATABASE, MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD

$vapidSubject = getenv('VAPID_SUBJECT') ?: 'mailto:admin@example.com';
// Apple Web Push requiere que el subject sea mailto: o https: — agregar prefijo si falta
if (!str_starts_with($vapidSubject, 'mailto:') && !str_starts_with($vapidSubject, 'https:')) {
    $vapidSubject = 'mailto:' . $vapidSubject;
}

return [
    'vapid_public_key'  => getenv('VAPID_PUBLIC_KEY')  ?: '',
    'vapid_private_key' => getenv('VAPID_PRIVATE_KEY') ?: '',
    'vapid_subject'     => $vapidSubject,

    'db_host'     => getenv('MYSQLHOST')     ?: '127.0.0.1',
    'db_port'     => getenv('MYSQLPORT')     ?: '3306',
    'db_name'     => getenv('MYSQLDATABASE') ?: 'railway',
    'db_user'     => getenv('MYSQLUSER')     ?: 'root',
    'db_password' => getenv('MYSQLPASSWORD') ?: '',
];
