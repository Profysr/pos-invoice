import { Box, Button, Divider, Group, NumberInput, Select, Stack, Switch, Text, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'

function PrinterSettingsSection({
  initialData,
  systemPrinters = [],
  onSave,
  saving = false
}) {
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      name: initialData.name || 'Counter Printer',
      connectionType: initialData.connectionType || 'system',
      networkHost: initialData.networkHost || '',
      networkPort: Number(initialData.networkPort) || 9100,
      systemPrinterName: initialData.systemPrinterName || '',
      paperWidthMm: Number(initialData.paperWidthMm) || 80,
      printableWidthMm: Number(initialData.printableWidthMm) || 72,
      characterWidth: Number(initialData.characterWidth) || 48,
      encoding: initialData.encoding || 'CP437',
      cutAfterPrint: initialData.cutAfterPrint ?? true,
      feedLinesAfterPrint: Number(initialData.feedLinesAfterPrint) || 0,
      timeoutMs: Number(initialData.timeoutMs) || 5000
    }
  })

  const connectionType = form.values.connectionType
  const printerOptions = [
    { value: '', label: 'Choose an installed printer' },
    ...systemPrinters.map((printer) => ({
      value: printer.name,
      label: printer.displayName
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

  return (
    <form onSubmit={form.onSubmit(onSave)}>
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

            <NumberInput
              label="Connection timeout"
              description="Milliseconds"
              min={100}
              step={100}
              key={form.key('timeoutMs')}
              {...form.getInputProps('timeoutMs')}
            />
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Text fw={600} size="sm" mb="xs">
            Receipt format
          </Text>
          <Stack gap="sm">
            <Group grow align="flex-start">
              <NumberInput
                label="Paper width"
                description="mm"
                min={20}
                max={200}
                key={form.key('paperWidthMm')}
                {...form.getInputProps('paperWidthMm')}
              />
              <NumberInput
                label="Printable width"
                description="mm"
                min={10}
                max={200}
                key={form.key('printableWidthMm')}
                {...form.getInputProps('printableWidthMm')}
              />
              <NumberInput
                label="Character width"
                description="characters per line"
                min={16}
                max={100}
                key={form.key('characterWidth')}
                {...form.getInputProps('characterWidth')}
              />
            </Group>
            <Select
              label="Encoding"
              data={['CP437', 'CP850', 'CP865', 'ISO-8859-1']}
              key={form.key('encoding')}
              {...form.getInputProps('encoding')}
            />
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Text fw={600} size="sm" mb="xs">
            Output
          </Text>
          <Stack gap="sm">
            <Switch
              label="Cut after print"
              key={form.key('cutAfterPrint')}
              {...form.getInputProps('cutAfterPrint', { type: 'checkbox' })}
            />
            <NumberInput
              label="Feed lines after print"
              min={0}
              max={20}
              key={form.key('feedLinesAfterPrint')}
              {...form.getInputProps('feedLinesAfterPrint')}
            />
          </Stack>
        </Box>

        <Divider />

        <Group justify="flex-end">
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

export default PrinterSettingsSection
