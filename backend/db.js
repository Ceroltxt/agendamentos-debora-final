const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./auth');

let SqliteDatabase = null;
try {
  ({ DatabaseSync: SqliteDatabase } = require('node:sqlite'));
} catch (e) {
  SqliteDatabase = null;
}

const DEFAULT_SCHOOLS = [
  {
    id: 'furlan',
    name: 'ETEC Antônio Furlan',
    code: 'ETEC-AF2026-8392',
    aliases: ['ETEC-AF2026-8392', 'ETEC-AB12CD', 'AF2026-8392'],
    city: 'Barueri - SP',
    description: 'Sistema de agendamento de espaços',
    spaces: ['Sala Maker', 'Biblioteca']
  },
  {
    id: 'rocha-mendes',
    name: 'ETEC Rocha Mendes',
    code: 'ETEC-RM2026-1042',
    aliases: ['ETEC-RM2026-1042'],
    city: 'São Paulo - SP',
    description: 'Agendamento integrado de laboratórios e biblioteca',
    spaces: ['Sala Maker', 'Biblioteca']
  }
];

function createDefaultSettings(userId) {
  return {
    userId,
    modoEscuro: false,
    altoContraste: false,
    textoMaior: false,
    reduzirAnim: false,
    leituraFacil: false,
    destacarFoco: false,
    reservaConf: true,
    reservaAlt: true,
    receberEmail: false
  };
}

function harmonizeReservations(list) {
  if (!Array.isArray(list)) return [];
  const latestByAuthor = new Map();
  list.forEach((r) => {
    if (r && r.authorId && r.authorName) {
      const prev = latestByAuthor.get(r.authorId);
      const rTime = r.createdAt ? new Date(r.createdAt).getTime() : 0;
      if (!prev || rTime >= prev.time) {
        latestByAuthor.set(r.authorId, {
          name: r.authorName.trim(),
          role: r.authorRole ? r.authorRole.trim() : 'Docente CPS',
          time: rTime
        });
      }
    }
  });

  const knownNameMap = new Map();
  const anaLatest = latestByAuthor.get('user_anacarol');
  if (anaLatest) {
    knownNameMap.set('ana carol', anaLatest);
    knownNameMap.set('carol', anaLatest);
  }
  const dimitriLatest = latestByAuthor.get('user_dimitri');
  if (dimitriLatest) {
    knownNameMap.set('dimitri', dimitriLatest);
  }

  return list
    .filter(Boolean)
    .map((r) => {
      let authorInfo = null;
      if (r.authorId && latestByAuthor.has(r.authorId)) {
        authorInfo = latestByAuthor.get(r.authorId);
      } else if (r.authorName && knownNameMap.has(r.authorName.trim().toLowerCase())) {
        authorInfo = knownNameMap.get(r.authorName.trim().toLowerCase());
      }
      const schoolId = r.schoolId || 'furlan';
      return {
        ...r,
        schoolId,
        slotIndex: Number(r.slotIndex),
        isRecurrent: Boolean(r.isRecurrent),
        recurrentDays: Array.isArray(r.recurrentDays) ? r.recurrentDays : [],
        authorName: authorInfo ? authorInfo.name : (r.authorName || 'Docente ETEC'),
        authorRole: authorInfo ? (authorInfo.role || r.authorRole || 'Docente CPS') : (r.authorRole || 'Docente CPS'),
        authorId: r.authorId || (authorInfo === anaLatest ? 'user_anacarol' : 'user_dimitri')
      };
    });
}

function loadLegacyReservationsSeed(dataDir) {
  const legacyFile = path.join(dataDir, 'reservations.json');
  try {
    if (fs.existsSync(legacyFile)) {
      const parsed = JSON.parse(fs.readFileSync(legacyFile, 'utf-8'));
      if (Array.isArray(parsed)) {
        return harmonizeReservations(parsed);
      }
    }
  } catch (e) {}
  return [];
}

function createStore(dataDir) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (SqliteDatabase) {
    return createSqliteStore(dataDir);
  }
  return createJsonStore(dataDir);
}

function buildDemoUsers() {
  const now = new Date().toISOString();
  return [
    {
      id: 'user_dimitri',
      email: 'dguerrask@gmail.com',
      name: 'Dimitri',
      role: 'Docente CPS',
      passwordHash: hashPassword('123456'),
      createdAt: now
    },
    {
      id: 'user_anacarol',
      email: 'anacarol.docente@gmail.com',
      name: 'Ana Carol',
      role: 'Docente CPS',
      passwordHash: hashPassword('123456'),
      createdAt: now
    }
  ];
}

