import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_PASSWORD = "adminofficerII";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Verify the caller is an admin using their own JWT — same lcms_is_admin()
    // check the rest of the app relies on, not re-implemented here.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerUser } = await callerClient.auth.getUser();
    if (!callerUser?.user) return json({ error: "Not authenticated" }, 401);

    const { data: isAdmin, error: adminError } = await callerClient.rpc("lcms_is_admin");
    if (adminError || !isAdmin) return json({ error: "Administrator access required" }, 403);

    const { allowed_user_id } = await req.json().catch(() => ({}));
    if (!allowed_user_id) return json({ error: "Missing account to reset" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: row, error: rowError } = await admin
      .from("LCMS-allowed-users")
      .select("email, full_name, first_name, middle_name, last_name, registered_user_id")
      .eq("id", allowed_user_id)
      .maybeSingle();
    if (rowError) return json({ error: rowError.message }, 500);
    if (!row) return json({ error: "Account not found" }, 404);
    if (!row.registered_user_id) return json({ error: "This account has not registered yet — there is no password to reset." }, 400);

    // Never let this generic default-password reset touch a superadmin
    // account, regardless of who is calling — that account is managed
    // separately, not through this shared default.
    const { data: superadminIds } = await callerClient.rpc("lcms_superadmin_user_ids");
    if (Array.isArray(superadminIds) && superadminIds.includes(row.registered_user_id)) {
      return json({ error: "The superadmin account's password cannot be reset here." }, 403);
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(row.registered_user_id, {
      password: DEFAULT_PASSWORD,
    });
    if (updateError) return json({ error: updateError.message }, 500);

    const resetAt = new Date().toISOString();
    await admin.from("LCMS-allowed-users").update({ password_reset_at: resetAt }).eq("id", allowed_user_id);

    const { data: callerProfile } = await callerClient
      .from("LCMS-profiles")
      .select("username")
      .eq("id", callerUser.user.id)
      .maybeSingle();

    await admin.from("lcms_account_audit").insert({
      actor_id: callerUser.user.id,
      actor_username: callerProfile?.username || null,
      action: "password_reset_to_default",
      details: { target_email: row.email, target_user_id: row.registered_user_id },
    });

    const displayName = row.full_name
      || [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ")
      || row.email;
    return json({ ok: true, message: `${displayName}'s password was reset to the default. They should sign in with it and change it right away.` });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
