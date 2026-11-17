import { Box, Button, Divider, Group, Stack, Text, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'

function CompanyMetadataSection({ initialData, onSave }) {
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: initialData
  })

  return (
    <form onSubmit={form.onSubmit((values) => (onSave ? onSave(values) : null))}>
      <Stack gap="md">
        <Box>
          <Text fw={600} size="sm" mb="xs">
            Company
          </Text>
          <Stack gap="sm">
            <TextInput
              label="Company name"
              placeholder="Business name shown on receipts"
              key={form.key('name')}
              {...form.getInputProps('name')}
            />
            <TextInput
              label="Logo"
              placeholder="Logo not configured"
              disabled
              key={form.key('logoText')}
              {...form.getInputProps('logoText')}
            />
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Text fw={600} size="sm" mb="xs">
            Address
          </Text>
          <TextInput
            label="Address"
            placeholder="Street, city"
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

        <Box>
          <Text fw={600} size="sm" mb="xs">
            Tax info
          </Text>
          <TextInput
            label="Tax number (NTN)"
            placeholder="NTN-0000000-0"
            key={form.key('taxNumber')}
            {...form.getInputProps('taxNumber')}
          />
        </Box>

        <Divider />

        <Group justify="flex-end">
          <Button type="submit">Save</Button>
        </Group>
      </Stack>
    </form>
  )
}

export default CompanyMetadataSection
