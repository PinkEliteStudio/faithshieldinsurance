import crypto from "node:crypto";
// DreamTeam CRM — shared helpers for the email robot (runs on Netlify, never in the browser)


export const SB_URL = "https://jztahpvtzkakcdukodqx.supabase.co";
export const PUBLISHABLE = "sb_publishable_AmlBDSiD3QTirLSLe9cADA_HSmpNiCf";
const SECRET = () => process.env.SUPABASE_SECRET_KEY || "";
export const SITE = () => (process.env.URL || "https://dreamteam-faithshield.netlify.app").replace(/\/$/, "");
export const TEST_FROM = "onboarding@resend.dev";
export const ACCOUNT_EMAIL = "rhinajasmyn@gmail.com";

export function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Talk to the Supabase database with the secret key
export async function sb(path, { method = "GET", body, prefer } = {}) {
  const key = SECRET();
  if (!key) throw new Error("SUPABASE_SECRET_KEY is missing in Netlify environment variables.");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Database error ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

export async function getSettings() {
  const rows = await sb("settings?select=key,value");
  const s = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
  return {
    sender_name: s.sender_name || "Rhina Delgado",
    sender_email: (s.sender_email || "").trim(),
    reply_to: (s.reply_to || ACCOUNT_EMAIL).trim(),
    mailing_address: (s.mailing_address || "").trim(),
    daily_limit: Math.max(0, parseInt(s.daily_limit || "100", 10) || 100),
    notify_email: (s.notify_email || ACCOUNT_EMAIL).trim(),
  };
}

// Is the person calling this the logged-in admin?
export async function requireAdmin(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Please log in again."), { status: 401 });
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: PUBLISHABLE, Authorization: `Bearer ${token}` } });
  if (!r.ok) throw Object.assign(new Error("Your login expired. Refresh the page and log in again."), { status: 401 });
  const user = await r.json();
  const prof = await sb(`profiles?id=eq.${user.id}&select=id,role,email`);
  if (!prof?.[0] || prof[0].role !== "admin") throw Object.assign(new Error("Only Rhina can send emails."), { status: 403 });
  return prof[0];
}

