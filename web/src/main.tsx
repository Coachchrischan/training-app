import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/fraunces/500-italic.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/mulish/400.css'
import '@fontsource/mulish/600.css'
import '@fontsource/mulish/800.css'
import '@fontsource/hanken-grotesk/600.css'
import '@fontsource/hanken-grotesk/700.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import './index.css'
import { applyBrand } from './brands'
import App from './App'

applyBrand()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
