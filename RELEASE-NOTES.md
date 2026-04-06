# Release Notes — Subscription & Organization Management System
## Version 1.0.0 | April 2026

---

## What Is This?

A centralized platform for your **Success & Account team** to manage client organizations, track subscriptions, monitor payments, and get automated email alerts before subscriptions expire.

**Live URL:** https://mjainik.github.io/subscription-management-system/

---

## Getting Started

### First-Time Setup (2 minutes)
1. Open the app URL
2. Enter your **Name** and **GitHub Personal Access Token**
   - Token needs `repo` and `project` scopes
   - [Create token here](https://github.com/settings/tokens/new?scopes=repo,project&description=Subscription+Manager)
3. Click **Save** — you're ready to go

### Email Alerts Setup (Admin — one time)
1. Go to [Repository Secrets](https://github.com/mjainik/subscription-management-system/settings/secrets/actions)
2. Add: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `ALERT_RECIPIENTS`
3. Alerts run automatically every day at 8:00 AM UTC

---

## Features

### 1. Dashboard
Your command center — everything your team needs at a glance.

**Organization Overview**
- Total, Active, Expiring Soon, Expired counts
- **Hover on any card** to see the list of organizations in that category
- Click any org name to jump to its detail page

**Revenue Overview**
- Contract Value (total across all orgs)
- Collected (total payments received)
- Remaining (pending amount)
- Overdue (past-due payments)
- At Risk (revenue from expiring subscriptions)

**Collection Progress**
- Visual progress bar showing overall collection percentage

**Charts & Tables**
- Revenue by Organization Type (Contractor, PMC, Owner, etc.)
- Revenue by Subscription Type (Annual, Monthly, Quarterly)
- Expiry Timeline — next 6 months at a glance
- Account Manager Workload — orgs, revenue, and renewals per manager
- Renewals Due This Month — with contract value and payment status
- Overdue Payments — who hasn't paid and how much
- Top Accounts by Value — your highest-value clients
- Recent Activity — latest changes across all organizations

**Export:** Download the entire dashboard as a PDF report.

---

### 2. Create Organization
Two ways to add a new client:

**Option A: Upload Invoice/Contract**
- Upload a PDF → system auto-extracts org name, email, dates, amount
- Extracted data fills the form automatically
- Review and correct before saving

**Option B: Manual Entry**
- Fill the form directly with all details

**Fields captured:**
- Organization Name, Contact Email, Phone (with country code), Address
- Contact Person, Designation
- Organization Type (Contractor / PMC / Owner / Developer / Design & Build)
- Account Manager
- Secondary Contact (name, email, phone)
- GST/Tax ID, Deal Source, Number of Licenses
- Subscription Type (Annual / Monthly / Quarterly), Plan Name
- Start Date, Expiry Date, Billing Date, Payment Cycle
- Amount, Currency
- Contract Value, Payment Schedule (One-time / Installments)
- Priority (Urgent / High / Normal / Low)
- Alert Settings (enabled, days before, recipients)
- Notes

**Smart Features:**
- Select subscription type → expiry date auto-calculates
- Select installments → payment schedule auto-generates
- Date fields show DD-MMM-YYYY format with calendar picker
- Phone fields include country code selector (25 countries)

---

### 3. Organization Listing
Searchable, filterable, sortable table of all organizations.

**Columns:** Name, Type, Expiry Date, Days Left, Status, Contract Value, Payment Status, Manager

**Filters:**
- Status (Active / Expiring Soon / Expired / Renewal In Progress)
- Subscription Type (Annual / Monthly / Quarterly)
- Payment Status (Fully Paid / Partially Paid / Overdue / Due)
- Expiry Window (30 / 60 / 90 days)

**Actions:**
- Search by organization name
- Sort by any column (click header)
- Click any row to open detail page
- Export CSV or PDF of current filtered view

---

### 4. Organization Detail
Complete view of a single organization with all actions available in-page.

**View Mode:**
- Organization details, contacts, subscription info
- Payment Summary (Contract Value, Paid, Remaining, Progress Bar)
- Payment History table with status badges
- Alert Settings
- Documents section
- Audit Log (who changed what, when)

**In-Page Actions (no redirects to GitHub):**
- **Edit** — full edit form opens in-page with all fields pre-filled, save updates everything
- **Add Subscription** — inline form to add another subscription
- **Add Payment** — record a payment with date, amount, method, receipt number
- **Upload Document** — attach files to the organization
- **Change Status** — quick buttons for Renewal In Progress, Active
- **Delete** — soft-delete (closes the GitHub issue)
- **Export PDF** — download one-page organization summary with payment details

---

### 5. Bulk Upload
Import multiple organizations at once via CSV.

- Download CSV template with all required columns
- Upload CSV → preview table shows parsed data with validation
- Click "Create All" → progress bar shows creation status
- Error report for any failed rows
- Maximum 100 organizations per upload

---

### 6. Settings
- Update your name and GitHub token
- View repository configuration
- Link to configure email alert secrets on GitHub

---

### 7. Email Alerts (Automatic)
Runs daily at 8:00 AM UTC via GitHub Actions.

- Checks all organizations for expiring subscriptions
- Sends a single email to your team with all expiring orgs
- Alert thresholds: 90, 60, 30, 7, and 0 days before expiry
- Each alert sent **exactly once** per threshold (no duplicates)
- Adds audit comment to the issue after sending
- Email includes: org name, expiry date, days left, amount, direct links

---

### 8. Status Auto-Update (Automatic)
Runs daily alongside email alerts.

- Automatically updates status labels based on expiry dates
- Active (>90 days) → Expiring Soon (1-90 days) → Expired (0 or less)
- Skips organizations marked "Renewal In Progress"
- Adds audit comment when status changes

---

## Payment Tracking

Track every payment against a contract:

```
Contract Value:  $1,000,000
Total Paid:      $450,000
Remaining:       $550,000
Status:          Partially Paid

Progress: ██████████████░░░░░░░░░░  45% Collected
```

- Set contract value and payment schedule during creation
- Choose installments (2/3/4/6/12) — schedule auto-generates
- Record each payment with date, amount, method, and receipt number
- Dashboard shows collection progress, overdue amounts, and at-risk revenue

---

## Data & Security

| Item | Detail |
|---|---|
| Data Storage | GitHub Issues (each org = one issue) |
| Shared Access | Anyone with repo access sees the same data |
| Version History | Every change tracked via git + audit comments |
| Auth | GitHub Personal Access Token (stored in browser only) |
| Access Control | GitHub repo permissions (Admin/Write/Triage/Read) |
| HTTPS | Enforced by GitHub Pages |

---

## Export & Reports

| Export | What's Included |
|---|---|
| **CSV (Listing)** | All orgs with 27 fields including payment data |
| **PDF (Dashboard)** | Metrics, charts, tables — full dashboard snapshot |
| **PDF (Org Detail)** | Org info, subscriptions, payment summary + history, alerts |

---

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (no framework)
- **Hosting:** GitHub Pages (static site, no server)
- **Data:** GitHub Issues + Labels + Projects v2
- **Automation:** GitHub Actions (daily cron)
- **PDF Parsing:** pdf.js (client-side)
- **PDF Export:** html2pdf.js (client-side)

---

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

---

## Known Limitations

- Data stored in GitHub Issues — subject to GitHub API rate limits (5,000 requests/hour)
- PDF auto-extraction works best with text-based PDFs (not scanned images)
- Edit form modifies only the first subscription — additional subscriptions are preserved but not editable inline (use "Add Subscription" for new ones)
- Bulk upload limited to 100 rows per file (GitHub API rate limits)

---

## Future Roadmap

- AI-powered invoice parsing (Claude API)
- Revenue forecasting and trends
- Customer health scoring
- Slack integration for alerts
- Account segmentation (Enterprise / Mid / Small)
- Multi-currency dashboard support
- Communication log per organization

---

## Support

For issues or feature requests, contact your admin or create an issue in the [repository](https://github.com/mjainik/subscription-management-system/issues).
