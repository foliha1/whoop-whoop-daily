# ActiveCampaign Daily numbering

## Current policy

The existing `ac-subscribe` signup pipeline seeds `WWD_NUMBER`. ActiveCampaign's **WWD: Delivery** automation then advances that value by **+1**, retaining its subscriber-local midnight wait and email-delivery steps. There is no backend daily resync.

Keep the automation's +1 action and local-time wait. Do not replace them with a global midnight-UTC update: that can advance the number before a subscriber's local Daily changes.

## Rollback scope

Removed the paused `activecampaign-daily-number` scheduled job, deployed `ac-daily-sync` endpoint, and its unused source and tests. The signup function, connector credentials, shared scheduled-job secret, other jobs, gameplay and subscription consent behavior remain unchanged.

Verified: no matching scheduled job remains, the removed endpoint returns 404, and the full suite passes (753 passed, four skipped).

This cleanup does not re-enroll exited contacts, resubscribe opted-out contacts, alter contact numbers, or modify ActiveCampaign's automation. An active list subscription does not by itself mean a contact is currently in the delivery automation.

## Historical one-off correction

On November 8, 2026, the manual UTC sync corrected six of 63 active list contacts to #90; 57 were already #90. Read-back confirmed all 63 at #90 at that moment. This was not a timezone-aware baseline and is not a guarantee that each subscriber's local date matched November 8.

The automatic schedule was created paused and was never enabled. No app publication is required to remove the live job and function.