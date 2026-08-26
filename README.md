<p align="center">
  <img src="public/logo.png" width="128" height="128" alt="TeleFlow Logo" />
</p>

# TeleFlow — Desktop Telegram Client & High-Speed Sequential Downloader

[![Version](https://img.shields.io/badge/version-1.0.4-00d4ff.svg)](https://github.com/geekykalpesh/TeleFlow/releases/tag/v1.0.4)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-3b82f6.svg)](https://github.com/geekykalpesh/TeleFlow/releases)
[![Electron](https://img.shields.io/badge/Electron-34.5.8-47858c.svg)](https://www.electronjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.4.3-646cff.svg)](https://vitejs.dev/)

**TeleFlow** is a high-performance cross-platform desktop application engineered for Telegram users, archivists, and content creators. It provides turbo parallel multi-worker downloading (up to **45+ MB/s**), Telegram link range parsing, deterministic ordered media downloading, real-time channel auto-syncing, and granular transfer controls.

---

## 🌟 Key Features (v1.0.4)

### 1. 🗑️ Instant Multi-Select, Context Menu & File Deletion (Disk & Queue)
- **Checkboxes & Select All**: Select multiple files or all channel files at once with a header checkbox.
- **Right-Click Context Menu**: Right-click any row to **Open File**, **Show in Folder**, **Pause/Resume/Retry**, **Remove from List**, or **Delete File & Remove**.
- **1-Click File Erasure**: Deletes files/partials permanently from your local hard drive and SQLite database in 1 single step.

### 2. 🎨 Native Windows Application & Installer Icons
- Full native Windows `.ico` integration for desktop shortcuts, Start Menu, taskbar window titlebar, and NSIS installer.

### 3. 🚀 Turbo Multi-Worker Download Engine (15–45+ MB/s)
- Opens **16 parallel MTProto TCP sockets per file** (up to 80 total streams across 5 files) directly connected to Telegram Data Centers (`dcId`), bypassing single-connection rate caps.
- Uses **512 KB request payloads** (8x larger than default 64 KB chunks), reducing network round-trip overhead by 87%.

### 4. 🔗 Telegram Link Range Parsing
- Support for direct Telegram post URLs (e.g. `https://t.me/c/3429930878/642` or `https://t.me/channel_name/1200`).
- Paste links into **From** and **To** range fields to download exact message spans automatically.

### 5. 🔁 GramJS Channel Entity Resolver & Auto-Sync
- Automatically resolves private channel entity hashes (`-100` prefix) and pre-warms entity cache on app startup so resume/retry works seamlessly across app restarts.
- **Continuous Pagination**: Automatically pages through complete channel history (from 80 to 80,000+ files) without truncation.

---

## 📦 Downloads (Version 1.0.4)

Download the latest pre-compiled binaries for your operating system from [GitHub Releases](https://github.com/geekykalpesh/TeleFlow/releases/tag/v1.0.4):

| Platform | Format | File Name | Description |
|---|---|---|---|
| 🪟 **Windows** | `.exe` | `TeleFlow Setup 1.0.4.exe` | Standard Windows NSIS Installer |
| 🪟 **Windows** | `.exe` | `TeleFlow 1.0.4.exe` | Portable Executable (No installation required) |
| 🍎 **macOS** | `.dmg` | `TeleFlow-1.0.4.dmg` | Apple Silicon & Intel macOS Disk Image |
| 🍎 **macOS** | `.zip` | `TeleFlow-1.0.4-mac.zip` | Portable zipped macOS application bundle |
| 🐧 **Linux** | `.AppImage` | `TeleFlow-1.0.4.AppImage` | Universal Linux AppImage binary |
| 🐧 **Linux** | `.deb` | `teleflow_1.0.4_amd64.deb` | Debian / Ubuntu installer package |

---

## 🛠️ Technology Stack

- **Core Desktop**: [Electron 34](https://www.electronjs.org/) (Native IPC bridge)
- **Frontend Logic & UI**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Lucide Icons](https://lucide.dev/)
- **Bundler & HMR**: [Vite 6](https://vitejs.dev/) with `vite-plugin-electron`
- **Telegram MTProto Client**: [GramJS](https://gram.js.org/) (Pure JS MTProto client with multi-worker support)
- **Local Database**: [SQL.js](https://sql.js.org/) (SQLite compiled to WebAssembly)

---

## 💻 Local Development & Building

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or v20+)
- `npm` (v9+)

### Installation & Running Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/geekykalpesh/TeleFlow.git
   cd TeleFlow
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start Development App**:
   ```bash
   npm run dev
   ```

### Building Multi-Platform Binaries

- **Windows**:
  ```bash
  npm run build:win
  ```

- **macOS**:
  ```bash
  npm run build:mac
  ```

- **Linux**:
  ```bash
  npm run build:linux
  ```

Executables are compiled into `./release/1.0.3/`.

---

## 🚀 Publishing Version 1.0.3 to GitHub

To trigger the automated GitHub Actions CI/CD release workflow for all platforms:

```bash
git add .
git commit -m "Release v1.0.3 - Turbo downloader, link parsing, full channel sync"
git tag v1.0.3
git push origin main
git push origin v1.0.3
```

GitHub Actions will automatically build Windows (`.exe`), macOS (`.dmg`), and Linux (`.AppImage`, `.deb`) packages and publish them directly to **GitHub Releases**.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
