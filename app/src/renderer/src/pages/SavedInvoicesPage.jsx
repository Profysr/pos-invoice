import { useEffect, useState } from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  CloseButton,
  Group,
  Modal,
  Pagination,
  Paper,
  Select,
  Table,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertCircle,
  IconEye,
  IconPencil,
  IconPrinter,
  IconSearch,
  IconTrash
} from '@tabler/icons-react'
import {
  formatPrice,
  makeReceiptData,
  normalizeShippingReceiptDraft,
  storedShippingReceiptToDraft
} from '../../../shared/invoice.js'
import ReceiptPreview from '../invoice/ReceiptPreview.jsx'
import './SavedInvoicesPage.css'

const ROWS_PER_PAGE_DEFAULT = 15
const PAGE_SIZE_OPTIONS = ['15', '30', '50', '100'].map((size) => ({
  value: size,
  label: `${size} / page`
}))

const printStatusBadge = {
  not_printed: { label: 'Not printed', color: 'gray' },
  queued: { label: 'Queued', color: 'blue' },
  printing: { label: 'Printing', color: 'blue' },
  succeeded: { label: 'Sent', color: 'green' },
  failed: { label: 'Failed', color: 'red' }
}

function message(error) {
  return error instanceof Error ? error.message : String(error)
}

