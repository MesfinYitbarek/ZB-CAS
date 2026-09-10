import prisma from './src/config/prisma.js';

const BASE = 'http://localhost:5000/api';
async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
let adminToken = null;
for (let i = 0; i < 30 && !adminToken; i++) {
  try {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'selam.tesfaye', password: 'Admin@123' }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 200 && j.data?.accessToken) adminToken = j.data.accessToken;
    else await new Promise(rr => setTimeout(rr, 2000));
  } catch { await new Promise(rr => setTimeout(rr, 2000)); }
}
if (!adminToken) process.exit(2);

const sup = await prisma.user.findFirst({ where: { username: 'sup.finance' } });
const report = await prisma.user.findFirst({ where: { supervisorId: sup.id, status: 'ACTIVE' }, select: { id: true } });
const comp = await prisma.competency.findFirst({ select: { id: true } });
const question = await prisma.question.findFirst({ select: { id: true } });
const mk = await api('/assessments', {
  method: 'POST', token: adminToken,
  body: {
    competencyId: comp.id, targetGroup: 'common', purpose: 'Sup E2E', description: 'Supervisor E2E eval',
    targetAudience: { type: 'SPECIFIC_EMPLOYEES', departments: [], employeeIds: [report.id] },
    questionIds: [question.id],
    startDate: new Date(Date.now() - 3600_000).toISOString(), endDate: new Date(Date.now() + 3600_000).toISOString(),
    type: 'SupervisorOnly',
  },
});
console.log('create:', mk.status, JSON.stringify(mk.json?.message || mk.json?.error || '').slice(0, 150));
const assId = mk.json?.data?.assessment?._id;
const sc = await api(`/assessments/${assId}/status`, { method: 'PATCH', token: adminToken, body: { status: 'SCHEDULED' } });
console.log('schedule:', sc.status, JSON.stringify(sc.json?.message || sc.json?.error || '').slice(0, 300));
const db1 = await prisma.assessment.findUnique({ where: { id: assId }, select: { status: true } });
console.log('db status after schedule:', db1?.status);
const g = await api(`/assessments/${assId}`, { token: adminToken });
console.log('get:', g.status, 'status now:', g.json?.data?.assessment?.status);
const db2 = await prisma.assessment.findUnique({ where: { id: assId }, select: { status: true } });
console.log('db status after get:', db2?.status);
await prisma.$disconnect();