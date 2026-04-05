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
        const date = new Date(dateStr + 'T00:00:00');
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
     * Format currency
     */
    formatCurrency(amount, currency = 'USD') {
        if (!amount && amount !== 0) return '—';
        const num = parseFloat(amount);
        if (isNaN(num)) return '—';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(num);
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
                // Multiple subscriptions: "Subscription 1", "Subscription 2", etc.
                data.subscriptions.push(this.parseMarkdownTable(lines.slice(1)));
            } else if (title === 'subscription details') {
                // Single subscription (legacy format)
                data.subscriptions.push(this.parseMarkdownTable(lines.slice(1)));
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
     * Build structured markdown body from form data
     */
    buildIssueBody(orgData, subscriptions, alertData, notes) {
        let body = `## Organization Details\n| Field | Value |\n|-------|-------|\n`;
        body += `| Organization Name | ${orgData.name || ''} |\n`;
        body += `| Contact Email | ${orgData.email || ''} |\n`;
        body += `| Phone | ${orgData.phone || ''} |\n`;
        body += `| Address | ${orgData.address || ''} |\n`;
        body += `| Organization Type | ${orgData.orgType || ''} |\n`;
        body += `| Account Manager | ${orgData.accountManager || ''} |\n`;

        subscriptions.forEach((sub, index) => {
            const heading = subscriptions.length > 1 ? `Subscription ${index + 1}` : 'Subscription Details';
            body += `\n## ${heading}\n| Field | Value |\n|-------|-------|\n`;
            body += `| Subscription Type | ${sub.type || ''} |\n`;
            body += `| Plan Name | ${sub.planName || ''} |\n`;
            body += `| Start Date | ${sub.startDate || ''} |\n`;
            body += `| Expiry Date | ${sub.expiryDate || ''} |\n`;
            body += `| Billing Date | ${sub.billingDate || ''} |\n`;
            body += `| Payment Cycle | ${sub.paymentCycle || ''} |\n`;
            body += `| Amount | ${sub.amount || ''} |\n`;
            body += `| Currency | ${sub.currency || 'USD'} |\n`;
            body += `| Auto Renew | ${sub.autoRenew || 'No'} |\n`;
        });

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
