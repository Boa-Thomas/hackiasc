// Edge Function: send-push
// Acionada por Database Webhook no INSERT de `notifications`.
// Busca os recipients da notificação, resolve as push_subscriptions de cada
// user_key e envia Web Push (VAPID). Remove subscriptions expiradas (404/410).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@hackiasc.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response("VAPID keys not configured", { status: 500 });
    }
    const payload = await req.json().catch(() => ({}));
    // Database Webhook: { type:'INSERT', record:{...} }. Aceita também { record } ou a própria linha.
    const notif = payload.record ?? payload;
    if (!notif?.id) return new Response("no notification id", { status: 400 });

    const { data: recips } = await admin
      .from("notification_recipients")
      .select("user_key")
      .eq("notification_id", notif.id);
    const userKeys = [...new Set((recips ?? []).map((r) => r.user_key))];
    if (userKeys.length === 0) {
      return new Response(
        JSON.stringify({ recipients: 0, subscriptions: 0, sent: 0 }),
        {
          headers: { "Content-Type": "application/json" },
        },
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
