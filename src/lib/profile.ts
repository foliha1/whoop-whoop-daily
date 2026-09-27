import { supabase } from "@/integrations/supabase/client";
import { getDisplayName, setDisplayName } from "@/lib/visitor";
import { DISPLAY_NAME_ERROR, validateDisplayName } from "@/lib/displayName";

export async function resolveDisplayName(): Promise<string> {
  const local = getDisplayName();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return local;
  const seed = validateDisplayName(local);
  const { data, error } = await supabase.rpc("get_my_display_name", {
    p_seed: seed.ok ? seed.name : undefined,
  });
  if (error || typeof data !== "string") return local;
  return setDisplayName(data);
}

export async function saveDisplayName(candidate: string): Promise<string> {
  const checked = validateDisplayName(candidate);
  if (!checked.ok) throw new Error(DISPLAY_NAME_ERROR);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return setDisplayName(checked.name);
  const { data, error } = await supabase.rpc("set_my_display_name", { p_display_name: checked.name });
  if (error || typeof data !== "string") throw new Error(DISPLAY_NAME_ERROR);
  return setDisplayName(data);
}