import { useCallback, useState } from 'react'
import AppSidebar from './layout/AppSidebar'
import AppToolbar from './layout/AppToolbar'
import NewInvoicePage from './pages/NewInvoicePage'
import SavedInvoicesPage from './pages/SavedInvoicesPage'
import SettingsModal from './settings/SettingsModal'

const viewNames = {
  'new-invoice': 'New Invoice',
  history: 'Saved Invoices'
}

function App() {
  const [activeView, setActiveView] = useState('new-invoice')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [invoiceSession, setInvoiceSession] = useState(0)
  const [editInvoice, setEditInvoice] = useState(null)

  const handleNavigate = useCallback((view) => {
    setActiveView(view)
    if (view === 'new-invoice') {
      setEditInvoice(null)
      setInvoiceSession((value) => value + 1)
    }
  }, [])

  const handleEditInvoice = useCallback((invoice) => {
    setEditInvoice(invoice)
    setActiveView('new-invoice')
    setInvoiceSession((value) => value + 1)
  }, [])

  return (
    <div className="app-shell">
      <AppSidebar
        activeView={activeView}
        onNavigate={handleNavigate}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="app-main">
        <AppToolbar viewName={viewNames[activeView]} />
        <main className="app-workspace">
          {activeView === 'new-invoice' ? (
            <NewInvoicePage key={invoiceSession} editInvoice={editInvoice} />
          ) : (
            <SavedInvoicesPage onEdit={handleEditInvoice} />
          )}
        </main>
      </div>
      <SettingsModal opened={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default App
