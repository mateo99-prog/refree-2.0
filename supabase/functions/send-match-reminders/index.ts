import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Reminder = { user_id: string; match_id: string; title: string; body: string; url: string };
type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return new Response("Missing configuration", { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: vapid, error: vapidError } = await supabase.rpc("get_push_vapid_config").single();
  if (vapidError || !vapid?.public_key || !vapid?.private_key) return new Response("Missing VAPID keys", { status: 500 });
  webpush.setVapidDetails("https://refflow.app", vapid.public_key, vapid.private_key);

  const { data: reminders, error: claimError } = await supabase.rpc("claim_due_match_reminders", { batch_size: 100 });
  if (claimError) return Response.json({ error: claimError.message }, { status: 500 });

  let delivered = 0;
  for (const reminder of (reminders || []) as Reminder[]) {
    const { data: subscriptions } = await supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", reminder.user_id).eq("enabled", true);
    let sentForReminder = false;
    for (const subscription of (subscriptions || []) as Subscription[]) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: reminder.title, body: reminder.body, url: reminder.url, tag: `match-${reminder.match_id}` }));
        delivered += 1; sentForReminder = true;
      } catch (error) {
        const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
        if (statusCode === 404 || statusCode === 410) await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
      }
    }
    if (!sentForReminder) await supabase.from("match_reminders").update({ sent_at: null, last_error: "No active push subscription", updated_at: new Date().toISOString() }).eq("user_id", reminder.user_id).eq("match_id", reminder.match_id);
  }

  return Response.json({ claimed: reminders?.length || 0, delivered });
});
