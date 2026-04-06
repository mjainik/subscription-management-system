/**
 * Utility Functions
 * Date calculations, formatting, helpers.
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
        const classes = {
            active: 'badge-success',
            expiringSoon: 'badge-warning',
            expired: 'badge-error'
        };
        return `<span class="badge ${classes[status]}">${CONFIG.labels.status[status]}</span>`;
    },

    /**
     * Format date for display (Apr 02, 2026)
     */
    formatDate(dateStr) {
        if (!dateStr) return '—';
        // Handle both YYYY-MM-DD and ISO timestamps (2026-04-05T12:00:00Z)
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
     * Format date for API/storage (2026-04-02)
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
     * Get milestone name from expiry date (e.g., "2026-06 Expiring")
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
        const symbols = { USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', CAD: 'C$', JPY: '¥', CNY: '¥', AED: 'د.إ', SAR: '﷼', SGD: 'S$', BRL: 'R$' };
        return symbols[code] || code || '$';
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
     * Format currency short form (K, L, Cr) with proper symbol
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

    /**
     * Parse structured markdown table from issue body
     */
    parseIssueBody(body) {
        const data = {
            organization: {},
            subscriptions: [],
            payment: {},
            paymentHistory: [],
            alerts: {},
            notes: ''
        };

        if (!body) return data;

        const sections = body.split(/^## /m).filter(Boolean);

        for (const section of sections) {
            const lines = section.trim().split('\n');
            const title = lines[0].trim().toLowerCase();

            if (title.includes('organization details')) {
                data.organization = this.parseMarkdownTable(lines.slice(1));
            } else if (title.includes('subscription') && !title.includes('details')) {
                data.subscriptions.push(this.parseMarkdownTable(lines.slice(1)));
            } else if (title === 'subscription details') {
                data.subscriptions.push(this.parseMarkdownTable(lines.slice(1)));
            } else if (title.includes('payment details')) {
                data.payment = this.parseMarkdownTable(lines.slice(1));
            } else if (title.includes('payment history')) {
                data.paymentHistory = this.parsePaymentHistoryTable(lines.slice(1));
            } else if (title.includes('alert settings')) {
                data.alerts = this.parseMarkdownTable(lines.slice(1));
            } else if (title.includes('notes')) {
                data.notes = lines.slice(1).join('\n').trim();
            }
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
                const key = match[1].trim();
                const value = match[2].trim();
                result[key] = value;
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
                    number: match[1].trim(),
                    date: match[2].trim(),
                    amount: match[3].trim(),
                    method: match[4].trim(),
                    receipt: match[5].trim(),
                    status: match[6].trim()
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

        const remaining = contractValue - totalPaid;
        const percentage = contractValue > 0 ? Math.round((totalPaid / contractValue) * 100) : 0;

        let status = 'Due';
        if (contractValue > 0 && totalPaid >= contractValue) status = 'Fully Paid';
        else if (totalPaid > 0) status = 'Partially Paid';

        // Check for overdue
        if (paymentHistory) {
            const today = new Date();
            for (const p of paymentHistory) {
                if (p.status === 'Due' && p.date && new Date(p.date) < today) {
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

    /**
     * Build structured markdown body from form data
     */
    buildIssueBody(orgData, subscriptions, paymentData, alertData, notes) {
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

        subscriptions.forEach((sub, index) => {
            const heading = subscriptions.length > 1 ? `Subscription ${index + 1}` : 'Subscription Details';
            body += `\n## ${heading}\n| Field | Value |\n|-------|-------|\n`;
            body += `| Subscription Type | ${sub.type || ''} |\n`;
            if (sub.customDuration) {
                body += `| Custom Duration | ${sub.customDuration} months |\n`;
            }
            body += `| Plan Name | ${sub.planName || ''} |\n`;
            body += `| Start Date | ${sub.startDate || ''} |\n`;
            body += `| Expiry Date | ${sub.expiryDate || ''} |\n`;
            body += `| Billing Date | ${sub.billingDate || ''} |\n`;
            body += `| Payment Cycle | ${sub.paymentCycle || ''} |\n`;
            body += `| Amount | ${sub.amount || ''} |\n`;
            body += `| Currency | ${sub.currency || 'USD'} |\n`;
            body += `| Auto Renew | ${sub.autoRenew || 'No'} |\n`;
        });

        // Payment Details
        body += `\n## Payment Details\n| Field | Value |\n|-------|-------|\n`;
        body += `| Contract Value | ${paymentData.contractValue || ''} |\n`;
        body += `| Payment Schedule | ${paymentData.schedule || 'One-time'} |\n`;
        body += `| Total Paid | ${paymentData.totalPaid || '$0'} |\n`;
        body += `| Remaining | ${paymentData.remaining || paymentData.contractValue || ''} |\n`;
        body += `| Payment Status | ${paymentData.status || 'Due'} |\n`;

        // Payment History
        if (paymentData.installments && parseInt(paymentData.installments) > 1) {
            body += `\n## Payment History\n| # | Date | Amount | Method | Receipt | Status |\n|---|------|--------|--------|---------|--------|\n`;
            const numInstallments = parseInt(paymentData.installments);
            const contractVal = parseFloat((paymentData.contractValue || '0').replace(/[^0-9.]/g, '')) || 0;
            const perInstallment = contractVal > 0 ? Math.round(contractVal / numInstallments) : 0;
            const startDate = paymentData.firstPaymentDate || subscriptions[0]?.startDate || '';

            for (let i = 0; i < numInstallments; i++) {
                let dueDate = '';
                if (startDate) {
                    const d = new Date(startDate + 'T00:00:00');
                    d.setMonth(d.getMonth() + (i * Math.floor(12 / numInstallments)));
                    dueDate = this.formatDateApi(d);
                }
                const installmentAmount = i === numInstallments - 1
                    ? contractVal - (perInstallment * (numInstallments - 1))
                    : perInstallment;
                const currSym = this.getCurrencySymbol(subscriptions[0]?.currency);
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
     * Get the earliest expiry date from multiple subscriptions
     */
    getEarliestExpiry(subscriptions) {
        if (!subscriptions || subscriptions.length === 0) return null;
        let earliest = null;
        for (const sub of subscriptions) {
            const expiry = sub['Expiry Date'] || sub.expiryDate;
            if (expiry) {
                if (!earliest || new Date(expiry) < new Date(earliest)) {
                    earliest = expiry;
                }
            }
        }
        return earliest;
    },

    /**
     * Get the most urgent status from multiple subscriptions
     */
    getMostUrgentStatus(subscriptions) {
        const priority = ['expired', 'expiringSoon', 'active'];
        let mostUrgent = 'active';

        for (const sub of subscriptions) {
            const expiry = sub['Expiry Date'] || sub.expiryDate;
            if (expiry) {
                const status = this.getStatus(expiry);
                if (priority.indexOf(status) < priority.indexOf(mostUrgent)) {
                    mostUrgent = status;
                }
            }
        }
        return mostUrgent;
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
