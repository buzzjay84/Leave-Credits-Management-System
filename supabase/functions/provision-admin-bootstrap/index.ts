import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // Verify the caller is the superadmin using their own JWT — this respects
    // the same lcms_is_superadmin() check the rest of the app relies on,
    // rather than re-implementing that logic here.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerUser } = await callerClient.auth.getUser();
    if (!callerUser?.user) return json({ error: "Not authenticated" }, 401);

    const { data: isSuperadmin, error: superadminError } = await callerClient.rpc("lcms_is_superadmin");
    if (superadminError || !isSuperadmin) return json({ error: "Superadmin access required" }, 403);

    const { email } = await req.json().catch(() => ({}));
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return json({ error: "Enter a valid email" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: allowedRow, error: allowedError } = await admin
      .from("LCMS-allowed-users")
      .select("email, full_name, school_id, school_name, is_active, registered_user_id")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (allowedError) return json({ error: allowedError.message }, 500);
    if (!allowedRow || !allowedRow.is_active) {
      return json({ error: "Add this email to Allowed Users first, then grant admin access." }, 400);
    }
    if (allowedRow.registered_user_id) {
      return json({ ok: true, bootstrapped: false, message: "This email already has its own login — no bootstrap needed." });
    }

    const { data: profileConflict } = await admin.from("LCMS-profiles").select("id").ilike("username", "admin").maybeSingle();
    const { data: allowedConflict } = await admin.from("LCMS-allowed-users").select("id").ilike("username", "admin").maybeSingle();
    if (profileConflict || allowedConflict) {
      return json({ error: 'The "admin" bootstrap username is already in use. Free it up (rename that account in Settings) before granting a new admin.' }, 409);
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: "admin",
      email_confirm: true,
    });
    if (createError || !created?.user) return json({ error: createError?.message || "Could not create the account." }, 500);

    const newUserId = created.user.id;

    const { error: profileError } = await admin.from("LCMS-profiles").insert({
      id: newUserId,
      username: "admin",
      email: normalizedEmail,
      full_name: allowedRow.full_name || normalizedEmail,
      role: "hrmo",
      school_id: "DEFAULT",
      school_name: "SDO Isabela City",
      is_active: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(newUserId);
      return json({ error: profileError.message }, 500);
    }

    const { error: linkError } = await admin
      .from("LCMS-allowed-users")
      .update({ registered_user_id: newUserId, username: "admin", role: "hrmo" })
      .ilike("email", normalizedEmail);
    if (linkError) return json({ error: linkError.message }, 500);

    const { data: callerProfile } = await callerClient
      .from("LCMS-profiles")
      .select("username")
      .eq("id", callerUser.user.id)
      .maybeSingle();

    await admin.from("lcms_account_audit").insert({
      actor_id: callerUser.user.id,
      actor_username: callerProfile?.username || null,
      action: "admin_bootstrap_provisioned",
      details: { email: normalizedEmail },
    });

    return json({ ok: true, bootstrapped: true, message: `${normalizedEmail} can now sign in with username "admin" and password "admin".` });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
