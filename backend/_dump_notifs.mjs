import prisma from './src/config/prisma.js';

const notifs = await prisma.notification.findMany({
  orderBy: { createdAt: 'desc' },
  take: 50,
  include: { user: { select: { id: true, name: true, email: true, roles: true, department: true } } },
});

console.log('=== NOTIFICATIONS (last 50) ===');
for (const n of notifs) {
  console.log(
    `${n.createdAt.toISOString()} [${n.type}] -> user=${n.userId} (${n.user?.name}, ${n.user?.email}, roles=${n.user?.roles?.join('/') || '?'}, dept=${n.user?.department || 'n/a'}) | ${n.title} | ${n.body}`
  );
}
console.log('count =', notifs.length);
await prisma.$disconnect();