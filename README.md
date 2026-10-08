# Lash by Design: website + booking (ATL-26281)

Domain: **lashbydesign.co.za** · Built 2026-10-08 by AXIEL / ATLAS OS · Brand locked 2026-10-08 (Milkshake leads, Mulberry replaces black).

## What's in here
| Path | What it is |
|---|---|
| `index.html` | Home page: sets, how booking works, patch test, gallery, studio, aftercare, FAQ |
| `book.html` | Online booking: set → first visit? → day/time → patch test (first visits) → details |
| `owner/` | **The Lash Bed**, the owner's app (diary, WhatsApp reminders, patch tests, lash maps, infills due, block time, phone bookings). Add to home screen on the phone. |
| `api/` | PHP 8 + SQLite backend (no database to set up) |
| `studio.json` | **Every studio fact** (hours, sets, prices, contacts). Edit this, not the HTML. `null` = hidden on the site. |
| `data/` | Booking database (created automatically, blocked from the web) |

## Upload to cPanel
1. Upload the zip's contents into `public_html/` and extract.
2. Copy `api/secret.example.php` to `api/secret.php` and fill in:
   - `owner_password_hash`: run `php -r "echo password_hash('PASSWORD', PASSWORD_DEFAULT);"` (cPanel Terminal), or ask AXIEL.
   - `notify_email` (the owner's inbox), plus `mail_from`: create `bookings@lashbydesign.co.za` in cPanel Email first.
   - Optional, but better: `data_dir` set to a folder outside `public_html`.
3. Use cPanel PHP version 8.1 or newer with the `pdo_sqlite` and `curl` extensions (both on by default).
4. Turn on SSL (AutoSSL). `.htaccess` forces https and redirects www to the bare domain.
5. Test the whole thing:
   - Make a booking on `/book.html`. The owner should get an email.
   - Log in at `/owner/` and check the booking is there.

## Deposits (off until set)
1. Put the deposit amount in `studio.json` → `depositRands`.
2. Put the Yoco secret key in `api/secret.php` → `yoco_secret_key`.
3. In the Yoco portal, register the webhook `https://lashbydesign.co.za/api/yoco-webhook.php`, then copy the `whsec_…` secret into `yoco_webhook_secret`.
4. Set both values (2 and 3) together, so the site never says a deposit is due when it can't take one.

## Preview mode
Anywhere without PHP (e.g. the GitHub Pages link), the booking page shows sample times and saves nothing. The owner app offers sample data instead. Live bookings only happen on lashbydesign.co.za.

## Still needed from the client (site hides these until filled in `studio.json`)
- WhatsApp / phone, email, Instagram handle
- Area + street address
- Real opening hours (`hoursConfirmed` is false: current hours are placeholders)
- Set names, durations and **prices**
- Deposit amount (if any) and cancellation notice (48 h assumed)
- Full-resolution photos (current ones are web-sized from the hub)

The photos show models, makeup artists and the owner, not "the team". The site doesn't call them the team or clients.
