/* services/activityService.js
 * Audit trail writer. Logging must never break the primary request, so every
 * failure is swallowed (warn-level only). Actor identity is resolved from the
 * authenticated request first; system-triggered events can pass actor explicitly.
 */
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

const resolveActor = async ({ req, actor }) => {
  let actorId = null;
  let actorName = null;
  let actorRole = null;
  let actorRoles = null;

  const lookup = async (id) => {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, roles: true },
    });
    if (user) {
      return { actorId: user.id, actorName: user.name, actorRole: user.roles?.[0] ?? null, actorRoles: user.roles ?? null };
    }
    return null;
  };

  if (req?.user?.id) return (await lookup(req.user.id)) ?? { actorId: req.user.id };

  if (typeof actor === 'string') return (await lookup(actor)) ?? { actorId: actor };

  if (actor && typeof actor === 'object') {
    return {
      actorId: actor.id ?? null,
      actorName: actor.name ?? null,
      actorRole: actor.roles?.[0] ?? actor.role ?? null,
      actorRoles: actor.roles ?? (actor.role ? [actor.role] : null),
    };
  }

  return { actorId, actorName, actorRole, actorRoles };
};

const isAdminRole = (roles) =>
  Array.isArray(roles) && (roles.includes('HR_ADMIN') || roles.includes('ADMIN'));

// Only admin CRUD on these entities is worth keeping in the audit trail.
// High-volume / non-admin entities (Response, Result, Feedback,
// SupervisorEvaluation, …) and session noise (login/logout/role_switch,
// password flows) are intentionally dropped so the log stays readable.
const TRACKED_ENTITIES = new Set([
  'User',
  'Assessment',
  'Competency',
  'Question',
  'Recommendation',
  'FAQ',
  'GeneratedReport',
]);

// Session/auth noise on the User entity — never stored even for admins.
const IGNORED_USER_ACTIONS = new Set([
  'login',
  'logout',
  'role_switch',
  'password_reset',
  'password_changed',
  'refresh',
]);

export const logActivity = async ({ req, actor, action, entity, entityId, description, metadata, ipAddress } = {}) => {
  try {
    if (typeof action !== 'string' || !action.trim()) throw new Error('action is required');
    if (typeof entity !== 'string' || !entity.trim()) throw new Error('entity is required');

    const actionKey = action.trim();
    const entityKey = entity.trim();

    if (!TRACKED_ENTITIES.has(entityKey)) return false;
    if (entityKey === 'User' && IGNORED_USER_ACTIONS.has(actionKey)) return false;

    const resolved = await resolveActor({ req, actor });

    // The activity log is an admin audit trail only — employee and supervisor
    // actions (and system-triggered events without an admin actor) are skipped.
    if (!isAdminRole(resolved.actorRoles)) return false;

    await prisma.activityLog.create({
      data: {
        actorId:     resolved.actorId,
        actorName:   resolved.actorName || 'System',
        actorRole:   resolved.actorRole,
        action:      actionKey,
        entity:      entityKey,
        entityId:    entityId || null,
        description: description || '',
        metadata:    metadata ?? undefined,
        ipAddress:   ipAddress ?? req?.ip ?? null,
      },
    });

    return true;
  } catch (err) {
    logger.warn({ event: 'activity_log_skipped', reason: err.message });
    return false;
  }
};

export default logActivity;