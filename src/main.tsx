import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import MainThreadPanel from './MainThreadPanel'
import ShortcutFeedback from './ShortcutFeedback'
import './styles.css'
import './t016-builder-ui.css'
import './visual-restraint.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <div className="forge-product-shell">
        <App />
        <aside className="forge-thread-rail" aria-label="Main thread workspace">
          <MainThreadPanel />
        </aside>
      </div>
      <ShortcutFeedback />
    </>
  </StrictMode>,
)
