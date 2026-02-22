const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'attendance.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
    seedDemoData();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      grade TEXT NOT NULL,
      section TEXT DEFAULT '',
      guardian_name TEXT DEFAULT '',
      guardian_phone TEXT DEFAULT '',
      qr_code TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL REFERENCES students(id),
      date TEXT NOT NULL,
      time_in TEXT NOT NULL,
      time_out TEXT,
      marked_by TEXT DEFAULT 'staff',
      UNIQUE(student_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
    CREATE INDEX IF NOT EXISTS idx_students_qr ON students(qr_code);
  `);

  // Migration: add face_descriptor column if it doesn't exist
  const cols = db.prepare("PRAGMA table_info(students)").all();
  if (!cols.find(c => c.name === 'face_descriptor')) {
    db.exec('ALTER TABLE students ADD COLUMN face_descriptor TEXT DEFAULT NULL');
  }
}

function seedDemoData() {
  const count = db.prepare('SELECT COUNT(*) as c FROM students').get();
  if (count.c > 0) return;

  const students = [
    { name: 'Aisha Rahman', grade: '10', section: 'A', guardian_name: 'Fatima Rahman', guardian_phone: '+60-123-4567' },
    { name: 'Liam Chen', grade: '10', section: 'A', guardian_name: 'Wei Chen', guardian_phone: '+60-234-5678' },
    { name: 'Sofia Martinez', grade: '9', section: 'B', guardian_name: 'Carlos Martinez', guardian_phone: '+60-345-6789' },
    { name: 'Raj Patel', grade: '9', section: 'A', guardian_name: 'Priya Patel', guardian_phone: '+60-456-7890' },
    { name: 'Emma Johnson', grade: '11', section: 'A', guardian_name: 'Sarah Johnson', guardian_phone: '+60-567-8901' },
    { name: 'Yusuf Ali', grade: '11', section: 'B', guardian_name: 'Hassan Ali', guardian_phone: '+60-678-9012' },
    { name: 'Mei Lin Tan', grade: '8', section: 'A', guardian_name: 'Siew Ling Tan', guardian_phone: '+60-789-0123' },
    { name: 'David Kim', grade: '8', section: 'B', guardian_name: 'Hyun Kim', guardian_phone: '+60-890-1234' },
  ];

  const insert = db.prepare(`
    INSERT INTO students (id, name, grade, section, guardian_name, guardian_phone, qr_code)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAttendance = db.prepare(`
    INSERT INTO attendance (student_id, date, time_in, time_out, marked_by)
    VALUES (?, ?, ?, ?, 'system')
  `);

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const insertMany = db.transaction(() => {
    const studentIds = [];
    for (const s of students) {
      const id = uuidv4();
      const qr = `STU-${uuidv4().slice(0, 8).toUpperCase()}`;
      insert.run(id, s.name, s.grade, s.section, s.guardian_name, s.guardian_phone, qr);
      studentIds.push(id);
    }

    // Add some attendance for yesterday
    for (let i = 0; i < 6; i++) {
      const hour = 7 + Math.floor(Math.random() * 2);
      const min = Math.floor(Math.random() * 60).toString().padStart(2, '0');
      const timeIn = `0${hour}:${min}:00`;
      const timeOut = `1${4 + Math.floor(Math.random() * 3)}:${min}:00`;
      insertAttendance.run(studentIds[i], yesterday, timeIn, timeOut);
    }

    // Add some attendance for today (morning arrivals)
    for (let i = 0; i < 4; i++) {
      const min = Math.floor(Math.random() * 60).toString().padStart(2, '0');
      const timeIn = `07:${min}:00`;
      insertAttendance.run(studentIds[i], today, timeIn, null);
    }
  });

  insertMany();
}

// --- Student CRUD ---

function getAllStudents(search = '', grade = '') {
  let sql = 'SELECT * FROM students WHERE active = 1';
  const params = [];
  if (search) {
    sql += ' AND (name LIKE ? OR qr_code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (grade) {
    sql += ' AND grade = ?';
    params.push(grade);
  }
  sql += ' ORDER BY name ASC';
  return db.prepare(sql).all(...params);
}

function getStudentById(id) {
  return db.prepare('SELECT * FROM students WHERE id = ?').get(id);
}

function getStudentByQr(qrCode) {
  return db.prepare('SELECT * FROM students WHERE qr_code = ? AND active = 1').get(qrCode);
}

