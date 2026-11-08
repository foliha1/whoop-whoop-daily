export type SignupActivity = {
  email_hint: string;
  source: string;
  puzzle_number: number | null;
  ac_status: "pending" | "succeeded" | "failed" | "skipped";
  seed_status: "pending" | "succeeded" | "failed" | "skipped";
  seeded_at: string | null;
  completed_at: string | null;
};

export async function trackSignup(options: {
  email: string; source: string; puzzleNumber: number | null; skip: boolean;
  record: (row: SignupActivity) => Promise<string | null>;
  finish: (id: string, row: SignupActivity) => Promise<void>;
  sync: () => Promise<{ ok: boolean; contactId: string | null }>;
  seed: (contactId: string, number: number) => Promise<boolean>;
}) {
  const [local, domain] = options.email.split("@");
  const row: SignupActivity = {
    email_hint: `${local.slice(0, 1)}***@${domain}`, source: options.source,
    puzzle_number: options.puzzleNumber, ac_status: "pending", seed_status: "pending",
    seeded_at: null, completed_at: null,
  };
  let id: string | null = null;
  try { id = await options.record({ ...row }); } catch { console.error("ac-subscribe: activity recording failed"); }
  let syncedToAc = false, numberSynced = false;
  if (options.skip) {
    row.ac_status = "skipped"; row.seed_status = "skipped";
  } else {
    let contactId: string | null = null;
    try {
      const result = await options.sync();
      syncedToAc = result.ok; contactId = result.contactId;
    } catch { console.error("ac-subscribe: ActiveCampaign request threw"); }
    row.ac_status = syncedToAc ? "succeeded" : "failed";
    row.seed_status = "skipped";
    if (syncedToAc && contactId && options.puzzleNumber !== null) {
      try { numberSynced = await options.seed(contactId, options.puzzleNumber); }
      catch { console.error("ac-subscribe: WWD_NUMBER write threw"); }
      row.seed_status = numberSynced ? "succeeded" : "failed";
      if (numberSynced) row.seeded_at = new Date().toISOString();
    }
  }
  row.completed_at = new Date().toISOString();
  if (id) {
    try { await options.finish(id, row); } catch { console.error("ac-subscribe: activity completion failed"); }
  }
  return { syncedToAc, numberSynced };
}