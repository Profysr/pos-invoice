import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from '@mantine/form'
import { Alert, Button, Flex, Loader, ScrollArea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle } from '@tabler/icons-react'
import InvoiceForm from '../invoice/InvoiceForm.jsx'
import ReceiptPreview from '../invoice/ReceiptPreview.jsx'
import {
  normalizeShippingReceiptDraft,
  parseMoneyToMinorUnits,
  storedShippingReceiptToDraft
} from '../../../shared/invoice.js'
import { buildShippingReceiptLines } from '../../../shared/receipt.js'
import { DEFAULT_SHIPPING_SERVICE } from '../../../shared/shipping-services.js'

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function localDateParts(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
}

function createInitialValues(bootstrap) {
  const now = localDateParts()
  return {
    invoiceNumber: bootstrap?.invoiceNumber || '',
    date: now.date,
    time: now.time,
    trackingNumber: '',
    price: '',
    shippingFrom: '',
    expectedDeliveryDate: '',
    service: DEFAULT_SHIPPING_SERVICE,
    destination: '',
    weight: '',
    insuranceLabel: '',
    insuranceAmount: '',
    currency: bootstrap?.company?.defaultCurrency || 'USD'
  }
}

function safeMoney(value) {
  try {
    return parseMoneyToMinorUnits(value)
  } catch {
    return 0
  }
}

function NewInvoiceEditor({ bootstrap, editInvoice = null }) {
  const initialValues = editInvoice
    ? { ...createInitialValues(bootstrap), ...storedShippingReceiptToDraft(editInvoice) }
    : createInitialValues(bootstrap)

  const form = useForm({
    mode: 'uncontrolled',
    initialValues,
    validate: {
      date: (value) => (value.trim().length > 0 ? null : 'Date is required'),
      time: (value) => (value.trim().length > 0 ? null : 'Time is required'),
      trackingNumber: (value) => (value.trim().length > 0 ? null : 'Tracking number is required'),
      price: (value) => {
        if (value.trim().length === 0) return 'Price is required'
        try {
          parseMoneyToMinorUnits(value, 'Price')
          return null
        } catch (error) {
          return error instanceof Error ? error.message : 'Price is invalid'
        }
      },
      shippingFrom: (value) =>
        value.trim().length > 0 ? null : 'Shipping from is required'
    }
  })
  const [invoiceId, setInvoiceId] = useState(() => editInvoice?.id ?? createId())
  const [printing, setPrinting] = useState(false)

  const receipt = useMemo(() => {
    const values = form.values
    const price = safeMoney(values.price)
    const insurance = safeMoney(values.insuranceAmount)
    return {
      invoiceDate: values.date,
      invoiceTime: values.time,
      trackingNumber: values.trackingNumber,
      subtotal: price,
      insurance,
      total: price + insurance,
      shippingFrom: values.shippingFrom,
      shippingService: values.service,
      destinationAddress: values.destination,
      packageWeight: values.weight,
      expectedDeliveryDate: values.expectedDeliveryDate,
      insuranceLabel: values.insuranceLabel,
      currency: values.currency
    }
  }, [form.values])

  const receiptLines = useMemo(
    () =>
      buildShippingReceiptLines({
        receipt,
        company: bootstrap.company || {},
        printer: bootstrap.printer || { characterWidth: 48, paperWidthMm: 80 }
      }),
    [receipt, bootstrap]
  )

  const paperWidth = Number(bootstrap.printer?.paperWidthMm) || 80
  const characterWidth = Number(bootstrap.printer?.characterWidth) || 48

  const handlePrint = useCallback(async () => {
    const validation = form.validate()
    if (validation.hasErrors) {
      notifications.show({
        color: 'red',
        title: 'Check the receipt',
        message: 'Complete the required fields before printing.'
      })
      return
    }

    let payload
    try {
      payload = normalizeShippingReceiptDraft(form.getValues(), invoiceId)
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Receipt is not ready',
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
          title: 'Receipt saved and sent',
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
          title={editInvoice ? 'Edit receipt' : 'New receipt'}
          onPrint={handlePrint}
          printing={printing}
        />
      </Flex>

      <Flex
        component="section"
        mih={0}
        style={{ flex: '1 1 auto', minWidth: 0, alignSelf: 'stretch' }}
      >
        <ScrollArea style={{ width: '100%' }} offsetScrollbars="y">
          <ReceiptPreview
            receiptLines={receiptLines}
            paperWidth={paperWidth}
            characterWidth={characterWidth}
            logoDataUrl={bootstrap.company?.logoDataUrl || ''}
          />
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
        title="Could not load the receipt workspace"
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