function createSqliteStore(dataDir) {
  const dbPath = path.join(dataDir, 'aplika.db');
  const db = new SqliteDatabase(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      aliases_json TEXT NOT NULL,
      city TEXT NOT NULL,
      description TEXT NOT NULL,
      spaces_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_schools (
      user_id TEXT NOT NULL,
      school_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (user_id, school_id)
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL,
      space TEXT NOT NULL,
      day TEXT NOT NULL,
      date TEXT,
      period TEXT NOT NULL,
      slot_index INTEGER NOT NULL,
      slot_label TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      description TEXT NOT NULL,
      grade TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      author_id TEXT NOT NULL,
      is_recurrent INTEGER NOT NULL DEFAULT 0,
      recurrent_days_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notices (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      time_label TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      school_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      room_count TEXT NOT NULL,
      class_schedules TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Seed schools
  const insertSchool = db.prepare(`
    INSERT OR IGNORE INTO schools (id, name, code, aliases_json, city, description, spaces_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  DEFAULT_SCHOOLS.forEach((s) => {
    insertSchool.run(
      s.id,
      s.name,
      s.code,
      JSON.stringify(s.aliases),
      s.city,
      s.description,
      JSON.stringify(s.spaces)
    );
  });

  // Seed demo users and school memberships
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, name, role, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertUserSchool = db.prepare(`
    INSERT OR IGNORE INTO user_schools (user_id, school_id, joined_at)
    VALUES (?, ?, ?)
  `);
  buildDemoUsers().forEach((u) => {
    insertUser.run(u.id, u.email, u.name, u.role, u.passwordHash, u.createdAt);
    insertUserSchool.run(u.id, 'furlan', u.createdAt);
  });

  // Seed reservations from legacy JSON if empty
  const resCount = db.prepare('SELECT COUNT(*) as total FROM reservations').get().total;
  if (resCount === 0) {
    const seed = loadLegacyReservationsSeed(dataDir);
    const insertRes = db.prepare(`
      INSERT OR IGNORE INTO reservations (
        id, school_id, space, day, date, period, slot_index, slot_label, slot_time,
        description, grade, author_name, author_role, author_id, is_recurrent,
        recurrent_days_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    seed.forEach((r) => {
      insertRes.run(
        r.id,
        r.schoolId || 'furlan',
        r.space,
        r.day,
        r.date || '',
        r.period,
        Number(r.slotIndex),
        r.slotLabel,
        r.slotTime,
        r.description || '',
        r.grade || 'Turma ETEC',
        r.authorName || 'Docente ETEC',
        r.authorRole || 'Docente CPS',
        r.authorId || 'user_dimitri',
        r.isRecurrent ? 1 : 0,
        JSON.stringify(r.recurrentDays || []),
        r.createdAt || new Date().toISOString()
      );
    });
  }

  let lastUpdated = Date.now();
  const touch = () => {
    lastUpdated = Date.now();
    return lastUpdated;
  };

  function mapUserRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      passwordHash: row.password_hash,
      createdAt: row.created_at
    };
  }

  function mapSchoolRow(row) {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      aliases: JSON.parse(row.aliases_json || '[]'),
      city: row.city,
      description: row.description,
      spaces: JSON.parse(row.spaces_json || '["Sala Maker","Biblioteca"]')
    };
  }

  function mapReservationRow(row) {
    return {
      id: row.id,
      schoolId: row.school_id,
      space: row.space,
      day: row.day,
      date: row.date || '',
      period: row.period,
      slotIndex: Number(row.slot_index),
      slotLabel: row.slot_label,
      slotTime: row.slot_time,
      description: row.description,
      grade: row.grade,
      authorName: row.author_name,
      authorRole: row.author_role,
      authorId: row.author_id,
      isRecurrent: Boolean(row.is_recurrent),
      recurrentDays: JSON.parse(row.recurrent_days_json || '[]'),
      createdAt: row.created_at
    };
  }

  return {
    engine: 'sqlite',
    getLastUpdated: () => lastUpdated,

    findUserByEmail(email) {
      const row = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
      return mapUserRow(row);
    },

    findUserById(id) {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      return mapUserRow(row);
    },

    createUser({ id, email, name, role, passwordHash }) {
      const createdAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO users (id, email, name, role, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, email.toLowerCase().trim(), name.trim(), role.trim(), passwordHash, createdAt);
      return this.findUserById(id);
    },

    updateUserProfile({ userId, name, role, oldName }) {
      const newName = name.trim();
      const newRole = role ? role.trim() : 'Docente CPS';
      db.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?').run(newName, newRole, userId);

      const all = this.listReservations();
      const normOld = (oldName || '').trim().toLowerCase();
      const updateStmt = db.prepare(`
        UPDATE reservations SET author_name = ?, author_role = ?, author_id = ? WHERE id = ?
      `);
      all.forEach((r) => {
        const matchId = r.authorId === userId;
        const matchOld = !r.authorId && normOld && r.authorName && r.authorName.trim().toLowerCase() === normOld;
        const matchKnownAna =
          userId === 'user_anacarol' &&
          r.authorName &&
          ['ana carol', 'carol'].includes(r.authorName.trim().toLowerCase());
        const matchKnownDimitri =
          userId === 'user_dimitri' &&
          r.authorName &&
          ['dimitri', 'jow'].includes(r.authorName.trim().toLowerCase());
        if (matchId || matchOld || matchKnownAna || matchKnownDimitri) {
          updateStmt.run(newName, newRole, userId, r.id);
        }
      });
      touch();
      return this.listReservations();
    },

    listSchools() {
      return db.prepare('SELECT * FROM schools ORDER BY name ASC').all().map(mapSchoolRow);
    },

    listUserSchools(userId) {
      if (!userId) return [];
      const rows = db.prepare(`
        SELECT s.* FROM schools s
        INNER JOIN user_schools us ON us.school_id = s.id
        WHERE us.user_id = ?
        ORDER BY us.joined_at ASC
      `).all(userId);
      return rows.map(mapSchoolRow);
    },

    findSchoolByCode(rawCode) {
      const clean = String(rawCode || '').trim().toUpperCase();
      if (!clean) return null;
      return this.listSchools().find(
        (s) =>
          s.id.toUpperCase() === clean ||
          s.code.toUpperCase() === clean ||
          s.aliases.some((a) => a.toUpperCase() === clean)
      ) || null;
    },

    joinSchool(userId, schoolId) {
      db.prepare(`
        INSERT OR IGNORE INTO user_schools (user_id, school_id, joined_at)
        VALUES (?, ?, ?)
      `).run(userId, schoolId, new Date().toISOString());
      return this.listUserSchools(userId);
    },

    listReservations(schoolId = null) {
      const rows = schoolId
        ? db.prepare('SELECT * FROM reservations WHERE school_id = ? ORDER BY created_at DESC').all(schoolId)
        : db.prepare('SELECT * FROM reservations ORDER BY created_at DESC').all();
      return harmonizeReservations(rows.map(mapReservationRow));
    },

    getReservationById(id) {
      const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
      return row ? mapReservationRow(row) : null;
    },

    createReservation(r) {
      const createdAt = r.createdAt || new Date().toISOString();
      db.prepare(`
        INSERT INTO reservations (
          id, school_id, space, day, date, period, slot_index, slot_label, slot_time,
          description, grade, author_name, author_role, author_id, is_recurrent,
          recurrent_days_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        r.id,
        r.schoolId || 'furlan',
        r.space,
        r.day,
        r.date || '',
        r.period,
        Number(r.slotIndex),
        r.slotLabel,
        r.slotTime,
        r.description || '',
        r.grade || 'Turma ETEC',
        r.authorName || 'Docente ETEC',
        r.authorRole || 'Docente CPS',
        r.authorId,
        r.isRecurrent ? 1 : 0,
        JSON.stringify(r.recurrentDays || []),
        createdAt
      );
      touch();
      return this.getReservationById(r.id);
    },

    replaceReservations(reservations, schoolId = null) {
      const normalized = harmonizeReservations(reservations);
      if (schoolId) {
        db.prepare('DELETE FROM reservations WHERE school_id = ?').run(schoolId);
      } else {
        db.prepare('DELETE FROM reservations').run();
      }
      const insertRes = db.prepare(`
        INSERT OR REPLACE INTO reservations (
          id, school_id, space, day, date, period, slot_index, slot_label, slot_time,
          description, grade, author_name, author_role, author_id, is_recurrent,
          recurrent_days_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      normalized.forEach((r) => {
        insertRes.run(
          r.id,
          schoolId || r.schoolId || 'furlan',
          r.space,
          r.day,
          r.date || '',
          r.period,
          Number(r.slotIndex),
          r.slotLabel,
          r.slotTime,
          r.description || '',
          r.grade || 'Turma ETEC',
          r.authorName || 'Docente ETEC',
          r.authorRole || 'Docente CPS',
          r.authorId || 'user_dimitri',
          r.isRecurrent ? 1 : 0,
          JSON.stringify(r.recurrentDays || []),
          r.createdAt || new Date().toISOString()
        );
      });
      touch();
      return this.listReservations();
    },

    deleteReservation(id) {
      const existing = this.getReservationById(id);
      if (!existing) return false;
      db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
      touch();
      return true;
    },

    listNotices(schoolId = 'furlan') {
      return db
        .prepare('SELECT id, school_id as schoolId, title, description as desc, time_label as time, created_at as createdAt FROM notices WHERE school_id = ? ORDER BY created_at DESC LIMIT 20')
        .all(schoolId);
    },

    addNotice({ id, schoolId = 'furlan', title, desc, time = 'Agora' }) {
      const createdAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO notices (id, school_id, title, description, time_label, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, schoolId, title, desc, time, createdAt);
      return { id, schoolId, title, desc, time, createdAt };
    },

    clearNotices(schoolId = 'furlan') {
      db.prepare('DELETE FROM notices WHERE school_id = ?').run(schoolId);
    },

    getSettings(userId) {
      if (!userId) return createDefaultSettings('guest');
      const row = db.prepare('SELECT config_json FROM settings WHERE user_id = ?').get(userId);
      if (!row) return createDefaultSettings(userId);
      try {
        return { ...createDefaultSettings(userId), ...JSON.parse(row.config_json) };
      } catch (e) {
        return createDefaultSettings(userId);
      }
    },

    saveSettings(userId, config) {
      const merged = { ...createDefaultSettings(userId), ...config, userId };
      db.prepare(`
        INSERT OR REPLACE INTO settings (user_id, config_json, updated_at)
        VALUES (?, ?, ?)
      `).run(userId, JSON.stringify(merged), new Date().toISOString());
      return merged;
    },

    listLeads() {
      return db
        .prepare('SELECT id, school_name as schoolName, contact_name as contactName, contact_phone as contactPhone, room_count as roomCount, class_schedules as classSchedules, notes, created_at as createdAt FROM leads ORDER BY created_at DESC')
        .all();
    },

    addLead({ id, schoolName, contactName, contactPhone, roomCount, classSchedules, notes = '' }) {
      const createdAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO leads (id, school_name, contact_name, contact_phone, room_count, class_schedules, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, schoolName, contactName, contactPhone, roomCount, classSchedules, notes, createdAt);
      return { id, schoolName, contactName, contactPhone, roomCount, classSchedules, notes, createdAt };
    }
  };
}

function createJsonStore(dataDir) {
  const dbPath = path.join(dataDir, 'db.json');
  let state = {
    users: [],
    schools: DEFAULT_SCHOOLS,
    userSchools: [],
    reservations: [],
    notices: [],
    settings: {},
    leads: []
  };

  if (fs.existsSync(dbPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      state = { ...state, ...parsed };
    } catch (e) {}
  }

  if (state.users.length === 0) {
    state.users = buildDemoUsers();
    state.userSchools = state.users.map((u) => ({
      userId: u.id,
      schoolId: 'furlan',
      joinedAt: u.createdAt
    }));
  }
  if (!Array.isArray(state.schools) || state.schools.length === 0) {
    state.schools = DEFAULT_SCHOOLS;
  }
  if (!Array.isArray(state.reservations) || state.reservations.length === 0) {
    state.reservations = loadLegacyReservationsSeed(dataDir);
  }

  function persist() {
    const tmpPath = `${dbPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmpPath, dbPath);
  }
  persist();

  let lastUpdated = Date.now();
  const touch = () => {
    lastUpdated = Date.now();
    persist();
    return lastUpdated;
  };

  return {
    engine: 'json',
    getLastUpdated: () => lastUpdated,

    findUserByEmail(email) {
      const norm = email.trim().toLowerCase();
      const u = state.users.find((item) => item.email.toLowerCase() === norm);
      return u ? { ...u, userId: u.id } : null;
    },

    findUserById(id) {
      const u = state.users.find((item) => item.id === id);
      return u ? { ...u, userId: u.id } : null;
    },

    createUser({ id, email, name, role, passwordHash }) {
      const user = {
        id,
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role: role.trim(),
        passwordHash,
        createdAt: new Date().toISOString()
      };
      state.users.push(user);
      persist();
      return { ...user, userId: user.id };
    },

    updateUserProfile({ userId, name, role, oldName }) {
      const newName = name.trim();
      const newRole = role ? role.trim() : 'Docente CPS';
      const user = state.users.find((u) => u.id === userId);
      if (user) {
        user.name = newName;
        user.role = newRole;
      }
      const normOld = (oldName || '').trim().toLowerCase();
      state.reservations = harmonizeReservations(
        state.reservations.map((r) => {
          const matchId = r.authorId === userId;
          const matchOld = !r.authorId && normOld && r.authorName && r.authorName.trim().toLowerCase() === normOld;
          const matchKnownAna =
            userId === 'user_anacarol' &&
            r.authorName &&
            ['ana carol', 'carol'].includes(r.authorName.trim().toLowerCase());
          const matchKnownDimitri =
            userId === 'user_dimitri' &&
            r.authorName &&
            ['dimitri', 'jow'].includes(r.authorName.trim().toLowerCase());
          if (matchId || matchOld || matchKnownAna || matchKnownDimitri) {
            return { ...r, authorName: newName, authorRole: newRole, authorId: userId };
          }
          return r;
        })
      );
      touch();
      return this.listReservations();
    },

    listSchools() {
      return state.schools;
    },

    listUserSchools(userId) {
      if (!userId) return [];
      const ids = state.userSchools.filter((us) => us.userId === userId).map((us) => us.schoolId);
      return state.schools.filter((s) => ids.includes(s.id));
    },

    findSchoolByCode(rawCode) {
      const clean = String(rawCode || '').trim().toUpperCase();
      if (!clean) return null;
      return (
        state.schools.find(
          (s) =>
            s.id.toUpperCase() === clean ||
            s.code.toUpperCase() === clean ||
            s.aliases.some((a) => a.toUpperCase() === clean)
        ) || null
      );
    },

    joinSchool(userId, schoolId) {
      if (!state.userSchools.some((us) => us.userId === userId && us.schoolId === schoolId)) {
        state.userSchools.push({ userId, schoolId, joinedAt: new Date().toISOString() });
        persist();
      }
      return this.listUserSchools(userId);
    },

    listReservations(schoolId = null) {
      const list = schoolId
        ? state.reservations.filter((r) => (r.schoolId || 'furlan') === schoolId)
        : state.reservations;
      return harmonizeReservations(list);
    },

    getReservationById(id) {
      return state.reservations.find((r) => r.id === id) || null;
    },

    createReservation(r) {
      const item = {
        ...r,
        schoolId: r.schoolId || 'furlan',
        slotIndex: Number(r.slotIndex),
        isRecurrent: Boolean(r.isRecurrent),
        recurrentDays: Array.isArray(r.recurrentDays) ? r.recurrentDays : [],
        createdAt: r.createdAt || new Date().toISOString()
      };
      state.reservations.unshift(item);
      touch();
      return item;
    },

    replaceReservations(reservations, schoolId = null) {
      const normalized = harmonizeReservations(reservations).map((r) => ({
        ...r,
        schoolId: schoolId || r.schoolId || 'furlan'
      }));
      if (schoolId) {
        const others = state.reservations.filter((r) => (r.schoolId || 'furlan') !== schoolId);
        state.reservations = harmonizeReservations([...others, ...normalized]);
      } else {
        state.reservations = normalized;
      }
      touch();
      return this.listReservations();
    },

    deleteReservation(id) {
      const before = state.reservations.length;
      state.reservations = state.reservations.filter((r) => r.id !== id);
      if (state.reservations.length === before) return false;
      touch();
      return true;
    },

    listNotices(schoolId = 'furlan') {
      return state.notices.filter((n) => n.schoolId === schoolId).slice(0, 20);
    },

    addNotice({ id, schoolId = 'furlan', title, desc, time = 'Agora' }) {
      const item = { id, schoolId, title, desc, time, createdAt: new Date().toISOString() };
      state.notices.unshift(item);
      persist();
      return item;
    },

    clearNotices(schoolId = 'furlan') {
      state.notices = state.notices.filter((n) => n.schoolId !== schoolId);
      persist();
    },

    getSettings(userId) {
      if (!userId || !state.settings[userId]) return createDefaultSettings(userId || 'guest');
      return { ...createDefaultSettings(userId), ...state.settings[userId] };
    },

    saveSettings(userId, config) {
      const merged = { ...createDefaultSettings(userId), ...config, userId };
      state.settings[userId] = merged;
      persist();
      return merged;
    },

    listLeads() {
      return state.leads;
    },

    addLead({ id, schoolName, contactName, contactPhone, roomCount, classSchedules, notes = '' }) {
      const lead = {
        id,
        schoolName,
        contactName,
        contactPhone,
        roomCount,
        classSchedules,
        notes,
        createdAt: new Date().toISOString()
      };
      state.leads.unshift(lead);
      persist();
      return lead;
    }
  };
}

module.exports = {
  createStore,
  harmonizeReservations
};
