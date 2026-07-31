import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Paths relativos: o build final é carregado via file:// pelo Electron
  // (renderer/index-react.html), não por um servidor HTTP.
  base: './',
  build: {
    // Saída dentro de renderer/, ao lado do index.html vanilla, para o
    // Electron empacotado carregar sem depender de um servidor Vite.
    outDir: '../renderer/dist-react',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Nomes fixos (sem hash) para que renderer/index-react.html possa
        // referenciar o bundle estaticamente, sem etapa de pós-processamento
        // a cada build.
        entryFileNames: 'app.js',
        chunkFileNames: 'app-[name].js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
})
