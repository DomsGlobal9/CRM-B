import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The workspace design system, first: tokens (Scaleezy light on plain :root),
// themes.css and every workspace recipe. The console's own layer,
// ./superadmin.css, is imported by SuperAdmin.jsx and so lands after it.
//
// No applyTheme()/watchSystemMode() and no data-theme here, on purpose. The
// console shares an origin -- and so localStorage -- with the boutique
// workspace, and theme.js reads the last boutique's design system and colour
// mode from there. The platform console is always Scaleezy light.
import '../index.css'
import SuperAdmin from './SuperAdmin.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SuperAdmin />
  </StrictMode>,
)
