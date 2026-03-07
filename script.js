// DOM Elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const workspace = document.getElementById('workspace');

const qualitySlider = document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');
const formatSelect = document.getElementById('formatSelect');

const originalPreview = document.getElementById('originalPreview');
const compressedPreview = document.getElementById('compressedPreview');
const originalSizeLabel = document.getElementById('originalSize');
const compressedSizeLabel = document.getElementById('compressedSize');
const savingsBadge = document.getElementById('savingsBadge');

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
    qualitySlider.addEventListener('input', (e) => {
        qualityValue.textContent = `${Math.round(e.target.value * 100)}%`;
        if (originalImage) compressImage();
    });

    formatSelect.addEventListener('change', () => {
        if (originalImage) compressImage();
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

        // Load into an Image object for canvas manipulation
        originalImage = new Image();
        originalImage.onload = () => {
            // Show workspace
            uploadZone.style.display = 'none';
            workspace.classList.remove('hidden');

            // Initial Compression
            compressImage();
        };
        originalImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function compressImage() {
    const quality = parseFloat(qualitySlider.value);
    const mimeType = formatSelect.value;

    // Create an off-screen canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // For this simple version, we stick to original dimensions. 
    // You could easily add width/height resizing here.
    canvas.width = originalImage.width;
    canvas.height = originalImage.height;

    // Draw the image to canvas
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

    // Compress to Blob
    canvas.toBlob((blob) => {
        if (!blob) return;

        // Cleanup old blob URL
        if (compressedBlobUrl) URL.revokeObjectURL(compressedBlobUrl);

        // Create new preview
        compressedBlobUrl = URL.createObjectURL(blob);
        compressedPreview.src = compressedBlobUrl;

        // Update Stats
        updateStats(blob.size);

    }, mimeType, quality);
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
