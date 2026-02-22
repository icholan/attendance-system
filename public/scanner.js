// ─── QR Scanner Logic ──────────────────────────────────────────────────────
const API = '';
let scanner = null;
let isProcessing = false;
let resultTimeout = null;

// ─── Face Recognition State ────────────────────────────────────────────────
let faceModelsLoaded = false;
let faceStream = null;
let faceDetectionInterval = null;
let enrolledFaces = [];

// ─── Beep Sound ────────────────────────────────────────────────────────────
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

// ─── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    startCameraScanner();
});

// ─── Mode Toggle ───────────────────────────────────────────────────────────
async function switchMode(mode) {
    document.getElementById('btn-camera').classList.toggle('active', mode === 'camera');
    document.getElementById('btn-manual').classList.toggle('active', mode === 'manual');
    document.getElementById('btn-face').classList.toggle('active', mode === 'face');

    document.getElementById('camera-section').style.display = mode === 'camera' ? 'block' : 'none';
    document.getElementById('manual-section').classList.toggle('active', mode === 'manual');
    document.getElementById('face-section').classList.toggle('active', mode === 'face');

    // Stop everything first (await camera stop to prevent race conditions)
    await stopCameraScanner();
    stopFaceRecognition();

    if (mode === 'camera') {
        startCameraScanner();
    } else if (mode === 'manual') {
        document.getElementById('manual-code').focus();
    } else if (mode === 'face') {
        startFaceRecognition();
    }
}

// ─── Camera Scanner (QR) ───────────────────────────────────────────────────
function startCameraScanner() {
    if (scanner) return;

    scanner = new Html5Qrcode('reader');
    scanner.start(
        { facingMode: 'environment' },
        {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
        },
        onScanSuccess,
        () => { } // ignore errors (no QR detected yet)
    ).catch(err => {
        console.warn('Camera error:', err);
        document.getElementById('reader').innerHTML = `
      <div style="padding:40px;text-align:center;color:#8888aa">
        <p style="font-size:36px;margin-bottom:12px">📷</p>
        <p style="font-size:14px">Camera access denied or not available.</p>
        <p style="font-size:13px;margin-top:8px">Switch to <strong>Manual</strong> or <strong>Face</strong> mode, or grant camera permission.</p>
      </div>`;
    });
}

async function stopCameraScanner() {
    if (scanner) {
        try {
            await scanner.stop();
        } catch (e) {
            // ignore stop errors
        }
        try {
            scanner.clear();
        } catch (e) {
            // ignore clear errors
        }
        scanner = null;
    }
}

// ─── Scan Handler ──────────────────────────────────────────────────────────
async function onScanSuccess(decodedText) {
    if (isProcessing) return;
    isProcessing = true;

    // Vibrate for haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(100);

    await recordScan(decodedText.trim());

    // Cooldown to prevent re-scanning immediately
    setTimeout(() => { isProcessing = false; }, 3000);
}

function submitManualCode() {
    const code = document.getElementById('manual-code').value.trim();
    if (!code) return;
    recordScan(code);
    document.getElementById('manual-code').value = '';
}

// Handle Enter key on manual input
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('manual-section').classList.contains('active')) {
        submitManualCode();
    }
});

// ─── Record Attendance (QR-based) ──────────────────────────────────────────
async function recordScan(qrCode) {
    try {
        const res = await fetch(`${API}/api/attendance/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qr_code: qrCode }),
        });

        const data = await res.json();

        if (!res.ok) {
            if (res.status === 409) {
                showResult('info', '🔄', data.student?.name || 'Student', `Grade ${data.student?.grade || '?'}`, 'Already recorded', data.student?.qr_code || '');
            } else {
                showResult('error', '❌', 'Not Found', `Code: ${qrCode}`, 'Invalid QR Code', '');
            }
            return;
        }

        if (data.action === 'IN') {
            showResult('success', '✅', data.student.name, `Grade ${data.student.grade}${data.student.section ? ' — ' + data.student.section : ''}`, 'Checked In', data.time);
        } else {
            showResult('success', '👋', data.student.name, `Grade ${data.student.grade}${data.student.section ? ' — ' + data.student.section : ''}`, 'Checked Out', data.time);
        }
    } catch (err) {
        showResult('error', '⚠️', 'Network Error', 'Could not reach server', '', '');
    }
}

// ─── Face Recognition ──────────────────────────────────────────────────────

// Helper: wrap a promise with a timeout
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout: ${label} took longer than ${ms / 1000}s`)), ms)
        )
    ]);
}