// Signatures so links can't be faked
export function sign(value) {
  return crypto.createHmac("sha256", SECRET() || "dev").update(String(value)).digest("hex").slice(0, 24);
}
export function checkSig(value, sig) {
  const a = Buffer.from(sign(value)), b = Buffer.from(String(sig || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Build the email: fill in {first_name} etc., make links trackable, add the legal footer
export function buildEmail({ template, lead, sendId, settings, isTest }) {
  const vals = {
    first_name: (lead.first_name || "").trim() || "there",
    last_name: lead.last_name || "",
    city: lead.city || "",
    mortgage: lead.mortgage_amount || "",
    quote_link: `${SITE()}/quote.html`,
  };
  const fill = t => String(t || "").replace(/\{([a-z_]+)\}/g, (m, k) => (k in vals ? vals[k] : m));
  const subject = (isTest ? "[TEST] " : "") + fill(template.subject);
  const bodyText = fill(template.body);

  const track = url => sendId
    ? `${SITE()}/.netlify/functions/click?s=${sendId}&u=${encodeURIComponent(url)}&h=${sign(sendId + "|" + url)}`
    : url;
  const unsubUrl = lead.id
    ? `${SITE()}/.netlify/functions/unsubscribe?id=${lead.id}&h=${sign(lead.id)}`
    : `${SITE()}/.netlify/functions/unsubscribe?test=1`;

  const paragraphs = bodyText.split(/\n\s*\n/).map(p => {
    const html = esc(p).replace(/(https?:\/\/[^\s<]+)/g, u => {
      const raw = u.replace(/&amp;/g, "&");
      return `<a href="${esc(track(raw))}" style="color:#B5146C;font-weight:600">${u}</a>`;
    }).replace(/\n/g, "<br>");
    return `<p style="margin:0 0 16px;line-height:1.6">${html}</p>`;
  }).join("");

  const address = settings.mailing_address || "(Mailing address goes here)";
  const html = `<!doctype html><html><body style="margin:0;background:#FBF6FB">
<div style="max-width:560px;margin:0 auto;padding:28px 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#2A1630">
${paragraphs}
<hr style="border:0;border-top:1px solid #EFE3F0;margin:28px 0 14px">
<p style="font-size:12px;color:#766A7C;line-height:1.5;margin:0">${esc(settings.sender_name)}, Licensed Insurance Agent<br>${esc(address)}<br>
You're receiving this because of your interest in protecting your home and family. <a href="${esc(unsubUrl)}" style="color:#766A7C">Unsubscribe</a></p>
</div></body></html>`;
  const text = `${bodyText}\n\n--\n${settings.sender_name}, Licensed Insurance Agent\n${address}\nUnsubscribe: ${unsubUrl}`;
  return { subject, html, text, unsubUrl };
}

// Send through Resend
export async function resendSend({ from, to, subject, html, text, replyTo, unsubUrl }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is missing in Netlify environment variables.");
  const headers = {};
  if (unsubUrl) { headers["List-Unsubscribe"] = `<${unsubUrl}>`; headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text, reply_to: replyTo || undefined, headers }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.message || out.error || `Resend error ${r.status}`);
  return out.id;
}

export function fromAddress(settings) {
  return settings.sender_email ? `${settings.sender_name} <${settings.sender_email}>` : `${settings.sender_name} <${TEST_FROM}>`;
}

export async function logActivity(lead_id, body) {
  try { await sb("activities", { method: "POST", body: { lead_id, type: "email", body } }); } catch (e) { console.error(e); }
}

// Send Rhina a quick heads-up email
export async function notifyRhina(settings, subject, lines) {
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#2A1630;line-height:1.6">${lines.map(l => `<p style="margin:0 0 10px">${esc(l)}</p>`).join("")}<p><a href="${SITE()}" style="color:#B5146C;font-weight:700">Open DreamTeam CRM</a></p></div>`;
  const to = settings.sender_email ? settings.notify_email : ACCOUNT_EMAIL;
  return resendSend({ from: `DreamTeam CRM <${settings.sender_email || TEST_FROM}>`, to, subject, html, text: lines.join("\n") + `\n\n${SITE()}` });
}

// ---- run-campaigns.mjs ----
// DreamTeam CRM — the follow-up robot. Runs EVERY MINUTE on Netlify and sends due campaign emails right away.
// Oct 6 update: was hourly with 25 per run; now every minute, stops itself after ~20 seconds so runs never overlap.

const STOP_STATUSES = ["appointment", "not_interested", "dnc"];
const PER_RUN = 40;
const TIME_BUDGET_MS = 20000; // Netlify scheduled functions must finish within 30 seconds
const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async () => {
  const started = Date.now();
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;
  try {
    const settings = await getSettings();
    if (!settings.sender_email || !settings.mailing_address) {
      console.log("Waiting: add your sending email and mailing address in Email setup.");
      return new Response("waiting for setup");
    }
    const hourET = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date()), 10);
    if (hourET < 8 || hourET >= 18) return new Response("outside sending hours (8am-6pm ET)");

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const sentRecently = await sb(`email_sends?select=id&is_test=eq.false&sent_at=gte.${since}&status=in.(sent,sending)`);
    let remaining = Math.min(settings.daily_limit - (sentRecently?.length || 0), PER_RUN);
    if (remaining <= 0) return new Response("daily limit reached");

    const campaigns = await sb("campaigns?status=eq.active&select=*");
    for (const c of campaigns || []) {
      if (remaining <= 0 || outOfTime()) break;
      const steps = await sb(`campaign_steps?campaign_id=eq.${c.id}&select=*&order=step_no`);
      if (!steps?.length) continue;

      // 1) Enroll new matching leads
      const statuses = (c.statuses || []).filter(Boolean);
      if (statuses.length) {
        let q = `leads?select=id&status=in.(${statuses.join(",")})&email=not.is.null&email=neq.&email_opt_out=eq.false&limit=1000`;
        if (c.opted_in_only) q += "&consent_at=not.is.null";
        if (c.source_filter) q += `&source=ilike.*${encodeURIComponent(c.source_filter.replace(/[*,()]/g, ""))}*`;
        const matches = await sb(q);
        if (matches?.length) {
          await sb("campaign_enrollments?on_conflict=campaign_id,lead_id", {
            method: "POST", prefer: "resolution=ignore-duplicates,return=minimal",
            body: matches.map(m => ({ campaign_id: c.id, lead_id: m.id, next_step: 1, next_send_at: new Date().toISOString() })),
          });
        }
      }

      // 2) Send what's due
      const due = await sb(`campaign_enrollments?campaign_id=eq.${c.id}&status=eq.active&next_send_at=lte.${new Date().toISOString()}&select=*&order=next_send_at&limit=${remaining}`);
      for (const en of due || []) {
        if (remaining <= 0 || outOfTime()) break;
        const lead = (await sb(`leads?id=eq.${en.lead_id}&select=*`))?.[0];
        if (!lead || !lead.email || lead.email_opt_out || STOP_STATUSES.includes(lead.status)) {
          await sb(`campaign_enrollments?id=eq.${en.id}`, { method: "PATCH", body: { status: "stopped" } });
          continue;
        }
        const step = steps.find(s => s.step_no === en.next_step);
        if (!step) { await sb(`campaign_enrollments?id=eq.${en.id}`, { method: "PATCH", body: { status: "done" } }); continue; }
        const tpl = step.template_id ? (await sb(`email_templates?id=eq.${step.template_id}&select=*`))?.[0] : null;
        if (!tpl) { await sb(`campaign_enrollments?id=eq.${en.id}`, { method: "PATCH", body: { status: "stopped" } }); continue; }

        const [row] = await sb("email_sends", { method: "POST", prefer: "return=representation",
          body: { lead_id: lead.id, campaign_id: c.id, template_id: tpl.id, to_email: lead.email, subject: tpl.subject, status: "sending" } });
        try {
          const email = buildEmail({ template: tpl, lead, sendId: row.id, settings });
          const id = await resendSend({ from: fromAddress(settings), to: lead.email, subject: email.subject, html: email.html, text: email.text, replyTo: settings.reply_to, unsubUrl: email.unsubUrl });
          await sb(`email_sends?id=eq.${row.id}`, { method: "PATCH", body: { status: "sent", resend_id: id, subject: email.subject } });
          await logActivity(lead.id, `Campaign "${c.name}" email ${step.step_no} sent: "${email.subject}"`);
        } catch (e) {
          console.error(e);
          await sb(`email_sends?id=eq.${row.id}`, { method: "PATCH", body: { status: "failed", error: String(e.message).slice(0, 500) } });
        }
        const next = steps.find(s => s.step_no === en.next_step + 1);
        const patch = next
          ? { next_step: next.step_no, next_send_at: new Date(Date.now() + Math.max(0, next.delay_days) * 86400000).toISOString() }
          : { status: "done" };
        await sb(`campaign_enrollments?id=eq.${en.id}`, { method: "PATCH", body: patch });
        remaining--;
        await sleep(600);
      }
    }
    return new Response("ok");
  } catch (e) {
    console.error(e);
    return new Response("error: " + e.message, { status: 500 });
  }
};

export const config = { schedule: "* * * * *" };