function createStudent({ name, grade, section, guardian_name, guardian_phone }) {
  const id = uuidv4();
  const qr = `STU-${uuidv4().slice(0, 8).toUpperCase()}`;
  db.prepare(`
    INSERT INTO students (id, name, grade, section, guardian_name, guardian_phone, qr_code)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, grade, section || '', guardian_name || '', guardian_phone || '', qr);
  return getStudentById(id);
}

function updateStudent(id, { name, grade, section, guardian_name, guardian_phone }) {
  db.prepare(`
    UPDATE students SET name = ?, grade = ?, section = ?, guardian_name = ?, guardian_phone = ?
    WHERE id = ?
  `).run(name, grade, section || '', guardian_name || '', guardian_phone || '', id);
  return getStudentById(id);
}

function deleteStudent(id) {
  db.prepare('UPDATE students SET active = 0 WHERE id = ?').run(id);
}

// --- Face Descriptor ---

function saveFaceDescriptor(studentId, descriptor) {
  db.prepare('UPDATE students SET face_descriptor = ? WHERE id = ?').run(JSON.stringify(descriptor), studentId);
}

function removeFaceDescriptor(studentId) {
  db.prepare('UPDATE students SET face_descriptor = NULL WHERE id = ?').run(studentId);
}

function getFaceDescriptors() {
  return db.prepare('SELECT id, name, grade, section, qr_code, face_descriptor FROM students WHERE active = 1 AND face_descriptor IS NOT NULL').all()
    .map(s => ({ ...s, face_descriptor: JSON.parse(s.face_descriptor) }));
}

// --- Attendance ---

function recordAttendance(qrCode, markedBy = 'staff') {
  const student = getStudentByQr(qrCode);
  if (!student) return { error: 'Student not found', status: 404 };
  return _recordAttendanceForStudent(student, markedBy);
}

function recordAttendanceById(studentId, markedBy = 'face') {
  const student = getStudentById(studentId);
  if (!student) return { error: 'Student not found', status: 404 };
  if (!student.active) return { error: 'Student is inactive', status: 400 };
  return _recordAttendanceForStudent(student, markedBy);
}

function _recordAttendanceForStudent(student, markedBy) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);

  const existing = db.prepare('SELECT * FROM attendance WHERE student_id = ? AND date = ?').get(student.id, date);

  if (existing) {
    if (existing.time_out) {
      return { error: 'Attendance already completed for today', status: 409, student };
    }
    // Record OUT time
    db.prepare('UPDATE attendance SET time_out = ? WHERE id = ?').run(time, existing.id);
    return { action: 'OUT', student, time, date };
  }

  // Record IN time
  db.prepare(`
    INSERT INTO attendance (student_id, date, time_in, marked_by)
    VALUES (?, ?, ?, ?)
  `).run(student.id, date, time, markedBy);

  return { action: 'IN', student, time, date };
}

function getAttendance({ date, grade, student_id, page = 1, limit = 50 }) {
  let sql = `
    SELECT a.*, s.name as student_name, s.grade, s.section, s.qr_code
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (date) {
    sql += ' AND a.date = ?';
    params.push(date);
  }
  if (grade) {
    sql += ' AND s.grade = ?';
    params.push(grade);
  }
  if (student_id) {
    sql += ' AND a.student_id = ?';
    params.push(student_id);
  }

  const countSql = sql.replace('SELECT a.*, s.name as student_name, s.grade, s.section, s.qr_code', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;

  sql += ' ORDER BY a.date DESC, a.time_in DESC LIMIT ? OFFSET ?';
  params.push(limit, (page - 1) * limit);

  const records = db.prepare(sql).all(...params);
  return { records, total, page, limit, pages: Math.ceil(total / limit) };
}

function getAttendanceForExport({ date_from, date_to, grade }) {
  let sql = `
    SELECT a.date, a.time_in, a.time_out, s.name as student_name, s.grade, s.section, s.qr_code
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (date_from) {
    sql += ' AND a.date >= ?';
    params.push(date_from);
  }
  if (date_to) {
    sql += ' AND a.date <= ?';
    params.push(date_to);
  }
  if (grade) {
    sql += ' AND s.grade = ?';
    params.push(grade);
  }
  sql += ' ORDER BY a.date DESC, s.name ASC';
  return db.prepare(sql).all(...params);
}

function getStats() {
  const today = new Date().toISOString().slice(0, 10);
  const totalStudents = db.prepare('SELECT COUNT(*) as c FROM students WHERE active = 1').get().c;
  const presentToday = db.prepare('SELECT COUNT(*) as c FROM attendance WHERE date = ?').get(today).c;
  const checkedOutToday = db.prepare('SELECT COUNT(*) as c FROM attendance WHERE date = ? AND time_out IS NOT NULL').get(today).c;

  const recentScans = db.prepare(`
    SELECT a.*, s.name as student_name, s.grade, s.section
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    WHERE a.date = ?
    ORDER BY a.time_in DESC
    LIMIT 10
  `).all(today);

  // Last 7 days trend
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const count = db.prepare('SELECT COUNT(*) as c FROM attendance WHERE date = ?').get(d).c;
    trend.push({ date: d, count });
  }

  // Grade breakdown for today
  const gradeBreakdown = db.prepare(`
    SELECT s.grade, COUNT(*) as count
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    WHERE a.date = ?
    GROUP BY s.grade
    ORDER BY s.grade
  `).all(today);

  return { totalStudents, presentToday, checkedOutToday, absentToday: totalStudents - presentToday, recentScans, trend, gradeBreakdown };
}

module.exports = {
  getDb,
  getAllStudents,
  getStudentById,
  getStudentByQr,
  createStudent,
  updateStudent,
  deleteStudent,
  saveFaceDescriptor,
  removeFaceDescriptor,
  getFaceDescriptors,
  recordAttendance,
  recordAttendanceById,
  getAttendance,
  getAttendanceForExport,
  getStats,
};
