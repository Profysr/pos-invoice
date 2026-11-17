import { useCallback, useMemo } from 'react'
import { useForm } from '@mantine/form'
import { Flex, ScrollArea } from '@mantine/core'
import InvoiceForm from '../invoice/InvoiceForm.jsx'
import LineItemsEditor from '../invoice/LineItemsEditor.jsx'
import ReceiptPreview from '../invoice/ReceiptPreview.jsx'
import {
  mockCompanyMetadata,
  mockPrinterSettings,
  mockDraftInvoice,
  mockLineTotalDisplay,
  mockReceiptLines
} from '../mockData.js'

// MOCK: draft values and receipt formatting move behind IPC once the persistence and receipt-formatter cards land. No business calculations are performed in this page — line totals and receiptLines are mock helpers from mockData.js standing in for the backend.
function NewInvoicePage() {
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: mockDraftInvoice,
    validate: {
      customerName: (value) => (value.trim().length > 0 ? null : 'Customer name is required'),
      invoiceNumber: (value) => (value.trim().length > 0 ? null : 'Invoice number is required')
    }
  })

  const rows = useMemo(() => form.values?.items ?? [], [form.values])

  const addRow = useCallback(() => {
    form.insertListItem('items', {
      id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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

  const handleSave = useCallback(
    (values) => {
      const validation = form.validate()
      if (validation.hasErrors) return
      // Backend integration point: window.invoiceApi.saveInvoice(values)
      console.log('[mock] save invoice', values)
    },
    [form]
  )

  const handlePrint = useCallback(() => {
    // Backend integration point: window.invoiceApi.printInvoice(values)
    console.log('[mock] print invoice', form.getValues())
  }, [form])

  // Line totals come from the mock display helper (props contract: a
  // backend-provided value keyed by row index).
  const lineTotals = useMemo(() => rows.map(mockLineTotalDisplay), [rows])

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

  const receiptLines = useMemo(
    () =>
      mockReceiptLines({
        values: form.getValues(),
        rows,
        lineTotals,
        company: mockCompanyMetadata
      }),
    [form, rows, lineTotals]
  )

  const paperWidth = mockPrinterSettings.paperWidth === '58mm' ? 58 : 80

  return (
    <Flex gap="sm" mih={0} style={{ height: '100%' }}>
      {/* Form column: ~57% width */}
      <Flex
        component="section"
        className="app-content-panel"
        p="md"
        mih={0}
        style={{ flex: '0 0 57%', minWidth: 0, alignSelf: 'stretch' }}
      >
        <InvoiceForm
          form={form}
          onSubmit={form.onSubmit(handleSave)}
          onPrint={handlePrint}
          lineItemsSlot={
            <LineItemsEditor
              rows={rows}
              lineTotals={lineTotals}
              errors={lineErrors}
              onChange={handleRowsChange}
              addRow={addRow}
            />
          }
        />
      </Flex>

      {/* Receipt preview column: ~43% width */}
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

export default NewInvoicePage
