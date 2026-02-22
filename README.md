# 🎓 QR Attendance System

A comprehensive school attendance management system with **QR Code scanning**, **Face Recognition**, and a full **Admin Portal**. Built with Node.js, Express, SQLite, and face-api.js.

---

## ✨ Features

### 📱 Multi-Mode Attendance Scanner
- **QR Code Scanning** — Scan student ID cards using the device camera
- **Face Recognition** — AI-powered face detection and matching using face-api.js
- **Manual Entry** — Type or paste QR codes manually
- **Audio & Haptic Feedback** — Beep sound + vibration on successful scan

### 🖥️ Admin Portal
- **Dashboard** — Real-time stats, 7-day attendance trend chart, grade breakdown
- **Student Management** — Add, edit, delete students with guardian details
- **QR Code Generation** — Generate, download (PNG), and view printable ID cards
- **Face Enrollment** — Enroll student faces via webcam for face recognition
- **Attendance Records** — View, filter by date/grade, paginated, with CSV export

### 🔒 Privacy-First Face Recognition
- No photos stored — only 128-dimensional mathematical face descriptors
- All face detection runs **client-side** in the browser
- Face descriptors cannot be reversed into images

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18 or later
- **npm** (comes with Node.js)

### Installation

```bash
# Clone or navigate to the project
cd qr-attendance

# Install dependencies
npm install

# Start the server
npm start
```

### Access the App

| Interface | URL | Description |
|-----------|-----|-------------|
| **Admin Portal** | http://localhost:3000 | Dashboard, students, attendance |
| **QR Scanner** | http://localhost:3000/scanner.html | Camera/Face/Manual scanning |
| **HTTPS (Mobile)** | https://localhost:3443 | Required for camera on mobile |

> **📱 Mobile Access:** Camera features require HTTPS. The app auto-generates a self-signed certificate. On your phone, open `https://<your-ip>:3443/scanner.html`.

---

## 📁 Project Structure

```
qr-attendance/
├── server.js              # Express server, API routes, HTTPS setup
├── db.js                  # SQLite database logic (CRUD, attendance)
├── package.json           # Dependencies and scripts
├── attendance.db          # SQLite database file (auto-created)
├── cert.pem / key.pem     # Self-signed SSL certificates for HTTPS
└── public/                # Frontend files (served as static)
    ├── index.html          # Admin Portal (Dashboard/Students/Attendance)
    ├── styles.css          # Full design system (dark mode UI)
    ├── app.js              # Admin Portal logic + face enrollment
    ├── scanner.html        # Mobile-optimized scanner page
    ├── scanner.js          # QR scanning + face recognition logic
    └── models/             # face-api.js AI model weights
        ├── ssd_mobilenetv1_model-*          # Face detection model
        ├── face_landmark_68_model-*         # Facial landmark detection
        └── face_recognition_model-*         # Face descriptor extraction
```

---

## 🗄️ Database Schema

The app uses **SQLite** via the `better-sqlite3` library. The database file (`attendance.db`) is created automatically on first run.

### `students` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (UUID) | Primary key |
| `name` | TEXT | Student full name |
| `grade` | TEXT | Grade level (e.g., "10") |
| `section` | TEXT | Section (e.g., "A") |
| `guardian_name` | TEXT | Parent/guardian name |
| `guardian_phone` | TEXT | Guardian phone number |
| `qr_code` | TEXT | Unique QR code (e.g., "STU-4A0217B2") |
| `face_descriptor` | TEXT | JSON array of 128 floats (nullable) |
| `active` | INTEGER | 1 = active, 0 = soft-deleted |
| `created_at` | TEXT | ISO datetime of creation |

### `attendance` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-increment primary key |
| `student_id` | TEXT | Foreign key → students.id |
| `date` | TEXT | Date (YYYY-MM-DD) |
| `time_in` | TEXT | Check-in time (HH:MM:SS) |
| `time_out` | TEXT | Check-out time (nullable) |
| `marked_by` | TEXT | "staff", "face", or "system" |

