import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import FirstRunCheck from './FirstRunCheck'
import MainThreadPanel from './MainThreadPanel'
import ShortcutFeedback from './ShortcutFeedback'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <>
      <div className="forge-product-shell">
        <App />
        <aside className="forge-thread-rail" aria-label="Main thread workspace">
          <MainThreadPanel />
          <div className="forge-rail-footer">
            <FirstRunCheck />
          </div>
        </aside>
      </div>
      <ShortcutFeedback />
    </>
  </StrictMode>,
)
