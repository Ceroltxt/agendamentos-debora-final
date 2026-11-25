const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplika-test-'));
fs.copyFileSync(
  path.join(__dirname, '..', 'data', 'reservations.json'),
  path.join(tempDir, 'reservations.json')
);
process.env.DATA_DIR = tempDir;

const { server } = require('../server');

let baseUrl = '';

test.before(async () => {
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function api(route, options = {}) {
  const res = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, data };
}

test('healthcheck e bloqueio de arquivos internos', async () => {
  const health = await api('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);

  const blocked = await fetch(`${baseUrl}/server.js`);
  assert.equal(blocked.status, 404);

  const blockedDb = await fetch(`${baseUrl}/backend/db.js`);
  assert.equal(blockedDb.status, 404);
});

test('fluxo completo de auth: registro, login, quick-access e update-profile', async () => {
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: 'novo.prof@cps.sp.gov.br',
      password: 'segredo123',
      name: 'Prof. Teste',
      role: 'Docente CPS'
    })
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.email, 'novo.prof@cps.sp.gov.br');
  assert.ok(reg.data.token);

  const me = await api('/api/auth/me', {
    headers: { Authorization: `Bearer ${reg.data.token}` }
  });
  assert.equal(me.status, 200);
  assert.equal(me.data.authenticated, true);
  assert.equal(me.data.user.name, 'Prof. Teste');

  const badLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'novo.prof@cps.sp.gov.br', password: 'errada' })
  });
  assert.equal(badLogin.status, 401);

  const quick = await api('/api/auth/quick-access', {
    method: 'POST',
    body: JSON.stringify({ profileKey: 'dimitri' })
  });
  assert.equal(quick.status, 200);
  assert.equal(quick.data.user.userId, 'user_dimitri');

  const updateProfile = await api('/api/update-profile', {
    method: 'POST',
    body: JSON.stringify({
      userId: reg.data.user.userId,
      name: 'Prof. Novo Nome',
      role: 'Docente CPS',
      oldName: 'Dimitri'
    })
  });
  assert.equal(updateProfile.status, 200);
  const dimitriRes = updateProfile.data.reservations.find((r) => r.id === 'res_1792848132353');
  assert.equal(dimitriRes.authorId, 'user_dimitri');
  assert.equal(dimitriRes.authorName, 'Dimitri');
});

test('escolas: conta nova começa sem escolas e vincula pelo id ou código', async () => {
  const newTeacher = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: 'docente.novo@cps.sp.gov.br',
      password: 'segredo123',
      name: 'Prof. Sem Escola',
      role: 'Docente CPS'
    })
  });
  assert.equal(newTeacher.status, 201);

  const emptySchools = await api(`/api/schools?userId=${encodeURIComponent(newTeacher.data.user.userId)}`);
  assert.equal(emptySchools.status, 200);
  assert.equal(emptySchools.data.userSchools.length, 0);

  const joinById = await api('/api/schools/join', {
    method: 'POST',
    body: JSON.stringify({ code: 'furlan', userId: newTeacher.data.user.userId })
  });
  assert.equal(joinById.status, 200);
  assert.equal(joinById.data.school.id, 'furlan');
  assert.equal(joinById.data.userSchools.length, 1);

  const listRes = await api('/api/schools?userId=user_dimitri');
  assert.equal(listRes.status, 200);
  assert.ok(listRes.data.schools.length >= 2);
  assert.equal(listRes.data.userSchools[0].id, 'furlan');

  const invalid = await api('/api/schools/join', {
    method: 'POST',
    body: JSON.stringify({ code: 'CODIGO-FAKE', userId: 'user_dimitri' })
  });
  assert.equal(invalid.status, 404);

  const join = await api('/api/schools/join', {
    method: 'POST',
    body: JSON.stringify({ code: 'ETEC-RM2026-1042', userId: 'user_dimitri' })
  });
  assert.equal(join.status, 200);
  assert.equal(join.data.school.id, 'rocha-mendes');
  assert.equal(join.data.userSchools.length, 2);
});

test('agendamentos: criar, detectar conflito de sala e conflito cruzado, cancelar', async () => {
  const created = await api('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({
      reservation: {
        id: 'res_test_001',
        schoolId: 'furlan',
        space: 'Sala Maker',
        day: 'qua',
        date: '2026-11-25',
        period: 'tarde',
        slotIndex: 1,
        slotLabel: '2ª aula',
        slotTime: '14:00 – 14:50',
        description: 'Projeto Integrador',
        authorName: 'Prof. Teste',
        authorRole: 'Docente CPS',
        authorId: 'user_teste',
        isRecurrent: false
      }
    })
  });
  assert.equal(created.status, 201);

  const sameSlot = await api('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({
      reservation: {
        id: 'res_test_002',
        schoolId: 'furlan',
        space: 'Sala Maker',
        day: 'qua',
        date: '2026-11-25',
        period: 'tarde',
        slotIndex: 1,
        slotLabel: '2ª aula',
        slotTime: '14:00 – 14:50',
        description: 'Conflito',
        authorName: 'Outro Prof',
        authorId: 'user_outro',
        isRecurrent: false
      }
    })
  });
  assert.equal(sameSlot.status, 409);

  const crossSpace = await api('/api/reservations', {
    method: 'POST',
    body: JSON.stringify({
      reservation: {
        id: 'res_test_003',
        schoolId: 'furlan',
        space: 'Biblioteca',
        day: 'qua',
        date: '2026-11-25',
        period: 'tarde',
        slotIndex: 1,
        slotLabel: '2ª aula',
        slotTime: '14:00 – 14:50',
        description: 'Conflito cruzado',
        authorName: 'Prof. Teste',
        authorId: 'user_teste',
        isRecurrent: false
      }
    })
  });
  assert.equal(crossSpace.status, 409);

  const forbiddenDel = await api('/api/reservations/res_test_001?authorId=user_outro', {
    method: 'DELETE'
  });
  assert.equal(forbiddenDel.status, 403);

  const del = await api('/api/reservations/res_test_001?authorId=user_teste', {
    method: 'DELETE'
  });
  assert.equal(del.status, 200);
});

test('avisos, configurações e leads', async () => {
  const postNotice = await api('/api/notices', {
    method: 'POST',
    body: JSON.stringify({ schoolId: 'furlan', title: 'Aviso Teste', desc: 'Descrição' })
  });
  assert.equal(postNotice.status, 201);

  const getNotices = await api('/api/notices?schoolId=furlan');
  assert.equal(getNotices.status, 200);
  assert.equal(getNotices.data.notices.length, 1);

  const saveCfg = await api('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ userId: 'user_dimitri', modoEscuro: true, textoMaior: true })
  });
  assert.equal(saveCfg.status, 200);
  assert.equal(saveCfg.data.settings.modoEscuro, true);

  const lead = await api('/api/leads', {
    method: 'POST',
    body: JSON.stringify({
      schoolName: 'ETEC Teste',
      contactName: 'Maria',
      contactPhone: '(11) 99999-8888',
      roomCount: '5 salas',
      classSchedules: 'Manhã e Tarde'
    })
  });
  assert.equal(lead.status, 201);

  const leads = await api('/api/leads');
  assert.equal(leads.status, 200);
  assert.equal(leads.data.leads.length, 1);
});
