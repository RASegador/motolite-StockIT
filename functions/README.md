# Low-stock email notifications — setup

This is code, not a running feature yet — it needs to be deployed with your
own Firebase project on the Blaze plan and your own email-provider account.
Nothing here was (or could be) tested by Claude: this sandbox has no
network access to Firebase's Functions emulator or deploy tooling.

## One-time setup

1. **Upgrade to Blaze.** Firebase Console → your project → gear icon →
   Usage and billing → Details & settings → upgrade. Cloud Functions
   require it even on a project that stays within the free monthly quota.

2. **Create a Resend account** (https://resend.com — chosen because
   sending mail is a single authenticated HTTP call, no SDK required) and
   verify a sending domain, or swap `buildAndSendEmail()` in `index.js` for
   whatever provider you'd rather use (SendGrid, Postmark, etc. all follow
   the same "one fetch call" shape).

3. **Set the API key as a function secret** (never commit it to the repo):
   ```
   firebase functions:secrets:set RESEND_API_KEY
   ```

4. **Add recipient emails** — in the Firebase Console's Firestore tab,
   create a document at `settings/notifications` with:
   ```json
   { "emails": ["owner@example.com", "manager@example.com"] }
   ```

5. **Install and deploy:**
   ```
   cd functions
   npm install
   firebase deploy --only functions
   ```

## What it does

Every 6 hours, checks every item across every shop against its own reorder
point (the same logic the in-app Low Stock banner uses), and — at most once
per day — emails everyone in `settings/notifications.emails` a table of
what's low, grouped by shop.

## Changing the schedule

Edit the `schedule: 'every 6 hours'` string in `index.js` — Cloud
Scheduler accepts either a plain-English interval like that, or a cron
expression (e.g. `'0 8 * * *'` for once a day at 8am). Redeploy after any
change.

## Cost

Blaze is pay-as-you-go, but a scheduled function running a few times a day
against a small Firestore collection, plus Resend's free tier (3,000
emails/month), realistically costs cents a month at this project's scale —
not a meaningful line item.
