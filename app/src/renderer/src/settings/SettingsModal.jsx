import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Flex, Loader, Modal } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle } from '@tabler/icons-react'
import CompanyMetadataSection from './CompanyMetadataSection'
import PrinterSettingsSection from './PrinterSettingsSection'

const defaultCompany = {
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
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
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
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let active = true
    if (opened) {
      // Defer the request so the effect does not synchronously update state.
      void Promise.resolve().then(() => {
        if (active) void load()
      })
    }
    return () => {
      active = false
    }
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
        message: 'Logo and currency saved.'
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

  const handlePrinterTest = async (values) => {
    setTesting(true)
    try {
      const result = await window.invoiceApi.testPrinter(values)
      notifications.show({
        color: result.ok ? 'green' : 'red',
        title: result.ok ? 'Printer test job succeeded' : 'Printer test job failed',
        message: result.message
      })
    } catch (testError) {
      notifications.show({
        color: 'red',
        title: 'Printer test job failed',
        message: testError instanceof Error ? testError.message : String(testError)
      })
    } finally {
      setTesting(false)
    }
  }

  const handleChooseLogo = () => window.invoiceApi.chooseLogo()
  const handleClose = () => {
    setLoading(true)
    onClose()
  }

  const sections = [
    { id: 'company', label: 'Company Metadata' },
    { id: 'printer', label: 'Printer Settings' }
  ]

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Settings"
      size={900}
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
          {loading ? (
            <Flex justify="center" align="center" mih={240}>
              <Loader size="sm" />
            </Flex>
          ) : error ? (
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
              onTest={handlePrinterTest}
              saving={saving}
              testing={testing}
            />
          )}
        </div>
      </div>
    </Modal>
  )
}

export default SettingsModal
