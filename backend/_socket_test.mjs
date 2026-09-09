import { io } from 'file:///C:/Users/Mesfin/Downloads/ZB-CAS/frontend/node_modules/socket.io-client/build/esm/index.js';
import prisma from './src/config/prisma.js';
import { hashPassword } from './src/utils/password.js';

const BASE = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, json };
}

const uniq = Date.now().toString().slice(-6);
const username = `asgntest${uniq}`;
const password = 'Test@1234x';

// 1) Admin login
const { json: loginJson } = await api('/auth/login', { method: 'POST', body: { username: 'selam.tesfaye', password: 'Admin@123' } });
const adminToken = loginJson.data.accessToken;
const adminId = loginJson.data.user._id || loginJson.data.user.id;

// 2) Ensure second user (correct recipient) with known password
const existing = await prisma.user.findUnique({ where: { username } });
if (existing) {
  await prisma.user.update({ where: { id: existing.id }, data: { status: 'ACTIVE', passwordHash: await hashPassword(password) } });
} else {
  await prisma.user.create({
    data: {
      employeeId: `ASGN${uniq}`, name: `Assign Test ${uniq}`, username, email: `${username}@test.com`,
      roles: ['EMPLOYEE'], status: 'ACTIVE', passwordHash: await hashPassword(password),
    },
  });
}
const user2 = await prisma.user.findUnique({ where: { username } });
const { json: empLogin } = await api('/auth/login', { method: 'POST', body: { username, password } });
const user2Token = empLogin.data.accessToken;

// 3) Competency + question fixtures
let competency = await prisma.competency.findFirst({ where: { name: 'Socket Test Competency', category: 'Technical' } });
if (!competency) competency = await prisma.competency.create({ data: { name: 'Socket Test Competency', category: 'Technical' } });
let question = await prisma.question.findFirst({ where: { text: 'Socket test question?' } });
if (!question) {
  question = await prisma.question.create({
    data: { competencyId: competency.id, targetGroup: 'common', type: 'MCQ', text: 'Socket test question?', options: ['A', 'B'], correctAnswer: 'A' },
  });
}
console.log('0 fixtures ready; user2 =', user2.id);

// 4) Open sockets for admin + user2 (helper)
function listen(tag) {
  return new Promise((resolve) => {
    const got = [];
    const s = io(SOCKET_URL, { auth: { token: tag.token }, transports: ['websocket', 'polling'], reconnectionAttempts: 0 });
    setTimeout(() => { s.disconnect(); resolve({ tag: tag.name, got }); }, 5000);
    s.on('connect', () => console.log(`   [${tag.name}] socket CONNECTED`));
    s.on('connect_error', (e) => console.log(`   [${tag.name}] error ${e.message}`));
    s.on('notification:new', (n) => { got.push(`${n.type}:${n.title}`); console.log(`   [${tag.name}] RECEIVED ${n.type}:${n.title}`); });
  });
}

// 5) Create assessment targeting ONLY user2
const startDate = new Date(Date.now() + 3600_000);
const endDate = new Date(Date.now() + 7200_000);
const created = await api('/assessments', {
  method: 'POST',
  token: adminToken,
  body: {
    competencyId: competency.id,
    targetGroup: 'common',
    purpose: 'Socket assignment test',
    description: `Socket assignment test ${uniq}`,
    targetAudience: { type: 'SPECIFIC_EMPLOYEES', departments: [], employeeIds: [user2.id] },
    questionIds: [question.id],
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    timeLimit: 60,
    type: 'SelfAssessment',
  },
});
console.log('1 assessment created:', created.status, JSON.stringify(created.json?.data?.assessment?._id || created.json?.message));
const assId = created.json?.data?.assessment?._id;

// 6) Open sockets BEFORE scheduling so both receive real-time events
const [a, b] = await Promise.all([listen({ name: 'ADMIN', token: adminToken }), listen({ name: 'USER2', token: user2Token })]);
await new Promise(r => setTimeout(r, 1500)); // let sockets connect

const sched = await api(`/assessments/${assId}/status`, { method: 'PATCH', token: adminToken, body: { status: 'SCHEDULED' } });
console.log('2 scheduled:', sched.status, JSON.stringify(sched.json?.message || sched.json?.error || '').slice(0, 300));
const after = await prisma.assessment.findUnique({ where: { id: assId }, select: { id: true, status: true } });
console.log('   DB status after schedule:', JSON.stringify(after));

await new Promise(r => setTimeout(r, 3500)); // collect remaining events
console.log('\nRESULT ADMIN got:', JSON.stringify(a.got));
console.log('RESULT USER2 got:', JSON.stringify(b.got));

// 7) API-level check
const asUser2 = await api('/notifications', { token: user2Token });
const asAdmin = await api('/notifications', { token: adminToken });
const u2Types = asUser2.json?.data?.notifications?.map(n => n.type) || [];
const adminTypes = asAdmin.json?.data?.notifications?.map(n => n.type) || [];
console.log('USER2 sees types:', JSON.stringify(u2Types));
console.log('ADMIN sees types:', JSON.stringify(adminTypes));

const verdict = b.got.some(g => g.startsWith('ASSESSMENT_ASSIGNED')) && a.got.length === 0 && u2Types.includes('ASSESSMENT_ASSIGNED') && !adminTypes.includes('ASSESSMENT_ASSIGNED');
console.log('\nVERDICT:', verdict ? 'PASS — notification delivered to the correct user only' : 'FAIL');

// 8) Cleanup fixtures
if (assId) {
  await prisma.assessment.deleteMany({ where: { id: assId } }).catch(e => console.log('ass delete:', e.message));
}
await prisma.notification.deleteMany({ where: { userId: user2.id, type: 'ASSESSMENT_ASSIGNED' } });
await prisma.question.deleteMany({ where: { id: question.id } }).catch(() => {});
await prisma.competency.deleteMany({ where: { id: competency.id } }).catch(() => {});
await prisma.$disconnect();