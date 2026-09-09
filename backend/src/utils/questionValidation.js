/* utils/questionValidation.js
 * Applies the Question model's pre-save validation + derived-field logic.
 * Extracted from the Mongoose pre('save') hook so Prisma create/update can
 * call it explicitly before writing to the DB.
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Validate and derive fields for a question object.
 * Throws an Error on invalid input — caller should convert to AppError 400.
 * Mutates and returns the object.
 */
export function applyQuestionDefaults(data) {
  const obj = { ...data };

  // Normalize target-group spelling (hyphen/underscore/case) to the enum
  if (obj.targetGroup !== undefined && obj.targetGroup !== null) {
    const s = String(obj.targetGroup).trim().toLowerCase().replace(/[-\s]+/g, '_');
    obj.targetGroup = (s === 'non_managerial' || s === 'nonmanagerial') ? 'non_managerial' : s;
  }

  // Force TrueFalse options
  if (obj.type === 'TrueFalse') {
    obj.options = ['True', 'False'];
  }

  // ───────── MCQ / ScenarioMCQ ─────────
  if (['MCQ', 'ScenarioMCQ'].includes(obj.type)) {
    if (!obj.correctAnswer) throw new Error('correctAnswer is required.');
    if (!obj.options || obj.options.length < 2) throw new Error('At least 2 options required.');
  }

  if (obj.type === 'ScenarioMCQ' && !obj.scenario) {
    throw new Error('Scenario text is required.');
  }

  // ───────── MultiSelect ─────────
  if (obj.type === 'MultiSelect') {
    if (!obj.correctAnswers || obj.correctAnswers.length === 0)
      throw new Error('correctAnswers required.');
    if (!obj.options || obj.options.length < 2)
      throw new Error('At least 2 options required.');
  }

  // ───────── Matching ─────────
  if (obj.type === 'Matching') {
    if (!obj.matchingPairs || obj.matchingPairs.length < 2)
      throw new Error('At least 2 matching pairs required.');

    obj.matchingLeft = shuffle(obj.matchingPairs.map(p => p.left));
    obj.matchingRight = shuffle(obj.matchingPairs.map(p => p.right));
  }

  // ───────── Ordering ─────────
  if (obj.type === 'Ordering') {
    if (!obj.correctOrder || obj.correctOrder.length < 2)
      throw new Error('At least 2 items required for ordering.');

    obj.orderItems = shuffle(obj.correctOrder);
  }

  // ───────── DragDrop ─────────
  if (obj.type === 'DragDropClassification') {
    if (!obj.categories || typeof obj.categories !== 'object')
      throw new Error('Categories object required.');

    const catNames = Object.keys(obj.categories);

    if (catNames.length < 2)
      throw new Error('At least 2 categories required.');

    const allItems = [];

    for (const cat of catNames) {
      const items = obj.categories[cat] || [];
      if (!Array.isArray(items) || items.length === 0)
        throw new Error(`Category "${cat}" must have items.`);

      allItems.push(...items);
    }

    if (allItems.length < 2)
      throw new Error('At least 2 total items required.');

    obj.categoryNames = catNames;
    obj.classificationItems = shuffle(allItems);
  }

  if (obj.score <= 0) obj.score = 1;

  return obj;
}
