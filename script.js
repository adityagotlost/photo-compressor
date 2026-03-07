// DOM Elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const workspace = document.getElementById('workspace');

const qualitySlider = document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');
const formatSelect = document.getElementById('formatSelect');
const targetSizeSelect = document.getElementById('targetSizeSelect');
const customSizeInput = document.getElementById('customSizeInput');
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
let originalImage = null; // HTMLImageElement
let originalFileSize = 0; // Bytes
let compressedBlobUrl = null;

// Initialization
function init() {
    setupEventListeners();
}

// Event Listeners Setup
function setupEventListeners() {
    // Drag & Drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Click Upload
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    // Settings Changes
    targetSizeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            customSizeInput.classList.add('visible');
        } else {
            customSizeInput.classList.remove('visible');
            if (originalImage) startTargetCompression();
        }
    });

    customSizeInput.addEventListener('change', () => {
        if (originalImage) startTargetCompression();
    });

    formatSelect.addEventListener('change', () => {
        if (originalImage) startTargetCompression();
    });

    // Buttons
    resetBtn.addEventListener('click', resetWorkspace);
    downloadBtn.addEventListener('click', downloadImage);
}

// Core Logic
function handleFile(file) {
    if (!file.type.match(/image\/(jpeg|png|webp)/)) {
        alert("Please upload a valid JPEG, PNG, or WebP image.");
        return;
    }

    currentFile = file;
    originalFileSize = file.size;
    originalSizeLabel.textContent = formatBytes(originalFileSize);

    // Read file for preview
    const reader = new FileReader();
    reader.onload = (e) => {
        originalPreview.src = e.target.result;

        originalImage = new Image();
        originalImage.onload = () => {
            // Set Original Dimensions in UI
            originalDimensionsVal.textContent = `${originalImage.width} x ${originalImage.height} px`;

            // Show workspace
            uploadZone.style.display = 'none';
            workspace.classList.remove('hidden');

            // Initial Compression
            startTargetCompression();
        };
        originalImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function getTargetKB() {
    if (targetSizeSelect.value === 'custom') {
        const val = parseFloat(customSizeInput.value);
        if (isNaN(val) || val <= 0) return originalFileSize / 1024; // Default to original if invalid
        return val;
    }
    return parseFloat(targetSizeSelect.value);
}

async function startTargetCompression() {
    clearStatus();
    targetStatusText.textContent = "Compressing...";
    targetStatusText.className = "status-badge working";

    // Disable inputs while working
    targetSizeSelect.disabled = true;
    formatSelect.disabled = true;

    try {
        await findOptimalCompression();
        targetStatusText.textContent = "Success";
        targetStatusText.className = "status-badge done";
    } catch (e) {
        console.error(e);
        targetStatusText.textContent = "Best Effort";
        targetStatusText.className = "status-badge error";
    } finally {
        targetSizeSelect.disabled = false;
        formatSelect.disabled = false;
    }
}

function processCanvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve) => {
        canvas.toBlob(resolve, mimeType, quality);
    });
}

async function findOptimalCompression() {
    const targetBytes = getTargetKB() * 1024;
    const mimeType = formatSelect.value;

    // Start with max quality and scale
    let currentQuality = 0.9;
    let currentScale = 1.0;

    let bestBlob = null;
    let bestBlobSize = Infinity;
    let bestDimensions = { w: originalImage.width, h: originalImage.height };

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Recursive-like loop to step down quality then scale until target is met
    for (let attempts = 0; attempts < 15; attempts++) {
        canvas.width = Math.round(originalImage.width * currentScale);
        canvas.height = Math.round(originalImage.height * currentScale);
        ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

        const blob = await processCanvasToBlob(canvas, mimeType, currentQuality);

        // Track the best (smallest) blob we produce in case we never hit the target exactly
        if (blob && Math.abs(blob.size - targetBytes) < Math.abs(bestBlobSize - targetBytes)) {
            bestBlob = blob;
            bestBlobSize = blob.size;
            bestDimensions = { w: canvas.width, h: canvas.height };
        }

        if (blob && blob.size <= targetBytes) {
            // Target achieved!
            bestBlob = blob;
            bestBlobSize = blob.size;
            bestDimensions = { w: canvas.width, h: canvas.height };
            break;
        }

        // Strategy to reduce size:
        if (currentQuality > 0.3) {
            // Lower quality first (has less visual impact than shrinking resolution)
            currentQuality -= 0.15;
        } else {
            // Quality is as low as we want to go, start shrinking dimensions
            currentScale -= 0.15;
            // Reset quality slightly so we aren't at purely abysmal 0.1 quality on a tiny image
            currentQuality = 0.7;
        }

        // Sanity break
        if (currentScale <= 0.1) break;
    }

    // Finish building UI with the best blob
    // If even our best compressed blob is somehow LARGER than the original (inflated)
    let finalBlob = bestBlob;
    let finalMimeType = mimeType;
    if (finalBlob && finalBlob.size > originalFileSize && targetBytes >= originalFileSize) {
        finalBlob = currentFile;
        finalMimeType = currentFile.type;
        formatSelect.value = finalMimeType;
        bestDimensions = { w: originalImage.width, h: originalImage.height };
    }

    if (compressedBlobUrl) URL.revokeObjectURL(compressedBlobUrl);
    compressedBlobUrl = URL.createObjectURL(finalBlob);
    compressedPreview.src = compressedBlobUrl;

    updateStats(finalBlob.size);
    compressedDimensionsVal.textContent = `${bestDimensions.w} x ${bestDimensions.h} px`;
}

function clearStatus() {
    targetStatusText.textContent = "Ready";
    targetStatusText.className = "status-badge";
}

function updateStats(compressedSize) {
    compressedSizeLabel.textContent = formatBytes(compressedSize);

    // Calculate savings
    const diff = originalFileSize - compressedSize;
    const percentage = (diff / originalFileSize) * 100;

    if (percentage > 0) {
        savingsBadge.textContent = `-${percentage.toFixed(1)}%`;
        savingsBadge.classList.remove('negative');
        compressedSizeLabel.classList.add('highlight-stat');
        compressedSizeLabel.style.color = 'var(--accent-color)';
    } else {
        savingsBadge.textContent = `+${Math.abs(percentage).toFixed(1)}%`;
        savingsBadge.classList.add('negative');
        compressedSizeLabel.style.color = 'var(--text-main)';
    }
}

function downloadImage() {
    if (!compressedBlobUrl) return;

    // Determine extension based on selected format
    const format = formatSelect.value;
    const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';

    // Construct new filename (e.g. image-compressed.webp)
    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'image';
    const newFileName = `${baseName}-compressed.${ext}`;

    // Create temporary link and click it
    const a = document.createElement('a');
    a.href = compressedBlobUrl;
    a.download = newFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function resetWorkspace() {
    // Hide workspace, show upload zone
    workspace.classList.add('hidden');
    setTimeout(() => {
        uploadZone.style.display = 'block';
    }, 300); // Wait for transition

    // Reset state
    fileInput.value = '';
    currentFile = null;
    originalImage = null;
    if (compressedBlobUrl) {
        URL.revokeObjectURL(compressedBlobUrl);
        compressedBlobUrl = null;
    }
}

// Utility Function
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Start App
init();
