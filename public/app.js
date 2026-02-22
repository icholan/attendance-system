// ─── QR Attendance — Admin Portal ───────────────────────────────────────────
const API = '';

// ─── State ─────────────────────────────────────────────────────────────────
let currentPage = 'dashboard';
let attendancePage = 1;
let searchTimer = null;

// ─── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('attendance-date').value = todayStr();
    loadDashboard();
});

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

// ─── Navigation ────────────────────────────────────────────────────────────
function switchPage(page) {
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
    currentPage = page;

    if (page === 'dashboard') loadDashboard();
    if (page === 'students') loadStudents();
    if (page === 'attendance') loadAttendance();
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
async function loadDashboard() {
    try {
        const res = await fetch(`${API}/api/attendance/stats`);
        const stats = await res.json();

        animateNumber('stat-total', stats.totalStudents);
        animateNumber('stat-present', stats.presentToday);
        animateNumber('stat-out', stats.checkedOutToday);
        animateNumber('stat-absent', stats.absentToday);

        renderTrendChart(stats.trend);
        renderGradeBreakdown(stats.gradeBreakdown, stats.totalStudents);
        renderRecentActivity(stats.recentScans);
    } catch (err) {
        showToast('Failed to load dashboard', 'error');
    }
}

function animateNumber(id, target) {
    const el = document.getElementById(id);
    const start = parseInt(el.textContent) || 0;
    const duration = 600;
    const startTime = performance.now();

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(start + (target - start) * eased);
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

function renderTrendChart(trend) {
    const container = document.getElementById('trend-chart');
    const max = Math.max(...trend.map(t => t.count), 1);
    container.innerHTML = trend.map(t => {
        const pct = (t.count / max) * 100;
        const day = new Date(t.date + 'T00:00').toLocaleDateString('en', { weekday: 'short' });
        return `
      <div class="chart-bar-wrapper">
        <div class="chart-bar-value">${t.count}</div>
        <div class="chart-bar" style="height:${Math.max(pct, 3)}%"></div>
        <div class="chart-bar-label">${day}</div>
      </div>`;
    }).join('');
}

function renderGradeBreakdown(grades, total) {
    const container = document.getElementById('grade-breakdown');
    if (!grades.length) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No data for today</p>';
        return;
    }
    const max = Math.max(...grades.map(g => g.count), 1);
    container.innerHTML = grades.map(g => `
    <div class="grade-item">
      <div class="grade-badge">${g.grade}</div>
      <div class="grade-bar-bg"><div class="grade-bar-fill" style="width:${(g.count / max) * 100}%"></div></div>
      <div class="grade-count">${g.count}</div>
    </div>`).join('');
}

function renderRecentActivity(scans) {
    const container = document.getElementById('recent-activity');
    if (!scans.length) {
        container.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>No scans recorded today yet.</p></div>';
        return;
    }
    container.innerHTML = scans.map(s => `
    <div class="activity-item">
      <div class="activity-dot ${s.time_out ? 'out' : 'in'}"></div>
      <div class="activity-info">
        <div class="activity-name">${esc(s.student_name)}</div>
        <div class="activity-detail">Grade ${esc(s.grade)}${s.section ? ' — ' + esc(s.section) : ''}</div>
      </div>
      <div class="activity-time">${s.time_out || s.time_in}</div>
    </div>`).join('');
}

// ─── Students ──────────────────────────────────────────────────────────────
async function loadStudents() {
    try {
        const search = document.getElementById('student-search').value;
        const grade = document.getElementById('student-grade-filter').value;
        const res = await fetch(`${API}/api/students?search=${encodeURIComponent(search)}&grade=${encodeURIComponent(grade)}`);
        const students = await res.json();

        const tbody = document.getElementById('students-table-body');
        const empty = document.getElementById('students-empty');

        if (!students.length) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        tbody.innerHTML = students.map(s => `
      <tr>
        <td class="student-name">${esc(s.name)}</td>
        <td><span class="badge badge-grade">${esc(s.grade)}</span></td>
        <td>${esc(s.section || '—')}</td>
        <td><code style="font-size:12px;color:var(--text-muted)">${esc(s.qr_code)}</code></td>
        <td style="font-size:13px;color:var(--text-secondary)">${esc(s.guardian_name || '—')}</td>
        <td>
          <div class="actions">
            <button class="btn-icon" title="View QR" onclick="showQr('${s.id}','${esc(s.name)}','${esc(s.qr_code)}')">📱</button>
            <button class="btn-icon" title="Edit" onclick="editStudent('${s.id}')">✏️</button>
            <button class="btn-icon danger" title="Delete" onclick="deleteStudent('${s.id}','${esc(s.name)}')">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
    } catch (err) {
        showToast('Failed to load students', 'error');
    }
}

function debounceStudentSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadStudents, 300);
}

// ─── Student Modal ─────────────────────────────────────────────────────────
function openStudentModal(editing = false) {
    document.getElementById('modal-title').textContent = editing ? 'Edit Student' : 'Add Student';
    document.getElementById('modal-save-btn').textContent = editing ? 'Update' : 'Save Student';
    if (!editing) {
        document.getElementById('student-id').value = '';
        document.getElementById('inp-name').value = '';
        document.getElementById('inp-grade').value = '';
        document.getElementById('inp-section').value = '';
        document.getElementById('inp-guardian').value = '';
        document.getElementById('inp-phone').value = '';
    }
    document.getElementById('student-modal').classList.add('active');
}

function closeStudentModal() {
    document.getElementById('student-modal').classList.remove('active');
}

async function editStudent(id) {
    try {
        const res = await fetch(`${API}/api/students`);
        const students = await res.json();
        const s = students.find(st => st.id === id);
        if (!s) return;

        document.getElementById('student-id').value = s.id;
        document.getElementById('inp-name').value = s.name;
        document.getElementById('inp-grade').value = s.grade;
        document.getElementById('inp-section').value = s.section || '';
        document.getElementById('inp-guardian').value = s.guardian_name || '';
        document.getElementById('inp-phone').value = s.guardian_phone || '';
        openStudentModal(true);
    } catch (err) {
        showToast('Failed to load student', 'error');
    }
}

async function saveStudent() {
    const id = document.getElementById('student-id').value;
    const data = {
        name: document.getElementById('inp-name').value.trim(),
        grade: document.getElementById('inp-grade').value.trim(),
        section: document.getElementById('inp-section').value.trim(),
        guardian_name: document.getElementById('inp-guardian').value.trim(),
        guardian_phone: document.getElementById('inp-phone').value.trim(),
    };

    if (!data.name || !data.grade) {
        showToast('Name and Grade are required', 'error');
        return;
    }

    try {
        const url = id ? `${API}/api/students/${id}` : `${API}/api/students`;
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!res.ok) {
            const err = await res.json();
            showToast(err.error || 'Failed to save', 'error');
            return;
        }

        showToast(id ? 'Student updated!' : 'Student added!', 'success');
        closeStudentModal();
        loadStudents();
    } catch (err) {
        showToast('Network error', 'error');
    }
}

async function deleteStudent(id, name) {
    if (!confirm(`Delete "${name}"? This will deactivate the student.`)) return;
    try {
        await fetch(`${API}/api/students/${id}`, { method: 'DELETE' });
        showToast('Student removed', 'success');
        loadStudents();
    } catch (err) {
        showToast('Failed to delete', 'error');
    }
}

// ─── QR Modal ──────────────────────────────────────────────────────────────
let currentQrStudentId = '';
let currentQrStudentName = '';

function showQr(id, name, qrCode) {
    currentQrStudentId = id;
    currentQrStudentName = name;
    document.getElementById('qr-modal-title').textContent = name;
    document.getElementById('qr-preview-content').innerHTML = `
    <img src="${API}/api/students/${id}/qr" alt="QR Code" width="220" height="220" />
    <div class="qr-code-text">${qrCode}</div>`;
    document.getElementById('qr-card-link').href = `${API}/api/students/${id}/card`;

    // Check face enrollment status
    fetch(`${API}/api/students`).then(r => r.json()).then(students => {
        const s = students.find(st => st.id === id);
        const statusEl = document.getElementById('face-enroll-status');
        if (s && s.face_descriptor) {
            statusEl.innerHTML = '✅ <span style="color:var(--success)">Face enrolled</span>';
        } else {
            statusEl.innerHTML = '⚠️ <span style="color:var(--text-muted)">Face not enrolled</span>';
        }
    });

    document.getElementById('qr-modal').classList.add('active');
}

async function downloadQr() {
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = `${API}/api/students/${currentQrStudentId}/qr`;

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${currentQrStudentName.replace(/\s+/g, '_')}_QR.png`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 500);
        }, 'image/png');

        showToast('QR code downloaded!', 'success');
    } catch (err) {
        showToast('Failed to download QR', 'error');
    }
}

