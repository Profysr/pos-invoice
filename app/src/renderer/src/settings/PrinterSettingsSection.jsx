import {
  Box,
  Button,
  Divider,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput
} from '@mantine/core'
import { useForm } from '@mantine/form'

/**
 * Printer settings for the MVP: LAN TCP printing only, 80 mm paper only.
 * USB, 58 mm, and company settings are out of scope for the MVP.
 */
function PrinterSettingsSection({
  initialData,
  onSave,
  onTest,
  saving = false,
  testing = false
}) {
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      name: initialData.name || 'Counter Printer',
      connectionType: 'network',
      networkHost: initialData.networkHost || '',
      networkPort: Number(initialData.networkPort) || 9100,
      paperWidthMm: '80',
      printableWidthMm: Number(initialData.printableWidthMm) || 72,
      characterWidth: Number(initialData.characterWidth) || 48,
      dotDensity: Number(initialData.dotDensity) || 8,
      encoding: initialData.encoding || 'CP437',
      cutAfterPrint: initialData.cutAfterPrint ?? true,
      feedLinesAfterPrint: initialData.feedLinesAfterPrint ?? 2,
      timeoutMs: Number(initialData.timeoutMs) || 5000
    }
  })

  const buildProfile = (values) => ({
    ...values,
    paperWidthMm: 80,
    printableWidthMm: 72,
    characterWidth: 48,
    usbVendorId: null,
    usbProductId: null
  })

  return (
    <form onSubmit={form.onSubmit((values) => onSave(buildProfile(values)))}>
      <Stack gap="md">
        <Box>
          <Text fw={600} size="sm" mb="xs">
            Profile
          </Text>
          <TextInput
            label="Profile name"
            placeholder="Counter Printer"
            key={form.key('name')}
            {...form.getInputProps('name')}
          />
        </Box>

        <Divider />

        <Box>
          <Text fw={600} size="sm" mb="xs">
            Connection (LAN TCP only)
          </Text>
          <Stack gap="sm">
            <TextInput
              label="Printer host / IP"
              description="The printer's IP address (read it from the printer's self-test page)"
              placeholder="192.168.1.50"
              required
              key={form.key('networkHost')}
              {...form.getInputProps('networkHost')}
            />
            <NumberInput
              label="Port"
              description="TCP port for raw ESC/POS printing"
              min={1}
              max={65535}
              key={form.key('networkPort')}
              {...form.getInputProps('networkPort')}
            />
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Text fw={600} size="sm" mb="xs">
            Paper (80 mm only)
          </Text>
          <Text size="xs" c="dimmed">
            80 mm paper, 48 characters per line, 72 mm printable width.
          </Text>
        </Box>

        <Divider />

        <Text size="xs" c="dimmed">
          Tests the values above, including unsaved changes. Save them before printing receipts.
        </Text>
        <Group justify='flex-end'>
          <Button
            type="button"
            variant="default"
            loading={testing}
            onClick={() => void onTest(buildProfile(form.getValues()))}
          >
            Test current settings
          </Button>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

export default PrinterSettingsSection