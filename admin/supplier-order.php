<?php
/**
 * NDCC Admin – Supplier Order Sheet
 * Aggregates unprocessed orders into a consolidated sheet for the kit supplier.
 * Password protected. Default password: ndcc2025
 * IMPORTANT: Change ADMIN_PASSWORD to match admin/orders.php before deploying.
 */

// ── CHANGE THIS PASSWORD (keep in sync with admin/orders.php) ────────────────
define('ADMIN_PASSWORD', 'ndcc2025');
// ─────────────────────────────────────────────────────────────────────────────

session_start();

// Handle logout
if (isset($_GET['logout'])) {
    $_SESSION['ndcc_admin_ok'] = false;
    session_destroy();
    header('Location: supplier-order.php');
    exit;
}

// Handle login
$login_error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if ($_POST['password'] === ADMIN_PASSWORD) {
        $_SESSION['ndcc_admin_ok'] = true;
        header('Location: supplier-order.php');
        exit;
    } else {
        $login_error = 'Incorrect password.';
    }
}

$authenticated = isset($_SESSION['ndcc_admin_ok']) && $_SESSION['ndcc_admin_ok'];

// ── Data ─────────────────────────────────────────────────────────────────────
$now         = date('Y-m-d H:i:s');
$today       = date('Y-m-d');
$order_count = 0;
$personalised = [];   // key => [item, size, back_number, back_name, qty]
$stock        = [];   // key => [item, size, qty]
$db_error     = '';

if ($authenticated) {
    require_once dirname(__DIR__) . '/config.php';
    try {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        $rows = $pdo->query(
            "SELECT `items` FROM `ndcc_orders` WHERE `processed` = 0 ORDER BY `submitted_at` ASC"
        )->fetchAll();

        $order_count = count($rows);

        foreach ($rows as $row) {
            $items = json_decode($row['items'], true);
            if (!is_array($items)) {
                continue;
            }
            foreach ($items as $item) {
                $name = trim($item['item'] ?? '');
                $size = trim($item['size'] ?? '');
                $qty  = max(1, (int)($item['qty'] ?? 1));
                $bn   = trim($item['back_number'] ?? '');
                $bna  = trim($item['back_name']   ?? '');

                if ($bn !== '' || $bna !== '') {
                    // Personalised: aggregate per unique combination
                    $key = $name . '||' . $size . '||' . $bn . '||' . $bna;
                    if (!isset($personalised[$key])) {
                        $personalised[$key] = [
                            'item'        => $name,
                            'size'        => $size,
                            'back_number' => $bn,
                            'back_name'   => $bna,
                            'qty'         => 0,
                        ];
                    }
                    $personalised[$key]['qty'] += $qty;
                } else {
                    // Stock: aggregate per item + size
                    $key = $name . '||' . $size;
                    if (!isset($stock[$key])) {
                        $stock[$key] = ['item' => $name, 'size' => $size, 'qty' => 0];
                    }
                    $stock[$key]['qty'] += $qty;
                }
            }
        }
    } catch (PDOException $e) {
        $db_error = $e->getMessage();
    }
}

