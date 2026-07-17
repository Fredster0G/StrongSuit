import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './index.css'
import { AppRoot } from './app/AppRoot'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
)
