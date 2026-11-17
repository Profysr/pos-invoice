import { Flex, Group, Stack, TextInput, Textarea, Button, Divider, Title } from '@mantine/core'
import { IconDeviceFloppy, IconPrinter } from '@tabler/icons-react'

/**
 * InvoiceForm — presentational form shell for the New Invoice workspace.
 * The @mantine/form instance is owned by NewInvoicePage and passed in.
 *
 * Props:
 * - form: @mantine/form instance with values { customerName, customerPhone,
 *   customerAddress, invoiceNumber, invoiceDate, invoiceTime, notes }
 * - onSubmit(values): submit handler wired to form.onSubmit (save path)
 * - onPrint(): backend integration callback
 * - saving / printing: busy flags for the action buttons
 * - lineItemsSlot: node rendered below the invoice details section
 *   (the line-items editor is injected by the page)
 */
function InvoiceForm({ form, onSubmit, onPrint, saving = false, printing = false, lineItemsSlot }) {
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <Stack gap="sm" flex={1} mih={0}>
        <section>
          <Title order={4}>Customer</Title>
          <Stack gap="xs" mt={6}>
            <TextInput
              label="Customer name"
              placeholder="e.g. Bilal Ahmad"
              required
              key={form.key('customerName')}
              {...form.getInputProps('customerName')}
            />
            <Flex gap="xs" wrap="wrap">
              <TextInput
                label="Phone"
                placeholder="+92 ..."
                style={{ flex: '1 1 160px' }}
                key={form.key('customerPhone')}
                {...form.getInputProps('customerPhone')}
              />
              <TextInput
                label="Address"
                placeholder="Street, city"
                style={{ flex: '2 1 240px' }}
                key={form.key('customerAddress')}
                {...form.getInputProps('customerAddress')}
              />
            </Flex>
          </Stack>
        </section>

        <Divider />

        <section>
          <Title order={4}>Invoice details</Title>
          <Flex gap="xs" wrap="wrap" mt={6}>
            <TextInput
              label="Invoice #"
              placeholder="INV-2026-0001"
              style={{ flex: '1 1 140px' }}
              key={form.key('invoiceNumber')}
              {...form.getInputProps('invoiceNumber')}
            />
            <TextInput
              label="Date"
              type="date"
              style={{ flex: '1 1 140px' }}
              key={form.key('invoiceDate')}
              {...form.getInputProps('invoiceDate')}
            />
            <TextInput
              label="Time"
              type="time"
              style={{ flex: '1 1 110px' }}
              key={form.key('invoiceTime')}
              {...form.getInputProps('invoiceTime')}
            />
          </Flex>
        </section>

        <Divider />

        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Title order={4}>Items</Title>
          <div style={{ marginTop: 6, flex: 1, minHeight: 0 }}>{lineItemsSlot}</div>
        </section>

        <Divider />

        <section>
          <Title order={4}>Notes</Title>
          <Textarea
            placeholder="Optional notes printed at the bottom of the receipt"
            autosize
            minRows={2}
            maxRows={4}
            mt={6}
            key={form.key('notes')}
            {...form.getInputProps('notes')}
          />
        </section>
      </Stack>

      <Group justify="flex-end" gap="xs" mt="sm">
        <Button
          variant="default"
          leftSection={<IconPrinter size={16} />}
          onClick={onPrint}
          loading={printing}
        >
          Print
        </Button>
        <Button type="submit" leftSection={<IconDeviceFloppy size={16} />} loading={saving}>
          Save invoice
        </Button>
      </Group>
    </form>
  )
}

export default InvoiceForm
