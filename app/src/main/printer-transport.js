import { NetTransport } from 'retail-print-kit/net'
import { UsbTransport } from 'retail-print-kit/usb'

/**
 * Build the transport for a printer profile.
 *
 *   connectionType === 'network' → NetTransport (LAN, JetDirect port 9100)
 *   connectionType === 'usb'     → UsbTransport (selected by vendor/product ID)
 *
 * USB vendor/product IDs come from the profile; nothing is hardcoded here.
 */
export function createPrinterTransport(printerProfile) {
  const { connectionType } = printerProfile
  if (connectionType === 'network') {
    return new NetTransport(printerProfile.networkHost, {
      port: Number(printerProfile.networkPort) || 9100,
      timeout: Number(printerProfile.timeoutMs) || 5000
    })
  }
  if (connectionType === 'usb') {
    return new UsbTransport({
      vendorId: printerProfile.usbVendorId,
      productId: printerProfile.usbProductId,
      timeout: Number(printerProfile.timeoutMs) || 5000
    })
  }
  throw new Error(`Unsupported printer connection type: ${connectionType}`)
}

/**
 * List attached USB printer-class devices as [{ vendorId, productId }].
 */
export async function listUsbPrinters() {
  return UsbTransport.list()
}

/**
 * Send ESC/POS bytes over a transport using the shared open → write → close
 * lifecycle. `close()` runs on success and on every failure so the socket or
 * USB interface is always released. The original open/write error is preserved
 * over any close error.
 */
export async function sendBytes(transport, bytes) {
  try {
    await transport.open()
    await transport.write(bytes)
  } finally {
    await transport.close()
  }
  return {
    ok: true,
    bytes: bytes.length,
    message: 'Data sent to printer. Physical output is not guaranteed.'
  }
}
