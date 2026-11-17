// Single source of truth for all Mantine design tokens.
// Do not introduce a second styling system — reference these tokens everywhere.
import { createTheme } from '@mantine/core'

// Declarative design tokens (shared design direction: plain solid colors,
// white panels, light neutral background, charcoal text, subtle grey borders,
// one restrained accent for primary actions, compact controls, 5px radius).
export const tokens = {
  accent: '#2563eb',
  accentHover: '#1d4ed8',
  text: '#1f2937',
  textDimmed: '#6b7280',
  background: '#f4f5f7',
  panel: '#ffffff',
  border: '#e5e7eb',
  radius: 5
}

const theme = createTheme({
  defaultRadius: tokens.radius,
  primaryColor: 'accent',
  primaryShade: 6,
  colors: {
    accent: [
      '#eff4ff',
      '#dde7fe',
      '#c2d3fd',
      '#9bb9fb',
      '#6f97f8',
      '#527ef5',
      tokens.accent,
      '#2563eb',
      '#1d4ed8',
      '#1e3fae'
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
    SegmentedControl: { defaultProps: { size: 'sm' } },
    ActionIcon: { defaultProps: { size: 'sm' } },
    Modal: {
      defaultProps: { size: 560, centered: true, overlayProps: { opacity: 0.4 } }
    },
    Table: { defaultProps: { highlightOnHover: false, verticalSpacing: 'xs' } },
    Paper: { defaultProps: { radius: tokens.radius } }
  }
})

export default theme
