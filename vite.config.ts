import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import fs from 'fs'

function copySqlWasm() {
  return {
    name: 'copy-sql-wasm',
    closeBundle() {
      const src = resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm')
      const destElectronDir = resolve(__dirname, 'dist-electron')
      const destDistDir = resolve(__dirname, 'dist')
      if (fs.existsSync(src)) {
        if (!fs.existsSync(destElectronDir)) fs.mkdirSync(destElectronDir, { recursive: true })
        fs.copyFileSync(src, resolve(destElectronDir, 'sql-wasm.wasm'))

        if (!fs.existsSync(destDistDir)) fs.mkdirSync(destDistDir, { recursive: true })
        fs.copyFileSync(src, resolve(destDistDir, 'sql-wasm.wasm'))
      }
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    copySqlWasm(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['sql.js', 'telegram', 'big-integer', 'fsevents', 'path', 'fs', 'crypto', 'os', 'child_process', 'net', 'tls', 'util', 'events', 'http', 'https', 'stream', 'zlib', 'url', 'buffer', 'assert']

            }
          }
        }
      },
      {
        entry: 'src/main/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    watch: {
      ignored: ['**/.teleflow_data/**', '**/database/**', '**/Downloads/**', '**/.temp/**', '**/dist/**', '**/dist-electron/**', '**/release/**']
    }
  }
})

