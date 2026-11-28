import {
  Button,
  Divider,
  Fieldset,
  Flex,
  Group,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title
} from '@mantine/core'
import { IconPrinter } from '@tabler/icons-react'
import { SHIPPING_SERVICES } from '../../../shared/shipping-services.js'
import { sanitizeMoneyInput } from '../../../shared/invoice.js'

const US_STATE_OPTIONS = [
  { value: 'AL', label: 'AL — Alabama' },
  { value: 'AK', label: 'AK — Alaska' },
  { value: 'AZ', label: 'AZ — Arizona' },
  { value: 'AR', label: 'AR — Arkansas' },
  { value: 'CA', label: 'CA — California' },
  { value: 'CO', label: 'CO — Colorado' },
  { value: 'CT', label: 'CT — Connecticut' },
  { value: 'DE', label: 'DE — Delaware' },
  { value: 'DC', label: 'DC — District of Columbia' },
  { value: 'FL', label: 'FL — Florida' },
  { value: 'GA', label: 'GA — Georgia' },
  { value: 'GU', label: 'GU — Guam' },
  { value: 'HI', label: 'HI — Hawaii' },
  { value: 'ID', label: 'ID — Idaho' },
  { value: 'IL', label: 'IL — Illinois' },
  { value: 'IN', label: 'IN — Indiana' },
  { value: 'IA', label: 'IA — Iowa' },
  { value: 'KS', label: 'KS — Kansas' },
  { value: 'KY', label: 'KY — Kentucky' },
  { value: 'LA', label: 'LA — Louisiana' },
  { value: 'ME', label: 'ME — Maine' },
  { value: 'MD', label: 'MD — Maryland' },
  { value: 'MA', label: 'MA — Massachusetts' },
  { value: 'MI', label: 'MI — Michigan' },
  { value: 'MN', label: 'MN — Minnesota' },
  { value: 'MS', label: 'MS — Mississippi' },
  { value: 'MO', label: 'MO — Missouri' },
  { value: 'MT', label: 'MT — Montana' },
  { value: 'NE', label: 'NE — Nebraska' },
  { value: 'NV', label: 'NV — Nevada' },
  { value: 'NH', label: 'NH — New Hampshire' },
  { value: 'NJ', label: 'NJ — New Jersey' },
  { value: 'NM', label: 'NM — New Mexico' },
  { value: 'NY', label: 'NY — New York' },
  { value: 'NC', label: 'NC — North Carolina' },
  { value: 'ND', label: 'ND — North Dakota' },
  { value: 'MP', label: 'MP — Northern Mariana Islands' },
  { value: 'OH', label: 'OH — Ohio' },
  { value: 'OK', label: 'OK — Oklahoma' },
  { value: 'OR', label: 'OR — Oregon' },
  { value: 'PA', label: 'PA — Pennsylvania' },
  { value: 'PR', label: 'PR — Puerto Rico' },
  { value: 'RI', label: 'RI — Rhode Island' },
  { value: 'SC', label: 'SC — South Carolina' },
  { value: 'SD', label: 'SD — South Dakota' },
  { value: 'TN', label: 'TN — Tennessee' },
  { value: 'TX', label: 'TX — Texas' },
  { value: 'UT', label: 'UT — Utah' },
  { value: 'VT', label: 'VT — Vermont' },
  { value: 'VA', label: 'VA — Virginia' },
  { value: 'VI', label: 'VI — U.S. Virgin Islands' },
  { value: 'WA', label: 'WA — Washington' },
  { value: 'WV', label: 'WV — West Virginia' },
  { value: 'WI', label: 'WI — Wisconsin' },
  { value: 'WY', label: 'WY — Wyoming' },
  { value: 'AS', label: 'AS — American Samoa' }
]

