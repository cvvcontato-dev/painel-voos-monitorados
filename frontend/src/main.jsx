import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { applyBrandColor, getSavedBrandColor } from './utils/brandTheme'

// Aplica a cor da marca salva imediatamente para evitar flash de cor
applyBrandColor(getSavedBrandColor())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
