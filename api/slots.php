<?php
declare(strict_types=1);
/* GET slots.php?service=classic&date=2026-10-20  -> {ok, times:["09:00",...]}
   GET slots.php?service=classic&days=1           -> {ok, days:["2026-10-14",...]} (dates with at least one opening) */
require __DIR__ . '/lib.php';

$sv = service((string)($_GET['service'] ?? ''));
if (!$sv) fail('Unknown service.');
$min = (int)$sv['minutes'];

if (isset($_GET['days'])) {
    $days = [];
    $n = (int)(studio()['bookAheadDays'] ?? 42);
    for ($i = 0; $i <= $n; $i++) {
        $d = date('Y-m-d', strtotime("+$i days", strtotime('today')));
        if (open_slots($d, $min)) $days[] = $d;
    }
    out(['ok' => true, 'days' => $days]);
}

out(['ok' => true, 'times' => open_slots((string)($_GET['date'] ?? ''), $min)]);
