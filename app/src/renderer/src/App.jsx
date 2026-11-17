import { useEffect, useState } from 'react'
import { Alert, Badge, Stack, Text, Title } from '@mantine/core'
import { IconReceipt } from '@tabler/icons-react'

function App() {
  const [appInfo, setAppInfo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    window.invoiceApi
      .getAppInfo()
      .then((info) => {
        if (active) setAppInfo(info)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <main className="app-shell">
      <Stack gap="sm">
        <IconReceipt aria-hidden="true" size={36} />
        <Title order={1}>Invoice Generator</Title>
        <Text c="dimmed">Secure Electron foundation and local database are ready.</Text>
        {error ? <Alert color="red">{error}</Alert> : null}
        {appInfo ? (
          <Badge variant="light">
            Electron {appInfo.version} · Node {appInfo.nodeVersion} · {appInfo.platform} · SQLite
            schema v{appInfo.databaseVersion}
          </Badge>
        ) : null}
      </Stack>
    </main>
  )
}

export default App
