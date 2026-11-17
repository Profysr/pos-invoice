import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Modal } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle } from '@tabler/icons-react'
import CompanyMetadataSection from './CompanyMetadataSection'
import PrinterSettingsSection from './PrinterSettingsSection'

const defaultCompany = {
  name: '',
  address: '',
  phone: '',
  email: '',
  defaultCurrency: 'USD',
  logoPath: null,
  logoDataUrl: null
}

const defaultPrinter = {
  id: 'default',
  name: 'Counter Printer',
  connectionType: 'system',
  networkHost: '',
  networkPort: 9100,
  systemPrinterName: '',
  paperWidthMm: 80,
  printableWidthMm: 72,
  characterWidth: 48,
  encoding: 'CP437',
  cutAfterPrint: true,
  feedLinesAfterPrint: 2,
  timeoutMs: 5000
}

function SettingsModal({ opened, onClose }) {
  const [section, setSection] = useState('company')
  const [company, setCompany] = useState(defaultCompany)
  const [printer, setPrinter] = useState(defaultPrinter)
  const [systemPrinters, setSystemPrinters] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // State is only updated inside promise callbacks, never synchronously in the effect.
  const load = useCallback(() => {
    const request = window.invoiceApi
      ? Promise.all([
          window.invoiceApi.getCompany(),
          window.invoiceApi.getPrinter(),
          window.invoiceApi.listSystemPrinters()
        ])
      : Promise.reject(new Error('The application API is unavailable.'))

    return request
      .then(([nextCompany, nextPrinter, printers]) => {
        setCompany(nextCompany || defaultCompany)
        setPrinter(nextPrinter || defaultPrinter)
        setSystemPrinters(printers || [])
        setError('')
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      })
  }, [])

  useEffect(() => {
    if (opened) void load()
  }, [opened, load])

  const handleCompanySave = async (values) => {
    setSaving(true)
    try {
      const saved = await window.invoiceApi.saveCompany(values)
      setCompany(saved)
      setRefreshKey((value) => value + 1)
      notifications.show({
        color: 'green',
        title: 'Company settings saved',
        message: 'New invoices will use the updated company details.'
      })
    } catch (saveError) {
      notifications.show({
        color: 'red',
        title: 'Could not save company settings',
        message: saveError instanceof Error ? saveError.message : String(saveError)
      })
    } finally {
      setSaving(false)
    }
  }

  const handlePrinterSave = async (values) => {
    setSaving(true)
    try {
      const saved = await window.invoiceApi.savePrinter(values)
      setPrinter(saved)
      setRefreshKey((value) => value + 1)
      notifications.show({
        color: 'green',
        title: 'Printer settings saved',
        message: 'The selected printer is ready for new invoices.'
      })
    } catch (saveError) {
      notifications.show({
        color: 'red',
        title: 'Could not save printer settings',
        message: saveError instanceof Error ? saveError.message : String(saveError)
      })
    } finally {
      setSaving(false)
    }
  }

  const handleChooseLogo = () => window.invoiceApi.chooseLogo()

  const sections = [
    { id: 'company', label: 'Company Metadata' },
    { id: 'printer', label: 'Printer Settings' }
  ]

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Settings"
      size={640}
      centered
      withCloseButton
      classNames={{ body: 'settings-modal-body' }}
    >
      <div className="settings-modal-layout">
        <nav className="settings-side-nav" aria-label="Settings sections">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={
                section === id
                  ? 'settings-side-nav-item settings-side-nav-item-active'
                  : 'settings-side-nav-item'
              }
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-section-area">
          {error ? (
            <Alert color="red" icon={<IconAlertCircle size={16} />} title="Could not load settings">
              {error}
              <Button variant="light" size="xs" mt="sm" onClick={() => void load()}>
                Retry
              </Button>
            </Alert>
          ) : section === 'company' ? (
            <CompanyMetadataSection
              key={`company-${refreshKey}`}
              initialData={company}
              onSave={handleCompanySave}
              onChooseLogo={handleChooseLogo}
              saving={saving}
            />
          ) : (
            <PrinterSettingsSection
              key={`printer-${refreshKey}`}
              initialData={printer}
              systemPrinters={systemPrinters}
              onSave={handlePrinterSave}
              saving={saving}
            />
          )}
        </div>
      </div>
    </Modal>
  )
}

export default SettingsModal
