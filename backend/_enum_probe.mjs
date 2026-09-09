import prisma from './src/config/prisma.js';

try {
  const c = await prisma.competency.create({
    data: {
      name: 'ZZZ Enum Probe',
      category: 'Technical',
      targetGroups: { create: [{ targetGroup: 'non-managerial', description: '' }] },
    },
  });
  console.log('HYPHEN accepted, id =', c.id);
  await prisma.competency.delete({ where: { id: c.id } });
} catch (e) {
  console.log('HYPHEN rejected:', String(e.message).split('\n').slice(0, 3).join(' | '));
} finally {
  await prisma.$disconnect();
}