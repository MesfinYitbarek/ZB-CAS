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

// readiness gate (captures a working token)
let adminToken = null;
for (let i = 0; i < 30 && !adminToken; i++) {
  try {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'selam.tesfaye', password: 'Admin@123' }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 200 && j.data?.accessToken) adminToken = j.data.accessToken;
    else await new Promise(rr => setTimeout(rr, 2000));
  } catch { await new Promise(rr => setTimeout(rr, 2000)); }
}
if (!adminToken) { console.log('BACKEND NOT READY'); process.exit(2); }

// find a supervisor with at least one active report
const sup = await prisma.user.findFirst({
  where: { roles: { has: 'SUPERVISOR' }, status: 'ACTIVE' },
  select: { id: true, username: true, roles: true },
});
console.log('supervisor:', JSON.stringify(sup));
if (!sup) { console.log('NO SUPERVISOR IN DB'); process.exit(0); }
const reports = await prisma.user.findMany({ where: { supervisorId: sup.id, status: 'ACTIVE' }, select: { id: true, name: true, username: true } });
console.log('reports:', JSON.stringify(reports.map(r => r.username)));

// pending evaluations for this supervisor (same query as supervisorController)
const evals = await prisma.supervisorEvaluation.findMany({
  where: { supervisorId: sup.id },
  select: { assessmentId: true, employeeId: true, status: true },
  take: 5,
});
console.log('supervisorEvaluations:', JSON.stringify(evals));

// try supervisor login — need password; instead use admin token but set role? Can't.
// Instead call the 3 endpoints as ADMIN to check for 500s on the same data.
if (evals.length) {
  const { assessmentId, employeeId } = evals[0];
  const a = await api(`/assessments/${assessmentId}`, { token: adminToken });
  console.log('GET assessment:', a.status, JSON.stringify(a.json?.message || a.json?.error || 'ok').slice(0, 200));
  const u = await api(`/users/${employeeId}`, { token: adminToken });
  console.log('GET user:', u.status, JSON.stringify(u.json?.message || u.json?.error || 'ok').slice(0, 200));
  const s = await api(`/responses/supervisor/${assessmentId}/${employeeId}`, { token: adminToken });
  console.log('GET supervisor-eval:', s.status, JSON.stringify(s.json?.message || s.json?.error || 'ok').slice(0, 200));
}
await prisma.$disconnect();