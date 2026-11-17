import { useState } from 'react'
import { NavLink } from '@mantine/core'
import { IconFileInvoice, IconHistory, IconSettings } from '@tabler/icons-react'

const navItems = [
  { id: 'new-invoice', label: 'New Invoice', icon: IconFileInvoice },
  { id: 'history', label: 'Saved Invoices', icon: IconHistory },
  { id: 'settings', label: 'Settings', icon: IconSettings }
]

function AppSidebar({ activeView, onNavigate, onOpenSettings }) {
  const [hovered, setHovered] = useState(null)

  return (
    <aside className="app-sidebar">
      <nav className="app-sidebar-nav" aria-label="Main navigation">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = id !== 'settings' && activeView === id
          const isHighlighted = isActive || hovered === id
          return (
            <NavLink
              key={id}
              label={label}
              leftSection={<Icon size={17} stroke={1.6} />}
              active={isActive}
              onClick={() => {
                setHovered(null)
                if (id === 'settings') onOpenSettings()
                else onNavigate(id)
              }}
              onMouseEnter={() => setHovered(id)}
              onMouseLeave={() => setHovered(null)}
              style={(theme) => ({
                borderRadius: theme.radius.sm,
                color: isHighlighted ? theme.colors.accent[6] : theme.colors.dark[7],
                background: isActive ? theme.colors.accent[0] : undefined,
                fontWeight: isActive ? 600 : 400
              })}
              styles={{
                root: { padding: '7px 10px' },
                label: { fontSize: '0.85rem' }
              }}
            />
          )
        })}
      </nav>
    </aside>
  )
}

export default AppSidebar
