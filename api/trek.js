export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const q = req.query.q;
  if (!q) {
    return res.status(400).json({ error: "Missing ?q parameter" });
  }

  try {
    const parsedFoods = parseFoodsWithQuantity(q);

    const items = [];
    let totals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0
    };

    for (const { food, qty } of parsedFoods) {
      const base = await getNutritionFromAI(food);

      const item = {
        food_name: base.food_name,
        serving_size: formatServingSize(qty, base.serving_size),
        calories_kcal: safeMul(base.calories_kcal, qty),
        protein_g: safeMul(base.protein_g, qty),
        carbs_g: safeMul(base.carbs_g, qty),
        fat_g: safeMul(base.fat_g, qty)
      };

      items.push(item);

      totals.calories += item.calories_kcal;
      totals.protein += item.protein_g;
      totals.carbs += item.carbs_g;
      totals.fat += item.fat_g;
    }

    // 🔥 AI-BASED RECOMMENDATIONS
    const recommendations = await getRecommendationsFromAI(totals);

    return res.status(200).json({
      items,
      total_calories_kcal: Math.round(totals.calories),
      recommendations
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/* ================= FOOD + QUANTITY PARSER ================= */

function parseFoodsWithQuantity(input) {
  return input
    .toLowerCase()
    .split(/with|,|\+|and|&/)
    .map(part => {
      const match = part.trim().match(/^(\d+)\s+(.*)$/);
      return {
        qty: match ? parseInt(match[1], 10) : 1,
        food: match ? match[2].trim() : part.trim()
      };
    })
    .filter(f => f.food);
}

/* ================= NUTRITION AI ================= */

async function getNutritionFromAI(food) {
  const SYSTEM_PROMPT = `
You are a food nutrition engine for health apps like HealthifyMe.

RULES:
- JSON ONLY
- Single serving
- Realistic values
- No null values

Serving size MUST be one of:
"1 cup", "1 bowl", "1 plate", "1 piece", "1 slice", "1 spoon", "1 glass"

OUTPUT FORMAT:
{
  "food_name": "",
  "serving_size": "",
  "calories_kcal": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number
}
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

  const text = await res.text();
  return sanitizeNutrition(JSON.parse(text), food);
}

/* ================= AI RECOMMENDATIONS ================= */

async function getRecommendationsFromAI({ calories, protein, carbs, fat }) {
  const SYSTEM_PROMPT = `
You are a nutrition assistant for a food tracking app.

TASK:
- Analyze the given nutrition totals.
- Give practical, everyday suggestions.
- Use phrases like: "increase", "reduce", "balance".
- Do NOT give medical advice.
- Do NOT mention diseases or conditions.
- Keep recommendations general and safe.

OUTPUT RULES:
- JSON ONLY
- Array of short strings
- No emojis
- No numbers unless necessary

OUTPUT FORMAT:
{
  "recommendations": [
    "string",
    "string"
  ]
}
`.trim();

  const prompt = `
SYSTEM:
${SYSTEM_PROMPT}

TOTAL NUTRITION:
Calories: ${Math.round(calories)} kcal
Protein: ${Math.round(protein)} g
Carbs: ${Math.round(carbs)} g
Fat: ${Math.round(fat)} g
`.trim();

  const res = await fetch(
    `https://text.pollinations.ai/${encodeURIComponent(prompt)}`
  );

  const text = await res.text();
  const json = JSON.parse(text);

  return Array.isArray(json.recommendations) ? json.recommendations : [];
}

/* ================= SANITIZER ================= */

function sanitizeNutrition(data, fallback) {
  return {
    food_name: data.food_name || capitalize(fallback),
    serving_size: normalizeServingSize(data.serving_size),
    calories_kcal: safeNum(data.calories_kcal),
    protein_g: safeNum(data.protein_g),
    carbs_g: safeNum(data.carbs_g),
    fat_g: safeNum(data.fat_g)
  };
}

/* ================= SERVING HELPERS ================= */

function normalizeServingSize(size = "") {
  const allowed = [
    "1 cup", "1 bowl", "1 plate",
    "1 piece", "1 slice", "1 spoon", "1 glass"
  ];
  if (allowed.includes(size)) return size;
  return "1 plate";
}

function formatServingSize(qty, baseServing) {
  const unit = baseServing.replace(/^1\s+/, "").trim();
  if (qty === 1) return `1 ${unit}`;
  return unit.endsWith("s") ? `${qty} ${unit}` : `${qty} ${unit}s`;
}

/* ================= HELPERS ================= */

function safeNum(v) {
  if (typeof v !== "number" || isNaN(v)) return 0;
  return Math.round(v * 10) / 10;
}

function safeMul(v, m) {
  return Math.round(safeNum(v) * m * 10) / 10;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
