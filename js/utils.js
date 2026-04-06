/**
 * Utility Functions
 * Date calculations, formatting, helpers.
 * Supports 3-tier subscription model: Platform, Project Batches, User Batches
 */
const Utils = {

    /**
     * Calculate remaining days from today to a target date
     */
    remainingDays(expiryDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiry = new Date(expiryDate);
        expiry.setHours(0, 0, 0, 0);
        const diffMs = expiry - today;
        return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    },

    /**
     * Determine subscription status based on remaining days
     */
    getStatus(expiryDate) {
        if (!expiryDate) return 'active';
        const days = this.remainingDays(expiryDate);
        if (days <= CONFIG.status.expiredMax) return 'expired';
        if (days <= CONFIG.status.expiringSoonMax) return 'expiringSoon';
        return 'active';
    },

    /**
     * Get status label name from status key
     */
    getStatusLabel(statusKey) {
        return CONFIG.labels.status[statusKey] || CONFIG.labels.status.active;
    },

    /**
     * Get status badge HTML
     */
    statusBadge(expiryDate, manualStatus) {
        if (manualStatus === 'renewalInProgress') {
            return `<span class="badge badge-info">${CONFIG.labels.status.renewalInProgress}</span>`;
        }
        const status = this.getStatus(expiryDate);
        const classes = { active: 'badge-success', expiringSoon: 'badge-warning', expired: 'badge-error' };
        return `<span class="badge ${classes[status]}">${CONFIG.labels.status[status]}</span>`;
    },

    /**
     * Format date for display (DD-MMM-YYYY)
     */
    formatDate(dateStr) {
        if (!dateStr) return '—';
        let date;
        if (dateStr.includes('T')) {
            date = new Date(dateStr);
        } else {
            date = new Date(dateStr + 'T00:00:00');
        }
        if (isNaN(date.getTime())) return '—';
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = String(date.getDate()).padStart(2, '0');
        return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
    },

    /**
     * Format date for API/storage (YYYY-MM-DD)
     */
    formatDateApi(date) {
        if (!date) return '';
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * Get milestone name from expiry date
     */
    getMilestoneName(expiryDate) {
        const date = new Date(expiryDate);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month} Expiring`;
    },

    /**
     * Get currency symbol from code
     */
    getCurrencySymbol(code) {
        // Currency symbol removed — amounts shown as plain numbers
        return '';
    },

    /**
     * Format currency with proper symbol
     */
    formatCurrency(amount, currency = 'USD') {
        if (!amount && amount !== 0) return '—';
        const num = typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;
        if (isNaN(num)) return '—';
        const symbol = this.getCurrencySymbol(currency);
        return symbol + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    },

    /**
     * Format currency short form (K, L, Cr)
     */
    formatCurrencyShort(amount, currency = 'USD') {
        if (!amount && amount !== 0) return '—';
        const num = typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;
        if (isNaN(num)) return '—';
        const symbol = this.getCurrencySymbol(currency);
        if (num >= 10000000) return symbol + (num / 10000000).toFixed(1) + 'Cr';
        if (num >= 100000) return symbol + (num / 100000).toFixed(1) + 'L';
        if (num >= 1000) return symbol + (num / 1000).toFixed(1) + 'K';
        return symbol + num.toLocaleString();
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Generate a unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    // ═══════════════════════════════════════════════════════
    // PARSER — 3-Tier Subscription Model
    // ═══════════════════════════════════════════════════════

    /**
     * Parse structured markdown from issue body.
     * Supports: Platform Subscription, Project Batches, User Batches
     * Backward compatible: old "Subscription Details" / "Subscription N" treated as platform
     */
    parseIssueBody(body) {
        const data = {
            organization: {},
            platform: null,           // Single platform subscription (or null)
            projectBatches: [],       // Array of project batch objects
            userBatches: [],          // Array of user batch objects
            subscriptions: [],        // Legacy: old-format subscriptions (backward compat)
            payment: {},
            paymentHistory: [],
            alerts: {},
            notes: ''
        };

        if (!body) return data;

        const sections = body.split(/^## /m).filter(Boolean);

        for (const section of sections) {
            const lines = section.trim().split('\n');
            const title = lines[0].trim();
            const titleLower = title.toLowerCase();

            if (titleLower.includes('organization details')) {
                data.organization = this.parseMarkdownTable(lines.slice(1));
            } else if (titleLower === 'platform subscription') {
                data.platform = this.parseMarkdownTable(lines.slice(1));
            } else if (titleLower.startsWith('project batch')) {
                data.projectBatches.push(this.parseMarkdownTable(lines.slice(1)));
            } else if (titleLower.startsWith('user batch')) {
                data.userBatches.push(this.parseMarkdownTable(lines.slice(1)));
            } else if (titleLower.includes('subscription') && !titleLower.includes('details')) {
                // Legacy: "Subscription 1", "Subscription 2"
                data.subscriptions.push(this.parseMarkdownTable(lines.slice(1)));
            } else if (titleLower === 'subscription details') {
                // Legacy: single subscription — treat as platform
                data.subscriptions.push(this.parseMarkdownTable(lines.slice(1)));
            } else if (titleLower.includes('payment details')) {
                data.payment = this.parseMarkdownTable(lines.slice(1));
            } else if (titleLower.includes('payment history')) {
                data.paymentHistory = this.parsePaymentHistoryTable(lines.slice(1));
            } else if (titleLower.includes('alert settings')) {
                data.alerts = this.parseMarkdownTable(lines.slice(1));
            } else if (titleLower.includes('notes')) {
                data.notes = lines.slice(1).join('\n').trim();
            }
        }

        // Backward compat: if no platform/batches but has legacy subscriptions, treat first as platform
        if (!data.platform && data.projectBatches.length === 0 && data.userBatches.length === 0 && data.subscriptions.length > 0) {
            data.platform = data.subscriptions[0];
        }

        return data;
    },

    /**
     * Parse a markdown table into key-value object
     */
    parseMarkdownTable(lines) {
        const result = {};
        for (const line of lines) {
            const match = line.match(/\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
            if (match && !match[1].includes('---') && match[1].toLowerCase() !== 'field') {
                result[match[1].trim()] = match[2].trim();
            }
        }
        return result;
    },

    /**
     * Parse payment history table (multi-column)
     */
    parsePaymentHistoryTable(lines) {
        const payments = [];
        for (const line of lines) {
            const match = line.match(/\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
            if (match) {
                payments.push({
                    number: match[1].trim(), date: match[2].trim(), amount: match[3].trim(),
                    method: match[4].trim(), receipt: match[5].trim(), status: match[6].trim()
                });
            }
        }
        return payments;
    },

    /**
     * Calculate payment summary from payment data
     */
    calculatePaymentSummary(payment, paymentHistory) {
        const contractValue = parseFloat((payment['Contract Value'] || '0').replace(/[^0-9.]/g, '')) || 0;
        let totalPaid = 0;

        if (paymentHistory && paymentHistory.length > 0) {
            for (const p of paymentHistory) {
                if (p.status === 'Paid') {
                    totalPaid += parseFloat((p.amount || '0').replace(/[^0-9.]/g, '')) || 0;
                }
            }
        } else {
            totalPaid = parseFloat((payment['Total Paid'] || '0').replace(/[^0-9.]/g, '')) || 0;
        }

        const remaining = Math.max(0, contractValue - totalPaid);
        const percentage = contractValue > 0 ? Math.min(100, Math.round((totalPaid / contractValue) * 100)) : (totalPaid > 0 ? 100 : 0);

        let status = 'Due';
        if (totalPaid > 0 && (contractValue === 0 || totalPaid >= contractValue)) status = 'Fully Paid';
        else if (totalPaid > 0) status = 'Partially Paid';

        if (paymentHistory) {
            const today = new Date();
            for (const p of paymentHistory) {
                if (p.status === 'Due' && p.date && p.date !== '—' && new Date(p.date) < today) {
                    status = 'Overdue';
                    break;
                }
            }
        }

        return { contractValue, totalPaid, remaining, percentage, status };
    },

    /**
     * Get payment status badge HTML
     */
    paymentStatusBadge(status) {
        const map = {
            'Fully Paid': '<span class="badge badge-success">Fully Paid</span>',
            'Partially Paid': '<span class="badge badge-warning">Partially Paid</span>',
            'Overdue': '<span class="badge badge-error">Overdue</span>',
            'Due': '<span class="badge badge-info">Due</span>'
        };
        return map[status] || '<span class="badge badge-default">—</span>';
    },

    // ═══════════════════════════════════════════════════════
    // BODY BUILDER — 3-Tier Model
    // ═══════════════════════════════════════════════════════

    /**
     * Build structured markdown body from form data.
     * New signature: buildIssueBody(orgData, subTypes, paymentData, alertData, notes)
     * subTypes = { platform: {...}, projectBatches: [...], userBatches: [...] }
     *
     * Backward compat: if subTypes is an array, treat as legacy subscriptions
     */
    buildIssueBody(orgData, subTypes, paymentData, alertData, notes) {
        let body = `## Organization Details\n| Field | Value |\n|-------|-------|\n`;
        body += `| Organization Name | ${orgData.name || ''} |\n`;
        body += `| Contact Email | ${orgData.email || ''} |\n`;
        body += `| Phone | ${orgData.phone || ''} |\n`;
        body += `| Address | ${orgData.address || ''} |\n`;
        body += `| Organization Type | ${orgData.orgType || ''} |\n`;
        body += `| Account Manager | ${orgData.accountManager || ''} |\n`;
        body += `| Contact Person | ${orgData.contactPerson || ''} |\n`;
        body += `| Designation | ${orgData.designation || ''} |\n`;
        body += `| Secondary Contact | ${orgData.secondaryContact || ''} |\n`;
        body += `| Secondary Email | ${orgData.secondaryEmail || ''} |\n`;
        body += `| Secondary Phone | ${orgData.secondaryPhone || ''} |\n`;
        body += `| GST/Tax ID | ${orgData.gstId || ''} |\n`;
        body += `| Deal Source | ${orgData.dealSource || ''} |\n`;
        body += `| Number of Licenses | ${orgData.licenses || ''} |\n`;

        // Handle both old (array) and new (object with platform/batches) format
        if (Array.isArray(subTypes)) {
            // Legacy format — old callers passing array of subscriptions
            subTypes.forEach((sub, index) => {
                const heading = subTypes.length > 1 ? `Subscription ${index + 1}` : 'Subscription Details';
                body += this._buildSubSection(heading, sub);
            });
        } else {
            // New 3-tier format
            if (subTypes.platform) {
                body += this._buildSubSection('Platform Subscription', subTypes.platform);
            }
            if (subTypes.projectBatches) {
                subTypes.projectBatches.forEach((batch, i) => {
                    body += this._buildBatchSection(`Project Batch ${i + 1}`, batch, 'project');
                });
            }
            if (subTypes.userBatches) {
                subTypes.userBatches.forEach((batch, i) => {
                    body += this._buildBatchSection(`User Batch ${i + 1}`, batch, 'user');
                });
            }
        }

        // Payment Details
        body += `\n## Payment Details\n| Field | Value |\n|-------|-------|\n`;
        body += `| Contract Value | ${paymentData.contractValue || ''} |\n`;
        body += `| Payment Schedule | ${paymentData.schedule || 'One-time'} |\n`;
        body += `| Total Paid | ${paymentData.totalPaid || '0'} |\n`;
        body += `| Remaining | ${paymentData.remaining || paymentData.contractValue || ''} |\n`;
        body += `| Payment Status | ${paymentData.status || 'Due'} |\n`;

        // Payment History (installments)
        if (paymentData.installments && parseInt(paymentData.installments) > 1) {
            body += `\n## Payment History\n| # | Date | Amount | Method | Receipt | Status |\n|---|------|--------|--------|---------|--------|\n`;
            const numInstallments = parseInt(paymentData.installments);
            const contractVal = parseFloat((paymentData.contractValue || '0').replace(/[^0-9.]/g, '')) || 0;
            const perInstallment = contractVal > 0 ? Math.round(contractVal / numInstallments) : 0;
            const startDate = paymentData.firstPaymentDate || '';
            const currSym = this.getCurrencySymbol(paymentData.currency);

            // Calculate spacing from actual contract duration (not hardcoded 12 months)
            let totalMonths = 12; // default fallback
            if (startDate && paymentData.expiryDate) {
                const sDate = new Date(startDate + 'T00:00:00');
                const eDate = new Date(paymentData.expiryDate + 'T00:00:00');
                totalMonths = Math.max(1, (eDate.getFullYear() - sDate.getFullYear()) * 12 + (eDate.getMonth() - sDate.getMonth()));
            }
            const monthSpacing = Math.max(1, Math.floor(totalMonths / numInstallments));

            for (let i = 0; i < numInstallments; i++) {
                let dueDate = '';
                if (startDate) {
                    const d = new Date(startDate + 'T00:00:00');
                    d.setMonth(d.getMonth() + (i * monthSpacing));
                    dueDate = this.formatDateApi(d);
                }
                const installmentAmount = i === numInstallments - 1
                    ? contractVal - (perInstallment * (numInstallments - 1))
                    : perInstallment;
                body += `| ${i + 1} | ${dueDate} | ${currSym}${installmentAmount.toLocaleString()} | — | — | Due |\n`;
            }
        }

        body += `\n## Alert Settings\n| Field | Value |\n|-------|-------|\n`;
        body += `| Alerts Enabled | ${alertData.enabled || 'Yes'} |\n`;
        body += `| Alert Days Before | ${alertData.daysBefore || CONFIG.defaultAlertDays} |\n`;
        body += `| Alert Recipients | ${alertData.recipients || ''} |\n`;

        if (notes) {
            body += `\n## Notes\n${notes}\n`;
        }

        return body;
    },

    /**
     * Build a subscription section (platform or legacy)
     */
    _buildSubSection(heading, sub) {
        let s = `\n## ${heading}\n| Field | Value |\n|-------|-------|\n`;
        s += `| Subscription Type | ${sub.type || ''} |\n`;
        if (sub.customDuration) s += `| Custom Duration | ${sub.customDuration} months |\n`;
        s += `| Plan Name | ${sub.planName || ''} |\n`;
        s += `| Start Date | ${sub.startDate || ''} |\n`;
        s += `| Expiry Date | ${sub.expiryDate || ''} |\n`;
        s += `| Billing Date | ${sub.billingDate || ''} |\n`;
        s += `| Payment Cycle | ${sub.paymentCycle || ''} |\n`;
        s += `| Amount | ${sub.amount || ''} |\n`;
        s += `| Currency | ${sub.currency || 'USD'} |\n`;
        s += `| Auto Renew | ${sub.autoRenew || 'No'} |\n`;
        return s;
    },

    /**
     * Build a batch section (project or user)
     */
    _buildBatchSection(heading, batch, batchType) {
        let s = `\n## ${heading}\n| Field | Value |\n|-------|-------|\n`;
        if (batchType === 'project') {
            s += `| Projects | ${batch.projects || ''} |\n`;
        } else {
            s += `| Users | ${batch.users || ''} |\n`;
        }
        s += `| Start Date | ${batch.startDate || ''} |\n`;
        s += `| Expiry Date | ${batch.expiryDate || ''} |\n`;
        s += `| Amount | ${batch.amount || ''} |\n`;
        s += `| Currency | ${batch.currency || 'USD'} |\n`;
        s += `| Payment Cycle | ${batch.paymentCycle || ''} |\n`;
        return s;
    },

    // ═══════════════════════════════════════════════════════
    // EXPIRY HELPERS — across all 3 types
    // ═══════════════════════════════════════════════════════

    /**
     * Get ALL items with expiry dates from parsed data.
     * Returns array of { label, expiryDate, days, type }
     * Works with both old (subscriptions[]) and new (platform/batches) formats
     */
    getAllExpiryItems(parsed) {
        const items = [];

        // Platform subscription
        if (parsed.platform) {
            const expiry = parsed.platform['Expiry Date'] || parsed.platform.expiryDate;
            if (expiry) {
                items.push({
                    label: 'Platform',
                    expiryDate: expiry,
                    days: this.remainingDays(expiry),
                    type: 'platform'
                });
            }
        }

        // Project batches
        if (parsed.projectBatches) {
            parsed.projectBatches.forEach((b, i) => {
                const expiry = b['Expiry Date'] || b.expiryDate;
                if (expiry) {
                    items.push({
                        label: `Projects: ${b['Projects'] || b.projects || 'Batch ' + (i + 1)}`,
                        expiryDate: expiry,
                        days: this.remainingDays(expiry),
                        type: 'project'
                    });
                }
            });
        }

        // User batches
        if (parsed.userBatches) {
            parsed.userBatches.forEach((b, i) => {
                const expiry = b['Expiry Date'] || b.expiryDate;
                if (expiry) {
                    items.push({
                        label: `Users: ${b['Users'] || b.users || 'Batch ' + (i + 1)}`,
                        expiryDate: expiry,
                        days: this.remainingDays(expiry),
                        type: 'user'
                    });
                }
            });
        }

        // Legacy subscriptions (backward compat)
        if (items.length === 0 && parsed.subscriptions) {
            parsed.subscriptions.forEach((sub, i) => {
                const expiry = sub['Expiry Date'] || sub.expiryDate;
                if (expiry) {
                    items.push({
                        label: sub['Subscription Type'] || 'Subscription ' + (i + 1),
                        expiryDate: expiry,
                        days: this.remainingDays(expiry),
                        type: 'legacy'
                    });
                }
            });
        }

        items.sort((a, b) => a.days - b.days);
        return items;
    },

    /**
     * Get the earliest expiry date across all subscription types
     * Backward compatible — works with old and new format
     */
    getEarliestExpiry(parsed) {
        // If called with old format (array of subscriptions), convert
        if (Array.isArray(parsed)) {
            const items = [];
            for (const sub of parsed) {
                const expiry = sub['Expiry Date'] || sub.expiryDate;
                if (expiry) items.push(expiry);
            }
            return items.sort((a, b) => new Date(a) - new Date(b))[0] || null;
        }

        // New format — parsed object
        const items = this.getAllExpiryItems(parsed);
        return items.length > 0 ? items[0].expiryDate : null;
    },

    /**
     * Get the most urgent status across all subscription types
     */
    getMostUrgentStatus(parsed) {
        // If called with old format (array), convert
        if (Array.isArray(parsed)) {
            const priority = ['expired', 'expiringSoon', 'active'];
            let mostUrgent = 'active';
            for (const sub of parsed) {
                const expiry = sub['Expiry Date'] || sub.expiryDate;
                if (expiry) {
                    const s = this.getStatus(expiry);
                    if (priority.indexOf(s) < priority.indexOf(mostUrgent)) mostUrgent = s;
                }
            }
            return mostUrgent;
        }

        const items = this.getAllExpiryItems(parsed);
        if (items.length === 0) return 'active';
        const priority = ['expired', 'expiringSoon', 'active'];
        let mostUrgent = 'active';
        for (const item of items) {
            const s = this.getStatus(item.expiryDate);
            if (priority.indexOf(s) < priority.indexOf(mostUrgent)) mostUrgent = s;
        }
        return mostUrgent;
    },

    /**
     * Get the soonest expiring item with its label (for dashboard hover)
     */
    getSoonestExpiringItem(parsed) {
        const items = this.getAllExpiryItems(parsed);
        return items.length > 0 ? items[0] : null;
    },

    /**
     * Debounce function
     */
    debounce(func, wait = 300) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    },

    /**
     * Parse query parameters from URL
     */
    getQueryParam(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    },

    /**
     * Validate email format
     */
    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    /**
     * Validate date string (YYYY-MM-DD)
     */
    isValidDate(dateStr) {
        if (!dateStr) return false;
        const date = new Date(dateStr);
        return !isNaN(date.getTime());
    },

    /**
     * Check if expiry date is after start date
     */
    isExpiryAfterStart(startDate, expiryDate) {
        return new Date(expiryDate) > new Date(startDate);
    },

    /**
     * Format relative time (e.g., "2 hours ago")
     */
    timeAgo(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + ' hrs ago';
        if (seconds < 2592000) return Math.floor(seconds / 86400) + ' days ago';
        return this.formatDate(dateStr);
    }
};