async function startFaceRecognition() {
    const statusEl = document.getElementById('face-status');
    console.log('[FaceRec] Starting face recognition...');

    // Load models if not already loaded
    if (!faceModelsLoaded) {
        statusEl.innerHTML = '<span class="icon">👤</span><p class="loading">Loading face recognition models...</p>';
        try {
            const modelPath = `${API}/models`;
            console.log('[FaceRec] Loading models from:', modelPath);

            // Load each model sequentially with timeout for better error isolation
            console.log('[FaceRec] Loading SSD MobileNet...');
            await withTimeout(
                faceapi.nets.ssdMobilenetv1.loadFromUri(modelPath),
                30000, 'SSD MobileNet'
            );
            console.log('[FaceRec] ✅ SSD MobileNet loaded');

            console.log('[FaceRec] Loading Face Landmarks...');
            await withTimeout(
                faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
                30000, 'Face Landmarks'
            );
            console.log('[FaceRec] ✅ Face Landmarks loaded');

            console.log('[FaceRec] Loading Face Recognition Net...');
            await withTimeout(
                faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
                30000, 'Face Recognition Net'
            );
            console.log('[FaceRec] ✅ Face Recognition Net loaded');

            faceModelsLoaded = true;
            console.log('[FaceRec] All models loaded successfully');
        } catch (err) {
            console.error('[FaceRec] Failed to load face models:', err);
            statusEl.innerHTML = `<span class="icon">❌</span><p>Failed to load face models.</p><p style="font-size:12px;margin-top:8px;opacity:0.7">${err.message || 'Check console for details.'}</p>`;
            return;
        }
    }

    // Load enrolled face descriptors
    statusEl.innerHTML = '<span class="icon">👤</span><p class="loading">Loading enrolled faces...</p>';
    try {
        const res = await fetch(`${API}/api/faces`);
        const faces = await res.json();
        console.log('[FaceRec] Loaded', faces.length, 'enrolled faces');
        enrolledFaces = faces.map(f => ({
            id: f.id,
            name: f.name,
            grade: f.grade,
            section: f.section,
            descriptor: new Float32Array(f.face_descriptor),
        }));
    } catch (err) {
        console.error('[FaceRec] Failed to load faces:', err);
    }

    if (enrolledFaces.length === 0) {
        statusEl.innerHTML = '<span class="icon">⚠️</span><p>No faces enrolled yet. Enroll students from the Admin Portal first.</p>';
    }

    // Start camera
    const video = document.getElementById('face-video');
    try {
        console.log('[FaceRec] Requesting camera access...');
        faceStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } }
        });
        video.srcObject = faceStream;
        await video.play();
        console.log('[FaceRec] Camera started');

        if (enrolledFaces.length > 0) {
            statusEl.innerHTML = '<span class="icon">📸</span><p>Show your face to the camera</p>';
        }

        // Start detection loop
        faceDetectionInterval = setInterval(() => detectFace(video), 800);
    } catch (err) {
        console.error('[FaceRec] Camera error:', err);
        statusEl.innerHTML = `
            <span class="icon">📷</span>
            <p>Camera access denied or not available.</p>
            <p style="font-size:12px;margin-top:8px;opacity:0.7">Ensure you're using HTTPS and have granted camera permission.</p>`;
    }
}

