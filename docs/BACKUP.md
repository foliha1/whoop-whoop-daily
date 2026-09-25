# Backups — where the data lives and how to get it back

Everything in this file is about the four tables that only exist in one place:

| Table | What it holds |
| --- | --- |
| `daily_results` | One row per player per puzzle: rounds solved, misses, peek, timing. This is the traction record. |
| `daily_events` | Anonymous gameplay events (ready screen viewed, run started, shares, attribution). |
| `daily_subscribers` | Email addresses given for the daily reminder, and whether they reached ActiveCampaign. |
| `admin_allowlist` | Which email addresses can open `/admin`. |

## Where the dumps live

In the backend's private storage bucket called **`daily-backups`**.

- Nothing in it is public. There is no anonymous read access. You have to be signed in to the backend to see it.
- Files are grouped in a folder per night, named by date, e.g. `2026-08-09/`.
- Inside each folder there is one file per table plus a `manifest.json`:

```
2026-08-09/
  daily_results.jsonl
  daily_events.jsonl
  daily_subscribers.jsonl
  admin_allowlist.jsonl
  manifest.json
```

- Folders older than **30 days** are deleted automatically on each run.

### Why `.jsonl` and not CSV

`.jsonl` is "JSON Lines": one complete record per line, exactly as the database
holds it. Two of these tables store structured data inside a single column
(`round_events` and `props`). In CSV that turns into quoted text full of commas
and quote marks, which is easy to corrupt on the way back in. JSON Lines
restores byte-for-byte, and it can still be streamed line by line, so a big
table never has to fit in memory at once.

`manifest.json` records the run date, and for each table the row count, the byte
size and the file path. If a backup ever came back suspiciously small, that file
is the fastest way to see it.

## What runs, and when

| Job | When | What it does |
| --- | --- | --- |
| `nightly-backup` | 03:17 UTC every night | Dumps all four tables, writes the manifest, deletes folders older than 30 days, records each table in the `backup_runs` table. |

It is protected by a shared secret (`BACKUP_CRON_SECRET`), so nobody can
trigger it from outside.

The tables are read in pages of 1,000 rows, so they can keep growing without the
job running out of memory.

### The heartbeat lives on the dashboard, not in your inbox

There is no weekly email. `hello@whoop-whoop.com` is a forward, so it can
receive but not send, and setting up a sending service would mean touching the
domain's DNS again. Instead, the status sits at the very top of `/admin`:

1. **Healthy** — one quiet gray line, e.g. `Backups healthy. Last run 3 hours ago.`
2. **Failed or stopped** — a loud red block naming the table and the night that
   failed. It is the first thing on the page.
3. **Stale counts as failed** — if the most recent successful run is more than
   30 hours old, the banner goes red even if nothing reported an error. A job
   that silently stopped running is the case this check exists to catch.

Press **Detail** to see the last seven nights, the row count per table in the
latest dump with the change since a week ago, and the dump's size and timestamp.

It contains **no player data and no email addresses** — only counts. It reads
through the same admin-only database function as the rest of the dashboard, so
signing out or losing access shows nothing.


## How to restore one table from a dump

You do not need to do this often, and you should not do it in a hurry. Read the
whole section first.

### Step 1 — pick the dump you want

In the backend, open Storage, then the `daily-backups` bucket, then the folder
for the date you want. Open `manifest.json` and check the row count for the
table you are restoring looks right. If the count is 0 or far too low, pick an
earlier night instead.

### Step 2 — practise on the scratch table first

There is a safe rehearsal built in. It loads a dump into a throwaway table
called `daily_results_scratch`, which nothing in the game reads, and tells you
whether the row count matches the file.

Ask whoever is helping you to call the `backup-restore-drill` job with the date
and table name. It answers with something like:

```json
{ "ok": true, "lines_in_file": 3, "scratch_rows": 3 }
```

`"ok": true` means the file loaded cleanly and every row arrived. If that fails,
stop — the dump is the problem, not the restore.

### Step 3 — restore into the real table

Only do this if data has actually been lost.

1. Download the `.jsonl` file for the table from the bucket.
2. In the backend SQL editor, make a safety copy of the current table first, so
   this step is reversible:

   ```sql
   create table daily_results_before_restore as
   select * from daily_results;
   ```

3. Load the file's rows back in. Each line of the file is one row, and every row
   carries its own `id`, so re-inserting a row that still exists is skipped
   rather than duplicated:

   ```sql
   insert into daily_results
   select * from jsonb_populate_record(null::daily_results, line)
   from  -- one row per line of the .jsonl file
   on conflict (id) do nothing;
   ```

   In practice the easiest way to do this without any tooling is to hand the
   `.jsonl` file to whoever is helping and ask them to insert it with the
   `on conflict (id) do nothing` clause above. That clause is the important
   part: it means running the restore twice cannot double the data.

4. Check the count matches what `manifest.json` said:

   ```sql
   select count(*) from daily_results;
   ```

5. If anything looks wrong, the safety copy from step 2 is still there.

### Step 4 — tidy up

Once you are happy, the safety copy can be dropped:

```sql
drop table daily_results_before_restore;
```

## How to check the backups in SQL

Run this in the backend SQL editor:

```sql
select run_date, table_name, row_count, bytes, status, error
from backup_runs
where kind = 'nightly'
order by run_date desc, table_name
limit 40;
```

Every table should appear once per night with `status = 'ok'` and a row count
that only ever goes up.

## Verification record

The system was tested end to end on 9 August 2026:

- Nightly job triggered manually. Four files landed in `2026-08-09/` with
  3 / 80 / 8 / 4 rows respectively, matching the live tables at that moment
  (22.2 KB total).
- `daily_results.jsonl` was restored into `daily_results_scratch`:
  3 lines in the file, 3 rows in the table. Match.
- The dashboard backup banner reads the same run log and showed the healthy
  state for that night.