function closeQrModal() {
    document.getElementById('qr-modal').classList.remove('active');
}

// ─── Face Enrollment ───────────────────────────────────────────────────────
let enrollModelsLoaded = false;
let enrollStream = null;

function playBeep(frequency = 600, duration = 200) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.value = 0.3;
        oscillator.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
        oscillator.stop(ctx.currentTime + duration / 1000);
    } catch (e) {
        // Audio not available
    }
}

async function openFaceEnroll() {
    document.getElementById('face-enroll-name').textContent = currentQrStudentName;
    document.getElementById('enroll-status').textContent = 'Loading face detection...';
    document.getElementById('capture-face-btn').disabled = true;
    document.getElementById('face-enroll-modal').classList.add('active');

    // Load face-api models
    if (!enrollModelsLoaded) {
        try {
            const modelPath = `${API}/models`;
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(modelPath),
                faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
                faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
            ]);
            enrollModelsLoaded = true;
        } catch (err) {
            document.getElementById('enroll-status').textContent = '❌ Failed to load face models';
            return;
        }
    }

    // Start camera
    try {
        enrollStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } }
        });
        const video = document.getElementById('enroll-video');
        video.srcObject = enrollStream;
        await video.play();
        document.getElementById('enroll-status').textContent = 'Position your face in the frame, then click Capture';
        document.getElementById('capture-face-btn').disabled = false;
    } catch (err) {
        document.getElementById('enroll-status').textContent = '❌ Camera access denied. Use HTTPS for mobile.';
    }
}

