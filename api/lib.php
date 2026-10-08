<?php
declare(strict_types=1);
/* Lash by Design booking backend: shared helpers.
   Storage: SQLite (PDO). Settings: ../studio.json (public facts) + secret.php (keys, never in git). */

date_default_timezone_set('Africa/Johannesburg');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, max-age=0');

const LBD_ROOT = __DIR__ . '/..';
$secretFile = __DIR__ . '/secret.php';
$LBD = is_file($secretFile) ? require $secretFile : [];
$LBD += [
    'owner_password_hash' => '',          // password_hash('...', PASSWORD_DEFAULT)
    'notify_email' => '',                 // where new bookings are emailed
    'mail_from' => '',                    // a mailbox on the site's own domain
    'data_dir' => __DIR__ . '/../data',   // ideally outside public_html
    'site_hosts' => ['lashbydesign.co.za', 'www.lashbydesign.co.za'], // browser Origins allowed to book
    'site_url' => 'https://lashbydesign.co.za',
    'yoco_secret_key' => '',              // sk_live_... (empty = deposits off)
    'yoco_webhook_secret' => '',          // whsec_...
];

function cfg(string $k) { global $LBD; return $LBD[$k] ?? null; }

function studio(): array {
    static $s = null;
    if ($s === null) $s = json_decode((string)file_get_contents(LBD_ROOT . '/studio.json'), true) ?: [];
    return $s;
}

function service(string $id): ?array {
    if ($id === 'patch') return ['id' => 'patch', 'name' => 'Patch test', 'minutes' => (int)(studio()['patchTest']['minutes'] ?? 15), 'price' => null];
    foreach (studio()['services'] ?? [] as $sv) if ($sv['id'] === $id) return $sv;
    return null;
}

function out($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $msg, int $code = 400): void { out(['ok' => false, 'error' => $msg], $code); }

function body(): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 20000) fail('Request too large.', 413);
    $j = json_decode((string)file_get_contents('php://input'), true);
    return is_array($j) ? $j : [];
}

function same_origin(): void {
    $hosts = cfg('site_hosts');
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === '' || !$hosts) return;
    $h = strtolower((string)parse_url($origin, PHP_URL_HOST));
    if (!in_array($h, $hosts, true)) fail('Not allowed.', 403);
}

function line(?string $v, int $max = 200): string {
    $v = str_replace(["\r", "\n"], ' ', (string)$v);
    return mb_substr(trim((string)preg_replace('/[\x00-\x1F\x7F]/u', '', $v)), 0, $max);
}

