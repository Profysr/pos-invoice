import { useState } from 'react'
import { Badge } from '@mantine/core'
import AppSidebar from './layout/AppSidebar'
import AppToolbar from './layout/AppToolbar'
import NewInvoicePage from './pages/NewInvoicePage'
import SavedInvoicesPage from './pages/SavedInvoicesPage'
import SettingsModal from './settings/SettingsModal'

const viewNames = {
  'new-invoice': 'New Invoice',
  history: 'History'
}

function App() {
  const [activeView, setActiveView] = useState('new-invoice')
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="app-shell">
      <AppSidebar
        activeView={activeView}
        onNavigate={setActiveView}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="app-main">
        <AppToolbar
          viewName={viewNames[activeView]}
          actions={
            <Badge variant="light" size="sm">
              Local database
            </Badge>
          }
        />
        <main className="app-workspace">
          {activeView === 'new-invoice' ? <NewInvoicePage /> : <SavedInvoicesPage />}
        </main>
      </div>
      <SettingsModal opened={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default App
