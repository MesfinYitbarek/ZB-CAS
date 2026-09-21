import prisma from '../config/prisma.js';
import asyncHandler from '../utils/asyncHandler.js';

// ─── EMPLOYEE LIST (search-as-you-type) ───────────────────────────────────────
// Optional ?search=<name> filters by name (case-insensitive) and caps results.
// Without it the full scoped list is returned (supervisors see direct reports).
export const getEmployees = asyncHandler(async (req, res) => {
  const { search } = req.query;
  let where = {};
  if (req.user.role === 'SUPERVISOR') where.supervisorId = req.user.id;
  else if (req.user.role === 'EMPLOYEE') where.id = req.user.id;

  const hasSearch = typeof search === 'string' && search.trim();
  if (hasSearch) where.name = { contains: search.trim(), mode: 'insensitive' };

  const rows = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, employeeId: true, department: true, position: true, gender: true },
    orderBy: { name: 'asc' },
    ...(hasSearch ? { take: 30 } : {}),
  });

  const employees = rows.map(r => ({ _id: r.id, ...r }));

  res.status(200).json({ status: 'success', data: { employees } });
});
