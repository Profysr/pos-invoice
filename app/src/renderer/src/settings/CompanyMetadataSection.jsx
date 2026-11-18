import { useState } from 'react'
import { Box, Button, Divider, Group, Image, Select, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'

function CompanyMetadataSection({ initialData, onSave, onChooseLogo, saving = false }) {
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      name: initialData.name || '',
      address: initialData.address || '',
      phone: initialData.phone || '',
      email: initialData.email || '',
      defaultCurrency: initialData.defaultCurrency || 'USD',
      logoPath: initialData.logoPath || null
    }
  })
  const [logoDataUrl, setLogoDataUrl] = useState(initialData.logoDataUrl || null)
  const [choosingLogo, setChoosingLogo] = useState(false)

  const currencyNames = new Intl.DisplayNames(['en'], { type: 'currency' })
  const CURRENCY_OPTIONS = Intl.supportedValuesOf('currency').map((code) => ({
    value: code,
    label: `${code} — ${currencyNames.of(code)}`
  }));

  const chooseLogo = async () => {
    if (!onChooseLogo) return
    setChoosingLogo(true)
    try {
      const result = await onChooseLogo()
      if (result?.logoPath) {
        form.setFieldValue('logoPath', result.logoPath)
        setLogoDataUrl(result.logoDataUrl || null)
      }
    } finally {
      setChoosingLogo(false)
    }
  }

  const removeLogo = () => {
    form.setFieldValue('logoPath', null)
    setLogoDataUrl(null)
  }

  return (
    <form onSubmit={form.onSubmit(onSave)}>
      <Stack gap="md">
        <Box>
          {/* <Text fw={600} size="sm" mb="xs">
            Company
          </Text> */}
          <Stack gap="sm">
            <TextInput
              label="Company name"
              placeholder="Business name shown on receipts"
              // required
              key={form.key('name')}
              {...form.getInputProps('name')}
            />
            {/* <TextInput
              label="Default currency"
              placeholder="PKR"
              description="Three-letter currency code used for new invoices"
              key={form.key('defaultCurrency')}
              {...form.getInputProps('defaultCurrency')}
            /> */}
            <Select
              label="Default currency"
              searchable
              data={CURRENCY_OPTIONS}
              key={form.key('defaultCurrency')}
              {...form.getInputProps('defaultCurrency')}
            />
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Text fw={600} size="sm" mb="xs">
            Logo
          </Text>
          <Group align="end" gap="sm">
            {logoDataUrl ? (
              <Image
                src={logoDataUrl}
                alt="Company logo"
                w={72}
                h={72}
                fit="contain"
                withPlaceholder
              />
            ) : (
              <Box
                style={{
                  width: 72,
                  height: 72,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--mantine-color-gray-2)',
                  borderRadius: 5,
                  color: 'var(--mantine-color-dimmed)',
                  fontSize: 12
                }}
              >
                No logo
              </Box>
            )}
            <Stack gap={6}>
              <Button
                type="button"
                variant="default"
                size="xs"
                loading={choosingLogo}
                onClick={() => void chooseLogo()}
              >
                Choose logo
              </Button>
              {form.values.logoPath && (
                <Button type="button" variant="subtle" color="red" size="xs" onClick={removeLogo}>
                  Remove logo
                </Button>
              )}
            </Stack>
          </Group>
        </Box>

        <Divider />

        <Box>
          {/* <Text fw={600} size="sm" mb="xs">
            Address
          </Text> */}
          <Textarea
            label="Address"
            description="Receipt sender block — one line each: street, city/state/ZIP"
            placeholder={'DE 5800 Corporate Dr Houston\nTX 77036'}
            autosize
            minRows={2}
            maxRows={6}
            key={form.key('address')}
            {...form.getInputProps('address')}
          />
        </Box>

        <Divider />

        <Box>
          <Text fw={600} size="sm" mb="xs">
            Contact
          </Text>
          <Stack gap="sm">
            <TextInput
              label="Phone"
              placeholder="+92 300 0000000"
              key={form.key('phone')}
              {...form.getInputProps('phone')}
            />
            <TextInput
              label="Email"
              type="email"
              placeholder="billing@example.com"
              key={form.key('email')}
              {...form.getInputProps('email')}
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

export default CompanyMetadataSection