function phone_norm(string $p): string {
    $d = preg_replace('/\D/', '', $p);
    if (strlen($d) === 10 && $d[0] === '0') $d = '27' . substr($d, 1);
    return $d;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $dir = cfg('data_dir');
    if (!is_dir($dir)) { @mkdir($dir, 0750, true); }
    if (!is_file($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
    $pdo = new PDO('sqlite:' . $dir . '/lbd.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=4000; PRAGMA foreign_keys=ON;');
    $pdo->exec("CREATE TABLE IF NOT EXISTS bookings(
        id INTEGER PRIMARY KEY, ref TEXT NOT NULL, service_id TEXT NOT NULL, service_name TEXT NOT NULL, minutes INTEGER NOT NULL,
        start_at TEXT NOT NULL, end_at TEXT NOT NULL, bed INTEGER NOT NULL DEFAULT 1,
        phone TEXT NOT NULL, name TEXT NOT NULL, email TEXT, notes TEXT,
        status TEXT NOT NULL DEFAULT 'pending', deposit_cents INTEGER, yoco_checkout_id TEXT, reminded_at TEXT,
        created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS bk_start ON bookings(start_at);
      CREATE INDEX IF NOT EXISTS bk_ref ON bookings(ref);
      CREATE TABLE IF NOT EXISTS clients(
        phone TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, patch_tested_at TEXT, patch_notes TEXT,
        lash_map TEXT, notes TEXT, consent_at TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS logins(ip TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS blocks(id INTEGER PRIMARY KEY, start_at TEXT NOT NULL, end_at TEXT NOT NULL, reason TEXT);");
    return $pdo;
}

/** SQL filter for bookings that hold their time: not cancelled, and unpaid deposit holds lapse after 30 minutes. */
function live_sql(): string {
    $cut = date('Y-m-d H:i:s', time() - 1800);
    return "(status NOT IN ('cancelled','no_show') AND NOT (status = 'awaiting_deposit' AND created_at < '$cut'))";
}

/** Open start times ("H:i") on a date for a service length. */
function open_slots(string $date, int $minutes): array {
    $s = studio();
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return [];
    $day = strtolower(date('D', strtotime($date)));
    $hrs = $s['hours'][$day] ?? null;
    if (!$hrs) return [];
    $first = strtotime('today') ; $last = strtotime('+' . (int)($s['bookAheadDays'] ?? 42) . ' days', $first);
    $t0 = strtotime($date . ' 00:00');
    if ($t0 < $first || $t0 > $last) return [];
    $open = strtotime("$date {$hrs[0]}"); $close = strtotime("$date {$hrs[1]}");
    $earliest = time() + 3600 * (int)($s['minNoticeHours'] ?? 12);
    $step = 60 * (int)($s['slotStepMinutes'] ?? 30);
    $beds = max(1, (int)($s['beds'] ?? 1));
    $q = db()->prepare("SELECT start_at, end_at FROM bookings WHERE " . live_sql() . " AND start_at < ? AND end_at > ?
                        UNION ALL SELECT start_at, end_at FROM blocks WHERE start_at < ? AND end_at > ?");
    $q->execute(["$date 23:59", "$date 00:00", "$date 23:59", "$date 00:00"]);
    $busy = array_map(fn($r) => [strtotime($r['start_at']), strtotime($r['end_at'])], $q->fetchAll());
    $out = [];
    for ($t = $open; $t + $minutes * 60 <= $close; $t += $step) {
        if ($t < $earliest) continue;
        $e = $t + $minutes * 60; $n = 0;
        foreach ($busy as [$a, $b]) if ($a < $e && $b > $t) $n++;
        if ($n < $beds) $out[] = date('H:i', $t);
    }
    return $out;
}

function slot_free(string $startAt, int $minutes): bool {
    [$d, $t] = explode(' ', $startAt) + ['', ''];
    return in_array($t, open_slots($d, $minutes), true);
}

function send_mail(string $to, string $subject, string $text): bool {
    $from = cfg('mail_from');
    if (!$to || !$from || !filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    $headers = "From: Lash by Design <$from>\r\nReply-To: " . (cfg('notify_email') ?: $from) . "\r\nContent-Type: text/plain; charset=UTF-8\r\nX-Mailer: LBD";
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, $headers, '-f' . $from);
}

function nice_time(string $at): string { return date('D j M, H:i', strtotime($at)); }

function owner(): void {
    session_name('lbd_owner');
    session_start(['cookie_httponly' => true, 'cookie_secure' => !empty($_SERVER['HTTPS']), 'cookie_samesite' => 'Strict']);
}

function notify_owner(string $ref, bool $paid = false): void {
    $q = db()->prepare('SELECT * FROM bookings WHERE ref = ? ORDER BY start_at');
    $q->execute([$ref]);
    $rows = $q->fetchAll();
    if (!$rows) return;
    $b = end($rows);
    $lines = ["New booking $ref" . ($paid ? ' (deposit paid)' : ''), ''];
    foreach ($rows as $r) $lines[] = $r['service_name'] . ': ' . nice_time($r['start_at']) . ' (' . $r['minutes'] . ' min)';
    $lines = array_merge($lines, ['', 'Name: ' . $b['name'], 'Cell: +' . $b['phone'], 'WhatsApp: https://wa.me/' . $b['phone']]);
    if ($b['email']) $lines[] = 'Email: ' . $b['email'];
    if ($b['notes'] && $b['service_id'] !== 'patch') $lines[] = 'Notes: ' . $b['notes'];
    $lines[] = '';
    $lines[] = 'Open The Lash Bed: ' . rtrim((string)cfg('site_url'), '/') . '/owner/';
    send_mail((string)cfg('notify_email'), 'New booking: ' . $b['name'] . ', ' . nice_time($rows[0]['start_at']), implode("\n", $lines));
}
