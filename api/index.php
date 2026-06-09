<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use Slim\Factory\AppFactory;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

$config      = require __DIR__ . '/../config.php';
$storageFile = __DIR__ . '/../storage/subscriptions.json';

// Crear directorio de storage si no existe
$storageDir = dirname($storageFile);
if (!is_dir($storageDir)) {
    mkdir($storageDir, 0755, true);
}

$app = AppFactory::create();

// Base path fijo para el router de Railway (PHP built-in server + router.php)
$app->setBasePath('/api');

// Middleware CORS (necesario si el frontend se sirve desde otro origen en desarrollo)
$app->add(function (Request $request, $handler) {
    $response = $handler->handle($request);
    return $response
        ->withHeader('Access-Control-Allow-Origin', '*')
        ->withHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        ->withHeader('Access-Control-Allow-Headers', 'Content-Type');
});

// Responder preflight OPTIONS
$app->options('/{routes:.+}', function (Request $request, Response $response) {
    return $response;
});

// GET /api/public-key — devuelve la clave VAPID pública al frontend
$app->get('/public-key', function (Request $request, Response $response) use ($config) {
    $response->getBody()->write(json_encode(['publicKey' => $config['vapid_public_key']]));
    return $response->withHeader('Content-Type', 'application/json');
});

// POST /api/subscribe — registra la suscripción push del dispositivo
$app->post('/subscribe', function (Request $request, Response $response) use ($storageFile) {
    $data = json_decode((string) $request->getBody(), true);

    if (empty($data['endpoint'])) {
        $response->getBody()->write(json_encode(['error' => 'Datos de suscripción inválidos']));
        return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
    }

    $subscriptions = file_exists($storageFile)
        ? (json_decode(file_get_contents($storageFile), true) ?? [])
        : [];

    // Evitar duplicados por endpoint
    $alreadyExists = array_filter($subscriptions, fn($s) => $s['endpoint'] === $data['endpoint']);
    if (empty($alreadyExists)) {
        $subscriptions[] = $data;
        file_put_contents($storageFile, json_encode($subscriptions, JSON_PRETTY_PRINT));
    }

    $response->getBody()->write(json_encode(['success' => true]));
    return $response->withHeader('Content-Type', 'application/json');
});

// POST /api/notify — envía una notificación push a todos los suscriptores
$app->post('/notify', function (Request $request, Response $response) use ($config, $storageFile) {
    $subscriptions = file_exists($storageFile)
        ? (json_decode(file_get_contents($storageFile), true) ?? [])
        : [];

    if (empty($subscriptions)) {
        $response->getBody()->write(json_encode(['error' => 'No hay suscriptores registrados']));
        return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
    }

    $webPush = new WebPush([
        'VAPID' => [
            'subject'    => $config['vapid_subject'],
            'publicKey'  => $config['vapid_public_key'],
            'privateKey' => $config['vapid_private_key'],
        ],
    ]);

    $payload = json_encode([
        'title' => '¡Notificación push!',
        'body'  => 'Botón presionado. ¡Funciona!',
    ]);

    foreach ($subscriptions as $sub) {
        $webPush->queueNotification(Subscription::create($sub), $payload);
    }

    $sent            = 0;
    $failedEndpoints = [];

    foreach ($webPush->flush() as $report) {
        if ($report->isSuccess()) {
            $sent++;
        } else {
            // Suscripción vencida o inválida — la removemos
            $failedEndpoints[] = $report->getEndpoint();
        }
    }

    // Limpiar suscripciones fallidas del storage
    if (!empty($failedEndpoints)) {
        $subscriptions = array_values(
            array_filter($subscriptions, fn($s) => !in_array($s['endpoint'], $failedEndpoints, true))
        );
        file_put_contents($storageFile, json_encode($subscriptions, JSON_PRETTY_PRINT));
    }

    $response->getBody()->write(json_encode(['sent' => $sent, 'failed' => count($failedEndpoints)]));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->run();
