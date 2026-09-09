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

  const lookup = async (id) => {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, roles: true },
    });
    if (user) {
      return { actorId: user.id, actorName: user.name, actorRole: user.roles?.[0] ?? null };
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
    };
  }

  return { actorId, actorName, actorRole };
};

export const logActivity = async ({ req, actor, action, entity, entityId, description, metadata, ipAddress } = {}) => {
  try {
    if (typeof action !== 'string' || !action.trim()) throw new Error('action is required');
    if (typeof entity !== 'string' || !entity.trim()) throw new Error('entity is required');

    const resolved = await resolveActor({ req, actor });

    await prisma.activityLog.create({
      data: {
        actorId:     resolved.actorId,
        actorName:   resolved.actorName || 'System',
        actorRole:   resolved.actorRole,
        action,
        entity,
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