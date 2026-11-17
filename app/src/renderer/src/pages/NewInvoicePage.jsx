import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from '@mantine/form'
import { Alert, Button, Flex, Loader, ScrollArea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle } from '@tabler/icons-react'
import InvoiceForm from '../invoice/InvoiceForm.jsx'
import LineItemsEditor from '../invoice/LineItemsEditor.jsx'
import ReceiptPreview from '../invoice/ReceiptPreview.jsx'
import {
  calculateInvoiceTotals,
  calculateLineTotal,
  formatMoney,
  normalizeInvoiceDraft,
  parseMoneyToMinorUnits,
  parseQuantityToMilli,
  storedInvoiceToDraft
} from '../../../shared/invoice.js'
import { buildReceiptLines } from '../../../shared/receipt.js'

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function localDateParts(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return {
    invoiceDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    invoiceTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
}

function createInitialValues(bootstrap) {
  const now = localDateParts()
  return {
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    invoiceNumber: bootstrap?.invoiceNumber || '',
    invoiceDate: bootstrap?.invoiceDate || now.invoiceDate,
    invoiceTime: bootstrap?.invoiceTime || now.invoiceTime,
    currency: bootstrap?.company?.defaultCurrency || 'USD',
    insurance: '',
    shippingService: '',
    destinationAddress: '',
    packageWeight: '',
    expectedDeliveryDate: '',
    trackingNumber: '',
    notes: '',
    items: [{ id: createId(), description: '', qty: '', unitPrice: '' }]
  }
}

function safeMoney(value) {
  try {
    return parseMoneyToMinorUnits(value)
  } catch {
    return 0
  }
}

function safeQuantity(value) {
  try {
    return parseQuantityToMilli(value)
  } catch {
    return null
  }
}

function NewInvoiceEditor({ bootstrap, editInvoice = null }) {
  const initialValues = editInvoice?.items?.length
    ? { ...createInitialValues(bootstrap), ...storedInvoiceToDraft(editInvoice) }
    : createInitialValues(bootstrap)

  const form = useForm({
    mode: 'uncontrolled',
    initialValues,
    validate: {
      customerName: (value) => (value.trim().length > 0 ? null : 'Customer name is required'),
      invoiceNumber: (value) => (value.trim().length > 0 ? null : 'Invoice number is required'),
      invoiceDate: (value) => (value.trim().length > 0 ? null : 'Invoice date is required'),
      invoiceTime: (value) => (value.trim().length > 0 ? null : 'Invoice time is required'),
      currency: (value) => (/^[A-Za-z]{3}$/.test(value.trim()) ? null : 'Use a three-letter currency code')
    }
  })
  const [invoiceId, setInvoiceId] = useState(() => editInvoice?.id ?? createId())
  const [printing, setPrinting] = useState(false)

  const rows = useMemo(() => form.values.items ?? [], [form.values])
  const currency = form.values.currency || bootstrap.company?.defaultCurrency || 'USD'

  const addRow = useCallback(() => {
    form.insertListItem('items', {
      id: createId(),
      description: '',
      qty: '',
      unitPrice: ''
    })
  }, [form])

  const handleRowsChange = useCallback(
    (nextRows) => {
      form.setValues((current) => ({ ...current, items: nextRows }))
    },
    [form]
  )

  const normalizedRows = useMemo(
    () =>
      rows.map((row) => {
        const quantityMilli = safeQuantity(row.qty)
        if (quantityMilli == null) return null
        try {
          return {
            id: row.id,
            description: row.description.trim(),
            quantityMilli,
            unitPrice: parseMoneyToMinorUnits(row.unitPrice, 'Unit price')
          }
        } catch {
          return null
        }
      }),
    [rows]
  )

  const insuranceMinor = useMemo(() => safeMoney(form.values.insurance), [form.values.insurance])

  const totals = useMemo(() => {
    const validItems = normalizedRows.filter(Boolean)
    if (validItems.length === 0) return { items: [], subtotal: 0, insurance: insuranceMinor, total: insuranceMinor }
    return calculateInvoiceTotals(validItems, insuranceMinor)
  }, [normalizedRows, insuranceMinor])

  const lineTotals = useMemo(
    () =>
      rows.map((row, index) => {
        const item = normalizedRows[index]
        if (!item) return '—'
        return formatMoney(calculateLineTotal(item.quantityMilli, item.unitPrice), currency)
      }),
    [rows, normalizedRows, currency]
  )

  const lineErrors = useMemo(() => {
    const map = {}
    Object.entries(form.errors ?? {}).forEach(([path, message]) => {
      const match = path.match(/^items\.(\d+)\.(.+)$/)
      if (match) {
        const row = rows[Number(match[1])]
        if (row) map[row.id] = { ...(map[row.id] || {}), [match[2]]: message }
      }
    })
    return map
  }, [form.errors, rows])

  const receiptLines = useMemo(() => {
    const validItems = normalizedRows.filter(Boolean)
    const receiptItems =
      validItems.length > 0
        ? validItems
        : [{ description: 'No items yet', quantityMilli: 1000, unitPrice: 0 }]
    const receiptTotals = calculateInvoiceTotals(receiptItems, insuranceMinor)
    return buildReceiptLines({
      invoice: {
        ...form.values,
        items: receiptItems,
        insurance: insuranceMinor,
        subtotal: receiptTotals.subtotal,
        total: receiptTotals.total
      },
      company: bootstrap.company || {},
      printer: bootstrap.printer || { characterWidth: 48, paperWidthMm: 80 }
    })
  }, [form.values, normalizedRows, insuranceMinor, bootstrap])

  const paperWidth = Number(bootstrap.printer?.paperWidthMm) || 80

  const handlePrint = useCallback(async () => {
    const validation = form.validate()
    if (validation.hasErrors) {
      notifications.show({
        color: 'red',
        title: 'Check the invoice',
        message: 'Complete the required fields before printing.'
      })
      return
    }

    let payload
    try {
      payload = normalizeInvoiceDraft(form.getValues(), invoiceId)
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Invoice is not ready',
        message: error instanceof Error ? error.message : String(error)
      })
      return
    }

    setPrinting(true)
    try {
      const result = await window.invoiceApi.printInvoice(payload)
      if (result.invoice?.id) setInvoiceId(result.invoice.id)

      if (result.print.status === 'succeeded') {
        notifications.show({
          color: 'green',
          title: 'Invoice saved and sent',
          message: `${result.print.printerName}: ${result.print.message}`
        })
      } else {
        notifications.show({
          color: 'red',
          title: 'Print failed',
          message: result.print.message
        })
      }
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Print failed',
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setPrinting(false)
    }
  }, [form, invoiceId])

  const lineItemsSlot = (
    <LineItemsEditor
      rows={rows}
      lineTotals={lineTotals}
      errors={lineErrors}
      onChange={handleRowsChange}
      addRow={addRow}
    />
  )

  return (
    <Flex gap="sm" mih={0} style={{ height: '100%' }}>
      <Flex
        component="section"
        className="app-content-panel"
        p="md"
        mih={0}
        style={{ flex: '0 0 57%', minWidth: 0, alignSelf: 'stretch' }}
      >
        <InvoiceForm
          form={form}
          title={editInvoice ? 'Edit invoice' : 'New invoice'}
          onPrint={handlePrint}
          printing={printing}
          lineItemsSlot={lineItemsSlot}
          totals={totals}
          currency={currency}
        />
      </Flex>

      <Flex
        component="section"
        mih={0}
        style={{ flex: '1 1 auto', minWidth: 0, alignSelf: 'stretch' }}
      >
        <ScrollArea style={{ width: '100%' }} offsetScrollbars="y">
          <ReceiptPreview receiptLines={receiptLines} paperWidth={paperWidth} />
        </ScrollArea>
      </Flex>
    </Flex>
  )
}

