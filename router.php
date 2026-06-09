<?php

declare(strict_types=1);

$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

// Redirigir /api/* al backend Slim
if (str_starts_with($uri, '/api')) {
    require __DIR__ . '/api/index.php';
    return true;
}

// Dejar que el servidor built-in sirva archivos estáticos directamente
if ($uri !== '/' && file_exists(__DIR__ . $uri)) {
    return false;
}

// Cualquier otra ruta sirve index.html (SPA fallback)
header('Content-Type: text/html; charset=utf-8');
readfile(__DIR__ . '/index.html');
return true;
