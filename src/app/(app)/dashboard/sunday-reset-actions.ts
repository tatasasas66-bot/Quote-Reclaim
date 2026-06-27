"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function updateSundayResetAction(formData: FormData) {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;

  const enabled = formData.get("enabled") === "true";
  await supabase
    .from("profiles")
    .update({ briefing_enabled: enabled })
    .eq("id", data.user.id);

  revalidatePath("/dashboard");
}
