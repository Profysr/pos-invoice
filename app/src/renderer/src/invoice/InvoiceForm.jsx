import {
  Button,
  Divider,
  Flex,
  Group,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title
} from '@mantine/core'
import { IconPrinter } from '@tabler/icons-react'
import { formatMoney } from '../../../shared/invoice.js'

function InvoiceForm({
  form,
  title = 'New invoice',
  onPrint,
  printing = false,
  lineItemsSlot,
  totals = { subtotal: 0, insurance: 0, total: 0 },
  currency = 'USD'
}) {
  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      noValidate
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      <Group justify="space-between" align="flex-start" gap="sm" mb="sm" wrap="nowrap">
        <div>
          <Title order={3}>{title}</Title>
          <Text size="xs" c="dimmed">
            Review the receipt preview, then print.
          </Text>
        </div>
        <Button
          type="button"
          leftSection={<IconPrinter size={16} />}
          onClick={onPrint}
          loading={printing}
        >
          Print
        </Button>
      </Group>

      <ScrollArea flex={1} mih={0} offsetScrollbars="y" scrollbarSize={8}>
        <Stack gap="sm">
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
                readOnly
                style={{ flex: '1 1 160px' }}
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
              <TextInput
                label="Currency"
                placeholder="PKR"
                description="Three-letter currency code"
                style={{ flex: '1 1 110px' }}
                key={form.key('currency')}
                {...form.getInputProps('currency')}
              />
            </Flex>
          </section>

          <Divider />

          <section>
            <Title order={4}>Items</Title>
            <div style={{ marginTop: 6 }}>{lineItemsSlot}</div>
          </section>

          <Divider />

          <section>
            <Title order={4}>Fulfillment</Title>
            <Flex gap="xs" wrap="wrap" mt={6}>
              <TextInput
                label="Shipping service"
                placeholder="e.g. TCS"
                style={{ flex: '1 1 180px' }}
                key={form.key('shippingService')}
                {...form.getInputProps('shippingService')}
              />
              <TextInput
                label="Tracking number"
                placeholder="Optional"
                style={{ flex: '1 1 180px' }}
                key={form.key('trackingNumber')}
                {...form.getInputProps('trackingNumber')}
              />
              <TextInput
                label="Package weight"
                placeholder="e.g. 2.5 kg"
                style={{ flex: '1 1 140px' }}
                key={form.key('packageWeight')}
                {...form.getInputProps('packageWeight')}
              />
              <TextInput
                label="Expected delivery"
                type="date"
                style={{ flex: '1 1 160px' }}
                key={form.key('expectedDeliveryDate')}
                {...form.getInputProps('expectedDeliveryDate')}
              />
              <TextInput
                label="Destination address"
                placeholder="City, address"
                style={{ flex: '2 1 260px' }}
                key={form.key('destinationAddress')}
                {...form.getInputProps('destinationAddress')}
              />
            </Flex>
          </section>

          <Divider />

          <section>
            <Title order={4}>Insurance and notes</Title>
            <Stack gap="xs" mt={6}>
              <TextInput
                label="Insurance amount"
                placeholder="0.00"
                inputMode="decimal"
                key={form.key('insurance')}
                {...form.getInputProps('insurance')}
              />
              <Textarea
                label="Notes"
                placeholder="Optional notes printed at the bottom of the receipt"
                autosize
                minRows={2}
                maxRows={4}
                key={form.key('notes')}
                {...form.getInputProps('notes')}
              />
            </Stack>
          </section>
        </Stack>
      </ScrollArea>

      <Divider mt="sm" />
      <Stack gap={4} mt="xs">
        <Group justify="space-between" gap="sm">
          <Text size="sm" c="dimmed">
            Subtotal
          </Text>
          <Text size="sm">{formatMoney(totals.subtotal, currency)}</Text>
        </Group>
        <Group justify="space-between" gap="sm">
          <Text size="sm" c="dimmed">
            Insurance
          </Text>
          <Text size="sm">{formatMoney(totals.insurance, currency)}</Text>
        </Group>
        <Group justify="space-between" gap="sm">
          <Text size="sm" fw={700}>
            Grand total
          </Text>
          <Text size="sm" fw={700}>
            {formatMoney(totals.total, currency)}
          </Text>
        </Group>
      </Stack>
    </form>
  )
}

export default InvoiceForm
