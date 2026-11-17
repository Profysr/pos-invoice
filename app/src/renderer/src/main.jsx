import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import theme from './theme'
import App from './App'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={theme} forceColorScheme="light">
      <Notifications />
      <App />
    </MantineProvider>
  </StrictMode>
)
