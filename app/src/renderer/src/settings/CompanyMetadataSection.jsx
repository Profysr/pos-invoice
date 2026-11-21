import { useState } from 'react'
import { Box, Button, Divider, Group, Image, Select, Stack, Text } from '@mantine/core'
import { useForm } from '@mantine/form'

function CompanyMetadataSection({ initialData, onSave, onChooseLogo, saving = false }) {
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
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
  }))

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
          <Select
            label="Default currency"
            searchable
            data={CURRENCY_OPTIONS}
            key={form.key('defaultCurrency')}
            {...form.getInputProps('defaultCurrency')}
          />
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
