/**
 * Utility Functions
 * Date calculations, formatting, helpers.
 * Supports 3-tier subscription model with per-subscription payment tracking.
 */
const Utils = {

    // ═══════════════════════════════════════════════════════
    // DATE & FORMAT HELPERS
    // ═══════════════════════════════════════════════════════

    remainingDays(expiryDate) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const expiry = new Date(expiryDate); expiry.setHours(0, 0, 0, 0);
        return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    },

    getStatus(expiryDate) {
        if (!expiryDate) return 'active';
        const days = this.remainingDays(expiryDate);
        if (days <= CONFIG.status.expiredMax) return 'expired';
        if (days <= CONFIG.status.expiringSoonMax) return 'expiringSoon';
        return 'active';
    },

    getStatusLabel(statusKey) {
        return CONFIG.labels.status[statusKey] || CONFIG.labels.status.active;
    },

    statusBadge(expiryDate, manualStatus) {
        if (manualStatus === 'renewalInProgress') return `<span class="badge badge-info">${CONFIG.labels.status.renewalInProgress}</span>`;
        const status = this.getStatus(expiryDate);
        const classes = { active: 'badge-success', expiringSoon: 'badge-warning', expired: 'badge-error' };
        return `<span class="badge ${classes[status]}">${CONFIG.labels.status[status]}</span>`;
    },

    formatDate(dateStr) {
        if (!dateStr) return '—';
        let date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
        if (isNaN(date.getTime())) return '—';
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}-${date.getFullYear()}`;
    },

    /**
     * Format date + time for audit logs (DD-MMM-YYYY hh:mm AM/PM)
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '—';
        const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr);
        if (isNaN(date.getTime())) return this.formatDate(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let hours = date.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const mins = String(date.getMinutes()).padStart(2, '0');
        return `${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}-${date.getFullYear()} ${hours}:${mins} ${ampm}`;
    },

    formatDateApi(date) {
        if (!date) return '';
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    getMilestoneName(expiryDate) {
        const d = new Date(expiryDate);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')} Expiring`;
    },

    getCurrencySymbol() { return ''; },

    formatCurrency(amount) {
        if (!amount && amount !== 0) return '—';
        const num = typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;
        if (isNaN(num) || num === 0) return '—';
        return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    },

    formatCurrencyShort(amount) {
        if (!amount && amount !== 0) return '—';
        const num = typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) : amount;
        if (isNaN(num)) return '—';
        if (num >= 10000000) return (num / 10000000).toFixed(1) + 'Cr';
        if (num >= 100000) return (num / 100000).toFixed(1) + 'L';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 11); },

    // ═══════════════════════════════════════════════════════
    // FINANCIAL YEAR HELPERS (Indian FY: Apr-Mar)
    // ═══════════════════════════════════════════════════════

    /**
     * Get Indian FY string from a date. e.g., "FY 2026-27"
     * FY starts April 1. Any date Apr-Dec = that year. Jan-Mar = previous year.
     */
    getFY(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const year = d.getFullYear();
        const month = d.getMonth(); // 0-indexed
        // Apr(3)-Dec(11) = FY starts this year. Jan(0)-Mar(2) = FY started last year.
        const fyStartYear = month >= 3 ? year : year - 1;
        return `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;
    },

    /**
     * Get current Indian FY
     */
    getCurrentFY() {
        return this.getFY(new Date().toISOString());
    },

    /**
     * Parse FY string to start/end dates. "FY 2026-27" → { start: "2026-04-01", end: "2027-03-31" }
     */
    parseFYDates(fyStr) {
        const m = (fyStr || '').match(/FY\s*(\d{4})-(\d{2})/);
        if (!m) return null;
        const startYear = parseInt(m[1]);
        return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
    },

    /**
     * Get all FY strings from an array of FY data objects, sorted newest first
     */
    sortFYs(fyList) {
        return fyList.sort((a, b) => {
            const aYear = parseInt((a || '').match(/\d{4}/)?.[0] || '0');
            const bYear = parseInt((b || '').match(/\d{4}/)?.[0] || '0');
            return bYear - aYear;
        });
    },

    /**
     * Get grace period status
     * Returns: 'active' | 'grace' | 'expired'
     */
    getGraceStatus(expiryDate, graceDays) {
        if (!expiryDate) return 'active';
        const days = this.remainingDays(expiryDate);
        const grace = parseInt(graceDays) || 7;
        if (days >= 0) return 'active';  // expiry day itself is still active
        if (days < 0 && Math.abs(days) <= grace) return 'grace';
        return 'expired';
    },

    /**
     * Grace period badge HTML
     */
    graceBadge(expiryDate, graceDays) {
        const status = this.getGraceStatus(expiryDate, graceDays);
        if (status === 'active') return this.statusBadge(expiryDate);
        if (status === 'grace') {
            const grace = parseInt(graceDays) || 7;
            const days = this.remainingDays(expiryDate);
            const graceLeft = grace - Math.abs(days);
            return `<span class="badge badge-warning">⏳ Grace Period (${graceLeft}d left)</span>`;
        }
        return '<span class="badge badge-error">❌ Expired</span>';
    },

    // ═══════════════════════════════════════════════════════
    // PARSER — FY-based + Per-Subscription Payment History
    // ═══════════════════════════════════════════════════════

    /**
     * Parse issue body. Supports:
     * - FY-based sections: "## FY 2026-27 Platform Subscription"
     * - Non-FY sections (backward compat): "## Platform Subscription"
     * - Legacy: "## Subscription Details"
     * Returns data with `fyData` map: { "FY 2026-27": { platform, batches, payments, docs }, ... }
     */
    parseIssueBody(body) {
        const data = {
            organization: {},
            fyData: {},               // Map of FY → { platform, platformPayHistory, projectBatches, projectPayHistories, userBatches, userPayHistories, documents, gracePeriod }
            fyList: [],               // Sorted list of FY strings (newest first)
            // Flat accessors (point to current/latest FY for backward compat)
            platform: null,
            platformPayHistory: [],
            projectBatches: [],
            projectPayHistories: [],
            userBatches: [],
            userPayHistories: [],
            subscriptions: [],
            payment: {},
            paymentHistory: [],
            alerts: {},
            notes: ''
        };

        if (!body) return data;

        const sections = body.split(/^## /m).filter(Boolean);
        const fyRegex = /^(FY\s*\d{4}-\d{2})\s+/i;

        for (const section of sections) {
            const lines = section.trim().split('\n');
            const title = lines[0].trim();
            const titleLower = title.toLowerCase();
            const tableData = lines.slice(1);

            // Check if section has FY prefix
            const fyMatch = title.match(fyRegex);
            const fy = fyMatch ? fyMatch[1].toUpperCase().replace(/\s+/g, ' ') : null;
            const sectionName = fy ? title.substring(fyMatch[0].length).trim().toLowerCase() : titleLower;

            // Initialize FY data if needed
            if (fy && !data.fyData[fy]) {
                data.fyData[fy] = {
                    platform: null, platformPayHistory: [],
                    projectBatches: [], projectPayHistories: [],
                    userBatches: [], userPayHistories: [],
                    documents: [], gracePeriod: '7'
                };
            }

            const target = fy ? data.fyData[fy] : data;

            if (titleLower.includes('organization details')) {
                data.organization = this.parseMarkdownTable(tableData);
            } else if (sectionName === 'platform subscription') {
                target.platform = this.parseMarkdownTable(tableData);
                if (target.platform['Grace Period']) {
                    if (fy) data.fyData[fy].gracePeriod = target.platform['Grace Period'];
                }
            } else if (sectionName === 'platform payment history') {
                target.platformPayHistory = this.parsePaymentHistoryTable(tableData);
            } else if (sectionName.startsWith('project batch') && !sectionName.includes('payment history')) {
                target.projectBatches.push(this.parseMarkdownTable(tableData));
            } else if (sectionName.startsWith('project batch') && sectionName.includes('payment history')) {
                target.projectPayHistories.push(this.parsePaymentHistoryTable(tableData));
            } else if (sectionName.startsWith('user batch') && !sectionName.includes('payment history')) {
                target.userBatches.push(this.parseMarkdownTable(tableData));
            } else if (sectionName.startsWith('user batch') && sectionName.includes('payment history')) {
                target.userPayHistories.push(this.parsePaymentHistoryTable(tableData));
            } else if (sectionName.includes('documents')) {
                if (fy) data.fyData[fy].documents = this._parseDocumentsTable(tableData);
            } else if (titleLower.includes('subscription') && !titleLower.includes('details')) {
                data.subscriptions.push(this.parseMarkdownTable(tableData));
            } else if (titleLower === 'subscription details') {
                data.subscriptions.push(this.parseMarkdownTable(tableData));
            } else if (titleLower === 'payment details') {
                data.payment = this.parseMarkdownTable(tableData);
            } else if (titleLower === 'payment history') {
                data.paymentHistory = this.parsePaymentHistoryTable(tableData);
            } else if (titleLower.includes('alert settings')) {
                data.alerts = this.parseMarkdownTable(tableData);
            } else if (titleLower.includes('notes')) {
                data.notes = lines.slice(1).join('\n').trim();
            }
        }

        // Build sorted FY list
        data.fyList = this.sortFYs(Object.keys(data.fyData));

        // Set flat accessors to latest FY (or non-FY data for backward compat)
        if (data.fyList.length > 0) {
            const latestFY = data.fyList[0];
            const latest = data.fyData[latestFY];
            data.platform = latest.platform;
            data.platformPayHistory = latest.platformPayHistory;
            data.projectBatches = latest.projectBatches;
            data.projectPayHistories = latest.projectPayHistories;
            data.userBatches = latest.userBatches;
            data.userPayHistories = latest.userPayHistories;
        }

        // Backward compat: if no FY data and no platform but has legacy subscriptions
        if (!data.platform && data.projectBatches.length === 0 && data.userBatches.length === 0 && data.subscriptions.length > 0) {
            data.platform = data.subscriptions[0];
        }

        return data;
    },

    /**
     * Parse documents table: | # | Type | File | Uploaded By | Date |
     */
    _parseDocumentsTable(lines) {
        const docs = [];
        for (const line of lines) {
            const match = line.match(/\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
            if (match) {
                docs.push({ number: match[1].trim(), type: match[2].trim(), file: match[3].trim(), uploadedBy: match[4].trim(), date: match[5].trim() });
            }
        }
        return docs;
    },

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

    // ═══════════════════════════════════════════════════════
    // PAYMENT CALCULATIONS
    // ═══════════════════════════════════════════════════════

    /**
     * Calculate payment summary from a payment history array
     * Works for per-subscription or global histories
     */
    calcPaySummaryFromHistory(totalAmount, payHistory) {
        const total = typeof totalAmount === 'string' ? parseFloat(totalAmount.replace(/[^0-9.-]/g, '')) || 0 : (totalAmount || 0);
        let paid = 0;
        if (payHistory) {
            for (const p of payHistory) {
                if (p.status === 'Paid') paid += parseFloat((p.amount || '0').replace(/[^0-9.-]/g, '')) || 0;
            }
        }
        const remaining = Math.max(0, total - paid);
        const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : (paid > 0 ? 100 : 0);

        let status = 'Due';
        if (paid > 0 && (total === 0 || paid >= total)) status = 'Fully Paid';
        else if (paid > 0) status = 'Partially Paid';
        if (payHistory) {
            const today = new Date();
            for (const p of payHistory) {
                if (p.status === 'Due' && p.date && p.date !== '—' && new Date(p.date) < today) { status = 'Overdue'; break; }
            }
        }
        return { totalAmount: total, totalPaid: paid, remaining, percentage: pct, status };
    },

    /**
     * Calculate COMBINED payment summary across all subscriptions + global
     */
    calculatePaymentSummary(payment, paymentHistory, parsed) {
        const contractValue = parseFloat((payment['Contract Value'] || '0').replace(/[^0-9.-]/g, '')) || 0;

        // Sum paid from ALL sources
        let totalPaid = 0;
        const allHistories = [];

        // Per-subscription histories (if parsed is provided)
        if (parsed) {
            if (parsed.platformPayHistory) allHistories.push(...parsed.platformPayHistory);
            if (parsed.projectPayHistories) parsed.projectPayHistories.forEach(h => allHistories.push(...h));
            if (parsed.userPayHistories) parsed.userPayHistories.forEach(h => allHistories.push(...h));
        }

        // Global payment history
        if (paymentHistory) allHistories.push(...paymentHistory);

        for (const p of allHistories) {
            if (p.status === 'Paid') totalPaid += parseFloat((p.amount || '0').replace(/[^0-9.-]/g, '')) || 0;
        }

        // If no histories at all, use stored Total Paid
        if (allHistories.length === 0) {
            totalPaid = parseFloat((payment['Total Paid'] || '0').replace(/[^0-9.-]/g, '')) || 0;
        }

        const remaining = Math.max(0, contractValue - totalPaid);
        const pct = contractValue > 0 ? Math.min(100, Math.round((totalPaid / contractValue) * 100)) : (totalPaid > 0 ? 100 : 0);

        let status = 'Due';
        if (totalPaid > 0 && (contractValue === 0 || totalPaid >= contractValue)) status = 'Fully Paid';
        else if (totalPaid > 0) status = 'Partially Paid';

        // Check overdue across all histories
        const today = new Date();
        for (const p of allHistories) {
            if (p.status === 'Due' && p.date && p.date !== '—' && new Date(p.date) < today) { status = 'Overdue'; break; }
        }

        return { contractValue, totalPaid, remaining, percentage: pct, status };
    },

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
     * Generate payment installments from subscription data
     * Returns array of { number, date, amount, method, receipt, status }
     */
    generateInstallments(amount, startDate, expiryDate, paymentCycle) {
        const totalAmt = typeof amount === 'string' ? parseFloat(amount.replace(/[^0-9.-]/g, '')) || 0 : (amount || 0);
        if (totalAmt <= 0 || !startDate) return [];

        // Calculate cycle months
        let cycleMonths = 12;
        if (paymentCycle === 'Monthly') cycleMonths = 1;
        else if (paymentCycle === 'Quarterly') cycleMonths = 3;
        else if (paymentCycle === 'Annual') cycleMonths = 12;
        else {
            // Custom: extract months from "18 months" or just number
            const m = (paymentCycle || '').match(/(\d+)/);
            if (m) cycleMonths = parseInt(m[1]);
        }

        // Calculate duration
        let durationMonths = 12;
        if (startDate && expiryDate) {
            const s = new Date(startDate + 'T00:00:00');
            const e = new Date(expiryDate + 'T00:00:00');
            durationMonths = Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
        }

        // Number of installments
        const numInstallments = Math.max(1, Math.ceil(durationMonths / cycleMonths));
        const perInstallment = Math.round(totalAmt / numInstallments);

        const installments = [];
        for (let i = 0; i < numInstallments; i++) {
            const d = new Date(startDate + 'T00:00:00');
            d.setMonth(d.getMonth() + (i * cycleMonths));
            const instAmount = i === numInstallments - 1 ? totalAmt - (perInstallment * (numInstallments - 1)) : perInstallment;
            installments.push({
                number: String(i + 1),
                date: this.formatDateApi(d),
                amount: String(instAmount),
                method: '—',
                receipt: '—',
                status: 'Due'
            });
        }
        return installments;
    },

    /**
     * After recording a payment, redistribute remaining amount across "Due" rows
     */
    redistributePayments(payHistory, totalAmount) {
        const total = typeof totalAmount === 'string' ? parseFloat(totalAmount.replace(/[^0-9.-]/g, '')) || 0 : (totalAmount || 0);
        let paid = 0;
        for (const p of payHistory) {
            if (p.status === 'Paid') paid += parseFloat((p.amount || '0').replace(/[^0-9.-]/g, '')) || 0;
        }
        const remaining = Math.max(0, total - paid);
        const dueRows = payHistory.filter(p => p.status === 'Due');
        if (dueRows.length > 0 && remaining > 0) {
            const perDue = Math.round(remaining / dueRows.length);
            for (let i = 0; i < dueRows.length; i++) {
                dueRows[i].amount = String(i === dueRows.length - 1 ? remaining - (perDue * (dueRows.length - 1)) : perDue);
            }
        } else if (dueRows.length > 0 && remaining === 0) {
            // All paid — set due rows to 0
            for (const d of dueRows) d.amount = '0';
        }
        return payHistory;
    },

    // ═══════════════════════════════════════════════════════
    // BODY BUILDER — Per-Subscription Payment Histories
    // ═══════════════════════════════════════════════════════

    /**
     * Build issue body. Supports FY-based output.
     * If subTypes has `fy` property, sections are prefixed with FY.
     * If subTypes has `allFYData` (map of FY → data), builds all FYs.
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

        if (Array.isArray(subTypes)) {
            // Legacy format
            subTypes.forEach((sub, i) => {
                body += this._buildSubSection(subTypes.length > 1 ? `Subscription ${i + 1}` : 'Subscription Details', sub);
            });
        } else if (subTypes.allFYData) {
            // Multi-FY format — write each FY's data with prefix
            const fyList = this.sortFYs(Object.keys(subTypes.allFYData));
            for (const fy of fyList) {
                body += this._buildFYBlock(fy, subTypes.allFYData[fy]);
            }
        } else {
            // Single FY or non-FY format
            const prefix = subTypes.fy ? `${subTypes.fy} ` : '';
            if (subTypes.platform) {
                body += this._buildSubSection(`${prefix}Platform Subscription`, subTypes.platform);
                body += this._buildPayHistorySection(`${prefix}Platform Payment History`, subTypes.platformPayHistory);
            }
            if (subTypes.projectBatches) {
                subTypes.projectBatches.forEach((batch, i) => {
                    body += this._buildBatchSection(`${prefix}Project Batch ${i + 1}`, batch, 'project');
                    const history = subTypes.projectPayHistories ? subTypes.projectPayHistories[i] : null;
                    body += this._buildPayHistorySection(`${prefix}Project Batch ${i + 1} Payment History`, history);
                });
            }
            if (subTypes.userBatches) {
                subTypes.userBatches.forEach((batch, i) => {
                    body += this._buildBatchSection(`${prefix}User Batch ${i + 1}`, batch, 'user');
                    const history = subTypes.userPayHistories ? subTypes.userPayHistories[i] : null;
                    body += this._buildPayHistorySection(`${prefix}User Batch ${i + 1} Payment History`, history);
                });
            }
            // FY documents
            if (subTypes.fy && subTypes.documents && subTypes.documents.length > 0) {
                body += this._buildDocumentsSection(`${prefix}Documents`, subTypes.documents);
            }
        }

        // Global Payment Details
        body += `\n## Payment Details\n| Field | Value |\n|-------|-------|\n`;
        body += `| Contract Value | ${paymentData.contractValue || ''} |\n`;
        body += `| Total Paid | ${paymentData.totalPaid || '0'} |\n`;
        body += `| Remaining | ${paymentData.remaining || ''} |\n`;
        body += `| Payment Status | ${paymentData.status || 'Due'} |\n`;

        if (paymentData.globalPayHistory && paymentData.globalPayHistory.length > 0) {
            body += this._buildPayHistorySection('Payment History', paymentData.globalPayHistory);
        }

        body += `\n## Alert Settings\n| Field | Value |\n|-------|-------|\n`;
        body += `| Alerts Enabled | ${alertData.enabled || 'Yes'} |\n`;
        body += `| Alert Days Before | ${alertData.daysBefore || CONFIG.defaultAlertDays} |\n`;
        body += `| Alert Recipients | ${alertData.recipients || ''} |\n`;

        if (notes) body += `\n## Notes\n${notes}\n`;

        return body;
    },

    /**
     * Build a complete FY block with all its sections
     */
    _buildFYBlock(fy, fyData) {
        let s = '';
        if (fyData.platform) {
            // Add grace period to platform data
            if (fyData.gracePeriod) fyData.platform['Grace Period'] = fyData.gracePeriod;
            s += this._buildSubSection(`${fy} Platform Subscription`, fyData.platform);
            s += this._buildPayHistorySection(`${fy} Platform Payment History`, fyData.platformPayHistory);
        }
        if (fyData.projectBatches) {
            fyData.projectBatches.forEach((batch, i) => {
                s += this._buildBatchSection(`${fy} Project Batch ${i + 1}`, batch, 'project');
                const history = fyData.projectPayHistories ? fyData.projectPayHistories[i] : null;
                s += this._buildPayHistorySection(`${fy} Project Batch ${i + 1} Payment History`, history);
            });
        }
        if (fyData.userBatches) {
            fyData.userBatches.forEach((batch, i) => {
                s += this._buildBatchSection(`${fy} User Batch ${i + 1}`, batch, 'user');
                const history = fyData.userPayHistories ? fyData.userPayHistories[i] : null;
                s += this._buildPayHistorySection(`${fy} User Batch ${i + 1} Payment History`, history);
            });
        }
        if (fyData.documents && fyData.documents.length > 0) {
            s += this._buildDocumentsSection(`${fy} Documents`, fyData.documents);
        }
        return s;
    },

    _buildSubSection(heading, sub) {
        let s = `\n## ${heading}\n| Field | Value |\n|-------|-------|\n`;
        s += `| Subscription Type | ${sub.type || sub['Subscription Type'] || ''} |\n`;
        if (sub.customDuration || sub['Custom Duration']) s += `| Custom Duration | ${sub.customDuration || sub['Custom Duration']} |\n`;
        s += `| Plan Name | ${sub.planName || sub['Plan Name'] || ''} |\n`;
        s += `| Start Date | ${sub.startDate || sub['Start Date'] || ''} |\n`;
        s += `| Expiry Date | ${sub.expiryDate || sub['Expiry Date'] || ''} |\n`;
        if (sub.gracePeriod || sub['Grace Period']) s += `| Grace Period | ${sub.gracePeriod || sub['Grace Period']} |\n`;
        s += `| Billing Date | ${sub.billingDate || sub['Billing Date'] || ''} |\n`;
        s += `| Payment Cycle | ${sub.paymentCycle || sub['Payment Cycle'] || ''} |\n`;
        s += `| Amount | ${sub.amount || sub['Amount'] || ''} |\n`;
        s += `| Currency | ${sub.currency || sub['Currency'] || 'INR'} |\n`;
        s += `| Auto Renew | ${sub.autoRenew || sub['Auto Renew'] || 'No'} |\n`;
        return s;
    },

    _buildDocumentsSection(heading, documents) {
        if (!documents || documents.length === 0) return '';
        let s = `\n## ${heading}\n| # | Type | File | Uploaded By | Date |\n|---|------|------|-------------|------|\n`;
        for (const d of documents) {
            s += `| ${d.number} | ${d.type} | ${d.file} | ${d.uploadedBy} | ${d.date} |\n`;
        }
        return s;
    },

    _buildBatchSection(heading, batch, batchType) {
        let s = `\n## ${heading}\n| Field | Value |\n|-------|-------|\n`;
        s += batchType === 'project' ? `| Projects | ${batch.projects || ''} |\n` : `| Users | ${batch.users || ''} |\n`;
        s += `| Start Date | ${batch.startDate || ''} |\n`;
        s += `| Expiry Date | ${batch.expiryDate || ''} |\n`;
        s += `| Amount | ${batch.amount || ''} |\n`;
        s += `| Currency | ${batch.currency || 'USD'} |\n`;
        s += `| Payment Cycle | ${batch.paymentCycle || ''} |\n`;
        return s;
    },

    _buildPayHistorySection(heading, history) {
        if (!history || history.length === 0) return '';
        let s = `\n## ${heading}\n| # | Date | Amount | Method | Receipt | Status |\n|---|------|--------|--------|---------|--------|\n`;
        for (const p of history) {
            s += `| ${p.number} | ${p.date} | ${p.amount} | ${p.method} | ${p.receipt} | ${p.status} |\n`;
        }
        return s;
    },

    // ═══════════════════════════════════════════════════════
    // EXPIRY HELPERS
    // ═══════════════════════════════════════════════════════

    getAllExpiryItems(parsed) {
        const items = [];
        if (parsed.platform) {
            const expiry = parsed.platform['Expiry Date'] || parsed.platform.expiryDate;
            if (expiry) items.push({ label: 'Platform', expiryDate: expiry, days: this.remainingDays(expiry), type: 'platform' });
        }
        if (parsed.projectBatches) {
            parsed.projectBatches.forEach((b, i) => {
                const expiry = b['Expiry Date'] || b.expiryDate;
                if (expiry) items.push({ label: `Projects: ${b['Projects'] || b.projects || 'Batch ' + (i + 1)}`, expiryDate: expiry, days: this.remainingDays(expiry), type: 'project' });
            });
        }
        if (parsed.userBatches) {
            parsed.userBatches.forEach((b, i) => {
                const expiry = b['Expiry Date'] || b.expiryDate;
                if (expiry) items.push({ label: `Users: ${b['Users'] || b.users || 'Batch ' + (i + 1)}`, expiryDate: expiry, days: this.remainingDays(expiry), type: 'user' });
            });
        }
        if (items.length === 0 && parsed.subscriptions) {
            parsed.subscriptions.forEach((sub, i) => {
                const expiry = sub['Expiry Date'] || sub.expiryDate;
                if (expiry) items.push({ label: sub['Subscription Type'] || 'Subscription ' + (i + 1), expiryDate: expiry, days: this.remainingDays(expiry), type: 'legacy' });
            });
        }
        items.sort((a, b) => a.days - b.days);
        return items;
    },

    getEarliestExpiry(parsed) {
        if (Array.isArray(parsed)) {
            const items = [];
            for (const sub of parsed) { const e = sub['Expiry Date'] || sub.expiryDate; if (e) items.push(e); }
            return items.sort((a, b) => new Date(a) - new Date(b))[0] || null;
        }
        const items = this.getAllExpiryItems(parsed);
        return items.length > 0 ? items[0].expiryDate : null;
    },

    getMostUrgentStatus(parsed) {
        if (Array.isArray(parsed)) {
            const priority = ['expired', 'expiringSoon', 'active'];
            let most = 'active';
            for (const sub of parsed) { const e = sub['Expiry Date'] || sub.expiryDate; if (e) { const s = this.getStatus(e); if (priority.indexOf(s) < priority.indexOf(most)) most = s; } }
            return most;
        }
        const items = this.getAllExpiryItems(parsed);
        if (items.length === 0) return 'active';
        const priority = ['expired', 'expiringSoon', 'active'];
        let most = 'active';
        for (const item of items) { const s = this.getStatus(item.expiryDate); if (priority.indexOf(s) < priority.indexOf(most)) most = s; }
        return most;
    },

    getSoonestExpiringItem(parsed) {
        const items = this.getAllExpiryItems(parsed);
        return items.length > 0 ? items[0] : null;
    },

    // ═══════════════════════════════════════════════════════
    // GENERAL HELPERS
    // ═══════════════════════════════════════════════════════

    debounce(func, wait = 300) {
        let timeout;
        return function (...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); };
    },

    getQueryParam(name) { return new URLSearchParams(window.location.search).get(name); },

    isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); },

    isValidDate(dateStr) { if (!dateStr) return false; return !isNaN(new Date(dateStr).getTime()); },

    isExpiryAfterStart(startDate, expiryDate) { return new Date(expiryDate) > new Date(startDate); },

    timeAgo(dateStr) {
        const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + ' hrs ago';
        if (seconds < 2592000) return Math.floor(seconds / 86400) + ' days ago';
        return this.formatDate(dateStr);
    }
};
