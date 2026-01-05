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
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

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

      totalCalories += item.calories_kcal;
      totalProtein += item.protein_g;
      totalCarbs += item.carbs_g;
      totalFat += item.fat_g;
    }

    const recommendations = generateRecommendations({
      calories: totalCalories,
      protein: totalProtein,
      carbs: totalCarbs,
      fat: totalFat
    });

    return res.status(200).json({
      items,
      total_calories_kcal: Math.round(totalCalories),
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

/* ================= AI ENGINE ================= */

async function getNutritionFromAI(food) {
  const SYSTEM_PROMPT = `
You are a food nutrition engine for health apps like HealthifyMe.

RULES:
- Return JSON ONLY.
- SINGLE serving.
- Realistic values.
- NEVER return null.

SERVING SIZE MUST BE ONE OF:
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

/* ================= SANITIZER ================= */

function sanitizeNutrition(data, foodFallback) {
  return {
    food_name: data.food_name || capitalize(foodFallback),
    serving_size: normalizeServingSize(data.serving_size),
    calories_kcal: safeNum(data.calories_kcal),
    protein_g: safeNum(data.protein_g),
    carbs_g: safeNum(data.carbs_g),
    fat_g: safeNum(data.fat_g)
  };
}

/* ================= SERVING NORMALIZER ================= */

function normalizeServingSize(size = "") {
  const allowed = [
    "1 cup",
    "1 bowl",
    "1 plate",
    "1 piece",
    "1 slice",
    "1 spoon",
    "1 glass"
  ];

  if (allowed.includes(size)) return size;

  const s = size.toLowerCase();
  if (s.includes("pizza") || s.includes("bread")) return "1 slice";
  if (s.includes("rice") || s.includes("pasta")) return "1 cup";
  if (s.includes("soup") || s.includes("sambar")) return "1 bowl";
  if (s.includes("milk") || s.includes("drink")) return "1 glass";

  return "1 plate";
}

/* ================= SERVING FORMATTER (NEW) ================= */

function formatServingSize(qty, baseServing) {
  const unit = baseServing.replace(/^1\s+/, "").trim();

  if (qty === 1) return `1 ${unit}`;
  if (unit.endsWith("s")) return `${qty} ${unit}`;

  return `${qty} ${unit}s`;
}

/* ================= RECOMMENDATIONS ================= */

function generateRecommendations({ calories, protein, carbs, fat }) {
  const recs = [];

  if (protein < 15) recs.push("Increase protein intake using eggs, dal, paneer, or lean meat.");
  else recs.push("Protein intake looks balanced.");

  if (carbs > 60) recs.push("Reduce refined carbohydrates; prefer whole grains.");
  else recs.push("Carbohydrate intake is moderate.");

  if (fat > 30) recs.push("Reduce fried or oily foods.");
  else recs.push("Fat intake appears balanced.");

  if (calories > 700) recs.push("Consider reducing portion size for calorie control.");
  else recs.push("Calorie intake is reasonable for one meal.");

  recs.push("Add vegetables or fruits for fiber and micronutrients.");
  recs.push("Drink enough water for digestion.");

  return recs;
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
