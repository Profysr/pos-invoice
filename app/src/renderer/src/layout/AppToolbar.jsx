import { Group, Text } from '@mantine/core'

function AppToolbar({ viewName, actions }) {
  return (
    <header className="app-toolbar">
      <Group justify="space-between" wrap="nowrap" gap="md" style={{ flex: 1 }}>
        <Group gap="sm" wrap="nowrap">
          <Text fw={600} size="sm">
            Invoice Generator
          </Text>
          <Text size="sm" c="dimmed">
            {viewName}
          </Text>
        </Group>
        <Group gap="xs" wrap="nowrap">
          {actions}
        </Group>
      </Group>
    </header>
  )
}

export default AppToolbar