function digitsOnly(value, maxLength) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, maxLength)
}

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
            <Title order={4}>Sender Address</Title>
            <Stack gap="xs" mt={6}>
              <Flex gap="xs" wrap="wrap">
                <TextInput
                  label="Sender name"
                  placeholder="DE MOSS"
                  required
                  style={{ flex: '1 1 200px' }}
                  key={form.key('senderName')}
                  {...form.getInputProps('senderName')}
                />
                <TextInput
                  label="Street address"
                  placeholder="5800 Corporate Dr"
                  required
                  style={{ flex: '2 1 240px' }}
                  key={form.key('senderStreet')}
                  {...form.getInputProps('senderStreet')}
                />
              </Flex>
              <Flex gap="xs" wrap="wrap">
                <TextInput
                  label="City"
                  placeholder="Houston"
                  required
                  style={{ flex: '1 1 160px' }}
                  key={form.key('senderCity')}
                  {...form.getInputProps('senderCity')}
                />
                <Select
                  label="State"
                  data={US_STATE_OPTIONS}
                  searchable
                  allowDeselect={false}
                  required
                  style={{ flex: '1 1 180px' }}
                  key={form.key('senderState')}
                  {...form.getInputProps('senderState')}
                />
                <TextInput
                  label="ZIP code"
                  placeholder="77036"
                  required
                  style={{ flex: '1 1 120px' }}
                  key={form.key('senderZip')}
                  {...form.getInputProps('senderZip')}
                />
              </Flex>
              <Fieldset legend="Shipping contact (optional)" variant="default">
                <Group gap="xs" wrap="wrap">
                  <TextInput
                    label="Area code"
                    placeholder="800"
                    inputMode="numeric"
                    maxLength={3}
                    style={{ flex: '1 1 100px' }}
                    key={form.key('senderContactArea')}
                    {...form.getInputProps('senderContactArea')}
                    onChange={(event) =>
                      form.setFieldValue(
                        'senderContactArea',
                        digitsOnly(event.currentTarget.value, 3)
                      )
                    }
                  />
                  <TextInput
                    label="Prefix"
                    placeholder="275"
                    inputMode="numeric"
                    maxLength={3}
                    style={{ flex: '1 1 100px' }}
                    key={form.key('senderContactPrefix')}
                    {...form.getInputProps('senderContactPrefix')}
                    onChange={(event) =>
                      form.setFieldValue(
                        'senderContactPrefix',
                        digitsOnly(event.currentTarget.value, 3)
                      )
                    }
                  />
                  <TextInput
                    label="Line number"
                    placeholder="8777"
                    inputMode="numeric"
                    maxLength={4}
                    style={{ flex: '1 1 120px' }}
                    key={form.key('senderContactLine')}
                    {...form.getInputProps('senderContactLine')}
                    onChange={(event) =>
                      form.setFieldValue(
                        'senderContactLine',
                        digitsOnly(event.currentTarget.value, 4)
                      )
                    }
                  />
                </Group>
              </Fieldset>
            </Stack>
          </section>

          <Divider />

          <section>
            <Title order={4}>Shipment</Title>
            <Flex gap="xs" wrap="wrap" mt={6}>
              <Select
                label="Service"
                data={SHIPPING_SERVICES}
                allowDeselect={false}
                required
                style={{ flex: '1 1 180px' }}
                key={form.key('service')}
                {...form.getInputProps('service')}
              />
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
            </Flex>
          </section>

          <Divider />

          <section>
            <Title order={4}>Destination & Package</Title>
            <Stack gap="xs" mt={6}>
              <Flex gap="xs" wrap="wrap">
                <TextInput
                  label="Destination city"
                  placeholder="DANBURY"
                  required
                  style={{ flex: '1 1 180px' }}
                  key={form.key('destCity')}
                  {...form.getInputProps('destCity')}
                />
                <Select
                  label="State"
                  data={US_STATE_OPTIONS}
                  searchable
                  allowDeselect={false}
                  required
                  style={{ flex: '1 1 180px' }}
                  key={form.key('destState')}
                  {...form.getInputProps('destState')}
                />
                <TextInput
                  label="ZIP code"
                  placeholder="06810"
                  required
                  style={{ flex: '1 1 120px' }}
                  key={form.key('destZip')}
                  {...form.getInputProps('destZip')}
                />
              </Flex>
              <Fieldset legend="Package weight" variant="default">
                <Group gap="xs" wrap="wrap">
                  <TextInput
                    label="Weight (lb)"
                    placeholder="14"
                    inputMode="numeric"
                    required
                    style={{ flex: '1 1 100px' }}
                    key={form.key('weightLb')}
                    {...form.getInputProps('weightLb')}
                  />
                  <TextInput
                    label="Weight (oz)"
                    placeholder="6"
                    inputMode="decimal"
                    required
                    style={{ flex: '1 1 110px' }}
                    key={form.key('weightOz')}
                    {...form.getInputProps('weightOz')}
                  />
                </Group>
              </Fieldset>
              <TextInput
                label="Expected delivery"
                type="date"
                key={form.key('expectedDeliveryDate')}
                {...form.getInputProps('expectedDeliveryDate')}
              />
            </Stack>
          </section>
        </Stack>
      </ScrollArea>
    </form>
  )
}

export default InvoiceForm
