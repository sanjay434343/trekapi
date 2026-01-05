export default async function handler(req, res) {
  // ---------------- CORS ----------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const q = req.query.q;
  if (!q) {
    return res.status(400).json({ error: "Missing ?q parameter" });
  }

  try {
    const foods = splitFoods(q);
    const items = [];
    let totalCalories = 0;

    for (const food of foods) {
      const nutrition = await getNutritionFromAI(food);
      items.push(nutrition);
      totalCalories += nutrition.calories_kcal;
    }

    return res.status(200).json({
      items,
      total_calories_kcal: Math.round(totalCalories)
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/* ================= FOOD SPLITTER ================= */

function splitFoods(input) {
  return input
    .toLowerCase()
    .split(/with|,|\+|and|&/)
    .map(f => f.trim())
    .filter(Boolean);
}

/* ================= AI NUTRITION ENGINE ================= */

async function getNutritionFromAI(food) {
  const SYSTEM_PROMPT = `
You are a professional food nutrition analysis engine designed for consumer health apps
(similar to HealthifyMe, MyFitnessPal, Cronometer).

Your job is to analyze user-mentioned foods and return accurate, realistic nutrition data.

CORE RESPONSIBILITIES
- Identify edible food items ONLY.
- Split multiple foods into separate items.
- Assume STANDARD SINGLE SERVING unless specified.
- Use Indian food standards and home-style preparation.

FOOD PARSING
- Detect: "with", ",", "+", "and", "&"
- Ignore non-food words.
- If not food, return INVALID_FOOD_INPUT.

NUTRITION ACCURACY
- Use realistic averages.
- No exaggeration.
- Calories must match macros logically.
- Prefer conservative values.

INDIAN CONTEXT
- Dosa = plain dosa
- Sambar = toor dal + vegetables
- Chapati = no butter
- Rice = cooked white rice

SERVING SIZES
- Dosa → 1 medium dosa (~120g)
- Idli → 1 medium idli
- Sambar → 1 cup (~150ml)

OUTPUT RULES
- JSON ONLY
- No explanations
- No markdown
- No ranges
- Numbers only
- Max 1 decimal

OUTPUT FORMAT

{
  "food_name": "<string>",
  "serving_size": "<string>",
  "calories_kcal": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number
}

VALIDATION
- Values must be nutritionally plausible.
- If uncertain, choose lower-calorie estimate.
`.trim();

  const prompt = `
SYSTEM:
${SYSTEM_PROMPT}

FOOD:
${food}
`.trim();

  const res = await fetch(
    `https://text.pollinations.ai/${encodeURIComponent(prompt)}`
  );

  if (!res.ok) {
    throw new Error("AI nutrition service failed");
  }

  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Invalid AI response format");
  }

  return {
    food_name: json.food_name,
    serving_size: json.serving_size,
    calories_kcal: Math.round(json.calories_kcal),
    protein_g: round(json.protein_g),
    carbs_g: round(json.carbs_g),
    fat_g: round(json.fat_g)
  };
}

/* ================= HELPERS ================= */

function round(v) {
  return Math.round(v * 10) / 10;
}
