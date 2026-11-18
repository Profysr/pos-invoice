import { useEffect, useMemo, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Pagination,
  Paper,
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
  formatMoney,
  normalizeShippingReceiptDraft,
  storedShippingReceiptToDraft
} from '../../../shared/invoice.js'
import { buildShippingReceiptLines } from '../../../shared/receipt.js'
import ReceiptPreview from '../invoice/ReceiptPreview.jsx'
import './SavedInvoicesPage.css'

const ROWS_PER_PAGE_DEFAULT = 15

const printStatusBadge = {
  not_printed: { label: 'Not printed', color: 'gray' },
  queued: { label: 'Queued', color: 'blue' },
  printing: { label: 'Printing', color: 'blue' },
  succeeded: { label: 'Printed', color: 'green' },
  failed: { label: 'Failed', color: 'red' }
}

function message(error) {
  return error instanceof Error ? error.message : String(error)
}

function SavedInvoicesPage({ onEdit }) {
  const [invoices, setInvoices] = useState([])
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [working, setWorking] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    let active = true
    const request = window.invoiceApi
      ? window.invoiceApi.listInvoices()
      : Promise.reject(new Error('The application API is unavailable.'))

    request
      .then((rows) => {
        if (active) {
          setInvoices(rows)
          setLoadError('')
        }
      })
      .catch((loadFailure) => {
        if (active) setLoadError(message(loadFailure))
      })

    return () => {
      active = false
    }
  }, [reloadKey])

  const refresh = () => setReloadKey((value) => value + 1)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return invoices
    return invoices.filter(
      (invoice) =>
        invoice.invoiceNumber.toLowerCase().includes(query) ||
        (invoice.trackingNumber || '').toLowerCase().includes(query) ||
        (invoice.destinationAddress || '').toLowerCase().includes(query)
    )
  }, [invoices, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE_DEFAULT))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice(
    (safePage - 1) * ROWS_PER_PAGE_DEFAULT,
    safePage * ROWS_PER_PAGE_DEFAULT
  )

  const viewingReceipt = useMemo(() => {
    if (!viewing?.invoice) return []
    return buildShippingReceiptLines({
      receipt: viewing.invoice,
      company: viewing.company || {},
      printer: viewing.printer || {}
    })
  }, [viewing])

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
    const [invoice, company, printer] = await Promise.all([
      window.invoiceApi.getInvoice(row.id),
      window.invoiceApi.getCompany(),
      window.invoiceApi.getPrinter()
    ])
    setViewing({ invoice, company, printer })
  })

  const handleEdit = guard(async (row) => {
    const invoice = await window.invoiceApi.getInvoice(row.id)
    onEdit(invoice)
  })

  const handlePrint = guard(async (row) => {
    const invoice = await window.invoiceApi.getInvoice(row.id)
    const payload = normalizeShippingReceiptDraft(
      storedShippingReceiptToDraft(invoice),
      invoice.id
    )
    const result = await window.invoiceApi.printInvoice(payload)
    refresh()
    notifications.show({
      color: result.print.status === 'succeeded' ? 'green' : 'red',
      title: result.print.status === 'succeeded' ? 'Receipt printed' : 'Print failed',
      message: `${result.print.printerName}: ${result.print.message}`
    })
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
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value)
            setPage(1)
          }}
          leftSection={<IconSearch size={16} stroke={1.5} />}
          size="xs"
          className="saved-invoices-search"
        />
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {filtered.length} receipt{filtered.length === 1 ? '' : 's'}
        </Text>
      </Group>

      {pageRows.length === 0 ? (
        <Text size="sm" c="dimmed" py="lg" ta="center">
          {invoices.length === 0
            ? 'No receipts yet'
            : `No receipts match "${search.trim()}"`}
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
              {pageRows.map((invoice) => {
                const status = printStatusBadge[invoice.printStatus] ?? printStatusBadge.not_printed
                return (
                  <Table.Tr key={invoice.id}>
                    <Table.Td className="saved-invoices-number">{invoice.invoiceNumber}</Table.Td>
                    <Table.Td>{invoice.invoiceDate}</Table.Td>
                    <Table.Td>{invoice.trackingNumber}</Table.Td>
                    <Table.Td>{invoice.destinationAddress}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      {formatMoney(invoice.total, invoice.currency)}
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

          {totalPages > 1 && (
            <Group justify="flex-end" mt="sm">
              <Pagination
                total={totalPages}
                value={safePage}
                onChange={setPage}
                size="sm"
                siblings={0}
                boundaries={false}
              />
            </Group>
          )}
        </>
      )}

      <Modal
        opened={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.invoice?.invoiceNumber || 'Receipt'}
        size={440}
        centered
      >
        {viewing && (
          <ReceiptPreview
            receiptLines={viewingReceipt}
            paperWidth={Number(viewing.printer?.paperWidthMm) || 80}
            characterWidth={Number(viewing.printer?.characterWidth) || 48}
            logoDataUrl={viewing.company?.logoDataUrl || ''}
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
