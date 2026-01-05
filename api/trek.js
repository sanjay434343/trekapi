import http from "http";
import url from "url";

/* ---------------- CONFIG ---------------- */

const PORT = process.env.PORT || 3000;
const POLLINATIONS_TEXT_API = "https://text.pollinations.ai";

/* ---------------- STRICT SYSTEM PROMPT ---------------- */

const SYSTEM_PROMPT = `
You are a food nutrition analysis engine.

PRIMARY TASK
- Analyze food items and return nutrition data.
- If the input contains multiple foods (e.g., "dosa with sambar"),
  split them into separate food items.
- Treat each food independently.

INPUT RULES
- Input is a food description.
- Detect separators: "with", ",", "+", "and".
- Assume STANDARD SINGLE SERVING for EACH item.
- Use Indian food standards if applicable.
- If input is not edible food, return INVALID_FOOD_INPUT.

ANALYSIS RULES
- Use realistic real-world nutrition values.
- No ranges. Single numeric values only.
- Calories must logically match macros.
- Assume most common preparation.
- No medical advice.

OUTPUT RULES
- JSON ONLY.
- No extra text.

OUTPUT FORMAT

{
  "items": [
    {
      "food_name": "<string>",
      "serving_size": "<string>",
      "calories_kcal": <number>,
      "protein_g": <number>,
      "carbs_g": <number>,
      "fat_g": <number>
    }
  ],
  "total_calories_kcal": <number>
}
`.trim();

/* ---------------- SERVER ---------------- */

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname !== "/api/trek") {
    res.writeHead(404);
    return res.end("Not Found");
  }

  const query = parsedUrl.query.q;

  if (!query) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      ok: false,
      error: "Missing query parameter ?q="
    }));
  }

  try {
    const prompt = `
SYSTEM:
${SYSTEM_PROMPT}

USER_INPUT:
${query}
    `.trim();

    const pollinationRes = await fetch(
      `${POLLINATIONS_TEXT_API}/${encodeURIComponent(prompt)}`
    );

    if (!pollinationRes.ok) {
      throw new Error("Pollinations API failed");
    }

    const text = await pollinationRes.text();

    // Ensure clean JSON output
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Invalid AI response format");
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(json));

  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: false,
      error: err.message
    }));
  }
});

/* ---------------- START ---------------- */

server.listen(PORT, () => {
  console.log(`Food Nutrition API running on port ${PORT}`);
});
