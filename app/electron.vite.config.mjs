import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {
    build: {
      // Sandboxed preload (sandbox: true) is executed as CommonJS by Electron;
      // the default ESM output for type:"module" packages fails with
      // "Cannot use import statement outside a module" and window.invoiceApi never loads.
      lib: { formats: ['cjs'] }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