function stopFaceRecognition() {
    if (faceDetectionInterval) {
        clearInterval(faceDetectionInterval);
        faceDetectionInterval = null;
    }
    if (faceStream) {
        faceStream.getTracks().forEach(t => t.stop());
        faceStream = null;
    }
    const video = document.getElementById('face-video');
    if (video) video.srcObject = null;

    const canvas = document.getElementById('face-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

async function detectFace(video) {
    if (isProcessing || !faceModelsLoaded || enrolledFaces.length === 0) return;
    if (video.readyState < 2) return;

    const canvas = document.getElementById('face-canvas');
    const ctx = canvas.getContext('2d');

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
        const detection = await faceapi
            .detectSingleFace(video)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) return;

        // Draw face bounding box
        const box = detection.detection.box;
        const scaleX = canvas.clientWidth / canvas.width;
        const scaleY = canvas.clientHeight / canvas.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#6c5ce7';
        ctx.lineWidth = 3 / scaleX;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Match against enrolled faces
        let bestMatch = null;
        let bestDistance = 1;

        for (const face of enrolledFaces) {
            const distance = faceapi.euclideanDistance(detection.descriptor, face.descriptor);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestMatch = face;
            }
        }

        // Threshold: 0.5 is a good balance between accuracy and usability
        if (bestMatch && bestDistance < 0.5) {
            // Draw green box for match
            ctx.strokeStyle = '#00d2a0';
            ctx.lineWidth = 4 / scaleX;
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            // Draw name label
            ctx.fillStyle = '#00d2a0';
            ctx.font = `bold ${16 / scaleX}px Inter, sans-serif`;
            ctx.fillText(bestMatch.name, box.x + 4, box.y - 8);

            isProcessing = true;
            playBeep(600, 200);
            if (navigator.vibrate) navigator.vibrate(100);
            await recordFaceScan(bestMatch);
            setTimeout(() => { isProcessing = false; }, 4000);
        }
    } catch (err) {
        console.warn('Face detection error:', err);
    }
}

async function recordFaceScan(matchedFace) {
    try {
        const res = await fetch(`${API}/api/attendance/face-scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: matchedFace.id }),
        });

        const data = await res.json();

        if (!res.ok) {
            if (res.status === 409) {
                showResult('info', '🔄', matchedFace.name, `Grade ${matchedFace.grade}`, 'Already recorded', '');
            } else {
                showResult('error', '❌', 'Error', data.error || 'Unknown error', '', '');
            }
            return;
        }

        if (data.action === 'IN') {
            showResult('success', '✅', data.student.name, `Grade ${data.student.grade}${data.student.section ? ' — ' + data.student.section : ''}`, 'Checked In', data.time);
        } else {
            showResult('success', '👋', data.student.name, `Grade ${data.student.grade}${data.student.section ? ' — ' + data.student.section : ''}`, 'Checked Out', data.time);
        }
    } catch (err) {
        showResult('error', '⚠️', 'Network Error', 'Could not reach server', '', '');
    }
}

// ─── Result Display ────────────────────────────────────────────────────────
function showResult(type, icon, name, detail, action, time) {
    const card = document.getElementById('result-card');

    // Remove previous classes
    card.className = 'result-card ' + type;

    document.getElementById('result-icon').textContent = icon;
    document.getElementById('result-name').textContent = name;
    document.getElementById('result-detail').textContent = detail;
    document.getElementById('result-action').textContent = action;
    document.getElementById('result-action').className = 'result-action ' + (action.toLowerCase().includes('in') ? 'in' : action.toLowerCase().includes('out') ? 'out' : '');
    document.getElementById('result-time').textContent = time;

    // Show card
    card.classList.add('show');

    // Auto-hide after 4s
    clearTimeout(resultTimeout);
    resultTimeout = setTimeout(() => {
        card.classList.remove('show');
    }, 4000);
}

