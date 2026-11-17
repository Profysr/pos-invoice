import { useState } from 'react'
import { Modal } from '@mantine/core'
import CompanyMetadataSection from './CompanyMetadataSection'
import PrinterSettingsSection from './PrinterSettingsSection'
import { mockCompanyMetadata, mockPrinterSettings } from '../mockData'

function SettingsModal({ opened, onClose }) {
  const [section, setSection] = useState('company')

  const sections = [
    { id: 'company', label: 'Company Metadata' },
    { id: 'printer', label: 'Printer Settings' }
  ]

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Settings"
      size={640}
      centered
      withCloseButton
      classNames={{ body: 'settings-modal-body' }}
    >
      <div className="settings-modal-layout">
        <nav className="settings-side-nav" aria-label="Settings sections">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={
                section === id
                  ? 'settings-side-nav-item settings-side-nav-item-active'
                  : 'settings-side-nav-item'
              }
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-section-area">
          {section === 'company' ? (
            <CompanyMetadataSection initialData={mockCompanyMetadata} />
          ) : (
            <PrinterSettingsSection initialData={mockPrinterSettings} />
          )}
        </div>
      </div>
    </Modal>
  )
}

export default SettingsModal