// Sort both tables by item name then size
usort($personalised, function($a, $b) {
    $c = strcmp($a['item'], $b['item']);
    return $c !== 0 ? $c : strcmp($a['size'], $b['size']);
});
usort($stock, function($a, $b) {
    $c = strcmp($a['item'], $b['item']);
    return $c !== 0 ? $c : strcmp($a['size'], $b['size']);
});
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NDCC Supplier Order Sheet</title>
<style>
  /* ── Screen styles ── */
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4; color: #333; min-height: 100vh; }
  header { background: #800000; color: #fff; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
  header h1 { font-size: 1.2rem; font-weight: 700; }
  header nav { display: flex; gap: 20px; align-items: center; }
  header nav a { color: #ADD8E6; font-size: .85rem; text-decoration: none; }
  header nav a:hover { text-decoration: underline; }
  .login-wrap { display: flex; justify-content: center; align-items: center; min-height: calc(100vh - 56px); }
  .login-box { background: #fff; border-radius: 12px; padding: 40px 36px; box-shadow: 0 4px 24px rgba(0,0,0,.1); width: 100%; max-width: 360px; }
  .login-box h2 { font-size: 1.3rem; color: #800000; margin-bottom: 20px; }
  .login-box label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: 6px; color: #555; }
  .login-box input[type=password] { width: 100%; border: 1px solid #ccc; border-radius: 8px; padding: 10px 14px; font-size: .95rem; margin-bottom: 14px; }
  .login-box input[type=password]:focus { outline: none; border-color: #800000; }
  .btn { display: inline-block; padding: 10px 28px; background: #800000; color: #fff; font-size: .9rem; font-weight: 600; border: none; border-radius: 20px; cursor: pointer; transition: background .2s; text-decoration: none; }
  .btn:hover { background: #600000; }
  .error { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; border-radius: 8px; padding: 10px 14px; font-size: .85rem; margin-bottom: 14px; }
  .main { max-width: 960px; margin: 32px auto; padding: 0 24px 80px; }
  .page-header { margin-bottom: 24px; }
  .page-header h2 { font-size: 1.4rem; color: #800000; font-weight: 700; }
  .page-header p { font-size: .875rem; color: #555; margin-top: 4px; }
  .actions { display: flex; gap: 12px; margin-bottom: 28px; flex-wrap: wrap; }
  .btn-outline { display: inline-block; padding: 9px 22px; background: #fff; color: #800000; font-size: .85rem; font-weight: 600; border: 2px solid #800000; border-radius: 20px; cursor: pointer; transition: background .2s, color .2s; text-decoration: none; }
  .btn-outline:hover { background: #800000; color: #fff; }
  .section-title { font-size: 1rem; font-weight: 700; color: #800000; margin: 28px 0 10px; letter-spacing: .3px; }
  .section-title span { font-size: .8rem; font-weight: 400; color: #888; margin-left: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: .875rem; margin-bottom: 8px; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,.06); }
  thead th { background: #800000; color: #fff; padding: 11px 16px; text-align: left; font-weight: 600; white-space: nowrap; }
  tbody tr:nth-child(even) { background: #fafafa; }
  tbody tr { border-bottom: 1px solid #f0f0f0; }
  td { padding: 10px 16px; }
  .qty-cell { font-weight: 700; color: #800000; }
  .empty-note { font-size: .875rem; color: #999; padding: 16px 0; font-style: italic; }
  .db-error { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; font-size: .875rem; }

  /* ── Print styles: only show header text + tables ── */
  @media print {
    body { background: #fff; }
    header, .actions, .btn, .btn-outline { display: none !important; }
    .main { margin: 0; padding: 0; max-width: 100%; }
    .page-header { display: block !important; margin-bottom: 16px; }
    .page-header h2 { font-size: 16pt; }
    .page-header p  { font-size: 10pt; }
    table { box-shadow: none; border: 1px solid #ccc; }
    thead th { background: #800000 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .section-title { font-size: 12pt; margin-top: 20pt; }
    .empty-note { font-size: 9pt; }
  }
</style>
</head>
<body>
<header>
  <h1>NDCC Admin &mdash; Supplier Order Sheet</h1>
  <?php if ($authenticated): ?>
  <nav>
    <a href="orders.php">Orders</a>
    <a href="volunteers.php">Volunteers</a>
    <a href="?logout=1">Log out</a>
  </nav>
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

  <div class="page-header">
    <h2>NDCC Apparel Supplier Order</h2>
    <p>Batch generated: <?= htmlspecialchars($now) ?></p>
    <p>Unprocessed orders included: <strong><?= (int)$order_count ?></strong></p>
  </div>

  <div class="actions no-print">
    <button class="btn-outline" onclick="window.print()">&#128438; Print / Save as PDF</button>
    <button class="btn" onclick="downloadCSV()">&#11015; Download CSV</button>
  </div>

  <!-- Table A: Personalised Items -->
  <div class="section-title">
    Table A &mdash; Personalised Items
    <span>(jerseys / tops with back number or name)</span>
  </div>
  <?php if (empty($personalised)): ?>
    <p class="empty-note">No personalised items in unprocessed orders.</p>
  <?php else: ?>
  <table id="tbl-personalised">
    <thead>
      <tr>
        <th>Item</th>
        <th>Size</th>
        <th>Back Number</th>
        <th>Back Name</th>
        <th>Total Qty</th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($personalised as $p): ?>
      <tr>
        <td><?= htmlspecialchars($p['item']) ?></td>
        <td><?= htmlspecialchars($p['size']) ?></td>
        <td><?= htmlspecialchars($p['back_number'] ?: '—') ?></td>
        <td><?= htmlspecialchars($p['back_name']   ?: '—') ?></td>
        <td class="qty-cell"><?= (int)$p['qty'] ?></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
  <?php endif; ?>

  <!-- Table B: Stock Items -->
  <div class="section-title">
    Table B &mdash; Stock Items
    <span>(no personalisation required)</span>
  </div>
  <?php if (empty($stock)): ?>
    <p class="empty-note">No stock items in unprocessed orders.</p>
  <?php else: ?>
  <table id="tbl-stock">
    <thead>
      <tr>
        <th>Item</th>
        <th>Size</th>
        <th>Total Qty</th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($stock as $s): ?>
      <tr>
        <td><?= htmlspecialchars($s['item']) ?></td>
        <td><?= htmlspecialchars($s['size']) ?></td>
        <td class="qty-cell"><?= (int)$s['qty'] ?></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
  <?php endif; ?>

</div>

<script>
/* Inline JS data from PHP for CSV generation */
var csvMeta = {
  now:   <?= json_encode($now) ?>,
  count: <?= (int)$order_count ?>
};

var persData = <?= json_encode(array_values($personalised), JSON_UNESCAPED_UNICODE) ?>;
var stockData = <?= json_encode(array_values($stock), JSON_UNESCAPED_UNICODE) ?>;

function csvEscape(v) {
  v = String(v == null ? '' : v);
  if (v.indexOf(',') !== -1 || v.indexOf('"') !== -1 || v.indexOf('\n') !== -1) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function downloadCSV() {
  var lines = [];
  lines.push('NDCC Apparel Supplier Order');
  lines.push('Generated:,' + csvEscape(csvMeta.now));
  lines.push('Unprocessed Orders:,' + csvMeta.count);
  lines.push('');

  lines.push('Personalised Items');
  lines.push('Item,Size,Back Number,Back Name,Qty');
  persData.forEach(function(r) {
    lines.push([
      csvEscape(r.item),
      csvEscape(r.size),
      csvEscape(r.back_number || ''),
      csvEscape(r.back_name   || ''),
      r.qty
    ].join(','));
  });
  lines.push('');

  lines.push('Stock Items');
  lines.push('Item,Size,Qty');
  stockData.forEach(function(r) {
    lines.push([csvEscape(r.item), csvEscape(r.size), r.qty].join(','));
  });

  var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'NDCC_Apparel_Order_' + csvMeta.now.substring(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>
<?php endif; ?>
</body>
</html>
