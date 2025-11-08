import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export async function sendAlert(message: string) {
  if (!WEBHOOK_URL) {
    console.log("🔕 No webhook set — skipping alert");
    return;
  }

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
    console.log("📣 Alert sent:", message);
  } catch (err) {
    console.error("❌ Failed to send alert:", err);
  }
}
