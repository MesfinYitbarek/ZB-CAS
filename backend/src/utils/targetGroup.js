/* utils/targetGroup.js
 *
 * The Prisma TargetGroup enum is canonical `managerial | non_managerial | common`
 * (underscores), but the frontend and file imports use the hyphenated spelling
 * `non-managerial`. These helpers translate at the API boundary so both
 * spellings are accepted on input, and the frontend always receives the
 * hyphenated form it already understands.
 */

export const TARGET_GROUPS_CANONICAL = ['managerial', 'non_managerial', 'common'];

/** Accepts 'non-managerial', 'non_managerial', any case/whitespace → canonical enum value. */
export const normalizeTargetGroup = (v) => {
  if (v === null || v === undefined) return v;
  const s = String(v).trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (s === 'non_managerial' || s === 'nonmanagerial') return 'non_managerial';
  return s;
};

/** Canonical enum value → hyphenated form for API responses. */
export const denormalizeTargetGroup = (v) => {
  if (v === null || v === undefined) return v;
  return String(v).replace(/_/g, '-');
};

/** True when the value is a valid TargetGroup in either spelling. */
export const isValidTargetGroup = (v) =>
  TARGET_GROUPS_CANONICAL.includes(normalizeTargetGroup(v));

// ─── CompetencyCategory spelling bridge ─────────────────────────────────────
// Prisma enum: Core_Personal_effectiveness | Core_Behavioral | Managerial |
// Leadership | Technical. The UI/imports use hyphenated variants
// ('Core-Personal effectiveness', 'Core-Behavioral').
const CATEGORY_MAP = {
  core_personal_effectiveness: 'Core_Personal_effectiveness',
  core_behavioral: 'Core_Behavioral',
  managerial: 'Managerial',
  leadership: 'Leadership',
  technical: 'Technical',
};

/** Accepts hyphen/underscore/space/case variants → canonical enum value. */
export const normalizeCategory = (v) => {
  if (v === null || v === undefined) return v;
  const key = String(v).trim().toLowerCase().replace(/[-_\s]+/g, '_');
  return CATEGORY_MAP[key] || String(v).trim();
};
