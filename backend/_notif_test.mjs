const BASE = 'http://localhost:5000/api';

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, json };
}

import prisma from './src/config/prisma.js';

const uniq = Date.now().toString().slice(-6);
const username = `nottest${uniq}`;

// 1) Admin login
const { json: loginJson } = await api('/auth/login', {
  method: 'POST',
  body: { username: 'selam.tesfaye', password: 'Admin@123' },
});
const adminToken = loginJson.data.accessToken;
console.log('ADMIN LOGIN:', loginJson.status, loginJson.data.user.name, '| roles:', loginJson.data.user.roles.join(','));

// 2) Register a new employee
const { status: regStatus, json: regJson } = await api('/auth/register', {
  method: 'POST',
  token: adminToken,
  body: {
    employeeId: `TEST${uniq}`,
    name: `Test User ${uniq}`,
    username,
    email: `${username}@test.com`,
    roles: ['EMPLOYEE'],
  },
});
console.log('REGISTER:', regStatus, regJson.message || regJson.error || JSON.stringify(regJson));
const newUser = regJson.data?.user ? (await prisma.user.findUnique({ where: { username } })) : null;
const newUserId = newUser?.id;

// 3) Login as the new employee
const { json: empLogin } = await api('/auth/login', {
  method: 'POST',
  body: { username, password: regJson.data?.tempPassword },
}).catch(e => console.log('login fail', e));
console.log('EMP LOGIN:', empLogin?.status, empLogin?.json?.data?.user?.name, '| tempPwd sent?', !!regJson.data?.tempPassword);

// 4) Fetch notifications AS the new employee — must contain its ACCOUNT_CREATED only
const empToken = empLogin?.json?.data?.accessToken;
if (empToken) {
  const { status, json } = await api('/notifications', { token: empToken });
  console.log('EMP NOTIFICATIONS:', status, JSON.stringify(json?.data?.notifications || json));
}

// 5) Fetch notifications AS ADMIN — must NOT contain the new user's notifications
const { status: adminNStatus, json: adminN } = await api('/notifications', { token: adminToken });
console.log('ADMIN NOTIFICATIONS (should be empty/other):', adminNStatus, 'count=', adminN?.data?.notifications?.length);

// 6) DB check — notification must exist for the NEW user only
const admin = await prisma.user.findFirst({ where: { username: 'selam.tesfaye' } });
const rows = await prisma.notification.findMany({
  where: { userId: { in: [newUserId, admin.id].filter(Boolean) } },
  include: { user: { select: { username: true, name: true } } },
});
console.log('DB NOTIFICATIONS for new+admin user:', rows.length);
for (const r of rows) console.log(' -', r.user?.username, r.type, '|', r.title);
await prisma.$disconnect();