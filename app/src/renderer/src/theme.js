// Single source of truth for all Mantine design tokens.
// Do not introduce a second styling system — reference these tokens everywhere.
import { createTheme } from '@mantine/core'

export const tokens = {
  accent: '#2563eb',
  accentHover: '#1d4ed8',
  text: '#1f2937',
  textDimmed: '#6b7280',
  background: '#f8f9fa',
  panel: '#ffffff',
  border: '#e5e7eb',
  danger: '#c92a2a',
  success: '#2b8a3e',
  radius: 5
}

const theme = createTheme({
  defaultRadius: tokens.radius,
  primaryColor: 'accent',
  primaryShade: 6,
  colors: {
    accent: [
      '#eff6ff',
      '#dbeafe',
      '#bfdbfe',
      '#93c5fd',
      '#60a5fa',
      '#3b82f6',
      tokens.accent,
      tokens.accentHover,
      '#1e40af',
      '#1e3a8a'
    ]
  },
  white: tokens.panel,
  black: tokens.text,
  fontFamily: "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  headings: {
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '1.25rem' },
      h2: { fontSize: '1.05rem' },
      h3: { fontSize: '0.95rem' },
      h4: { fontSize: '0.875rem' }
    }
  },
  spacing: {
    xs: '6px',
    sm: '10px',
    md: '14px',
    lg: '20px',
    xl: '28px'
  },
  components: {
    Button: { defaultProps: { size: 'sm' } },
    TextInput: { defaultProps: { size: 'sm' } },
    NumberInput: { defaultProps: { size: 'sm' } },
    PasswordInput: { defaultProps: { size: 'sm' } },
    Select: { defaultProps: { size: 'sm' } },
    Textarea: { defaultProps: { size: 'sm' } },
    Checkbox: { defaultProps: { size: 'sm' } },
    Switch: { defaultProps: { size: 'sm' } },
    SegmentedControl: { defaultProps: { size: 'sm' } },
    ActionIcon: { defaultProps: { size: 'sm' } },
    Modal: {
      defaultProps: { size: 560, centered: true, overlayProps: { opacity: 0.45 } }
    },
    Table: { defaultProps: { highlightOnHover: false, verticalSpacing: 'xs' } },
    Paper: { defaultProps: { radius: tokens.radius } }
  }
})

export default theme
