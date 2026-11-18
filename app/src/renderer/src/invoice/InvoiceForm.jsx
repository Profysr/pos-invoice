import {
  Button,
  Divider,
  Flex,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title
} from '@mantine/core'
import { Select } from '@mantine/core'
import { IconPrinter } from '@tabler/icons-react'
import { SHIPPING_SERVICES } from '../../../shared/shipping-services.js'
import { sanitizeMoneyInput } from '../../../shared/invoice.js'

function InvoiceForm({ form, title = 'New receipt', onPrint, printing = false }) {
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
            <Title order={4}>Shipment</Title>
            <Flex gap="xs" wrap="wrap" mt={6}>
              <TextInput
                label="Date"
                type="date"
                required
                style={{ flex: '1 1 140px' }}
                key={form.key('date')}
                {...form.getInputProps('date')}
              />
              <TextInput
                label="Time"
                type="time"
                required
                style={{ flex: '1 1 110px' }}
                key={form.key('time')}
                {...form.getInputProps('time')}
              />
              <TextInput
                label="Tracking number"
                placeholder="9201990367007536409945"
                required
                style={{ flex: '2 1 220px' }}
                key={form.key('trackingNumber')}
                {...form.getInputProps('trackingNumber')}
              />
              <TextInput
                label="Price"
                placeholder="65.22"
                inputMode="decimal"
                required
                style={{ flex: '1 1 110px' }}
                key={form.key('price')}
                {...form.getInputProps('price')}
                onChange={(event) =>
                  form.setFieldValue('price', sanitizeMoneyInput(event.currentTarget.value))
                }
              />
              <Select
                label="Service"
                data={SHIPPING_SERVICES}
                allowDeselect={false}
                style={{ flex: '1 1 180px' }}
                key={form.key('service')}
                {...form.getInputProps('service')}
              />
            </Flex>
          </section>

          <Divider />

          <section>
            <Title order={4}>Addresses</Title>
            <Stack gap="xs" mt={6}>
              {/* <Textarea
                label="Shipping from"
                description="One line each: name, street, city/state/ZIP, phone"
                placeholder={'DE MOSS\nDE 5800 Corporate Dr Houston\nTX 77036\n(800)275-8777'}
                autosize
                minRows={4}
                maxRows={8}
                required
                key={form.key('shippingFrom')}
                {...form.getInputProps('shippingFrom')}
              /> */}
              <Flex gap="xs" wrap="wrap">
                <TextInput
                  label="Destination"
                  placeholder="DANBURY CT 06810"
                  style={{ flex: '1 1 200px' }}
                  key={form.key('destination')}
                  {...form.getInputProps('destination')}
                />
                <TextInput
                  label="Weight"
                  placeholder="14 lb 6.0 oz"
                  style={{ flex: '1 1 160px' }}
                  key={form.key('weight')}
                  {...form.getInputProps('weight')}
                />
                <TextInput
                  label="Expected delivery"
                  type="date"
                  style={{ flex: '1 1 160px' }}
                  key={form.key('expectedDeliveryDate')}
                  {...form.getInputProps('expectedDeliveryDate')}
                />
              </Flex>
            </Stack>
          </section>

          <Divider />

          <section>
            <Title order={4}>Insurance</Title>
            <Flex gap="xs" wrap="wrap" mt={6}>
              <TextInput
                label="Coverage label"
                placeholder="Up to $100.00 included"
                style={{ flex: '2 1 220px' }}
                key={form.key('insuranceLabel')}
                {...form.getInputProps('insuranceLabel')}
              />
              <TextInput
                label="Insurance amount"
                placeholder="0.00"
                inputMode="decimal"
                style={{ flex: '1 1 140px' }}
                key={form.key('insuranceAmount')}
                {...form.getInputProps('insuranceAmount')}
                onChange={(event) =>
                  form.setFieldValue(
                    'insuranceAmount',
                    sanitizeMoneyInput(event.currentTarget.value)
                  )
                }
              />
            </Flex>
          </section>
        </Stack>
      </ScrollArea>
    </form>
  )
}

export default InvoiceForm
