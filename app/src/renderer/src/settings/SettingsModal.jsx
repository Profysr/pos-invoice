import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Flex, Loader, Modal } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle } from '@tabler/icons-react'
import PrinterSettingsSection from './PrinterSettingsSection'

const defaultPrinter = {
  id: 'default',
  name: 'Counter Printer',
  connectionType: 'network',
  networkHost: '',
  networkPort: 9100,
  paperWidthMm: 80,
  printableWidthMm: 72,
  characterWidth: 48,
  encoding: 'CP437',
  cutAfterPrint: true,
  feedLinesAfterPrint: 2,
  timeoutMs: 5000
}

/**
 * Settings modal for the MVP. Only printer settings are available.
 * Company settings (currency) and USB printer support are out of scope.
 */
function SettingsModal({ opened, onClose }) {
  const [printer, setPrinter] = useState(defaultPrinter)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    const request = window.invoiceApi
      ? window.invoiceApi.getPrinter()
      : Promise.reject(new Error('The application API is unavailable.'))

    return request
      .then((nextPrinter) => {
        setPrinter(nextPrinter || defaultPrinter)
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let active = true
    if (opened) {
      void Promise.resolve().then(() => {
        if (active) void load()
      })
    }
    return () => {
      active = false
    }
  }, [opened, load])

  const handlePrinterSave = async (values) => {
    setSaving(true)
    try {
      const saved = await window.invoiceApi.savePrinter(values)
      setPrinter(saved)
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

  const handleClose = () => {
    setLoading(true)
    onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Printer Settings"
      size={560}
      centered
      withCloseButton
      classNames={{ body: 'settings-modal-body' }}
    >
      <div className="settings-modal-layout">
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
          ) : (
            <PrinterSettingsSection
              initialData={printer}
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