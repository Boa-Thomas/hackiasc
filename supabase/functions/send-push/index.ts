// Edge Function: send-push
// SECURITY (sweep "B"): this function had ZERO auth and pushed attacker-controlled
// title/body/url from the request body. Now:
//   1. Requires header `x-webhook-secret` === env PUSH_WEBHOOK_SECRET (shared with the
//      DB trigger trg_notifications_send_push). Fail-CLOSED if the env is unset.
//   2. Trusts ONLY the notification id from the body; re-fetches title/body/url from
//      the `notifications` row (service-role).
// ⚠️ DEPLOY PREREQUISITE (ops, in order): (a) set PUSH_WEBHOOK_SECRET as an edge
//    function secret; (b) store the same value in vault as `push_webhook_secret`;
//    (c) apply migrations/fix_send_push_auth.sql (trigger sends the header); THEN
//    deploy this. Otherwise pushes stop (fail-closed). Runbook in the changelog.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC   = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE  = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT  = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@hackiasc.com";
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  try {
    // Shared-secret gate — fail-closed when the env var is unset.
    const incoming = req.headers.get("x-webhook-secret") ?? "";
    if (!WEBHOOK_SECRET || incoming !== WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response("VAPID keys not configured", { status: 500 });
    }

    const payload = await req.json().catch(() => ({}));
    const bodyRecord = payload.record ?? payload;
    const notifId = bodyRecord?.id;
    if (!notifId) return new Response("no notification id", { status: 400 });

    // Re-fetch content from the DB row — never trust body-supplied title/body/url.
    const { data: notif, error: notifErr } = await admin
      .from("notifications")
      .select("id, title, body, url")
      .eq("id", notifId)
      .maybeSingle();
    if (notifErr || !notif) return new Response("notification not found", { status: 404 });

    const { data: recips } = await admin
      .from("notification_recipients")
      .select("user_key")
      .eq("notification_id", notif.id);
    const userKeys = [...new Set((recips ?? []).map((r) => r.user_key))];
    if (userKeys.length === 0) {
      return new Response(
        JSON.stringify({ recipients: 0, subscriptions: 0, sent: 0 }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_key", userKeys);

    const body = JSON.stringify({
      title: notif.title,
      body: notif.body,
      url: notif.url ?? "#participante",
      tag: notif.id,
    });

    let sent = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        recipients: userKeys.length,
        subscriptions: subs?.length ?? 0,
        sent,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});