function NewInvoicePage({ editInvoice = null }) {
  const [bootstrap, setBootstrap] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    // Reject through a promise so no state is set synchronously inside the effect.
    const request = window.invoiceApi?.getBootstrap
      ? window.invoiceApi.getBootstrap()
      : Promise.reject(new Error('The application API is unavailable.'))

    request
      .then((data) => {
        if (active) setBootstrap(data)
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError))
      })

    return () => {
      active = false
    }
  }, [attempt])

  if (error) {
    return (
      <Alert
        color="red"
        icon={<IconAlertCircle size={16} />}
        title="Could not load the invoice workspace"
      >
        {error}
        <Button
          variant="light"
          size="xs"
          mt="sm"
          onClick={() => {
            setError('')
            setAttempt((value) => value + 1)
          }}
        >
          Retry
        </Button>
      </Alert>
    )
  }

  if (!bootstrap) {
    return (
      <Flex justify="center" align="center" mih={300}>
        <Loader size="sm" />
      </Flex>
    )
  }

  return (
    <NewInvoiceEditor
      key={`${bootstrap.invoiceNumber}-${attempt}-${editInvoice?.id ?? 'new'}`}
      bootstrap={bootstrap}
      editInvoice={editInvoice}
    />
  )
}

export default NewInvoicePage
