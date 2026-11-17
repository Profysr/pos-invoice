import { ActionIcon, Button, Group, ScrollArea, Stack, Table, Text, TextInput } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'

function LineItemsEditor({ rows, lineTotals = [], errors = {}, onChange, addRow }) {
  const updateRow = (id, field, value) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)))
  }

  const removeRow = (id) => {
    onChange(rows.filter((row) => row.id !== id))
  }

  return (
    <Stack gap={6}>
      <ScrollArea offsetScrollbars="x" scrollbarSize={8}>
        <Table withTableBorder withColumnBorders fz="xs" horizontalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: '46%' }}>Item / description</Table.Th>
              <Table.Th w={90}>Qty</Table.Th>
              <Table.Th w={110}>Unit price</Table.Th>
              <Table.Th w={110} style={{ textAlign: 'right' }}>
                Line total
              </Table.Th>
              <Table.Th w={44} aria-label="Row actions" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row, index) => {
              const rowErrors = errors[row.id] || {}
              return (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    <TextInput
                      variant="unstyled"
                      placeholder="Item description"
                      size="xs"
                      value={row.description}
                      error={rowErrors.description}
                      onChange={(event) =>
                        updateRow(row.id, 'description', event.currentTarget.value)
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      variant="unstyled"
                      size="xs"
                      inputMode="decimal"
                      placeholder="0"
                      value={row.qty}
                      error={rowErrors.qty}
                      onChange={(event) => updateRow(row.id, 'qty', event.currentTarget.value)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      variant="unstyled"
                      size="xs"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={row.unitPrice}
                      error={rowErrors.unitPrice}
                      onChange={(event) =>
                        updateRow(row.id, 'unitPrice', event.currentTarget.value)
                      }
                    />
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Text size="xs" c={rowErrors.lineTotal ? 'red' : undefined} fw={500}>
                      {lineTotals[index] ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      aria-label={`Remove row ${index + 1}`}
                      onClick={() => removeRow(row.id)}
                    >
                      <IconTrash size={15} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              )
            })}
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="xs" c="dimmed" ta="center" py="sm">
                    No items yet. Use “Add item” to start the invoice.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            <Table.Tr>
              <Table.Td colSpan={5} p={4}>
                <Group gap={6}>
                  <Button
                    variant="light"
                    size="compact-sm"
                    leftSection={<IconPlus size={14} />}
                    onClick={addRow}
                  >
                    Add item
                  </Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  )
}

export default LineItemsEditor
