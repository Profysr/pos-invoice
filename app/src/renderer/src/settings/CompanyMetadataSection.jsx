import { Box, Button, Group, Select, Stack } from '@mantine/core'
import { useForm } from '@mantine/form'

function CompanyMetadataSection({ initialData, onSave, saving = false }) {
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      defaultCurrency: initialData.defaultCurrency || 'USD'
    }
  })

  const currencyNames = new Intl.DisplayNames(['en'], { type: 'currency' })
  const CURRENCY_OPTIONS = Intl.supportedValuesOf('currency').map((code) => ({
    value: code,
    label: `${code} — ${currencyNames.of(code)}`
  }))

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
