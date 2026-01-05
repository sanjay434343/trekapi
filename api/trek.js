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
    let totalCalories = 0;

    for (const { food, qty } of parsedFoods) {
      const base = await getNutritionFromAI(food);

      // Multiply by quantity safely
      const item = {
        food_name: base.food_name,
        serving_size: `${qty} × ${base.serving_size}`,
        calories_kcal: safeMul(base.calories_kcal, qty),
        protein_g: safeMul(base.protein_g, qty),
        carbs_g: safeMul(base.carbs_g, qty),
        fat_g: safeMul(base.fat_g, qty)
      };

      items.push(item);
      totalCalories += item.calories_kcal;
    }

    return res.status(200).json({
      items,
      total_calories_kcal: Math.round(totalCalories)
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/* ================= QUANTITY PARSER ================= */

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

/* ================= AI ENGINE ================= */

async function getNutritionFromAI(food) {
  const SYSTEM_PROMPT = `
You are a food nutrition engine for health apps.

Rules:
- Return JSON ONLY.
- Assume SINGLE serving.
- Indian home-style preparation.
- Realistic values only.
- Never return null.

Output format:
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

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("AI returned invalid JSON");
  }

  return sanitizeNutrition(json, food);
}

/* ================= SANITIZER ================= */

function sanitizeNutrition(data, foodFallback) {
  return {
    food_name: data.food_name || capitalize(foodFallback),
    serving_size: data.serving_size || "1 standard serving",
    calories_kcal: safeNum(data.calories_kcal),
    protein_g: safeNum(data.protein_g),
    carbs_g: safeNum(data.carbs_g),
    fat_g: safeNum(data.fat_g)
  };
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
