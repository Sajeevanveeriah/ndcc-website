<?php
/**
 * NDCC – Order Handler
 * Accepts a JSON POST, saves the order to ndcc_orders, returns JSON.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

// Parse JSON body
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
    exit;
}

// Basic server-side validation
$name  = isset($data['name'])  ? trim($data['name'])  : '';
$email = isset($data['email']) ? trim($data['email']) : '';
$phone = isset($data['phone']) ? trim($data['phone']) : '';
$items = isset($data['items']) ? $data['items']       : [];

if ($name === '') {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'Name is required']);
    exit;
}
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'Valid email is required']);
    exit;
}

require_once __DIR__ . '/config.php';

try {
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);

    // Create table if it doesn't exist
    $pdo->exec("CREATE TABLE IF NOT EXISTS `ndcc_orders` (
        `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
        `name`         VARCHAR(255) NOT NULL,
        `email`        VARCHAR(255) NOT NULL,
        `phone`        VARCHAR(50)  NOT NULL DEFAULT '',
        `items`        LONGTEXT     NOT NULL,
        `processed`    TINYINT(1)   NOT NULL DEFAULT 0,
        `submitted_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $stmt = $pdo->prepare(
        "INSERT INTO `ndcc_orders` (`name`, `email`, `phone`, `items`)
         VALUES (:name, :email, :phone, :items)"
    );
    $stmt->execute([
        ':name'  => $name,
        ':email' => $email,
        ':phone' => $phone,
        ':items' => json_encode($items, JSON_UNESCAPED_UNICODE),
    ]);

    echo json_encode(['status' => 'ok']);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
}
