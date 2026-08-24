# TeleFlow — Desktop Telegram Client & Sequential Media Downloader

[![Version](https://img.shields.io/badge/version-1.0.0-00d4ff.svg)](https://github.com/geekykalpesh/TeleFlow/releases/tag/v1.0.0)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-3b82f6.svg)](https://github.com/geekykalpesh/TeleFlow/releases)
[![Electron](https://img.shields.io/badge/Electron-34.2.0-47858c.svg)](https://www.electronjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.1.1-646cff.svg)](https://vitejs.dev/)

**TeleFlow** is a powerful, production-ready cross-platform desktop application engineered for Telegram users, archivists, and content creators. It provides deterministic, ordered media downloading, real-time channel auto-syncing, per-channel queue isolation, and granular transfer controls.

---

## 🌟 Key Features

### 1. ⚡ Deterministic Sequential Ordering
- Automatically prefixes downloaded files with ordered sequence numbers (`001_`, `002_`, `003_`).
- Preserves exact Telegram message chronology so multi-part courses, video series, and document archives remain in order.

### 2. 📡 Isolated Per-Channel Dashboard
- Every Telegram channel or group runs in its **own isolated card view**.
- View real-time download speeds (`↓ MB/s`), remaining transfer ETAs, byte progress bars, and file status counters (`✓ done`, `⬇ active`, `⏱ queued`, `⏸ paused`, `✗ failed`).

### 3. 🔁 Automatic Background & Manual Sync
- **60-Second Auto-Sync**: Runs silently in the background, scanning all tracked channels for newly posted videos, photos, and files.
- **Manual Sync Buttons**: Instant `Sync Channel` and `Sync All Channels` triggers to poll Telegram on demand.

### 4. 📄 Infinite Auto-Load & Bottom Pagination
- **Auto-Stream Channel History**: Automatically streams the entire message history of any channel into memory without forcing manual page loads.
- **Page Jump Navigation**: Bottom pagination bar with `25 | 50 | 100 | 250 | All` page sizes, page number pills, and direct page jumping (`Go to page: [ 3 ] [Jump]`).

### 5. ⏸️ Granular Pause / Resume / Retry Controls
- Instantly abort network transfers per file or across an entire channel.
- Resumes downloads from existing `.part` byte offsets without re-downloading existing chunks.
- Retry failed items individually or via bulk `Retry All Failed`.

### 6. 📂 Custom Destination Folder Routing
- Configure custom output download directories per channel session or set a global default directory.

---

## 📦 Downloads (Version 1.0.0)

Download the latest pre-compiled binary for your operating system from [GitHub Releases](https://github.com/geekykalpesh/TeleFlow/releases/tag/v1.0.0):

| Platform | Format | Description |
|---|---|---|
| 🪟 **Windows** | `.exe` (NSIS Installer) | Standard Windows installer with Start Menu & Desktop shortcuts |
| 🪟 **Windows** | `.exe` (Portable) | Standalone portable executable (no installation required) |
| 🍎 **macOS** | `.dmg` | Apple Silicon & Intel macOS disk image installer |
| 🍎 **macOS** | `.zip` | Portable zipped macOS application bundle |
| 🐧 **Linux** | `.AppImage` | Universal Linux AppImage binary |
| 🐧 **Linux** | `.deb` | Debian / Ubuntu installer package |

---

## 🛠️ Technology Stack

- **Core Desktop**: [Electron 34](https://www.electronjs.org/) (Native IPC bridge)
- **Frontend Logic & UI**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Lucide Icons](https://lucide.dev/)
- **Bundler & HMR**: [Vite 6](https://vitejs.dev/) with `vite-plugin-electron`
- **Telegram MTProto Client**: [GramJS](https://gram.js.org/) (Pure JS MTProto client)
- **Local Database**: [SQL.js](https://sql.js.org/) (SQLite compiled to WebAssembly)

---

## 💻 Local Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or v20+)
- `npm` (v9+)

### Installation

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

---

## 🔨 Building Executables Locally

- **Build Windows Executables**:
  ```bash
  npm run build:win
  ```

- **Build macOS Executables**:
  ```bash
  npm run build:mac
  ```

- **Build Linux Executables**:
  ```bash
  npm run build:linux
  ```

Output binaries are compiled to the `./release/1.0.0/` folder.

---

## 🚀 Automated Release Workflow (CI/CD)

TeleFlow uses **GitHub Actions** for multi-platform cross-compilation:

To publish a new automated release:
```bash
git tag v1.0.0
git push origin v1.0.0
```
GitHub Actions will automatically build Windows, macOS, and Linux binaries and publish them directly to **GitHub Releases**.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
