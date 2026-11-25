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
  usbPrinters = [],
  onSave,
  onTest,
  saving = false,
  testing = false
}) {
  const usbDevice = initialData.usbVendorId != null && initialData.usbProductId != null
    ? `${initialData.usbVendorId}:${initialData.usbProductId}`
    : ''

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      name: initialData.name || 'Counter Printer',
      connectionType: initialData.connectionType || 'network',
      networkHost: initialData.networkHost || '',
      networkPort: Number(initialData.networkPort) || 9100,
      // A single "vendor:product" string held in the form; split into the two
      // DB columns on save. Nothing is hardcoded here.
      usbDevice,
      paperWidthMm: Number(initialData.paperWidthMm) === 58 ? '58' : '80',
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
  const usbOptions = usbPrinters.map((printer) => ({
    value: `${printer.vendorId}:${printer.productId}`,
    label: `0x${printer.vendorId.toString(16).padStart(4, '0')} / 0x${printer.productId.toString(16).padStart(4, '0')}`
  }))

  const buildProfile = (values) => {
    const usb = values.connectionType === 'usb'
      ? String(values.usbDevice ?? '').split(':')
      : []
    return {
      ...values,
      ...paperPreset(values.paperWidthMm),
      usbVendorId: values.connectionType === 'usb' && usb.length === 2 ? Number(usb[0]) : null,
      usbProductId: values.connectionType === 'usb' && usb.length === 2 ? Number(usb[1]) : null
    }
  }

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
                { value: 'network', label: 'LAN printer (ESC/POS TCP)' },
                { value: 'usb', label: 'USB printer (ESC/POS USB)' }
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
                label="USB device"
                description="Vendor / product ID of the thermal printer"
                data={usbOptions}
                searchable
                key={form.key('usbDevice')}
                {...form.getInputProps('usbDevice')}
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
            color="accent"
            autoContrast
            data={[
              { value: '80', label: '80 mm (48 chars/line)' }
            ]}
            key={form.key('paperWidthMm')}
            {...form.getInputProps('paperWidthMm')}
          />
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
