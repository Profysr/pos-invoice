import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Flex, Group, Loader, Modal, NavLink, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle, IconCloudDownload, IconPrinter } from '@tabler/icons-react'
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

const navItems = [
  { id: 'printer', label: 'Printer', icon: IconPrinter },
  { id: 'updates', label: 'Updates', icon: IconCloudDownload }
]

/**
 * Settings modal. Printer settings on one section, application updates on the other.
 * Company settings (currency) and USB printer support are out of scope.
 */
function SettingsModal({ opened, onClose }) {
  const [activeTab, setActiveTab] = useState('printer')
  const [printer, setPrinter] = useState(defaultPrinter)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [updateStatus, setUpdateStatus] = useState('idle')
  const [updateInfo, setUpdateInfo] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [updateError, setUpdateError] = useState('')

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
    if (opened && activeTab === 'printer') {
      void Promise.resolve().then(() => {
        if (active) void load()
      })
    }
    return () => {
      active = false
    }
  }, [opened, activeTab, load])

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

  const handleCheckUpdates = async () => {
    setUpdateStatus('checking')
    setUpdateError('')
    const request = window.invoiceApi?.checkForUpdates
      ? window.invoiceApi.checkForUpdates()
      : Promise.reject(new Error('The application API is unavailable.'))
    try {
      const result = await request
      if (result.error) {
        setUpdateStatus('error')
        setUpdateError(result.error)
        return
      }
      if (result.available) {
        setUpdateStatus('available')
        setUpdateInfo(result)
      } else {
        setUpdateStatus('uptodate')
        notifications.show({
          color: 'green',
          title: 'No updates available',
          message: 'You are on the latest version.'
        })
      }
    } catch (error) {
      setUpdateStatus('error')
      setUpdateError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleDownloadInstall = async () => {
    setDownloading(true)
    setUpdateError('')
    const request = window.invoiceApi?.downloadAndInstallUpdate
      ? window.invoiceApi.downloadAndInstallUpdate()
      : Promise.reject(new Error('The application API is unavailable.'))
    try {
      await request
      // quitAndInstall() in the main process restarts the app with the new version.
      notifications.show({
        color: 'green',
        title: 'Installing update…',
        message: 'The app will restart to complete the update.'
      })
    } catch (error) {
      setDownloading(false)
      setUpdateStatus('error')
      setUpdateError(error instanceof Error ? error.message : String(error))
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
      title="Settings"
      size={720}
      centered
      withCloseButton
      classNames={{ body: 'settings-modal-body' }}
    >
      <div className="settings-modal-layout">
        <nav className="settings-side-nav" aria-label="Settings sections">
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id
            return (
              <NavLink
                key={id}
                label={label}
                leftSection={<Icon size={16} stroke={1.6} />}
                active={isActive}
                onClick={() => setActiveTab(id)}
                style={(theme) => ({
                  borderRadius: theme.radius.sm,
                  color: isActive ? theme.colors.accent[6] : theme.colors.dark[7],
                  background: isActive ? theme.colors.accent[0] : undefined,
                  fontWeight: isActive ? 600 : 400,
                  padding: '7px 10px'
                })}
              />
            )
          })}
        </nav>

        <div className="settings-section-area">
          {activeTab === 'printer' ? (
            <>
              {loading ? (
                <Flex justify="center" align="center" mih={240}>
                  <Loader size="sm" />
                </Flex>
              ) : error ? (
                <Alert
                  color="red"
                  icon={<IconAlertCircle size={16} />}
                  title="Could not load settings"
                  style={{ marginBottom: 'sm' }}
                >
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
            </>
          ) : (
            <section className="settings-updates" aria-label="Application updates">
              <Group wrap="nowrap" align="top">
                <Text size="sm" fw={600} mb="xs">
                  Application updates
                </Text>
                {updateStatus === 'checking' ? <Loader size="sm" mt="2px" /> : null}
              </Group>
              <Group gap="xs" wrap="nowrap" mt="xs">
                {updateStatus === 'available' ? (
                  <>
                    <Alert color="blue" size="xs" title="Update available">
                      Version {updateInfo?.version} is ready to download.
                    </Alert>
                    <Button
                      leftSection={<IconCloudDownload size={14} stroke={1.6} />}
                      color="blue"
                      loading={downloading}
                      disabled={downloading}
                      onClick={handleDownloadInstall}
                    >
                      Download & install
                    </Button>
                  </>
                ) : updateStatus === 'uptodate' ? (
                  <Text size="xs" c="green">
                    You are on the latest version.
                  </Text>
                ) : updateStatus === 'error' ? (
                  <Alert color="red" size="xs" title="Could not check for updates">
                    {updateError}
                  </Alert>
                ) : (
                  <Button
                    leftSection={<IconCloudDownload size={14} stroke={1.6} />}
                    onClick={handleCheckUpdates}
                  >
                    Check for updates
                  </Button>
                )}
              </Group>
            </section>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default SettingsModal
