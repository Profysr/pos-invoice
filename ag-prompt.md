Copy this prompt for the deployed agent:
Build the frontend UI components for the Invoice Generator desktop application.

Repository:
/home/ubuntu/.hermes/shared-memory/workspace/projects/pos-invoice

Before coding:
1. Read PLAN.md, especially the application scope and Phase 3.
2. Inspect the existing renderer files and package.json.
3. Use the existing design registry/component library already available in the workspace. Do not install another UI framework or dependency. Mantine and Tabler Icons are already installed; use registry components where available.
4. If the design registry is missing or unclear, ask me before implementing instead of guessing.

Implement the frontend UI only. Follow the existing scope and architecture.

## Design Direction

Build a professional, minimal, compact Windows desktop business application.
The design must feel practical, organized and polished.

**Visual requirements:**

- Use plain, solid colors.
- White panels on a light neutral background.
- Dark charcoal text.
- Subtle grey borders.
- One restrained accent color for primary actions.
- Red for destructive actions and green for successful statuses.
- Consistent typography, spacing and alignment.
- Compact buttons, inputs, tables and modals.
- Subtle corner rounding.

**Strictly avoid:**

- Gradients.
- Glassmorphism.
- Excessive shadows.
- Decorative backgrounds.
- Oversized headings.
- Excessive whitespace.
- Unnecessary animations.
- Colorful dashboard cards.
- Inconsistent component styling.

Use existing design registry theme tokens and typography. Prefer existing components over creating new ones.

## Layout

- Fixed sidebar approximately 220–240px wide with 3 navs: New Invoice, History and Settings (Clicking setting button will open up a modal)
- Compact top toolbar.
- Organized main workspace.
- White content panels with subtle borders.
- Natural scrolling when content exceeds available screen height.
- Optimize for typical Windows desktop screens.

## New Invoice

Use a two-column workspace:

- Invoice form: approximately 55–60%.
- Receipt preview: approximately 40–45%.

Organize the form into clearly separated sections.
Use compact labels and controls. Avoid unnecessary card nesting.
The line-items editor should resemble a professional spreadsheet-style table.

## Receipt Preview

Treat the receipt as a physical thermal-paper preview.

- White paper.
- Monospace typography.
- Realistic 58mm/80mm proportions.
- Subtle shadow.
- Proper alignment and separators.
- Center the paper in its preview area.

Keep it visually independent from ordinary application panels.
Consume canonical receiptLines through props. Do not implement a second receipt-rendering or ESC/POS engine.

## Saved Invoices

Use a clean, compact table.&#x20;
Include search, invoice information, print status and row actions.
Provide a useful empty state without unnecessary illustrations.&#x20;
Make sure to add paginations in the table.

## Modals

Use consistent modal styling, widths, spacing and action placement. We need a single modal with side-navs in the modal with company meta and printer settings.
Keep Company Metadata and Printer Settings organized into logical sections.

## Implementation Constraints

- React state and @mantine/form only.
- Use existing dependencies.
- Do not install additional packages.
- Use Tabler icons.
- Do not modify Electron main, preload, IPC, SQLite, printing or persistence logic.
- Expose appropriate props and callbacks for backend integration.
- Do not implement business calculations.
- Receive calculated totals and canonical receipt data through props.
- Use native date and time inputs.

## Before Implementation

1. Inspect the existing project structure.
2. Inspect the design registry and available theme tokens.
3. Identify existing reusable components.
4. Follow the established component conventions.
5. Implement the UI without duplicating existing functionality.

## Quality Requirements

The final result should look like a professionally designed invoicing application, not a generic AI-generated dashboard.

Prioritize clarity, compactness, consistency and usability over visual decoration.
Verify all screens, modals, forms, navigation states and callback interactions before reporting completion.
Do not modify anything outside the frontend scope.

Suggested component locations:
- src/renderer/src/layout/AppSidebar.jsx
- src/renderer/src/layout/AppToolbar.jsx
- src/renderer/src/invoice/InvoiceForm.jsx
- src/renderer/src/invoice/LineItemsEditor.jsx
- src/renderer/src/invoice/ReceiptPreview.jsx
- src/renderer/src/settings/CompanyMetadataModal.jsx
- src/renderer/src/settings/PrinterSettingsModal.jsx
- src/renderer/src/pages/NewInvoicePage.jsx
- src/renderer/src/pages/SavedInvoicesPage.jsx

Mock data is acceptable for demonstrating interactions, but keep it clearly separated so the backend agent can replace it with real IPC data.

Validation:
Don't install packages. Keep the machine resources in mind, you can just verify and review your changes, but could not install bundle packages.

Report the files changed, checks run, and any assumption that requires clarification.
Skipped: backend integration and actual persistence. Risk: the eventual receipt-preview contract must use the shared canonical receipt model rather than duplicating formatting logic.