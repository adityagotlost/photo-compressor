# 📸 Sleek Photo Compressor

[**Live Demo**](https://adityagotlost.github.io/photo-compressor/)

A fast, privacy-first, browser-based image compression tool. No uploads, no servers — everything happens locally on your device.

---

## ✨ Features

- 🔒 **100% Private** — Images never leave your browser; all processing is done client-side
- 📱 **Offline App (PWA)** — Install the tool as a standalone app to use fully offline without any network
- ⚡ **Binary Search Compression** — Uses a smart two-phase binary search algorithm to hit your target file size in milliseconds
- 🎯 **Target File Size** — Set a precise target size (e.g. 10 KB, 100 KB) with quick-select preset pills
- 🖼️ **Output Format Selection** — Export as **JPEG**, **WebP** (recommended), or **PNG**
- 📊 **Side-by-Side Comparison** — View original vs compressed image with size and dimension stats
- 💾 **One-Click Download** — Downloads the compressed image with a clean, auto-generated filename
- 🖱️ **Drag & Drop Support** — Upload images by dragging them onto the page or clicking to browse
- 🛡️ **Inflation Guard** — Automatically keeps the original file if compression would make it larger
- 📐 **Large Image Handling** — Caps working resolution at 4096px on the longest side to prevent browser crashes on 4K/8K images while preserving high details

---

## 🚀 Getting Started

This is a pure HTML/CSS/JS project — no build tools or dependencies required.

1. **Clone or download** the repository
2. Open `index.html` in any modern browser
3. That's it!

```
photo-compressor/
├── index.html   # App structure & UI
├── style.css    # Styling & animations
├── script.js    # Compression logic
└── README.md
```

---

## 🛠️ How It Works

### Phase 1 — Quality Binary Search
The algorithm performs up to **7 iterations** of binary search on the JPEG/WebP quality parameter (`0.05` → `0.95`) at the capped resolution. It stops early if the result is within **3%** of the target size.

### Phase 2 — Scale Binary Search (fallback)
If quality search alone can't reach the target (e.g. the target is very small), a second binary search on the **image scale** (resolution reduction) kicks in with up to **6 more iterations** at a lower quality base of `0.50` (to preserve dimensions over pixel sharpness when needed).

This two-phase approach finds optimal compression settings in typically **under 1 second**, even for large images.

---

## 📋 Supported Formats

| Input | Output |
|-------|--------|
| JPEG  | JPEG   |
| PNG   | WebP ✅ |
| WebP  | PNG    |

> **Tip:** WebP is the recommended output format for the best size-to-quality ratio.

---

## 🌐 Browser Compatibility

Works in all modern browsers that support the **Canvas API** and **`toBlob()`**:

- ✅ Chrome / Edge (v76+)
- ✅ Firefox (v90+)
- ✅ Safari (v14+)

---

## 📄 License

Free to use for personal and educational projects.
