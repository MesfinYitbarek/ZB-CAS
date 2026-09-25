export const resolveAudienceUserIds = async (assessment, prisma) => {
  const ACTIVE_EMPLOYEE = { status: 'ACTIVE', roles: { has: 'EMPLOYEE' } };

  if (assessment.audienceType === 'SPECIFIC_EMPLOYEES' && assessment.audienceEmployees?.length) {
    const ids = assessment.audienceEmployees.map(e => e.employeeId);
    const users = await prisma.user.findMany({ where: { id: { in: ids }, ...ACTIVE_EMPLOYEE }, select: { id: true } });
    return users.map(u => u.id);
  }

  if (assessment.audienceType === 'DEPARTMENT_ALL' && assessment.audienceDepartments?.length) {
    const users = await prisma.user.findMany({
      where: { ...ACTIVE_EMPLOYEE, department: { in: assessment.audienceDepartments.map(d => d.department) } },
      select: { id: true },
    });
    return users.map(u => u.id);
  }

  const where = { ...ACTIVE_EMPLOYEE };
  if (assessment.legacyDepartment) where.department = assessment.legacyDepartment;
  if (assessment.legacyPosition) where.position = assessment.legacyPosition;
  const users = await prisma.user.findMany({ where, select: { id: true } });
  return users.map(u => u.id);
};
