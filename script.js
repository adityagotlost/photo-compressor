// DOM Elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const workspace = document.getElementById('workspace');

const formatSelect = document.getElementById('formatSelect');
const customSizeInput = document.getElementById('customSizeInput');
const presetPills = document.querySelectorAll('.preset-pill');
const targetStatusText = document.getElementById('targetStatusText');

const originalPreview = document.getElementById('originalPreview');
const compressedPreview = document.getElementById('compressedPreview');
const originalSizeLabel = document.getElementById('originalSize');
const compressedSizeLabel = document.getElementById('compressedSize');
const savingsBadge = document.getElementById('savingsBadge');
const originalDimensionsVal = document.getElementById('originalDimensionsVal');
const compressedDimensionsVal = document.getElementById('compressedDimensionsVal');

const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

// State
let currentFile = null;
let originalImage = null;
let originalFileSize = 0;
let compressedBlobUrl = null;

// --- Event Listeners ---
function setupEventListeners() {
    // Drag & Drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    // File Input
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    // Preset Pills
    presetPills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            presetPills.forEach(p => p.classList.remove('active'));
            e.currentTarget.classList.add('active');

            const size = e.currentTarget.getAttribute('data-size');
            if (size === 'max') {
                customSizeInput.value = Math.ceil(originalFileSize / 1024) || 10000;
            } else {
                customSizeInput.value = size;
            }

            if (originalImage) startTargetCompression();
        });
    });

    // Custom Size Input
    customSizeInput.addEventListener('input', () => {
        presetPills.forEach(p => p.classList.remove('active'));
    });
    customSizeInput.addEventListener('change', () => {
        if (originalImage) startTargetCompression();
    });

    // Format
    formatSelect.addEventListener('change', () => {
        if (originalImage) startTargetCompression();
    });

    // Buttons
    resetBtn.addEventListener('click', resetWorkspace);
    downloadBtn.addEventListener('click', downloadImage);
}

