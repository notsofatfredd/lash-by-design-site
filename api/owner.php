<?php
declare(strict_types=1);
/* Owner API for The Lash Bed (owner/). Every call: ?a=<action>, header X-LBD: 1, JSON body for POSTs. */
require __DIR__ . '/lib.php';

owner();
if (($_SERVER['HTTP_X_LBD'] ?? '') !== '1') fail('Missing header.', 400);
same_origin();
$a = (string)($_GET['a'] ?? '');
$post = $_SERVER['REQUEST_METHOD'] === 'POST';
$in = $post ? body() : [];
$pdo = db();
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');

if ($a === 'login') {
    if (!$post) fail('POST only.', 405);
    $since = time() - 900;
    $pdo->prepare('DELETE FROM logins WHERE at < ?')->execute([$since]);
    $n = $pdo->prepare('SELECT COUNT(*) FROM logins WHERE ip = ?');
    $n->execute([$ip]);
    if ((int)$n->fetchColumn() >= 8) fail('Too many tries. Wait 15 minutes.', 429);
    $hash = (string)cfg('owner_password_hash');
    if ($hash === '') fail('Owner password not set up yet (api/secret.php).', 503);
    if (!password_verify((string)($in['password'] ?? ''), $hash)) {
        $pdo->prepare('INSERT INTO logins(ip, at) VALUES(?, ?)')->execute([$ip, time()]);
        fail('That password is not right.', 401);
    }
    session_regenerate_id(true);
    $_SESSION['owner'] = true;
    out(['ok' => true]);
}
if ($a === 'logout') { $_SESSION = []; session_destroy(); out(['ok' => true]); }
if (empty($_SESSION['owner'])) fail('Please log in.', 401);
if ($a === 'me') out(['ok' => true]);

$STATUSES = ['awaiting_deposit', 'booked', 'arrived', 'done', 'cancelled', 'no_show'];
$day = fn($v) => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$v) ? (string)$v : null;
$at = fn($v) => preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', (string)$v) ? (string)$v : null;

