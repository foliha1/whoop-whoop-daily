# Sign-in email icon and six-digit code hardening

## Scope
- Replace the written email brand line with the existing Daily web-app icon in light mode and its warm-black inverted alternate in dark mode.
- Use absolute URLs on the published `www.whoop-whoop.com` domain so mail clients can fetch both images.
- Keep all six authentication email types code-only and otherwise unchanged.

## Six-digit verification
- Keep sign-in generation with the hosted authentication service, whose email OTP is six numeric digits.
- Enforce exactly six ASCII digits before client verification and at the email subject/rendering boundary.
- Preserve the configured 60-minute expiry and ensure the email copy matches it.
- Add focused regression tests covering nonnumeric, short, long, valid, and expired-code behavior.

## Delivery and checks
- Deploy the updated authentication email sender so the last deployed version matches the project.
- Verify the rendered email contains both absolute icon URLs, no written logo replacement, and an exact six-digit sample.
- Run focused tests and check the final build diagnostics. Do not publish the app.
