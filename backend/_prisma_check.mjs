import prisma from './src/config/prisma.js';

try {
  await prisma.assessment.findMany({
    where: { id: 'none' },
    include: { competency: { select: { id: true } } },
    select: { id: true, competency: { select: { id: true } } },
  });
  console.log('OK no-throw');
} catch (e) {
  console.log('THROWS len:', String(e.message).length);
  console.log('THROWS full:', String(e.message).slice(0, 500));
} finally {
  await prisma.$disconnect();
}