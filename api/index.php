<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use Slim\Factory\AppFactory;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

$config = require __DIR__ . '/../config.php';

// Conexión PDO a MySQL
$dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
    $config['db_host'],
    $config['db_port'],
    $config['db_name']
);
$pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

// Crear tabla si no existe
$pdo->exec("
    CREATE TABLE IF NOT EXISTS subscriptions (
        id       INT AUTO_INCREMENT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        data     JSON NOT NULL,
        UNIQUE KEY uq_endpoint (endpoint(500))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

$app = AppFactory::create();

$app->setBasePath('/api');

$app->add(function (Request $request, $handler) {
    $response = $handler->handle($request);
    return $response
        ->withHeader('Access-Control-Allow-Origin', '*')
        ->withHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        ->withHeader('Access-Control-Allow-Headers', 'Content-Type');
});

$app->options('/{routes:.+}', function (Request $request, Response $response) {
    return $response;
});

// GET /api/public-key
$app->get('/public-key', function (Request $request, Response $response) use ($config) {
    $response->getBody()->write(json_encode(['publicKey' => $config['vapid_public_key']]));
    return $response->withHeader('Content-Type', 'application/json');
});

// POST /api/subscribe
$app->post('/subscribe', function (Request $request, Response $response) use ($pdo) {
    $data = json_decode((string) $request->getBody(), true);

    if (empty($data['endpoint'])) {
        $response->getBody()->write(json_encode(['error' => 'Datos de suscripción inválidos']));
        return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
    }

    $stmt = $pdo->prepare('
        INSERT INTO subscriptions (endpoint, data)
        VALUES (:endpoint, :data)
        ON DUPLICATE KEY UPDATE data = VALUES(data)
    ');
    $stmt->execute([
        ':endpoint' => $data['endpoint'],
        ':data'     => json_encode($data),
    ]);

    $response->getBody()->write(json_encode(['success' => true]));
    return $response->withHeader('Content-Type', 'application/json');
});

// POST /api/notify
$app->post('/notify', function (Request $request, Response $response) use ($config, $pdo) {
    $rows = $pdo->query('SELECT id, endpoint, data FROM subscriptions')->fetchAll();

    if (empty($rows)) {
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

    $indexById = [];
    foreach ($rows as $row) {
        $sub = json_decode($row['data'], true);
        $webPush->queueNotification(Subscription::create($sub), $payload);
        $indexById[$row['endpoint']] = $row['id'];
    }

    $sent            = 0;
    $failedIds       = [];

    foreach ($webPush->flush() as $report) {
        if ($report->isSuccess()) {
            $sent++;
        } else {
            $ep = $report->getEndpoint();
            if (isset($indexById[$ep])) {
                $failedIds[] = $indexById[$ep];
            }
        }
    }

    // Eliminar suscripciones vencidas o inválidas
    if (!empty($failedIds)) {
        $placeholders = implode(',', array_fill(0, count($failedIds), '?'));
        $pdo->prepare("DELETE FROM subscriptions WHERE id IN ($placeholders)")->execute($failedIds);
    }

    $response->getBody()->write(json_encode(['sent' => $sent, 'failed' => count($failedIds)]));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->run();
