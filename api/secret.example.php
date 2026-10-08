<?php
/* Copy to api/secret.php on the server and fill in. secret.php is never committed (see .gitignore).
   Make a password hash with:  php -r "echo password_hash('the-owner-password', PASSWORD_DEFAULT);"  */
return [
    'owner_password_hash' => '',
    'notify_email' => '',             // the owner's inbox for new bookings
    'mail_from' => '',                // e.g. bookings@lashbydesign.co.za (create this mailbox in cPanel)
    // 'data_dir' => '/home/CPANELUSER/lbd-data',   // better: a folder outside public_html
    'yoco_secret_key' => '',          // sk_live_... from the Yoco portal; empty = no deposits
    'yoco_webhook_secret' => '',      // whsec_... shown when you register api/yoco-webhook.php
];
