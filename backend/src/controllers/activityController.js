/* controllers/activityController.js */
import prisma from '../config/prisma.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── LIST ACTIVITY LOG (HR_ADMIN) ─────────────────────────────────────────────
export const getActivities = asyncHandler(async (req, res) => {
  const { entity, action, actorId, from, to, search, page = 1, limit = 50 } = req.query;

  const where = {};
  if (entity)  where.entity  = entity;
  if (action)  where.action  = action;
  if (actorId) where.actorId = actorId;

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  if (search && search.trim()) {
    where.OR = [
      { description: { contains: search.trim(), mode: 'insensitive' } },
      { actorName:   { contains: search.trim(), mode: 'insensitive' } },
    ];
  }

  const pageNum    = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum   = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const skip       = (pageNum - 1) * limitNum;

  const [activities, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.activityLog.count({ where }),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      activities: activities.map((a) => ({ ...a, _id: a.id })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
  });
});