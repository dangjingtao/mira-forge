import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import MainThreadPanel from './MainThreadPanel'
import ShortcutFeedback from './ShortcutFeedback'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <App />
      <MainThreadPanel />
      <ShortcutFeedback />
    </>
  </StrictMode>,
)
