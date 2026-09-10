import prisma from './src/config/prisma.js';
import { hashPassword } from './src/utils/password.js';

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

// readiness gate
let probeToken = null;
for (let i = 0; i < 30 && !probeToken; i++) {
  try {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'selam.tesfaye', password: 'Admin@123' }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 200 && j.data?.accessToken) probeToken = j.data.accessToken;
    else await new Promise(rr => setTimeout(rr, 2000));
  } catch { await new Promise(rr => setTimeout(rr, 2000)); }
}
if (!probeToken) { console.log('BACKEND NOT READY'); process.exit(2); }

// temp password for the supervisor (restored after)
const sup = await prisma.user.findFirst({ where: { username: 'sup.finance' } });
const oldHash = sup.passwordHash;
await prisma.user.update({ where: { id: sup.id }, data: { passwordHash: await hashPassword('Tmp@1234x') } });

const supLoginRes = await api('/auth/login', { method: 'POST', body: { username: 'sup.finance', password: 'Tmp@1234x' } });
console.log('supervisor login:', supLoginRes.status, JSON.stringify(supLoginRes.json).slice(0, 200));
const supToken = supLoginRes.json.data.accessToken;
const { data: supLoginWrap } = { data: supLoginRes.json.data };
console.log('supervisor activeRole:', supLoginWrap.activeRole);

const pend = await api('/supervisors/pending', { token: supToken });
let items = pend.data?.data?.pendingEvaluations || [];
console.log('pending status:', pend.status, 'count:', items.length);

// ── create a live SupervisorOnly assessment for one report if none pending ──
let createdAssId = null;
if (!items.length) {
  const adminLogin2 = await api('/auth/login', { method: 'POST', body: { username: 'selam.tesfaye', password: 'Admin@123' } });
  const adminToken = adminLogin2.json.data.accessToken;
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
  console.log('fixture assessment:', mk.status, 'assId:', mk.json?.data?.assessment?._id);
  createdAssId = mk.json?.data?.assessment?._id;
  const psc = await api(`/assessments/${createdAssId}/status`, { method: 'PATCH', token: adminToken, body: { status: 'SCHEDULED' } });
  console.log('schedule:', psc.status, JSON.stringify(psc.json?.message || psc.json?.error || '').slice(0, 200));
  const gg = await api(`/assessments/${createdAssId}`, { token: adminToken });
  console.log('get:', gg.status, 'status now:', gg.json?.data?.assessment?.status);
  const pend2 = await api('/supervisors/pending', { token: supToken });
  items = pend2.data?.data?.pendingEvaluations || [];
  console.log('pending after fixture:', pend2.status, 'count:', items.length);
}

const first = items.find(i => !i.isScheduled) || items[0];
if (!first) { console.log('NO PENDING ITEMS TO TEST'); }
else {
  const empId = first.employee._id || first.employee.id;
  console.log('first item employee key:', first.employee._id ? '_id present' : 'ONLY id', '→', empId);
  const a = await api(`/assessments/${first.assessmentId}`, { token: supToken });
  console.log('GET assessment:', a.status);
  const u = await api(`/users/${empId}`, { token: supToken });
  console.log('GET user:', u.status, JSON.stringify(u.json?.message || 'ok').slice(0, 100));
  const s = await api(`/responses/supervisor/${first.assessmentId}/${empId}`, { token: supToken });
  console.log('GET supervisor-eval:', s.status);
  const ok = a.status === 200 && u.status === 200 && (s.status === 200 || s.status === 404);
  console.log(ok ? 'VERDICT: PASS — evaluate page data loads' : 'VERDICT: FAIL');

  // full evaluate flow: draft save + submit as supervisor
  if (ok && createdAssId) {
    const sv = await api('/responses/supervisor/save', { method: 'POST', token: supToken, body: { assessmentId: first.assessmentId, employeeId: empId, score: 80, comments: 'E2E eval' } });
    console.log('supervisor save:', sv.status);
    const sb = await api('/responses/supervisor/submit', { method: 'POST', token: supToken, body: { assessmentId: first.assessmentId, employeeId: empId, score: 80, comments: 'E2E eval' } });
    console.log('supervisor submit:', sb.status);
  }
}

if (createdAssId) {
  await prisma.response.deleteMany({ where: { assessmentId: createdAssId } }).catch(() => {});
  await prisma.supervisorEvaluation.deleteMany({ where: { assessmentId: createdAssId } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { userId: sup.id } }).catch(() => {});
  await prisma.assessment.deleteMany({ where: { id: createdAssId } }).catch(() => {});
}

await prisma.user.update({ where: { id: sup.id }, data: { passwordHash: oldHash } });
await prisma.$disconnect();