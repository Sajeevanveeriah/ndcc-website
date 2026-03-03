<?php
/**
 * NDCC Admin – Orders
 * Password protected. Default password: ndcc2025
 * IMPORTANT: Change the password below before deploying to production.
 */

// ── CHANGE THIS PASSWORD ──────────────────────────────────────────────────────
define('ADMIN_PASSWORD', 'ndcc2025');
// ─────────────────────────────────────────────────────────────────────────────

session_start();

// Handle "mark as processed" AJAX action
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'mark_processed') {
    if (!isset($_SESSION['ndcc_admin_ok']) || !$_SESSION['ndcc_admin_ok']) {
        header('Content-Type: application/json');
        echo json_encode(['status' => 'error', 'message' => 'Not authenticated']);
        exit;
    }
    require_once dirname(__DIR__) . '/config.php';
    $id = isset($_POST['id']) ? (int)$_POST['id'] : 0;
    if ($id > 0) {
        try {
            $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $stmt = $pdo->prepare("UPDATE `ndcc_orders` SET `processed` = 1 WHERE `id` = :id");
            $stmt->execute([':id' => $id]);
            header('Content-Type: application/json');
            echo json_encode(['status' => 'ok']);
        } catch (PDOException $e) {
            header('Content-Type: application/json');
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
    }
    exit;
}

// Handle logout
if (isset($_GET['logout'])) {
    $_SESSION['ndcc_admin_ok'] = false;
    session_destroy();
    header('Location: orders.php');
    exit;
}

// Handle login
$login_error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if ($_POST['password'] === ADMIN_PASSWORD) {
        $_SESSION['ndcc_admin_ok'] = true;
        header('Location: orders.php');
        exit;
    } else {
        $login_error = 'Incorrect password.';
    }
}

$authenticated = isset($_SESSION['ndcc_admin_ok']) && $_SESSION['ndcc_admin_ok'];

$orders = [];
$db_error = '';

