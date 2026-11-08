# ActiveCampaign Daily number sync

`ac-daily-sync` sets `WWD_NUMBER` to an absolute puzzle number, with #1 on August 11, 2026. The scheduled email numbering policy is midnight UTC; gameplay continues to roll over on each player's local calendar date. Around midnight, the email number can therefore differ from a player's local Daily.

## Required handoff before enabling

In ActiveCampaign's **WWD: Delivery** automation, remove the action that adds **+1** to `WWD_NUMBER`. Preserve the email and wait steps. The new job must not run alongside that increment action: it would create two competing writers. The job is initially paused until this handoff is confirmed.

The new sync does not repair automation exits or re-enroll contacts, and does not send email. A contact outside the delivery automation can have a corrected number without receiving a reminder.

## Operation

- Job: `activecampaign-daily-number`, daily at 00:00 UTC (one run per day, low recurring Cloud activity). Provider processing adds seconds; failures wait for the next day's run unless manually retried.
- Only active members of `AC_LIST_ID` are queried; no contact creation, subscription changes, or writes to other custom fields.
- Resolve the field by `WWD_NUMBER`, paginate contacts and field values, skip correct values and update stale ones (create missing values).
- Use existing server-only `AC_API_URL`, `AC_API_KEY`, and `AC_LIST_ID`. Authenticate scheduled/manual requests with the existing `BACKUP_CRON_SECRET` header; no credentials are copied into application source or returned by the endpoint.
- Sequential requests respect ActiveCampaign's account rate limit and `Retry-After`; reads have bounded retries. Ambiguous failed writes are not blindly replayed; a later invocation reads the actual field first.
- POST `{ "dryRun": true }` previews counts without writes. POST `{}` executes using the server's current UTC date; caller-supplied dates/numbers are not accepted.
- Responses/logs include totals, UTC date and puzzle number, never subscriber email addresses. Provider failures preserve status/details.
- Inspect `cron.job`, `cron.job_run_details`, HTTP callback responses and function logs to troubleshoot; a successful cron dispatch alone does not prove the provider update succeeded.

## Verification

- Nine sync tests cover launch date, Nov 8 #90, UTC rollover #91, stale-value repair, missing values, pagination, active-list selection, dry runs, throttling and failed writes.
- Full suite: 762 passed, 4 skipped.
- Live unauthorized request: rejected with 401.
- Live dry run on Nov 8: 63 active contacts, 57 correct values, six needing correction, no writes.