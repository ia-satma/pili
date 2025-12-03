# PMO Continuous Improvement Dashboard - Design Guidelines

## Design Approach: Data-First Enterprise System

**Selected Framework**: Fluent Design System principles adapted for data-heavy productivity applications  
**Visual References**: Linear (modern data management), Notion (information hierarchy), Asana (project clarity)

**Core Design Philosophy**: Precision over decoration. Every visual element serves data comprehension, traceability, and user efficiency. No ambiguity, no inference—visual clarity reflects the platform's deterministic nature.

---

## Typography System

**Font Stack**: Inter (via Google Fonts CDN)
- **Display/Headers**: 600 weight, tracking -0.02em
- **Body/Data**: 400 weight for readability in dense tables
- **Monospace Numbers**: Tabular figures for data alignment in grids/charts
- **Labels/Meta**: 500 weight, 14px, uppercase for section headers

**Hierarchy**:
- Page Titles: 32px/600
- Section Headers: 24px/600  
- Subsections: 18px/600
- Body/Data: 15px/400
- Captions/Meta: 13px/500

---

## Layout System

**Spacing Scale**: Tailwind units of **2, 4, 6, 8, 12, 16** for consistent rhythm
- Component padding: `p-4` to `p-6`
- Section margins: `my-8` to `my-12`
- Card spacing: `gap-6` for grids
- Dense data areas: `p-2` for table cells

**Grid Structure**:
- Main dashboard: 12-column responsive grid
- Card layouts: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` for KPI cards
- Data tables: Full-width with horizontal scroll on mobile
- Sidebar navigation: Fixed 240px width on desktop, collapsible on mobile

**Container Widths**:
- Main content: `max-w-7xl mx-auto px-6`
- Data grids: Full viewport width minus sidebar
- Modals/Detail views: `max-w-4xl`

---

## Component Library

### Navigation & Layout
- **Top Bar**: Fixed, 64px height, contains PMO logo, global search, user profile, notifications
- **Sidebar**: 240px, collapsible, hierarchical navigation (Dashboard, Projects Grid, Indicators, History, Settings)
- **Breadcrumbs**: Show hierarchy (Dashboard > Project Detail > Version X)

### Data Display Components
- **Excel-Style Data Grid**: 
  - Sticky headers, frozen columns
  - Row height: 40px minimum
  - Cell padding: `px-3 py-2`
  - Zebra striping for row distinction
  - Inline edit mode with validation indicators
  - Column resize handles
  - Filter dropdowns in headers

- **KPI Cards**: 
  - Structured: Title, Large number value, Change indicator (+/-), Sparkline chart
  - Dimensions: Min 200px height, `p-6` padding
  - Hover: Subtle elevation lift

- **Traffic Light Indicators**:
  - Circle badges (12px diameter) with status
  - Always paired with text label (never standalone)
  - Placement: Left of project name in grid

- **Charts** (Recharts):
  - Bar charts for project counts by department
  - Line charts for timeline trends
  - Pie/donut for status distribution
  - Consistent axis labels, grid lines, tooltips

### Interactive Components
- **Project Detail Panel**: Slide-over drawer (480px width) from right
  - Sticky header with project name and close button
  - Tabbed sections: Overview, S/N Timeline, Milestones, History
  - Timeline: Vertical connector lines, date stamps left-aligned

- **Excel Upload Component**:
  - Drag-and-drop zone (border-dashed, `min-h-48`)
  - File validation feedback (immediate, deterministic)
  - Version comparison preview before commit

- **Version Comparison View**:
  - Side-by-side diff layout
  - Added rows: Green left border
  - Modified cells: Yellow highlight with change tooltip
  - Deleted rows: Red strikethrough

- **Chat Interface (PMO Bot)**:
  - Fixed bottom-right position (can expand to `max-w-md`)
  - Message bubbles: User (right-aligned), Bot (left-aligned)
  - Source citations below bot responses in small monospace text
  - "No data found" responses clearly distinguished
  - Input field with explicit "Ask PMO Bot" placeholder

### Forms & Inputs
- **Text Inputs**: 40px height, `px-3` padding, clear focus states
- **Dropdowns**: Match data grid aesthetic, searchable for long lists
- **Date Pickers**: Calendar popover, TBD checkbox clearly labeled
- **Validation**: Inline error messages (red text + icon), success checkmarks

### Overlays
- **Modal Dialogs**: Centered, `max-w-2xl`, backdrop blur
- **Confirmation Prompts**: Small modals for destructive actions (delete, overwrite)
- **Toast Notifications**: Top-right stack, 4s auto-dismiss, action buttons for critical alerts

---

## Specialized Layouts

### Dashboard View
- **Top Row**: 4 KPI cards (`grid-cols-4`, responsive to `grid-cols-2` on tablet, `grid-cols-1` on mobile)
- **Middle Section**: 2-column layout (60/40 split) - Main chart left, status breakdown right
- **Bottom Section**: Recent updates table (5 most recent)

### Projects Grid View
- Full-screen data table
- Filter bar above grid: Department, Status, Date range dropdowns side-by-side
- Pagination footer: Rows per page selector + page numbers

### Indicators Tab
- Faithful Excel replication
- Multiple chart sections stacked vertically with `mb-12` spacing
- Each chart section: Title + Description + Visualization
- Export to PDF/Excel button top-right

### Project Detail View (Slide-over)
- Header: Project name (20px/600) + Traffic light status
- Metadata grid: 2-column key-value pairs (`grid-cols-2`, `gap-4`)
- S/N Timeline: Chronological cards with connector lines
- History tab: Audit log table with timestamp, user, action, old/new values

---

## Animations

**Minimal, purposeful only**:
- Sidebar collapse/expand: 200ms ease
- Modal open: 150ms fade + slight scale
- Toast notifications: Slide in from top-right
- Data loading: Subtle skeleton screens (no spinners)
- NO hover animations on data cells, NO page transitions

---

## Accessibility & Quality Standards

- WCAG 2.1 AA compliance for contrast
- Keyboard navigation throughout (Tab, Arrow keys in grid)
- Screen reader labels for all icons and status indicators
- Focus indicators visible on all interactive elements
- Consistent form field states across application

---

## Images

**No hero images required** - this is a data-first enterprise tool, not marketing.

**Icon Usage**: Material Icons via CDN for consistency
- Navigation icons: 24px
- Status indicators: 20px  
- Action buttons: 18px
- Inline icons (in text): 16px

---

## Platform-Specific Notes

This is a **web application**, not a landing page. Design emphasizes:
- Dense information architecture
- Multi-panel layouts (grid + detail view)
- Persistent navigation and context
- Professional, trust-building aesthetic through clarity and precision
- Zero visual ambiguity to match zero data hallucination mandate