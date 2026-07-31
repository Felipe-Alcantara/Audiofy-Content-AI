import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Reaproveita o CSS do renderer vanilla para manter a mesma aparência
// enquanto a migração para React está em andamento (ver docs/USO-PUBLICO.md).
import '../../renderer/styles.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