switch ($a) {
    case 'agenda': {   // GET from, to (inclusive dates)
        $from = $day($_GET['from'] ?? '') ?? date('Y-m-d');
        $to = $day($_GET['to'] ?? '') ?? $from;
        $q = $pdo->prepare("SELECT b.*, c.patch_tested_at, c.lash_map FROM bookings b LEFT JOIN clients c ON c.phone = b.phone
                            WHERE b.start_at >= ? AND b.start_at <= ? ORDER BY b.start_at");
        $q->execute(["$from 00:00", "$to 23:59"]);
        $bl = $pdo->prepare('SELECT * FROM blocks WHERE start_at <= ? AND end_at >= ? ORDER BY start_at');
        $bl->execute(["$to 23:59", "$from 00:00"]);
        out(['ok' => true, 'bookings' => $q->fetchAll(), 'blocks' => $bl->fetchAll()]);
    }
    case 'status': {   // POST id, status
        $st = (string)($in['status'] ?? '');
        if (!$post || !in_array($st, $STATUSES, true)) fail('Bad status.');
        $b = $pdo->prepare('SELECT * FROM bookings WHERE id = ?');
        $b->execute([(int)($in['id'] ?? 0)]);
        $row = $b->fetch();
        if (!$row) fail('Not found.', 404);
        $pdo->prepare('UPDATE bookings SET status = ? WHERE id = ?')->execute([$st, $row['id']]);
        if ($st === 'done' && $row['service_id'] === 'patch') {
            $pdo->prepare('UPDATE clients SET patch_tested_at = ? WHERE phone = ?')->execute([substr($row['start_at'], 0, 10), $row['phone']]);
        }
        out(['ok' => true]);
    }
    case 'reminded': {   // POST id: the owner tapped the WhatsApp reminder
        $pdo->prepare('UPDATE bookings SET reminded_at = ? WHERE id = ?')->execute([date('Y-m-d H:i'), (int)($in['id'] ?? 0)]);
        out(['ok' => true]);
    }
    case 'add': {   // POST service, start, name, phone, notes: phone or walk-in bookings, owner may overlap on purpose
        $sv = service((string)($in['service'] ?? ''));
        $start = $at($in['start'] ?? '');
        $phone = phone_norm((string)($in['phone'] ?? ''));
        $name = line($in['name'] ?? '', 80);
        if (!$post || !$sv || !$start || strlen($phone) < 9 || $name === '') fail('Service, time, name and cell are needed.');
        $now = date('Y-m-d H:i:s');
        $pdo->prepare('INSERT OR IGNORE INTO clients(phone, name, created_at) VALUES(?,?,?)')->execute([$phone, $name, $now]);
        $pdo->prepare("INSERT INTO bookings(ref, service_id, service_name, minutes, start_at, end_at, phone, name, notes, status, created_at)
                       VALUES(?,?,?,?,?,?,?,?,?,'booked',?)")
            ->execute(['LBD-' . strtoupper(bin2hex(random_bytes(3))), $sv['id'], $sv['name'], $sv['minutes'], $start,
                       date('Y-m-d H:i', strtotime($start) + 60 * (int)$sv['minutes']), $phone, $name, line($in['notes'] ?? '', 300) ?: null, $now]);
        out(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
    }
    case 'clients': {   // GET q
        $q = '%' . line($_GET['q'] ?? '', 60) . '%';
        $s = $pdo->prepare("SELECT c.*, (SELECT MAX(start_at) FROM bookings b WHERE b.phone = c.phone AND b.status = 'done') AS last_visit
                            FROM clients c WHERE c.name LIKE ? OR c.phone LIKE ? ORDER BY c.name LIMIT 60");
        $s->execute([$q, $q]);
        out(['ok' => true, 'clients' => $s->fetchAll()]);
    }
    case 'client': {
        $phone = phone_norm((string)($post ? ($in['phone'] ?? '') : ($_GET['phone'] ?? '')));
        if ($post) {   // POST phone, patch_tested_at?, patch_notes, lash_map, notes
            $pt = $day($in['patch_tested_at'] ?? '');
            $pdo->prepare('UPDATE clients SET patch_tested_at = ?, patch_notes = ?, lash_map = ?, notes = ? WHERE phone = ?')
                ->execute([$pt, mb_substr((string)($in['patch_notes'] ?? ''), 0, 500) ?: null, mb_substr((string)($in['lash_map'] ?? ''), 0, 500) ?: null,
                           mb_substr((string)($in['notes'] ?? ''), 0, 1500) ?: null, $phone]);
            out(['ok' => true]);
        }
        $c = $pdo->prepare('SELECT * FROM clients WHERE phone = ?');
        $c->execute([$phone]);
        $client = $c->fetch();
        if (!$client) fail('Not found.', 404);
        $h = $pdo->prepare('SELECT id, ref, service_name, start_at, status FROM bookings WHERE phone = ? ORDER BY start_at DESC LIMIT 40');
        $h->execute([$phone]);
        out(['ok' => true, 'client' => $client, 'history' => $h->fetchAll()]);
    }
    case 'infills': {   // clients whose last set/infill was done 14+ days ago and who have nothing booked
        [$soon] = studio()['infillAfterDays'] ?? [14, 21];
        $sets = array_values(array_filter(array_map(fn($s) => $s['id'], studio()['services'] ?? []), fn($id) => $id !== 'lift'));
        $in_ = implode(',', array_fill(0, count($sets), '?'));
        $s = $pdo->prepare("SELECT c.phone, c.name, MAX(b.start_at) AS last_at FROM clients c JOIN bookings b ON b.phone = c.phone
                            WHERE b.status = 'done' AND b.service_id IN ($in_) GROUP BY c.phone
                            HAVING last_at <= ? AND NOT EXISTS (SELECT 1 FROM bookings f WHERE f.phone = c.phone AND f.start_at > ? AND f.status IN ('booked','awaiting_deposit'))
                            ORDER BY last_at");
        $s->execute(array_merge($sets, [date('Y-m-d 23:59', strtotime("-$soon days")), date('Y-m-d H:i')]));
        $rows = array_map(function ($r) { $r['days'] = (int)floor((time() - strtotime($r['last_at'])) / 86400); return $r; }, $s->fetchAll());
        out(['ok' => true, 'due' => $rows]);
    }
    case 'block': {   // POST start, end, reason
        $s = $at($in['start'] ?? ''); $e = $at($in['end'] ?? '');
        if (!$post || !$s || !$e || $e <= $s) fail('Start and end are needed.');
        $pdo->prepare('INSERT INTO blocks(start_at, end_at, reason) VALUES(?,?,?)')->execute([$s, $e, line($in['reason'] ?? '', 120) ?: null]);
        out(['ok' => true]);
    }
    case 'unblock': {
        $pdo->prepare('DELETE FROM blocks WHERE id = ?')->execute([(int)($in['id'] ?? 0)]);
        out(['ok' => true]);
    }
}
fail('Unknown action.', 404);