if ($authenticated) {
    require_once dirname(__DIR__) . '/config.php';
    try {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        // Ensure table exists (create if not)
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
        $orders = $pdo->query("SELECT * FROM `ndcc_orders` ORDER BY `submitted_at` DESC")->fetchAll();
    } catch (PDOException $e) {
        $db_error = $e->getMessage();
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NDCC Admin – Orders</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4; color: #333; min-height: 100vh; }
  header { background: #800000; color: #fff; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; }
  header h1 { font-size: 1.25rem; font-weight: 700; letter-spacing: .5px; }
  header a { color: #ADD8E6; font-size: .85rem; text-decoration: none; }
  header a:hover { text-decoration: underline; }
  .login-wrap { display: flex; justify-content: center; align-items: center; min-height: calc(100vh - 56px); }
  .login-box { background: #fff; border-radius: 12px; padding: 40px 36px; box-shadow: 0 4px 24px rgba(0,0,0,.1); width: 100%; max-width: 360px; }
  .login-box h2 { font-size: 1.3rem; color: #800000; margin-bottom: 20px; }
  .login-box label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: 6px; color: #555; }
  .login-box input[type=password] { width: 100%; border: 1px solid #ccc; border-radius: 8px; padding: 10px 14px; font-size: .95rem; margin-bottom: 14px; }
  .login-box input[type=password]:focus { outline: none; border-color: #800000; }
  .btn { display: inline-block; padding: 10px 28px; background: #800000; color: #fff; font-size: .9rem; font-weight: 600; border: none; border-radius: 20px; cursor: pointer; transition: background .2s; }
  .btn:hover { background: #600000; }
  .error { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; border-radius: 8px; padding: 10px 14px; font-size: .85rem; margin-bottom: 14px; }
  .main { max-width: 1200px; margin: 32px auto; padding: 0 24px 64px; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.07); overflow: hidden; }
  .card-head { padding: 20px 24px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; }
  .card-head h2 { font-size: 1.1rem; color: #800000; }
  .badge { background: #ADD8E6; color: #800000; font-size: .75rem; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
  .badge-done { background: #d1fae5; color: #065f46; font-size: .78rem; font-weight: 600; padding: 3px 10px; border-radius: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  thead th { background: #800000; color: #fff; padding: 12px 16px; text-align: left; font-weight: 600; white-space: nowrap; }
  tbody tr { border-bottom: 1px solid #f0f0f0; transition: background .15s; }
  tbody tr:hover { background: #fafafa; }
  tbody tr.processed td { opacity: .5; }
  tbody tr.processed td:first-child { text-decoration: line-through; }
  td { padding: 12px 16px; vertical-align: top; }
  .items-list { margin: 0; padding: 0; list-style: none; }
  .items-list li { padding: 2px 0; font-size: .82rem; color: #555; }
  .items-list li::before { content: "• "; color: #800000; }
  .pers-detail { color: #800000; font-size: .78rem; }
  .mark-btn { padding: 5px 14px; background: #ADD8E6; border: none; border-radius: 20px; font-size: .78rem; font-weight: 600; color: #800000; cursor: pointer; transition: background .2s; white-space: nowrap; }
  .mark-btn:hover { background: #8ec8da; }
  .mark-btn:disabled { opacity: .5; cursor: default; }
  .empty { text-align: center; padding: 48px 16px; color: #999; font-size: .95rem; }
  .db-error { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; font-size: .875rem; }
  .supplier-link { margin-top: 16px; text-align: right; font-size: .875rem; }
  .supplier-link a { color: #800000; font-weight: 600; text-decoration: none; }
  .supplier-link a:hover { text-decoration: underline; }
</style>
</head>
<body>
<header>
  <h1>NDCC Admin &mdash; Orders</h1>
  <?php if ($authenticated): ?>
    <a href="?logout=1">Log out</a>
  <?php endif; ?>
</header>

<?php if (!$authenticated): ?>
<div class="login-wrap">
  <div class="login-box">
    <h2>Admin Login</h2>
    <?php if ($login_error): ?><div class="error"><?= htmlspecialchars($login_error) ?></div><?php endif; ?>
    <form method="post">
      <label for="pw">Password</label>
      <input type="password" id="pw" name="password" autofocus required>
      <button type="submit" class="btn">Login</button>
    </form>
  </div>
</div>

<?php else: ?>
<div class="main">
  <?php if ($db_error): ?>
    <div class="db-error"><strong>Database error:</strong> <?= htmlspecialchars($db_error) ?></div>
  <?php endif; ?>

  <div class="card">
    <div class="card-head">
      <h2>All Orders</h2>
      <span class="badge"><?= count($orders) ?> total</span>
    </div>

    <?php if (empty($orders) && !$db_error): ?>
      <p class="empty">No orders yet.</p>
    <?php else: ?>
    <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Submitted</th>
          <th>Name</th>
          <th>Email</th>
          <th>Phone</th>
          <th>Items</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody id="orders-tbody">
        <?php foreach ($orders as $row): ?>
        <?php
          $items_raw = $row['items'];
          $items_arr = json_decode($items_raw, true);
          $is_processed = (int)$row['processed'] === 1;
        ?>
        <tr id="row-<?= (int)$row['id'] ?>" class="<?= $is_processed ? 'processed' : '' ?>">
          <td><?= (int)$row['id'] ?></td>
          <td style="white-space:nowrap"><?= htmlspecialchars($row['submitted_at']) ?></td>
          <td><?= htmlspecialchars($row['name']) ?></td>
          <td><a href="mailto:<?= htmlspecialchars($row['email']) ?>" style="color:#800000"><?= htmlspecialchars($row['email']) ?></a></td>
          <td><?= htmlspecialchars($row['phone'] ?: '—') ?></td>
          <td>
            <?php if (is_array($items_arr) && count($items_arr) > 0): ?>
            <ul class="items-list">
              <?php foreach ($items_arr as $item): ?>
              <?php
                $bn  = trim($item['back_number'] ?? '');
                $bna = trim($item['back_name']   ?? '');
                $has_pers = ($bn !== '' || $bna !== '');
              ?>
              <li>
                <?= htmlspecialchars($item['item'] ?? '') ?>
                <?php if (!empty($item['size'])): ?>(<?= htmlspecialchars($item['size']) ?>)<?php endif; ?>
                &times; <?= (int)($item['qty'] ?? 1) ?>
                <?php if (!empty($item['unit_price'])): ?>— $<?= htmlspecialchars($item['unit_price']) ?><?php endif; ?>
                <?php if ($has_pers): ?>
                  <span class="pers-detail">&nbsp;|&nbsp;Back&nbsp;#:&nbsp;<?= htmlspecialchars($bn ?: '—') ?>&nbsp;|&nbsp;Name:&nbsp;<?= htmlspecialchars($bna ?: '—') ?></span>
                <?php endif; ?>
              </li>
              <?php endforeach; ?>
            </ul>
            <?php else: ?>
            <span style="color:#999;font-size:.82rem;"><?= htmlspecialchars($items_raw) ?></span>
            <?php endif; ?>
          </td>
          <td>
            <?php if (!$is_processed): ?>
            <button class="mark-btn" data-id="<?= (int)$row['id'] ?>" onclick="markProcessed(this)">Mark processed</button>
            <?php else: ?>
            <span class="badge-done">Done</span>
            <?php endif; ?>
          </td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
    </div>
    <?php endif; ?>
  </div>

  <p class="supplier-link">
    <a href="supplier-order.php">&#128196; Generate Supplier Order Sheet &rarr;</a>
  </p>
</div>

<script>
function markProcessed(btn) {
  btn.disabled = true;
  btn.textContent = 'Saving…';
  var id = btn.getAttribute('data-id');
  var fd = new FormData();
  fd.append('action', 'mark_processed');
  fd.append('id', id);
  fetch('orders.php', { method: 'POST', body: fd })
    .then(function(r){ return r.json(); })
    .then(function(res) {
      if (res.status === 'ok') {
        var row = document.getElementById('row-' + id);
        row.classList.add('processed');
        btn.parentNode.innerHTML = '<span class="badge-done">Done</span>';
      } else {
        btn.disabled = false;
        btn.textContent = 'Mark processed';
        alert('Error: ' + (res.message || 'Unknown error'));
      }
    })
    .catch(function() {
      btn.disabled = false;
      btn.textContent = 'Mark processed';
      alert('Network error – please try again.');
    });
}
</script>
<?php endif; ?>
</body>
</html>
