<?php
declare(strict_types=1);
/* Yoco Checkout API helpers. Deposits stay off until secret.php has yoco_secret_key AND studio.json has depositRands. */

function yoco_on(): bool { return (string)cfg('yoco_secret_key') !== ''; }

/** Creates a hosted checkout. Returns ['id'=>..., 'redirectUrl'=>...] or null. */
function yoco_checkout(string $ref, int $cents): ?array {
    $base = rtrim((string)cfg('site_url'), '/');
    $payload = json_encode([
        'amount' => $cents,
        'currency' => 'ZAR',
        'successUrl' => "$base/book.html?paid=" . rawurlencode($ref),
        'cancelUrl' => "$base/book.html?unpaid=" . rawurlencode($ref),
        'failureUrl' => "$base/book.html?unpaid=" . rawurlencode($ref),
        'metadata' => ['ref' => $ref],
    ]);
    $ch = curl_init('https://payments.yoco.com/api/checkouts');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . cfg('yoco_secret_key'), 'Idempotency-Key: ' . $ref],
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $j = is_string($raw) ? json_decode($raw, true) : null;
    if ($code >= 300 || empty($j['id']) || empty($j['redirectUrl'])) { error_log("LBD yoco checkout $code: " . substr((string)$raw, 0, 300)); return null; }
    return ['id' => $j['id'], 'redirectUrl' => $j['redirectUrl']];
}

/** Verifies a Yoco (Standard Webhooks) signature: webhook-id.webhook-timestamp.body, HMAC-SHA256 with the base64 part of whsec_... */
function yoco_verify(string $body): bool {
    $secret = (string)cfg('yoco_webhook_secret');
    $id = (string)($_SERVER['HTTP_WEBHOOK_ID'] ?? '');
    $ts = (string)($_SERVER['HTTP_WEBHOOK_TIMESTAMP'] ?? '');
    $sigs = (string)($_SERVER['HTTP_WEBHOOK_SIGNATURE'] ?? '');
    if ($secret === '' || $id === '' || !ctype_digit($ts) || abs(time() - (int)$ts) > 300) return false;
    $key = base64_decode(preg_replace('/^whsec_/', '', $secret));
    $want = base64_encode(hash_hmac('sha256', "$id.$ts.$body", $key, true));
    foreach (explode(' ', $sigs) as $s) {
        [$v, $sig] = explode(',', $s, 2) + ['', ''];
        if ($v === 'v1' && hash_equals($want, $sig)) return true;
    }
    return false;
}