> **Constraint:** One attendance record per student per day (`UNIQUE(student_id, date)`).

---

## 🔌 API Reference

All endpoints return JSON. Base URL: `http://localhost:3000`

### Students

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/students?search=&grade=` | List all students (filterable) |
| `POST` | `/api/students` | Create a new student |
| `PUT` | `/api/students/:id` | Update student details |
| `DELETE` | `/api/students/:id` | Soft-delete (deactivate) a student |

### QR Codes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/students/:id/qr?format=png` | Get QR code image (PNG or SVG) |
| `GET` | `/api/students/:id/qr-data` | Get QR code as base64 data URL |
| `GET` | `/api/students/:id/card` | Get printable student ID card (HTML) |

### Face Recognition

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/students/:id/face` | Enroll face descriptor `{descriptor: [128 floats]}` |
| `DELETE` | `/api/students/:id/face` | Remove enrolled face |
| `GET` | `/api/faces` | Get all enrolled face descriptors |

### Attendance

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/attendance/scan` | Record attendance via QR code `{qr_code}` |
| `POST` | `/api/attendance/face-scan` | Record attendance via face `{student_id}` |
| `GET` | `/api/attendance?date=&grade=&page=` | Get attendance records (paginated) |
| `GET` | `/api/attendance/export?date_from=&date_to=&grade=` | Export as CSV |
| `GET` | `/api/attendance/stats` | Dashboard statistics |

### Attendance Logic

1. **First scan** of the day → records **Check In** (`time_in`)
2. **Second scan** of the day → records **Check Out** (`time_out`)
3. **Third scan** → returns `409 Already completed`

---

## 🧠 Face Recognition — How It Works

### Technology
- **Library:** [face-api.js](https://github.com/justadudewhohacks/face-api.js) v0.22.2 (built on TensorFlow.js)
- **Models used:**
  - `ssd_mobilenetv1` — Detects faces in the video frame
  - `face_landmark_68` — Identifies 68 facial landmarks
  - `face_recognition` — Extracts 128-dimensional face descriptors

### Enrollment Flow
1. Admin opens a student's QR modal → clicks **"Enroll Face"**
2. Camera activates, student positions their face
3. Admin clicks **"Capture Face"**
4. `face-api.js` extracts a 128-dimensional descriptor (client-side)
5. The descriptor array is sent to the server and stored in the database
6. Beep sound confirms successful enrollment ✅

### Recognition Flow
1. Scanner page → switch to **Face** mode
2. Models load, camera activates
3. Every 800ms, the system detects faces and extracts descriptors
4. It compares against all enrolled faces using **Euclidean distance**
5. If distance < **0.5** → match found → attendance recorded
6. Beep + vibration confirm the recognition ✅

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Node.js + Express.js |
| **Database** | SQLite (via better-sqlite3) |
| **Frontend** | Vanilla HTML/CSS/JS (no framework) |
| **QR Scanning** | html5-qrcode v2.3.8 |
| **Face Recognition** | face-api.js v0.22.2 (TensorFlow.js) |
| **QR Generation** | qrcode (npm package) |
| **IDs** | uuid v9 |
| **HTTPS** | Self-signed certificates (for mobile camera) |

---

## 📊 Viewing the Database

### Terminal
```bash
sqlite3 attendance.db

# List tables
.tables

# View students
SELECT name, grade, qr_code FROM students WHERE active = 1;

# View today's attendance
SELECT * FROM attendance WHERE date = date('now');

# Exit
.quit
```

### GUI Tools
- **[DB Browser for SQLite](https://sqlitebrowser.org/)** — Free desktop app
- **VS Code** — Install the "SQLite Viewer" extension

---

## ⚙️ Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP server port |
| `HTTPS_PORT` | 3443 | HTTPS server port |

Set via environment variables:
```bash
PORT=8080 HTTPS_PORT=8443 npm start
```

---

## 📝 License

This project is for educational and internal use.
