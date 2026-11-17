import { Box, Button, Divider, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'

function PrinterSettingsSection({ initialData, onSave }) {
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: initialData
  })

  return (
    <form onSubmit={form.onSubmit((values) => (onSave ? onSave(values) : null))}>
      <Stack gap="md">
        <Box>
          <Text fw={600} size="sm" mb="xs">
            Profile
          </Text>
          <TextInput
            label="Profile name"
            placeholder="Counter Printer"
            key={form.key('profileName')}
            {...form.getInputProps('profileName')}
          />
        </Box>

        <Divider />

        <Box>
          <Text fw={600} size="sm" mb="xs">
            Connection
          </Text>
          <Select
            label="Connection type"
            data={[
              { value: 'usb', label: 'USB' },
              { value: 'lan', label: 'LAN (TCP)' },
              { value: 'system', label: 'System printer' }
            ]}
            key={form.key('connectionType')}
            {...form.getInputProps('connectionType')}
          />
        </Box>

        <Divider />

        <Box>
          <Text fw={600} size="sm" mb="xs">
            Receipt format
          </Text>
          <Stack gap="sm">
            <Select
              label="Paper width"
              data={[
                { value: '58mm', label: '58 mm' },
                { value: '80mm', label: '80 mm' }
              ]}
              key={form.key('paperWidth')}
              {...form.getInputProps('paperWidth')}
            />
            <Select
              label="Character set"
              data={['CP437', 'CP850', 'CP865', 'ISO-8859-1']}
              key={form.key('characterSet')}
              {...form.getInputProps('characterSet')}
            />
            <Select
              label="Encoding"
              data={[{ value: 'escpos', label: 'ESC/POS' }]}
              key={form.key('encoding')}
              {...form.getInputProps('encoding')}
            />
          </Stack>
        </Box>

        <Divider />

        <Group justify="flex-end">
          <Button type="submit">Save</Button>
        </Group>
      </Stack>
    </form>
  )
}

export default PrinterSettingsSection