function SavedInvoicesPage({ onEdit }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [settledKey, setSettledKey] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(ROWS_PER_PAGE_DEFAULT)
  const [working, setWorking] = useState(false)
  const [printingId, setPrintingId] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [debouncedSearch, , { flush }] = useDebouncedValue(search, 250)

  // Loading is derived from the request key so the effect never sets state synchronously.
  const requestKey = `${page}|${pageSize}|${debouncedSearch}|${reloadKey}`
  const loading = settledKey !== requestKey

  useEffect(() => {
    let active = true
    const request = window.invoiceApi
      ? window.invoiceApi.listInvoices({ page, pageSize, search: debouncedSearch })
      : Promise.reject(new Error('The application API is unavailable.'))

    request
      .then((result) => {
        if (!active) return
        setRows(result.rows)
        setTotal(result.total)
        setLoadError('')
        setSettledKey(requestKey)
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
        if (page > lastPage) {
          // The last page was deleted or filtered away; the next fetch owns the loading state.
          setPage(lastPage)
        }
      })
      .catch((loadFailure) => {
        if (!active) return
        setLoadError(message(loadFailure))
        setSettledKey(requestKey)
      })

    return () => {
      active = false
    }
  }, [page, pageSize, debouncedSearch, reloadKey, requestKey])

  const refresh = () => setReloadKey((value) => value + 1)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const guard = (action) => async (row) => {
    if (working) return
    setWorking(true)
    try {
      await action(row)
    } catch (error) {
      notifications.show({ color: 'red', title: 'Action failed', message: message(error) })
    } finally {
      setWorking(false)
    }
  }

  const handleView = guard(async (row) => {
    const [invoice, printer] = await Promise.all([
      window.invoiceApi.getInvoice(row.id),
      window.invoiceApi.getPrinter()
    ])
    setViewing({ invoice, printer })
  })

  const handleEdit = guard(async (row) => {
    const invoice = await window.invoiceApi.getInvoice(row.id)
    onEdit(invoice)
  })

  const handlePrint = guard(async (row) => {
    setPrintingId(row.id)
    try {
      const invoice = await window.invoiceApi.getInvoice(row.id)
      const payload = normalizeShippingReceiptDraft(
        storedShippingReceiptToDraft(invoice),
        invoice.id
      )
      const result = await window.invoiceApi.printInvoice(payload)
      refresh()
      notifications.show({
        color: result.print.status === 'succeeded' ? 'green' : 'red',
        title: result.print.status === 'succeeded' ? 'Receipt sent' : 'Print failed',
        message: `${result.print.printerName}: ${result.print.message}`
      })
    } finally {
      setPrintingId(null)
    }
  })

  const confirmDelete = guard(async () => {
    if (!deleting) return
    await window.invoiceApi.deleteInvoice(deleting.id)
    notifications.show({
      color: 'green',
      title: 'Receipt deleted',
      message: `${deleting.invoiceNumber} was removed.`
    })
    setDeleting(null)
    refresh()
  })

  if (loadError) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />} title="Could not load saved receipts">
        {loadError}
        <Button variant="light" size="xs" mt="sm" onClick={refresh}>
          Retry
        </Button>
      </Alert>
    )
  }

  return (
    <Paper withBorder p="md" radius="sm" className="saved-invoices-panel">
      <Group justify="space-between" gap="sm" mb="sm" wrap="nowrap">
        <TextInput
          placeholder="Search reference, tracking or destination"
          aria-label="Search receipts"
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value)
            setPage(1)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') flush()
          }}
          leftSection={<IconSearch size={16} stroke={1.5} />}
          rightSection={
            search ? (
              <CloseButton
                size="xs"
                variant="transparent"
                aria-label="Clear search"
                onClick={() => {
                  setSearch('')
                  setPage(1)
                }}
              />
            ) : undefined
          }
          rightSectionPointerEvents="all"
          loading={loading}
          loadingPosition="left"
          size="xs"
          className="saved-invoices-search"
        />
        <Group gap="xs" wrap="nowrap">
          <Select
            size="xs"
            aria-label="Receipts per page"
            data={PAGE_SIZE_OPTIONS}
            value={String(pageSize)}
            onChange={(value) => {
              setPageSize(Number(value) || ROWS_PER_PAGE_DEFAULT)
              setPage(1)
            }}
            allowDeselect={false}
            w={92}
          />
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {total} receipt{total === 1 ? '' : 's'}
          </Text>
        </Group>
      </Group>

      {rows.length === 0 ? (
        <Text size="sm" c="dimmed" py="lg" ta="center">
          {loading
            ? 'Loading receipts…'
            : search.trim()
              ? `No receipts match "${search.trim()}"`
              : 'No receipts yet'}
        </Text>
      ) : (
        <>
          <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Reference #</Table.Th>
                <Table.Th>Date</Table.Th>
                <Table.Th>Tracking #</Table.Th>
                <Table.Th>Destination</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Price</Table.Th>
                <Table.Th>Print status</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((invoice) => {
                const status = printStatusBadge[invoice.printStatus] ?? printStatusBadge.not_printed
                const destination = [
                  invoice.destinationCity,
                  [invoice.destinationState, invoice.destinationZip].filter(Boolean).join(' ')
                ]
                  .filter(Boolean)
                  .join(', ')
                return (
                  <Table.Tr key={invoice.id}>
                    <Table.Td className="saved-invoices-number">{invoice.invoiceNumber}</Table.Td>
                    <Table.Td>{invoice.invoiceDate}</Table.Td>
                    <Table.Td>{invoice.trackingNumber}</Table.Td>
                    <Table.Td>{destination}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      {formatPrice(invoice.total)}
                    </Table.Td>
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
                            aria-label={`Print ${invoice.invoiceNumber}`}
                            disabled={working}
                            loading={printingId === invoice.id}
                            onClick={() => handlePrint(invoice)}
                          >
                            <IconPrinter size={16} stroke={1.5} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="View" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label={`View ${invoice.invoiceNumber}`}
                            disabled={working}
                            onClick={() => handleView(invoice)}
                          >
                            <IconEye size={16} stroke={1.5} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Edit" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label={`Edit ${invoice.invoiceNumber}`}
                            disabled={working}
                            onClick={() => handleEdit(invoice)}
                          >
                            <IconPencil size={16} stroke={1.5} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            aria-label={`Delete ${invoice.invoiceNumber}`}
                            disabled={working}
                            onClick={() => setDeleting(invoice)}
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

          <Group justify="space-between" mt="sm" gap="sm">
            <Text size="xs" c="dimmed">
              Page {Math.min(page, totalPages)} of {totalPages}
            </Text>
            {totalPages > 1 && (
              <Pagination
                total={totalPages}
                value={Math.min(page, totalPages)}
                onChange={setPage}
                size="sm"
                siblings={1}
                boundaries={1}
                withEdges
              />
            )}
          </Group>
        </>
      )}

      <Modal
        opened={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.invoice?.invoiceNumber || 'Receipt'}
        size={720}
        centered
      >
        {viewing && (
          <ReceiptPreview
            receiptData={makeReceiptData(viewing.invoice)}
            printer={viewing.printer || {}}
          />
        )}
      </Modal>

      <Modal
        opened={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete receipt?"
        size="sm"
        centered
      >
        <Text size="sm">
          {deleting?.invoiceNumber} and its stored details will be permanently removed. This cannot
          be undone.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button color="red" loading={working} onClick={confirmDelete}>
            Delete
          </Button>
        </Group>
      </Modal>
    </Paper>
  )
}

export default SavedInvoicesPage
