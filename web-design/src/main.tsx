import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Fontlar lokal (npm @fontsource) — xarici CDN yoxdur: CSP sadə qalır, sinifdə internetsiz də işləyir
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
