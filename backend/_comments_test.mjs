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
if (!adminToken) { console.log('BACKEND NOT READY'); process.exit(2); }

// find a supervisor evaluation WITH comments, then its result
const withComments = await prisma.response.findFirst({
  where: { respondentType: 'supervisor', comments: { not: '' } },
  select: { assessmentId: true, employeeId: true, comments: true },
});
console.log('supervisor response with comments:', withComments ? 'FOUND' : 'NONE', withComments ? JSON.stringify(withComments.comments).slice(0, 80) : '');
if (withComments) {
  const result = await prisma.result.findFirst({
    where: { assessmentId: withComments.assessmentId, userId: withComments.employeeId },
    select: { id: true },
  });
  if (result) {
    const rd = await api(`/results/${result.id}`, { token: adminToken });
    const se = rd.json?.data?.supervisorEvaluation;
    console.log('result detail status:', rd.status);
    console.log('supervisorEvaluation returned:', JSON.stringify(se)?.slice(0, 200));
    console.log(se && se.comments ? 'VERDICT: PASS — comments surface in result detail' : 'VERDICT: FAIL');
  } else {
    console.log('no result row for that pair (Combined not yet scored?) — checking pending-count endpoint instead');
  }
} else {
  console.log('no commented evaluations in DB — submitting one via API as supervisor is covered by flow test; skipping');
}

// dashboard pending shape check (competency object present for name display)
const dash = await api('/dashboard/employee?period=yearly', { token: adminToken });
const pend = dash.json?.data?.pendingAssessments || [];
console.log('dashboard pending sample keys:', JSON.stringify(Object.keys(pend[0] || {})));
await prisma.$disconnect();