function closeFaceEnroll() {
    if (enrollStream) {
        enrollStream.getTracks().forEach(t => t.stop());
        enrollStream = null;
    }
    const video = document.getElementById('enroll-video');
    if (video) video.srcObject = null;
    const canvas = document.getElementById('enroll-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    document.getElementById('face-enroll-modal').classList.remove('active');
}

async function captureFace() {
    const video = document.getElementById('enroll-video');
    const statusEl = document.getElementById('enroll-status');
    const captureBtn = document.getElementById('capture-face-btn');

    captureBtn.disabled = true;
    statusEl.textContent = '🔍 Detecting face...';

    try {
        const detection = await faceapi
            .detectSingleFace(video)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            statusEl.textContent = '❌ No face detected. Please position your face clearly and try again.';
            captureBtn.disabled = false;
            return;
        }

        // Draw bounding box on canvas
        const canvas = document.getElementById('enroll-canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        const box = detection.detection.box;
        ctx.strokeStyle = '#00d2a0';
        ctx.lineWidth = 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        statusEl.textContent = '💾 Saving face data...';

        // Save descriptor to server
        const descriptor = Array.from(detection.descriptor);
        const res = await fetch(`${API}/api/students/${currentQrStudentId}/face`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descriptor }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to save');
        }

        showToast('Face enrolled successfully! ✅', 'success');
        playBeep(600, 200);
        document.getElementById('face-enroll-status').innerHTML = '✅ <span style="color:var(--success)">Face enrolled</span>';

        // Close after a brief delay to show the bounding box
        setTimeout(() => closeFaceEnroll(), 1000);
    } catch (err) {
        statusEl.textContent = '❌ ' + (err.message || 'Failed to enroll face');
        captureBtn.disabled = false;
    }
}

// ─── Attendance ────────────────────────────────────────────────────────────
async function loadAttendance(page = 1) {
    attendancePage = page;
    try {
        const date = document.getElementById('attendance-date').value;
        const grade = document.getElementById('attendance-grade-filter').value;
        const res = await fetch(`${API}/api/attendance?date=${date}&grade=${encodeURIComponent(grade)}&page=${page}`);
        const data = await res.json();

        const tbody = document.getElementById('attendance-table-body');
        const empty = document.getElementById('attendance-empty');

        if (!data.records.length) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            document.getElementById('attendance-pagination').innerHTML = '';
            return;
        }

        empty.style.display = 'none';
        tbody.innerHTML = data.records.map(r => `
      <tr>
        <td class="student-name">${esc(r.student_name)}</td>
        <td><span class="badge badge-grade">${esc(r.grade)}</span></td>
        <td>${r.date}</td>
        <td style="font-variant-numeric:tabular-nums">${r.time_in}</td>
        <td style="font-variant-numeric:tabular-nums">${r.time_out || '—'}</td>
        <td>${r.time_out
                ? '<span class="badge badge-out">Checked Out</span>'
                : '<span class="badge badge-in">Present</span>'}</td>
      </tr>`).join('');

        renderPagination(data);
    } catch (err) {
        showToast('Failed to load attendance', 'error');
    }
}

function renderPagination(data) {
    const container = document.getElementById('attendance-pagination');
    if (data.pages <= 1) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = `
    <button ${data.page <= 1 ? 'disabled' : ''} onclick="loadAttendance(${data.page - 1})">← Prev</button>
    <span class="page-info">Page ${data.page} of ${data.pages}</span>
    <button ${data.page >= data.pages ? 'disabled' : ''} onclick="loadAttendance(${data.page + 1})">Next →</button>`;
}

function exportAttendance() {
    const date = document.getElementById('attendance-date').value;
    const grade = document.getElementById('attendance-grade-filter').value;
    const url = `${API}/api/attendance/export?date_from=${date}&date_to=${date}&grade=${encodeURIComponent(grade)}`;
    window.open(url, '_blank');
}

// ─── Utilities ─────────────────────────────────────────────────────────────
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Close modals on backdrop click
document.addEventListener('click', (e) => {
    if (e.target.id === 'student-modal') closeStudentModal();
    if (e.target.id === 'qr-modal') closeQrModal();
    if (e.target.id === 'face-enroll-modal') closeFaceEnroll();
});

// Close modals on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeStudentModal();
        closeQrModal();
        closeFaceEnroll();
    }
});
