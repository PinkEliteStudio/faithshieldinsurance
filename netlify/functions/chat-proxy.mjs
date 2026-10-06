// netlify/functions/chat-proxy.mjs  (FaithShield WEBSITE repo)
// Passes chat bubble messages from the website to Rhina's chat bot in Wellstead.
// Needed because the website's security settings only allow it to talk to itself.
const TARGET = "https://dreamteam-faithshield.netlify.app/.netlify/functions/chat-bot";
const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: JSON_HEADERS });
  }
  try {
    const body = await req.text();
    if (body.length > 100000) {
      return new Response(JSON.stringify({ error: "Too large" }), { status: 413, headers: JSON_HEADERS });
    }
    const r = await fetch(TARGET, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": "https://faithshieldinsurance.netlify.app" },
      body
    });
    return new Response(await r.text(), { status: r.status, headers: JSON_HEADERS });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ reply: "I'm sorry, I'm having trouble right now. Please call or text Rhina at (786) 385-7888. 🙏" }), { status: 200, headers: JSON_HEADERS });
  }
};
