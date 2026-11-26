import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from '@mantine/form'
import { Alert, Button, Flex, Loader, ScrollArea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle } from '@tabler/icons-react'
import InvoiceForm from '../invoice/InvoiceForm.jsx'
import ReceiptPreview from '../invoice/ReceiptPreview.jsx'
import {
  makeReceiptData,
  normalizeShippingReceiptDraft,
  parseMoneyToMinorUnits,
  storedShippingReceiptToDraft
} from '../../../shared/invoice.js'

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
    senderName: '',
    senderStreet: '',
    senderCity: '',
    senderState: '',
    senderZip: '',
    senderContact: '',
    senderContactArea: '',
    senderContactPrefix: '',
    senderContactLine: '',
    expectedDeliveryDate: now.date,
    service: 'Prepaid Mail',
    destCity: '',
    destState: '',
    destZip: '',
    weightLb: '',
    weightOz: ''
  }
}

// function safeMoney(value) {
//   try {
//     return parseMoneyToMinorUnits(value)
//   } catch {
//     return 0
//   }
// }

function requiredValue(label) {
  return (value) => (String(value ?? '').trim() ? null : `${label} is required`)
}

function NewInvoiceEditor({ bootstrap, editInvoice = null }) {
  const initialValues = editInvoice
    ? { ...createInitialValues(bootstrap), ...storedShippingReceiptToDraft(editInvoice) }
    : createInitialValues(bootstrap)

  const form = useForm({
    mode: 'controlled',
    initialValues,
    validate: {
      date: requiredValue('Date'),
      time: requiredValue('Time'),
      trackingNumber: (value) => {
        const text = value.trim()
        if (!text) return 'Tracking number is required'
        if (!/^[A-Za-z0-9]+$/.test(text)) {
          return 'Tracking number may only contain letters and digits'
        }
        return null
      },
      price: (value) => {
        if (value.trim().length === 0) return 'Price is required'
        try {
          parseMoneyToMinorUnits(value, 'Price')
          return null
        } catch (error) {
          return error instanceof Error ? error.message : 'Price is invalid'
        }
      },
      service: requiredValue('Service'),
      senderName: requiredValue('Sender name'),
      senderStreet: requiredValue('Sender street'),
      senderCity: requiredValue('Sender city'),
      senderState: requiredValue('Sender state'),
      senderZip: requiredValue('Sender ZIP'),
      destCity: requiredValue('Destination city'),
      destState: requiredValue('Destination state'),
      destZip: requiredValue('Destination ZIP')
    }
  })

  const [invoiceId, setInvoiceId] = useState(() => editInvoice?.id ?? createId())
  const [printing, setPrinting] = useState(false)

  const receiptData = useMemo(() => makeReceiptData(form.values), [form.values])

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
          title: 'Receipt saved; print job sent',
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
            receiptData={receiptData}
            printer={bootstrap?.printer || { characterWidth: 48, paperWidthMm: 80 }}
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
