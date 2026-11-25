const {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  extractToken,
  setAuthCookie,
  clearAuthCookie
} = require('./auth');
const { checkReservationConflict } = require('./conflict');

const MAX_BODY_BYTES = 1024 * 1024; // 1MB

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function publicUser(user) {
  if (!user) return null;
  return {
    userId: user.id,
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

function getAuthenticatedUser(req, store, authSecret) {
  const token = extractToken(req);
  if (!token) return null;
  const payload = verifyToken(token, authSecret);
  if (!payload || !payload.userId) return null;
  return store.findUserById(payload.userId) || {
    id: payload.userId,
    userId: payload.userId,
    email: payload.email || '',
    name: payload.name || 'Docente',
    role: payload.role || 'Docente CPS'
  };
}

function createApiHandler(store, authSecret) {
  return async function handleApiRequest(req, res, urlObj) {
    const reqPath = urlObj.pathname;
    const method = req.method;

    try {
      // Healthcheck
      if (reqPath === '/api/health' && method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          engine: store.engine,
          timestamp: new Date().toISOString()
        });
      }

      // Auth: Register
      if (reqPath === '/api/auth/register' && method === 'POST') {
        const body = await readJsonBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const name = String(body.name || '').trim();
        const role = String(body.role || 'Docente CPS').trim() || 'Docente CPS';

        if (!email || !email.includes('@')) {
          return sendJson(res, 400, { error: 'Informe um e-mail válido.' });
        }
        if (!name) {
          return sendJson(res, 400, { error: 'Informe seu nome completo.' });
        }
        if (password.length < 6) {
          return sendJson(res, 400, { error: 'A senha deve conter no mínimo 6 caracteres.' });
        }
        if (store.findUserByEmail(email)) {
          return sendJson(res, 409, { error: 'Este e-mail já está cadastrado. Vá em "Entrar".' });
        }

        let userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        if (email === 'dguerrask@gmail.com') userId = 'user_dimitri';
        else if (email.includes('anacarol') || email.includes('ana.carol')) userId = 'user_anacarol';

        const user = store.createUser({
          id: userId,
          email,
          name,
          role,
          passwordHash: hashPassword(password)
        });

        const token = signToken(publicUser(user), authSecret);
        setAuthCookie(res, token);
        return sendJson(res, 201, {
          success: true,
          user: publicUser(user),
          token
        });
      }

      // Auth: Login
      if (reqPath === '/api/auth/login' && method === 'POST') {
        const body = await readJsonBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');

        if (!email || !password) {
          return sendJson(res, 400, { error: 'Preencha e-mail e senha.' });
        }

        const user = store.findUserByEmail(email);
        if (!user || !verifyPassword(password, user.passwordHash)) {
          return sendJson(res, 401, { error: 'E-mail ou senha incorretos.' });
        }

        const token = signToken(publicUser(user), authSecret);
        setAuthCookie(res, token);
        return sendJson(res, 200, {
          success: true,
          user: publicUser(user),
          token
        });
      }

      // Auth: Quick-access demo users
      if (reqPath === '/api/auth/quick-access' && method === 'POST') {
        const body = await readJsonBody(req);
        const key = String(body.profileKey || '').trim().toLowerCase();
        const targetEmail =
          key === 'anacarol' ? 'anacarol.docente@gmail.com' : 'dguerrask@gmail.com';
        const user = store.findUserByEmail(targetEmail);
        if (!user) {
          return sendJson(res, 404, { error: 'Conta de demonstração não encontrada.' });
        }
        store.joinSchool(user.id, 'furlan');
        const token = signToken(publicUser(user), authSecret);
        setAuthCookie(res, token);
        return sendJson(res, 200, {
          success: true,
          user: publicUser(user),
          token
        });
      }

      // Auth: Current session
      if (reqPath === '/api/auth/me' && method === 'GET') {
        const user = getAuthenticatedUser(req, store, authSecret);
        if (!user) {
          return sendJson(res, 401, { authenticated: false, user: null });
        }
        return sendJson(res, 200, {
          authenticated: true,
          user: publicUser(user)
        });
      }

      // Auth: Logout
      if (reqPath === '/api/auth/logout' && method === 'POST') {
        clearAuthCookie(res);
        return sendJson(res, 200, { success: true });
      }

      // Update profile
      if (reqPath === '/api/update-profile' && method === 'POST') {
        const body = await readJsonBody(req);
        const authUser = getAuthenticatedUser(req, store, authSecret);
        const userId = body.userId || (authUser && authUser.id);
        const name = String(body.name || '').trim();
        const role = String(body.role || 'Docente CPS').trim();
        const oldName = String(body.oldName || '').trim();

        if (!userId || !name) {
          return sendJson(res, 400, { error: 'userId e name são obrigatórios.' });
        }

        const reservations = store.updateUserProfile({ userId, name, role, oldName });
        const updatedUser = store.findUserById(userId);
        if (updatedUser) {
          const token = signToken(publicUser(updatedUser), authSecret);
          setAuthCookie(res, token);
        }

        return sendJson(res, 200, {
          success: true,
          user: updatedUser ? publicUser(updatedUser) : { userId, name, role },
          reservations,
          lastUpdated: store.getLastUpdated()
        });
      }

      // Schools: List
      if (reqPath === '/api/schools' && method === 'GET') {
        const authUser = getAuthenticatedUser(req, store, authSecret);
        const userId = urlObj.searchParams.get('userId') || (authUser && authUser.id) || null;
        const schools = store.listSchools();
        const userSchools = userId ? store.listUserSchools(userId) : [];
        return sendJson(res, 200, {
          schools,
          userSchools
        });
      }

      // Schools: Join by code
      if (reqPath === '/api/schools/join' && method === 'POST') {
        const body = await readJsonBody(req);
        const authUser = getAuthenticatedUser(req, store, authSecret);
        const userId = body.userId || (authUser && authUser.id) || null;
        const code = String(body.code || '').trim();
        if (!code) {
          return sendJson(res, 400, { error: 'Digite o código da escola.' });
        }
        const school = store.findSchoolByCode(code);
        if (!school) {
          return sendJson(res, 404, { error: 'Código de escola inválido.' });
        }
        const userSchools = userId ? store.joinSchool(userId, school.id) : [school];
        return sendJson(res, 200, {
          success: true,
          school,
          userSchools
        });
      }

      // Reservations: List
      if (reqPath === '/api/reservations' && method === 'GET') {
        const schoolFilter = urlObj.searchParams.get('schoolId');
        const allReservations = store.listReservations();
        const filtered = schoolFilter
          ? allReservations.filter((r) => (r.schoolId || 'furlan') === schoolFilter)
          : allReservations;

        return sendJson(res, 200, {
          reservations: filtered,
          allReservations,
          lastUpdated: store.getLastUpdated()
        });
      }

      // Reservations: Create single OR bulk sync
      if (reqPath === '/api/reservations' && method === 'POST') {
        const body = await readJsonBody(req);

        // Single reservation creation with server-side conflict validation
        if (body.reservation || (body.space && body.period && body.slotIndex !== undefined)) {
          const item = body.reservation || body;
          const authUser = getAuthenticatedUser(req, store, authSecret);
          const candidate = {
            id: item.id || `res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            schoolId: item.schoolId || 'furlan',
            space: String(item.space || '').trim(),
            day: String(item.day || '').trim(),
            date: String(item.date || '').trim(),
            period: String(item.period || '').trim(),
            slotIndex: Number(item.slotIndex),
            slotLabel: String(item.slotLabel || `${Number(item.slotIndex) + 1}ª aula`),
            slotTime: String(item.slotTime || ''),
            description: String(item.description || '').trim() || 'Atividade de aula',
            grade: String(item.grade || 'Turma ETEC').trim(),
            authorName: String(item.authorName || (authUser && authUser.name) || 'Docente ETEC').trim(),
            authorRole: String(item.authorRole || (authUser && authUser.role) || 'Docente CPS').trim(),
            authorId: String(item.authorId || (authUser && authUser.id) || 'user_dimitri'),
            isRecurrent: Boolean(item.isRecurrent),
            recurrentDays: Array.isArray(item.recurrentDays) ? item.recurrentDays : [],
            createdAt: item.createdAt || new Date().toISOString()
          };

          if (!candidate.space || !candidate.period || Number.isNaN(candidate.slotIndex)) {
            return sendJson(res, 400, { error: 'Dados obrigatórios da reserva incompletos.' });
          }

          const allReservations = store.listReservations();
          const conflict = checkReservationConflict(allReservations, candidate);
          if (conflict) {
            return sendJson(res, 409, {
              error: conflict.message,
              code: conflict.type
            });
          }

          const created = store.createReservation(candidate);
          return sendJson(res, 201, {
            success: true,
            reservation: created,
            lastUpdated: store.getLastUpdated()
          });
        }

        // Bulk sync compatibility
        if (Array.isArray(body.reservations)) {
          const allReservations = store.replaceReservations(body.reservations, body.schoolId || null);
          return sendJson(res, 200, {
            success: true,
            count: allReservations.length,
            reservations: allReservations,
            lastUpdated: store.getLastUpdated()
          });
        }

        return sendJson(res, 400, { error: 'Corpo da requisição inválido.' });
      }

      // Reservations: Delete by id
      if (reqPath.startsWith('/api/reservations/') && method === 'DELETE') {
        const id = decodeURIComponent(reqPath.slice('/api/reservations/'.length)).trim();
        if (!id) {
          return sendJson(res, 400, { error: 'ID da reserva não informado.' });
        }
        const existing = store.getReservationById(id);
        if (!existing) {
          return sendJson(res, 404, { error: 'Reserva não encontrada.' });
        }

        const authUser = getAuthenticatedUser(req, store, authSecret);
        const requestedAuthorId = urlObj.searchParams.get('authorId');
        const actorId = (authUser && authUser.id) || requestedAuthorId;
        if (actorId && existing.authorId && existing.authorId !== actorId) {
          return sendJson(res, 403, { error: 'Você só pode cancelar suas próprias reservas.' });
        }

        store.deleteReservation(id);
        return sendJson(res, 200, {
          success: true,
          id,
          lastUpdated: store.getLastUpdated()
        });
      }

      // Notices: List / Add / Clear
      if (reqPath === '/api/notices' && method === 'GET') {
        const schoolId = urlObj.searchParams.get('schoolId') || 'furlan';
        return sendJson(res, 200, { notices: store.listNotices(schoolId) });
      }

      if (reqPath === '/api/notices' && method === 'POST') {
        const body = await readJsonBody(req);
        const title = String(body.title || '').trim();
        const desc = String(body.desc || '').trim();
        const schoolId = String(body.schoolId || 'furlan').trim();
        const time = String(body.time || 'Agora').trim();
        if (!title) {
          return sendJson(res, 400, { error: 'Título do aviso é obrigatório.' });
        }
        const notice = store.addNotice({
          id: `notice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          schoolId,
          title,
          desc,
          time
        });
        return sendJson(res, 201, { success: true, notice });
      }

      if (reqPath === '/api/notices' && method === 'DELETE') {
        const schoolId = urlObj.searchParams.get('schoolId') || 'furlan';
        store.clearNotices(schoolId);
        return sendJson(res, 200, { success: true });
      }

      // Settings: Get / Save
      if (reqPath === '/api/settings' && method === 'GET') {
        const authUser = getAuthenticatedUser(req, store, authSecret);
        const userId = urlObj.searchParams.get('userId') || (authUser && authUser.id) || 'guest';
        return sendJson(res, 200, { settings: store.getSettings(userId) });
      }

      if (reqPath === '/api/settings' && (method === 'PUT' || method === 'POST')) {
        const body = await readJsonBody(req);
        const authUser = getAuthenticatedUser(req, store, authSecret);
        const userId = body.userId || (authUser && authUser.id) || 'guest';
        const settings = store.saveSettings(userId, body);
        return sendJson(res, 200, { success: true, settings });
      }

      // Leads: List / Create
      if (reqPath === '/api/leads' && method === 'GET') {
        return sendJson(res, 200, { leads: store.listLeads() });
      }

      if (reqPath === '/api/leads' && method === 'POST') {
        const body = await readJsonBody(req);
        const schoolName = String(body.schoolName || '').trim();
        const contactName = String(body.contactName || '').trim();
        const contactPhone = String(body.contactPhone || '').trim();
        const roomCount = String(body.roomCount || '').trim();
        const classSchedules = String(body.classSchedules || '').trim();
        const notes = String(body.notes || '').trim();

        if (!schoolName || !contactName || !contactPhone || !roomCount || !classSchedules) {
          return sendJson(res, 400, { error: 'Preencha todos os campos obrigatórios.' });
        }

        const lead = store.addLead({
          id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          schoolName,
          contactName,
          contactPhone,
          roomCount,
          classSchedules,
          notes
        });
        return sendJson(res, 201, { success: true, lead });
      }

      return sendJson(res, 404, { error: 'Rota de API não encontrada.' });
    } catch (err) {
      if (err && err.message === 'INVALID_JSON') {
        return sendJson(res, 400, { error: 'JSON inválido.' });
      }
      if (err && err.message === 'PAYLOAD_TOO_LARGE') {
        return sendJson(res, 413, { error: 'Payload excede o limite permitido.' });
      }
      console.error('Erro na API:', err);
      return sendJson(res, 500, { error: 'Erro interno no servidor.' });
    }
  };
}

module.exports = {
  createApiHandler
};
