const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
db.getDb();

// ─── Student Routes ───────────────────────────────────────────────────────────

app.get('/api/students', (req, res) => {
    try {
        const { search, grade } = req.query;
        const students = db.getAllStudents(search || '', grade || '');
        res.json(students);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/students', (req, res) => {
    try {
        const { name, grade, section, guardian_name, guardian_phone } = req.body;
        if (!name || !grade) {
            return res.status(400).json({ error: 'Name and grade are required' });
        }
        const student = db.createStudent({ name, grade, section, guardian_name, guardian_phone });
        res.status(201).json(student);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/students/:id', (req, res) => {
    try {
        const existing = db.getStudentById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Student not found' });
        const { name, grade, section, guardian_name, guardian_phone } = req.body;
        if (!name || !grade) {
            return res.status(400).json({ error: 'Name and grade are required' });
        }
        const student = db.updateStudent(req.params.id, { name, grade, section, guardian_name, guardian_phone });
        res.json(student);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/students/:id', (req, res) => {
    try {
        const existing = db.getStudentById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Student not found' });
        db.deleteStudent(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── QR Code Route ────────────────────────────────────────────────────────────

app.get('/api/students/:id/qr', async (req, res) => {
    try {
        const student = db.getStudentById(req.params.id);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        const format = req.query.format || 'png';
        const isDownload = req.query.download === '1';
        const filename = student.name.replace(/\s+/g, '_');

        if (format === 'svg') {
            const svg = await QRCode.toString(student.qr_code, { type: 'svg', width: 300, margin: 2 });
            if (isDownload) res.set('Content-Disposition', `attachment; filename="${filename}_QR.svg"`);
            res.type('image/svg+xml').send(svg);
        } else {
            const png = await QRCode.toBuffer(student.qr_code, {
                width: 300,
                margin: 2,
                color: { dark: '#1a1a2e', light: '#ffffff' },
            });
            if (isDownload) res.set('Content-Disposition', `attachment; filename="${filename}_QR.png"`);
            res.type('image/png').send(png);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Return QR as a base64 data URL (for reliable client-side download)
app.get('/api/students/:id/qr-data', async (req, res) => {
    try {
        const student = db.getStudentById(req.params.id);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        const dataUrl = await QRCode.toDataURL(student.qr_code, {
            width: 300,
            margin: 2,
            color: { dark: '#1a1a2e', light: '#ffffff' },
        });
        res.json({ dataUrl, name: student.name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate a printable ID card HTML for a student
app.get('/api/students/:id/card', async (req, res) => {
    try {
        const student = db.getStudentById(req.params.id);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        const qrDataUrl = await QRCode.toDataURL(student.qr_code, {
            width: 200,
            margin: 1,
            color: { dark: '#1a1a2e', light: '#ffffff' },
        });

        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ID Card - ${student.name}</title>
<style>
  body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f0f0; font-family: 'Inter', sans-serif; }
  .card { width: 340px; background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); color: white; border-radius: 16px; padding: 28px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.3); }
  .card h2 { margin: 0 0 4px; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.7; }
  .card h1 { margin: 0 0 6px; font-size: 22px; }
  .card .grade { font-size: 13px; opacity: 0.8; margin-bottom: 16px; }
  .card .qr { background: white; padding: 12px; border-radius: 12px; display: inline-block; margin-bottom: 12px; }
  .card .qr img { display: block; }
  .card .code { font-family: monospace; font-size: 14px; letter-spacing: 2px; opacity: 0.6; }
</style></head>
<body>
  <div class="card">
    <h2>Student ID Card</h2>
    <h1>${student.name}</h1>
    <div class="grade">Grade ${student.grade}${student.section ? ' — Section ' + student.section : ''}</div>
    <div class="qr"><img src="${qrDataUrl}" width="180" height="180" /></div>
    <div class="code">${student.qr_code}</div>
  </div>
</body></html>`;
        res.type('text/html').send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ─── Face Recognition Routes ──────────────────────────────────────────────────

app.post('/api/students/:id/face', (req, res) => {
    try {
        const student = db.getStudentById(req.params.id);
        if (!student) return res.status(404).json({ error: 'Student not found' });
        const { descriptor } = req.body;
        if (!descriptor || !Array.isArray(descriptor)) {
            return res.status(400).json({ error: 'Face descriptor array is required' });
        }
        db.saveFaceDescriptor(req.params.id, descriptor);
        res.json({ success: true, message: 'Face enrolled successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/students/:id/face', (req, res) => {
    try {
        const student = db.getStudentById(req.params.id);
        if (!student) return res.status(404).json({ error: 'Student not found' });
        db.removeFaceDescriptor(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/faces', (req, res) => {
    try {
        const faces = db.getFaceDescriptors();
        res.json(faces);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/attendance/face-scan', (req, res) => {
    try {
        const { student_id } = req.body;
        if (!student_id) return res.status(400).json({ error: 'Student ID is required' });
        const result = db.recordAttendanceById(student_id, 'face');
        if (result.error) {
            return res.status(result.status).json(result);
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Attendance Routes ────────────────────────────────────────────────────────

app.post('/api/attendance/scan', (req, res) => {
    try {
        const { qr_code, marked_by } = req.body;
        if (!qr_code) return res.status(400).json({ error: 'QR code is required' });

        const result = db.recordAttendance(qr_code, marked_by || 'staff');
        if (result.error) {
            return res.status(result.status).json(result);
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/attendance', (req, res) => {
    try {
        const { date, grade, student_id, page, limit } = req.query;
        const result = db.getAttendance({
            date, grade, student_id,
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 50,
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/attendance/export', (req, res) => {
    try {
        const { date_from, date_to, grade } = req.query;
        const records = db.getAttendanceForExport({ date_from, date_to, grade });

        const header = 'Date,Student Name,Grade,Section,QR Code,Time In,Time Out\n';
        const rows = records.map(r =>
            `${r.date},"${r.student_name}",${r.grade},${r.section},${r.qr_code},${r.time_in},${r.time_out || ''}`
        ).join('\n');

        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', `attachment; filename="attendance_${date_from || 'all'}_${date_to || 'all'}.csv"`);
        res.send(header + rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/attendance/stats', (req, res) => {
    try {
        const stats = db.getStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Start Server ─────────────────────────────────────────────────────────────

// Get local network IP for mobile access
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const localIP = getLocalIP();

// HTTP server (works for localhost/desktop)
app.listen(PORT, () => {
    console.log(`🎓 QR Attendance System`);
    console.log(`   HTTP  → http://localhost:${PORT}`);
});

// HTTPS server (required for camera access on mobile devices)
try {
    const sslOptions = {
        key: fs.readFileSync(path.join(__dirname, 'key.pem')),
        cert: fs.readFileSync(path.join(__dirname, 'cert.pem')),
    };
    https.createServer(sslOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`   HTTPS → https://localhost:${HTTPS_PORT}`);
        console.log(``);
        console.log(`📱 Open on your iPhone:`);
        console.log(`   https://${localIP}:${HTTPS_PORT}/scanner.html`);
    });
} catch (err) {
    console.log(`⚠️  HTTPS not available (missing cert files). Camera won't work on mobile.`);
}
