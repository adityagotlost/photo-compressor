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

    let bestUnderBlob = null;
    let bestUnderDimensions = null;
    let closestBlob = null;
    let closestScore = Infinity;
    let closestDimensions = { w: originalImage.width, h: originalImage.height };

    // Build strategy list: progressively more aggressive
    // Phase 1: full capped resolution, decreasing quality
    // Phase 2: decreasing resolution at moderate quality
    const strategies = [];
    for (let q = 0.92; q >= 0.05; q -= 0.06) {
        strategies.push({ wScale: 1.0, quality: parseFloat(q.toFixed(2)) });
    }
    for (let s = 0.85; s >= 0.05; s -= 0.1) {
        strategies.push({ wScale: parseFloat(s.toFixed(2)), quality: 0.7 });
    }

    for (const { wScale, quality } of strategies) {
        canvas.width = Math.round(baseW * wScale);
        canvas.height = Math.round(baseH * wScale);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

        const blob = await canvasToBlob(canvas, mimeType, quality);
        if (!blob) continue;

        const score = Math.abs(blob.size - targetBytes);
        if (score < closestScore) {
            closestBlob = blob;
            closestScore = score;
            closestDimensions = { w: canvas.width, h: canvas.height };
        }

        if (blob.size <= targetBytes) {
            // Keep the largest (best quality) result that is still under target
            if (!bestUnderBlob || blob.size > bestUnderBlob.size) {
                bestUnderBlob = blob;
                bestUnderDimensions = { w: canvas.width, h: canvas.height };
            }
            // Stop early if we've over-compressed past 50% of target – good enough
            if (blob.size < targetBytes * 0.5) break;
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
