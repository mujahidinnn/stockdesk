# Email templates

Copies of the eight auth emails Supabase can send for this project. The
dashboard is where they actually run from — these files exist so the wording is
versioned with the app and a dashboard reset does not lose it.

Paste the HTML into **Body**, the subject into **Subject**, then Save. Each
file's opening comment repeats both, plus which template variables that
particular page offers.

## Action emails

Sent because someone asked for something. All carry a link.

| File                        | Dashboard page                | Subject                                    | Used by the app                            |
| --------------------------- | ----------------------------- | ------------------------------------------ | ------------------------------------------ |
| `reset_password.html`       | Emails → Reset password       | Atur ulang kata sandi StockDesk             | Yes, "Forgot password?" on the login page  |
| `change_email_address.html` | Emails → Change email address | Konfirmasi perubahan alamat email StockDesk | Yes, Profile Settings                      |
| `invite_user.html`          | Emails → Invite user          | Undangan bergabung ke StockDesk             | No, only the dashboard's own Invite button |
| `confirm_sign_up.html`      | Emails → Confirm sign up      | Konfirmasi akun StockDesk Anda              | No, accounts are created pre-confirmed     |
| `magic_link_or_otp.html`    | Emails → Magic link or OTP    | Tautan masuk StockDesk                      | No, password and Google only               |

## Notifications

Sent after the fact, nothing to do. Deliberately link-free, see below.

| File                         | Dashboard page                            | Subject                                      | Used by the app   |
| ---------------------------- | ----------------------------------------- | -------------------------------------------- | ----------------- |
| `password_changed.html`      | Emails → Security → Password changed      | Kata sandi StockDesk Anda telah diubah        | Yes, toggle is on |
| `email_address_changed.html` | Emails → Security → Email address changed | Alamat email akun StockDesk Anda telah diubah | Yes, toggle is on |

## Codes

| File                    | Dashboard page            | Subject                  | Used by the app                     |
| ----------------------- | ------------------------- | ------------------------ | ----------------------------------- |
| `reauthentication.html` | Emails → Reauthentication | Kode verifikasi StockDesk | No, re-auth uses signInWithPassword |

## Why some are filled in although nothing sends them

`invite`, `confirmation` and `magic_link` fire the moment someone enables that
flow, or uses the Supabase dashboard's own Invite button, which needs no app
code at all. The default template is English boilerplate that reads like
phishing, so they are branded rather than left alone.

The five remaining Security toggles (phone number, sign-in method linked and
removed, MFA added and removed) have no template here and are switched off.
Nothing in the app can trigger them: there is no phone auth and no MFA. Write a
template before turning any of them on.

## Why the notifications have no link

An email about account security that asks you to click something is exactly
what a phisher sends. These say what happened and tell the reader to reach the
admin through a channel they already trust. `reauthentication.html` has no link
either, but for a different reason: that page offers no `{{ .ConfirmationURL }}`
at all, a code is the whole point.

## Why reset_password.html links to our own domain

The action emails use `{{ .ConfirmationURL }}`, which points at
`<project-ref>.supabase.co`. Mail sent from `stockdesk.mujahidin.my.id` carrying a
link to a different domain is a phishing signal, and Gmail acted on it.

`reset_password.html` instead builds the link itself from `{{ .TokenHash }}`, and
`ResetPasswordPage` trades that token for a session via `verifyOtp`. Same
result, one domain. The other action emails keep `ConfirmationURL` because none
of them has a landing page in the app to do that exchange.

## Illustrations

Each template shows `https://stockdesk.mujahidin.my.id/email/<template>.png`
from `public/email/`, hardcoded rather than `{{ .SiteURL }}` so the dashboard
preview and a locally opened file can load it too.
They are unDraw illustrations (free, no attribution required) recoloured to
`#1273e2` (the primary) and rendered to PNG, because Gmail strips inline SVG. They only show
once the app is deployed.

The header logo is `public/email/logo.png`, the hexagon from `public/favicon.svg`
rendered to a 96px transparent PNG (shown at 36px) for the same reason.
Re-render it if the favicon changes.
