import prisma from './src/config/prisma.js';
import { hashPassword } from './src/utils/password.js';
import { logActivity } from './src/services/activityService.js';

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

const uniq = Date.now().toString().slice(-6);
const username = `fbx${uniq}`;
const password = 'Test@1234x';

const { json: loginJson } = await api('/auth/login', { method: 'POST', body: { username: 'selam.tesfaye', password: 'Admin@123' } });
const adminToken = loginJson.data.accessToken;
const adminUser = await prisma.user.findUnique({ where: { username: 'selam.tesfaye' } });

let competency = await prisma.competency.findFirst({ where: { name: 'Feedback Bugfix Competency', category: 'Technical' } });
if (!competency) competency = await prisma.competency.create({ data: { name: 'Feedback Bugfix Competency', category: 'Technical' } });
let question = await prisma.question.findFirst({ where: { text: 'Feedback bugfix question?' } });
if (!question) {
  question = await prisma.question.create({
    data: { competencyId: competency.id, targetGroup: 'common', type: 'MCQ', text: 'Feedback bugfix question?', options: ['A', 'B'], correctAnswer: 'A' },
  });
}

const employee = await prisma.user.create({
  data: {
    employeeId: `FBX${uniq}`, name: `Feedback Test ${uniq}`, username, email: `${username}@test.com`,
    roles: ['EMPLOYEE'], status: 'ACTIVE', passwordHash: await hashPassword(password),
  },
});
const { json: empLogin } = await api('/auth/login', { method: 'POST', body: { username, password } });
const empToken = empLogin.data.accessToken;

// Assessment targeted at the employee
const created = await api('/assessments', {
  method: 'POST', token: adminToken,
  body: {
    competencyId: competency.id, targetGroup: 'common', purpose: 'Career Development', description: `Feedback bugfix E2E ${uniq}`,
    targetAudience: { type: 'SPECIFIC_EMPLOYEES', departments: [], employeeIds: [employee.id] },
    questionIds: [question.id],
    startDate: new Date(Date.now() - 3600_000).toISOString(), endDate: new Date(Date.now() + 3600_000).toISOString(),
    timeLimit: 60, type: 'SelfAssessment',
  },
});
const assId = created.json?.data?.assessment?._id;
await api(`/assessments/${assId}/status`, { method: 'PATCH', token: adminToken, body: { status: 'SCHEDULED' } });
await api(`/assessments/${assId}/status`, { method: 'PATCH', token: adminToken, body: { status: 'ACTIVE' } });

// Verify assessment detail returns questions WITH options (issue 3 API side)
const detail = await api(`/assessments/${assId}`, { token: adminToken });
const q0 = detail.json?.data?.assessment?.questionIds?.[0];
console.log('assessment detail question options count:', q0?.options?.length, '(want 2)');

// Employee takes it (zero answers) -> security record + result created
await api('/responses/submit', {
  method: 'POST', token: empToken,
  body: { assessmentId: assId, employeeId: employee.id, respondentType: 'self', securityLog: [], totalViolations: 0 },
});
await api('/results/auto-score', { method: 'POST', token: empToken, body: { assessmentId: assId, employeeId: employee.id } });

// ISSUE 1: feedback eligible-assessments no longer 500s and includes the taken one
const elig = await api('/feedback/eligible-assessments', { token: empToken });
const eligIds = elig.json?.data?.assessments?.map(a => a.id) || [];
console.log('feedback eligible status:', elig.status, 'includes taken:', eligIds.includes(assId), '(want 200 + true)');

// ISSUE 2: result detail exposes purpose + targetGroup
const results = await api(`/results/user/${employee.id}`, { token: empToken });
const myRes = results.json?.data?.results?.find(r => (r.assessmentId?._id || r.assessmentId) === assId);
const rd = await api(`/results/${myRes._id}`, { token: empToken });
console.log('result purpose:', rd.json?.data?.result?.purpose, '| targetGroup:', rd.json?.data?.result?.targetGroup, '(want non-N/A)');

// ISSUE 4: activity guard — admin logs, employee skipped
const before = await prisma.activityLog.count({ where: { action: { in: ['bra_guard_admin', 'bra_guard_employee'] } } });
await logActivity({ actor: adminUser.id, action: 'bra_guard_admin', entity: 'GuardTest' });
await logActivity({ actor: employee.id, action: 'bra_guard_employee', entity: 'GuardTest' });
const after = await prisma.activityLog.count({ where: { action: { in: ['bra_guard_admin', 'bra_guard_employee'] } } });
const adminRow = await prisma.activityLog.findFirst({ where: { action: 'bra_guard_admin' }, select: { actorRole: true } });
console.log('activity rows created (want 1, admin only):', after - before, '| admin actorRole:', adminRow?.actorRole);

const pass = q0?.options?.length === 2
  && elig.status === 200 && eligIds.includes(assId)
  && rd.json?.data?.result?.purpose !== 'N/A' && rd.json?.data?.result?.targetGroup !== 'N/A'
  && (after - before) === 1;
console.log('\nVERDICT:', pass ? 'PASS — feedback, result purpose/target, options, admin-only activity all fixed' : 'FAIL');

// Cleanup
await prisma.activityLog.deleteMany({ where: { action: { in: ['bra_guard_admin', 'bra_guard_employee'] } } });
await prisma.feedback.deleteMany({ where: { userId: employee.id } }).catch(() => {});
await prisma.resultQuestionDetail.deleteMany({ where: { result: { is: { assessmentId: assId, userId: employee.id } } } }).catch(() => {});
await prisma.result.deleteMany({ where: { assessmentId: assId, userId: employee.id } }).catch(() => {});
await prisma.response.deleteMany({ where: { assessmentId: assId, employeeId: employee.id } }).catch(() => {});
await prisma.securityViolation.deleteMany({ where: { assessmentId: assId, userId: employee.id } }).catch(() => {});
await prisma.notification.deleteMany({ where: { userId: employee.id } }).catch(() => {});
await prisma.assessment.deleteMany({ where: { id: assId } }).catch(() => {});
await prisma.question.deleteMany({ where: { id: question.id } }).catch(() => {});
await prisma.competency.deleteMany({ where: { id: competency.id } }).catch(() => {});
await prisma.user.deleteMany({ where: { id: employee.id } }).catch(() => {});
await prisma.$disconnect();