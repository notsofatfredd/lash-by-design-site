<?php
declare(strict_types=1);
/* POST book.php  {service, start:"Y-m-d H:i", name, phone, email?, notes?, patchStart?:"Y-m-d H:i", consent:true, website:""}
   -> {ok, ref, status, when, patchWhen?, redirect?}  (redirect = Yoco deposit checkout, only when deposits are switched on) */
require __DIR__ . '/lib.php';
require __DIR__ . '/yoco.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST only.', 405);
same_origin();
$in = body();

// Honeypot: bots fill every field. Look successful, store nothing.
if (!empty($in['website'])) out(['ok' => true, 'ref' => 'LBD-' . strtoupper(bin2hex(random_bytes(3))), 'status' => 'booked']);

$sv = service((string)($in['service'] ?? ''));
if (!$sv || $sv['id'] === 'patch') fail('Please choose a set.');
$name = line($in['name'] ?? '', 80);
$phone = phone_norm((string)($in['phone'] ?? ''));
$email = line($in['email'] ?? '', 120);
$notes = mb_substr(trim(strip_tags((string)($in['notes'] ?? ''))), 0, 600);
$start = line($in['start'] ?? '', 16);
if (mb_strlen($name) < 2) fail('Please add your name.');
if (strlen($phone) < 9 || strlen($phone) > 15) fail('Please check your cellphone number.');
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Please check your email address.');
if (empty($in['consent'])) fail('Please agree to the booking terms.');
if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $start)) fail('Please choose a time.');

$pdo = db();
$cl = $pdo->prepare('SELECT * FROM clients WHERE phone = ?');
$cl->execute([$phone]);
$client = $cl->fetch() ?: null;

$needsPatch = empty($sv['noPatchTest']) && !($client && $client['patch_tested_at']);
$patchStart = $needsPatch ? line($in['patchStart'] ?? '', 16) : '';
$patch = service('patch');
if ($needsPatch) {
    if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $patchStart)) fail('First visits need a quick patch test. Please choose a patch test time.', 422);
    $gap = 3600 * (int)(studio()['patchTest']['hoursBefore'] ?? 24);
    if (strtotime($patchStart) > strtotime($start) - $gap) fail('Your patch test needs to be at least ' . ($gap / 3600) . ' hours before your set.', 422);
}

$open = $pdo->prepare('SELECT COUNT(*) FROM bookings WHERE phone = ? AND start_at > ? AND ' . live_sql());
$open->execute([$phone, date('Y-m-d H:i')]);
if ((int)$open->fetchColumn() >= 3) fail('You already have upcoming bookings with us. Please message the studio to add another.', 429);

$deposit = (int)(studio()['depositRands'] ?? 0);
$takeDeposit = $deposit > 0 && yoco_on();
$status = $takeDeposit ? 'awaiting_deposit' : 'booked';
$ref = 'LBD-' . strtoupper(bin2hex(random_bytes(3)));
$now = date('Y-m-d H:i:s');
$end = fn(string $s, int $m) => date('Y-m-d H:i', strtotime($s) + 60 * $m);

$pdo->exec('BEGIN IMMEDIATE');
try {
    if (!slot_free($start, (int)$sv['minutes'])) { $pdo->exec('ROLLBACK'); fail('Sorry, that time has just been taken. Please pick another.', 409); }
    if ($needsPatch && !slot_free($patchStart, (int)$patch['minutes'])) { $pdo->exec('ROLLBACK'); fail('Sorry, that patch test time has just been taken. Please pick another.', 409); }

    if ($client) {
        $pdo->prepare('UPDATE clients SET name = ?, email = COALESCE(NULLIF(?, \'\'), email), consent_at = ? WHERE phone = ?')->execute([$name, $email, $now, $phone]);
    } else {
        $pdo->prepare('INSERT INTO clients(phone, name, email, consent_at, created_at) VALUES(?,?,?,?,?)')->execute([$phone, $name, $email ?: null, $now, $now]);
    }
    $ins = $pdo->prepare('INSERT INTO bookings(ref, service_id, service_name, minutes, start_at, end_at, phone, name, email, notes, status, deposit_cents, created_at)
                          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $ins->execute([$ref, $sv['id'], $sv['name'], $sv['minutes'], $start, $end($start, (int)$sv['minutes']), $phone, $name, $email ?: null, $notes ?: null,
                   $status, $takeDeposit ? $deposit * 100 : null, $now]);
    if ($needsPatch) {
        $ins->execute([$ref, 'patch', 'Patch test', $patch['minutes'], $patchStart, $end($patchStart, (int)$patch['minutes']), $phone, $name, $email ?: null,
                       'Before ' . $sv['name'] . ' on ' . nice_time($start), $status, null, $now]);
    }
    $pdo->exec('COMMIT');
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->exec('ROLLBACK');
    error_log('LBD book: ' . $e->getMessage());
    fail('Something went wrong saving your booking. Please try again or message the studio.', 500);
}

$res = ['ok' => true, 'ref' => $ref, 'status' => $status, 'when' => nice_time($start)];
if ($needsPatch) $res['patchWhen'] = nice_time($patchStart);

if ($takeDeposit) {
    $co = yoco_checkout($ref, $deposit * 100);
    if (!$co) {
        $pdo->prepare("UPDATE bookings SET status = 'cancelled' WHERE ref = ?")->execute([$ref]);
        fail('We could not start the deposit payment. Nothing was charged. Please try again in a minute.', 502);
    }
    $pdo->prepare('UPDATE bookings SET yoco_checkout_id = ? WHERE ref = ?')->execute([$co['id'], $ref]);
    $res['redirect'] = $co['redirectUrl'];
    out($res);   // the owner is emailed when the deposit clears (yoco-webhook.php)
}

notify_owner($ref);
out($res);
