import { useMemo, useState } from 'react'
import {
  ActionIcon,
  Badge,
  Group,
  Pagination,
  Paper,
  Table,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core'
import { IconEye, IconPrinter, IconSearch, IconTrash } from '@tabler/icons-react'
import { mockInvoices } from '../mockData'
import './SavedInvoicesPage.css'

const ROWS_PER_PAGE_DEFAULT = 10

const printStatusBadge = {
  printed: { label: 'Printed', color: 'gray' },
  'not-printed': { label: 'Not printed', color: 'dark' },
  pending: { label: 'Pending', color: 'gray' }
}

const formatTotal = (total) =>
  new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(total)

// Mock defaults: replaced by real IPC callbacks from App/backend wiring.
const noop = () => {}

function SavedInvoicesPage({
  invoices = mockInvoices,
  onSearch = noop,
  onPrint = noop,
  onView = noop,
  onDelete = noop,
  page: pageProp,
  rowsPerPage: rowsPerPageProp = ROWS_PER_PAGE_DEFAULT
}) {
  // shortcut: page state lives here, backend agent moves it server/IPC side
  const [pageState, setPageState] = useState(1)
  const page = pageProp ?? pageState
  const rowsPerPage = rowsPerPageProp

  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter(
      (inv) => inv.number.toLowerCase().includes(q) || inv.customer.toLowerCase().includes(q)
    )
  }, [invoices, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage)

  const handleSearchChange = (event) => {
    const value = event.currentTarget.value
    setSearch(value)
    onSearch(value)
    setPageState(1)
  }

  const handlePageChange = (next) => {
    if (pageProp === undefined) setPageState(next)
  }

  return (
    <Paper withBorder p="md" radius="sm" className="saved-invoices-panel">
      <Group justify="space-between" gap="sm" mb="sm" wrap="nowrap">
        <TextInput
          placeholder="Search invoice # or customer"
          value={search}
          onChange={handleSearchChange}
          leftSection={<IconSearch size={16} stroke={1.5} />}
          size="xs"
          className="saved-invoices-search"
        />
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {filtered.length} invoice{filtered.length === 1 ? '' : 's'}
        </Text>
      </Group>

      {pageRows.length === 0 ? (
        <Text size="sm" c="dimmed" py="lg" ta="center">
          {invoices.length === 0 ? 'No invoices yet' : `No invoices match "${search.trim()}"`}
        </Text>
      ) : (
        <>
          <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Invoice #</Table.Th>
                <Table.Th>Date</Table.Th>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Items</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Total</Table.Th>
                <Table.Th>Print status</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pageRows.map((inv) => {
                const status = printStatusBadge[inv.printStatus] ?? printStatusBadge.pending
                return (
                  <Table.Tr key={inv.id}>
                    <Table.Td className="saved-invoices-number">{inv.number}</Table.Td>
                    <Table.Td>{inv.date}</Table.Td>
                    <Table.Td>{inv.customer}</Table.Td>
                    <Table.Td>{inv.itemCount ?? '—'}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{formatTotal(inv.total)}</Table.Td>
                    <Table.Td>
                      <Badge color={status.color} variant="light" size="sm">
                        {status.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <Tooltip label="Print" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label={`Print ${inv.number}`}
                            onClick={() => onPrint(inv)}
                          >
                            <IconPrinter size={16} stroke={1.5} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="View" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label={`View ${inv.number}`}
                            onClick={() => onView(inv)}
                          >
                            <IconEye size={16} stroke={1.5} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label={`Delete ${inv.number}`}
                            onClick={() => onDelete(inv)}
                          >
                            <IconTrash size={16} stroke={1.5} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>

          {totalPages > 1 && (
            <Group justify="flex-end" mt="sm">
              <Pagination
                total={totalPages}
                value={safePage}
                onChange={handlePageChange}
                size="sm"
                siblings={0}
                boundaries={false}
              />
            </Group>
          )}
        </>
      )}
    </Paper>
  )
}

export default SavedInvoicesPage
