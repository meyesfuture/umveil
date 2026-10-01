import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          cockpit: resolve(__dirname, 'src/preload/cockpit.ts'),
          stage: resolve(__dirname, 'src/preload/stage.ts'),
          overlay: resolve(__dirname, 'src/preload/overlay.ts'),
          'embed-guest': resolve(__dirname, 'src/preload/embed-guest.ts'),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer'),
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          cockpit: resolve(__dirname, 'src/renderer/cockpit/index.html'),
          stage: resolve(__dirname, 'src/renderer/stage/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay/index.html'),
        },
      },
    },
  },
})