// --- Core Logic ---
function handleFile(file) {
    if (!file.type.match(/image\/(jpeg|png|webp)/)) {
        alert("Please upload a valid JPEG, PNG, or WebP image.");
        return;
    }

    currentFile = file;
    originalFileSize = file.size;
    originalSizeLabel.textContent = formatBytes(originalFileSize);

    const reader = new FileReader();
    reader.onload = (e) => {
        originalPreview.src = e.target.result;
        originalImage = new Image();
        originalImage.onload = () => {
            originalDimensionsVal.textContent = `${originalImage.width} x ${originalImage.height} px`;
            uploadZone.style.display = 'none';
            workspace.classList.remove('hidden');
            startTargetCompression();
        };
        originalImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function getTargetBytes() {
    const val = parseFloat(customSizeInput.value);
    if (isNaN(val) || val <= 0) return originalFileSize;
    return val * 1024;
}

async function startTargetCompression() {
    targetStatusText.textContent = "Compressing...";
    targetStatusText.className = "status-badge working";
    customSizeInput.disabled = true;
    presetPills.forEach(p => p.disabled = true);
    formatSelect.disabled = true;

    try {
        await findOptimalCompression();
        targetStatusText.textContent = "Done ✓";
        targetStatusText.className = "status-badge done";
    } catch (err) {
        console.error(err);
        targetStatusText.textContent = "Failed";
        targetStatusText.className = "status-badge error";
    } finally {
        customSizeInput.disabled = false;
        presetPills.forEach(p => p.disabled = false);
        formatSelect.disabled = false;
    }
}

function canvasToBlob(canvas, mimeType, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
}

// Cap max working resolution to prevent browser crash on large/8K images
const MAX_WORKING_PX = 2048;

function getWorkingScale() {
    const longest = Math.max(originalImage.width, originalImage.height);
    if (longest <= MAX_WORKING_PX) return 1.0;
    return MAX_WORKING_PX / longest;
}

async function findOptimalCompression() {
    const targetBytes = getTargetBytes();
    const mimeType = formatSelect.value;

    const capScale = getWorkingScale(); // e.g. 0.26 for an 8K image
    const baseW = Math.round(originalImage.width * capScale);
    const baseH = Math.round(originalImage.height * capScale);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // --- Phase 1: Binary search on quality at the capped resolution (~5-7 iterations) ---
    let lo = 0.05, hi = 0.95;
    let bestUnderBlob = null, bestUnderDimensions = null;
    let closestBlob = null, closestScore = Infinity;
    let closestDimensions = { w: baseW, h: baseH };

    async function tryEncode(w, h, q) {
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(originalImage, 0, 0, w, h);
        return canvasToBlob(canvas, mimeType, q);
    }

    for (let i = 0; i < 7; i++) {
        const mid = parseFloat(((lo + hi) / 2).toFixed(3));
        const blob = await tryEncode(baseW, baseH, mid);
        if (!blob) break;

        const score = Math.abs(blob.size - targetBytes);
        if (score < closestScore) { closestBlob = blob; closestScore = score; closestDimensions = { w: baseW, h: baseH }; }

        if (blob.size <= targetBytes) {
            bestUnderBlob = blob;
            bestUnderDimensions = { w: baseW, h: baseH };
            lo = mid; // go higher quality
        } else {
            hi = mid; // go lower quality
        }
        if (score < targetBytes * 0.03) break; // within 3% — good enough, stop early
    }

    // --- Phase 2: Only if quality alone couldn't hit target — binary search on scale ---
    if (!bestUnderBlob) {
        let scLo = 0.1, scHi = 0.9;
        for (let i = 0; i < 6; i++) {
            const sc = parseFloat(((scLo + scHi) / 2).toFixed(3));
            const w = Math.round(baseW * sc);
            const h = Math.round(baseH * sc);
            const blob = await tryEncode(w, h, 0.75);
            if (!blob) break;

            const score = Math.abs(blob.size - targetBytes);
            if (score < closestScore) { closestBlob = blob; closestScore = score; closestDimensions = { w, h }; }

            if (blob.size <= targetBytes) {
                bestUnderBlob = blob;
                bestUnderDimensions = { w, h };
                scLo = sc; // try higher scale (better quality)
            } else {
                scHi = sc; // shrink more
            }
            if (score < targetBytes * 0.03) break;
        }
    }

    const bestBlob = bestUnderBlob || closestBlob;
    const bestDimensions = bestUnderDimensions || closestDimensions;

    // Prevent inflation: if compressed is bigger than original, keep original
    let finalBlob = bestBlob;
    if (!finalBlob || (finalBlob.size > originalFileSize && targetBytes >= originalFileSize)) {
        finalBlob = currentFile;
        bestDimensions = { w: originalImage.width, h: originalImage.height };
    }

    if (compressedBlobUrl) URL.revokeObjectURL(compressedBlobUrl);
    compressedBlobUrl = URL.createObjectURL(finalBlob);
    compressedPreview.src = compressedBlobUrl;

    updateStats(finalBlob.size);
    compressedDimensionsVal.textContent = `${bestDimensions.w} x ${bestDimensions.h} px`;
}

function updateStats(compressedSize) {
    compressedSizeLabel.textContent = formatBytes(compressedSize);
    const pct = ((originalFileSize - compressedSize) / originalFileSize) * 100;
    if (pct > 0) {
        savingsBadge.textContent = `-${pct.toFixed(1)}%`;
        savingsBadge.className = 'savings';
        compressedSizeLabel.style.color = 'var(--accent-color)';
    } else {
        savingsBadge.textContent = `+${Math.abs(pct).toFixed(1)}%`;
        savingsBadge.className = 'savings negative';
        compressedSizeLabel.style.color = 'var(--text-main)';
    }
}

function downloadImage() {
    if (!compressedBlobUrl) return;
    const format = formatSelect.value;
    const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
    const baseName = currentFile.name.replace(/\.[^/.]+$/, '') || 'image';
    const a = document.createElement('a');
    a.href = compressedBlobUrl;
    a.download = `${baseName}-compressed.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function resetWorkspace() {
    workspace.classList.add('hidden');
    setTimeout(() => { uploadZone.style.display = 'block'; }, 300);
    fileInput.value = '';
    currentFile = null;
    originalImage = null;
    if (compressedBlobUrl) {
        URL.revokeObjectURL(compressedBlobUrl);
        compressedBlobUrl = null;
    }
    targetStatusText.textContent = 'Ready';
    targetStatusText.className = 'status-badge';
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

setupEventListeners();
