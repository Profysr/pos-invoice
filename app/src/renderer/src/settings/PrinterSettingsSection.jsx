import {
  Box,
  Button,
  Divider,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { paperPreset } from '../../../shared/paper.js'

function PrinterSettingsSection({
  initialData,
  systemPrinters = [],
  onSave,
  onTest,
  saving = false,
  testing = false
}) {
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      name: initialData.name || 'Counter Printer',
      connectionType: initialData.connectionType || 'system',
      networkHost: initialData.networkHost || '',
      networkPort: Number(initialData.networkPort) || 9100,
      systemPrinterName: initialData.systemPrinterName || '',
      // The only format question the user answers; the grid is derived on save.
      paperWidthMm: Number(initialData.paperWidthMm) === 58 ? '58' : '80',
      // Kept in the profile but no longer asked for — values round-trip on save.
      printableWidthMm: Number(initialData.printableWidthMm) || 72,
      characterWidth: Number(initialData.characterWidth) || 48,
      dotDensity: Number(initialData.dotDensity) || 8,
      encoding: initialData.encoding || 'CP437',
      cutAfterPrint: initialData.cutAfterPrint ?? true,
      feedLinesAfterPrint: initialData.feedLinesAfterPrint ?? 2,
      timeoutMs: Number(initialData.timeoutMs) || 5000
    }
  })

  const connectionType = form.values.connectionType
  const printerOptions = [
    { value: '', label: 'Choose an installed printer' },
    ...systemPrinters.map((printer) => ({
      value: printer.name,
      label: printer.isDefault ? `${printer.displayName} (default)` : printer.displayName
    }))
  ]
  if (
    form.values.systemPrinterName &&
    !printerOptions.some((option) => option.value === form.values.systemPrinterName)
  ) {
    printerOptions.push({
      value: form.values.systemPrinterName,
      label: form.values.systemPrinterName
    })
  }

  // Merge the derived paper grid into whatever the form holds.
  const buildProfile = (values) => ({ ...values, ...paperPreset(values.paperWidthMm) })

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
            Connection
          </Text>
          <Stack gap="sm">
            <Select
              label="Connection type"
              data={[
                { value: 'system', label: 'Windows installed printer' },
                { value: 'network', label: 'LAN printer (ESC/POS TCP)' }
              ]}
              key={form.key('connectionType')}
              {...form.getInputProps('connectionType')}
            />

            {connectionType === 'network' ? (
              <>
                <TextInput
                  label="Printer host / IP"
                  description="Tip: the printer's self-test page (hold Feed while powering on) prints its IP"
                  placeholder="192.168.1.50"
                  required
                  key={form.key('networkHost')}
                  {...form.getInputProps('networkHost')}
                />
                <NumberInput
                  label="Port"
                  min={1}
                  max={65535}
                  key={form.key('networkPort')}
                  {...form.getInputProps('networkPort')}
                />
              </>
            ) : (
              <Select
                label="Installed printer"
                data={printerOptions}
                searchable
                key={form.key('systemPrinterName')}
                {...form.getInputProps('systemPrinterName')}
              />
            )}
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Text fw={600} size="sm" mb="xs">
            Paper
          </Text>
          <SegmentedControl
            fullWidth
            data={[
              { value: '80', label: '80 mm (48 chars/line)' },
              { value: '58', label: '58 mm (32 chars/line)' }
            ]}
            key={form.key('paperWidthMm')}
            {...form.getInputProps('paperWidthMm')}
          />
        </Box>

        <Divider />

        <Group justify="space-between">
          <Button
            type="button"
            variant="default"
            loading={testing}
            onClick={() => void onTest(buildProfile(form.getValues()))}
          >
            Test print
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
