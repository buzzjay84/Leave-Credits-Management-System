import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './hooks/useTheme'
import './styles/global.css'

// Electron's default action for a file dropped anywhere it isn't explicitly
// handled is to navigate the window to that file — which silently swallows
// the drop instead of reaching a React onDrop handler if the cursor lands
// so much as a pixel outside a drop zone on the way down. Block that
// default everywhere; drop zones still handle their own onDragOver/onDrop.
window.addEventListener('dragover', event => event.preventDefault())
window.addEventListener('drop', event => event.preventDefault())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider><App /></ThemeProvider>
  </React.StrictMode>
)
