<?php
declare(strict_types=1);
/* Yoco webhook (register https://lashbydesign.co.za/api/yoco-webhook.php in the Yoco portal, event payment.succeeded). */
require __DIR__ . '/lib.php';
require __DIR__ . '/yoco.php';

$body = (string)file_get_contents('php://input');
if (!yoco_verify($body)) fail('Bad signature.', 401);
$ev = json_decode($body, true) ?: [];
if (($ev['type'] ?? '') !== 'payment.succeeded') out(['ok' => true]);

$meta = $ev['payload']['metadata'] ?? [];
$checkout = (string)($meta['checkoutId'] ?? '');
$pdo = db();
$q = $pdo->prepare("SELECT DISTINCT ref FROM bookings WHERE yoco_checkout_id = ? AND yoco_checkout_id <> ''");
$q->execute([$checkout]);
$ref = $q->fetchColumn();
if (!$ref) { error_log('LBD webhook: no booking for checkout ' . $checkout); out(['ok' => true]); }

// Paid, even if the 30-minute hold lapsed; the owner sorts any clash from the app.
$pdo->prepare("UPDATE bookings SET status = 'booked' WHERE ref = ? AND status IN ('awaiting_deposit','cancelled')")->execute([$ref]);
notify_owner((string)$ref, true);
out(['ok' => true]);
