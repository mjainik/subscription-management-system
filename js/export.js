/**
 * Export Module
 * CSV and PDF export functionality.
 */
const Export = {

    /**
     * Export data as CSV file
     */
    downloadCSV(data, filename = 'export.csv') {
        const headers = [
            'Org Name', 'Contact Email', 'Phone', 'Organization Type',
            'Contact Person', 'Designation', 'Account Manager',
            'Subscription Type', 'Plan Name', 'Start Date', 'Expiry Date',
            'Billing Date', 'Payment Cycle', 'Amount', 'Currency',
            'Contract Value', 'Total Paid', 'Remaining', 'Payment Status',
            'Remaining Days', 'Status',
            'Deal Source', 'GST/Tax ID', 'Licenses',
            'Alert Enabled', 'Alert Days'
        ];

        let csv = headers.join(',') + '\n';

        for (const item of data) {
            const parsed = Utils.parseIssueBody(item.body);
            const org = parsed.organization;
            const plat = parsed.platform || parsed.subscriptions[0] || {};
            const payment = parsed.payment || {};
            const alerts = parsed.alerts;
            const expiryDate = Utils.getEarliestExpiry(parsed) || '';
            const days = expiryDate ? Utils.remainingDays(expiryDate) : '';
            const statusKey = expiryDate ? Utils.getStatus(expiryDate) : '';
            const statusLabel = statusKey ? CONFIG.labels.status[statusKey] : '';
            const paySummary = Utils.calculatePaymentSummary(payment, parsed.paymentHistory || [], parsed);

            // Subscription types summary
            const subTypeParts = [];
            if (parsed.platform) subTypeParts.push('Platform');
            if (parsed.projectBatches && parsed.projectBatches.length > 0) subTypeParts.push('Projects(' + parsed.projectBatches.length + ')');
            if (parsed.userBatches && parsed.userBatches.length > 0) subTypeParts.push('Users(' + parsed.userBatches.length + ')');
            const subTypeSummary = subTypeParts.join(' + ') || (plat['Subscription Type'] || '');

            const row = [
                this.csvEscape(item.title),
                this.csvEscape(org['Contact Email'] || ''),
                this.csvEscape(org['Phone'] || ''),
                this.csvEscape(org['Organization Type'] || ''),
                this.csvEscape(org['Contact Person'] || ''),
                this.csvEscape(org['Designation'] || ''),
                this.csvEscape(org['Account Manager'] || ''),
                this.csvEscape(subTypeSummary),
                this.csvEscape(plat['Plan Name'] || ''),
                this.csvEscape(plat['Start Date'] || ''),
                this.csvEscape(expiryDate),
                this.csvEscape(plat['Billing Date'] || ''),
                this.csvEscape(plat['Payment Cycle'] || ''),
                this.csvEscape(plat['Amount'] || ''),
                this.csvEscape(plat['Currency'] || 'USD'),
                this.csvEscape(payment['Contract Value'] || ''),
                this.csvEscape(String(paySummary.totalPaid)),
                this.csvEscape(String(paySummary.remaining)),
                this.csvEscape(paySummary.status),
                this.csvEscape(String(days)),
                this.csvEscape(statusLabel),
                this.csvEscape(org['Deal Source'] || ''),
                this.csvEscape(org['GST/Tax ID'] || ''),
                this.csvEscape(org['Number of Licenses'] || ''),
                this.csvEscape(alerts['Alerts Enabled'] || 'Yes'),
                this.csvEscape(alerts['Alert Days Before'] || '60')
            ];

            csv += row.join(',') + '\n';
        }

        this.downloadFile(csv, filename, 'text/csv;charset=utf-8;');
    },

    /**
     * Escape a CSV value
     */
    csvEscape(value) {
        if (!value) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    },

    /**
     * Export current page as PDF
     */
    async downloadPDF(elementId, filename = 'report.pdf') {
        const element = document.getElementById(elementId);
        if (!element) {
            Toast.show('Could not find content to export.', 'error');
            return;
        }

        // Check if html2pdf is available
        if (typeof html2pdf === 'undefined') {
            Toast.show('PDF export library not loaded. Please try again.', 'error');
            return;
        }

        Toast.show('Generating PDF...', 'info');

        const opt = {
            margin: [10, 10, 10, 10],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                logging: false
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'landscape'
            }
        };

        try {
            await html2pdf().set(opt).from(element).save();
            Toast.show('PDF downloaded successfully!', 'success');
        } catch (error) {
            Toast.show('Failed to generate PDF: ' + error.message, 'error');
        }
    },

    /**
     * Export single organization detail as PDF
     */
    async downloadOrgPDF(orgData, filename) {
        const container = document.createElement('div');
        container.style.padding = '20px';
        container.style.fontFamily = 'Inter, sans-serif';
        container.style.color = '#1A1D23';

        const parsed = Utils.parseIssueBody(orgData.body);
        const org = parsed.organization;
        const alerts = parsed.alerts;
        const payment = parsed.payment || {};
        const payHistory = parsed.paymentHistory || [];
        const paySummary = Utils.calculatePaymentSummary(payment, payHistory, parsed);
        const plat = parsed.platform || parsed.subscriptions[0] || {};

        const tdStyle = 'padding: 8px; border: 1px solid #E5E7EB;';
        const thStyle = `${tdStyle} font-weight: bold; width: 200px;`;

        let html = `
            <div style="border-bottom: 3px solid #E8450A; padding-bottom: 10px; margin-bottom: 20px;">
                <h1 style="color: #E8450A; margin: 0;">${Utils.escapeHtml(orgData.title)}</h1>
                <p style="color: #666; margin: 5px 0 0;">Exported on ${Utils.formatDate(new Date().toISOString())}</p>
            </div>

            <h2>Organization Details</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr><td style="${thStyle}">Contact Person</td><td style="${tdStyle}">${Utils.escapeHtml(org['Contact Person'] || '—')}</td></tr>
                <tr><td style="${thStyle}">Designation</td><td style="${tdStyle}">${Utils.escapeHtml(org['Designation'] || '—')}</td></tr>
                <tr><td style="${thStyle}">Contact Email</td><td style="${tdStyle}">${Utils.escapeHtml(org['Contact Email'] || '—')}</td></tr>
                <tr><td style="${thStyle}">Phone</td><td style="${tdStyle}">${Utils.escapeHtml(org['Phone'] || '—')}</td></tr>
                <tr><td style="${thStyle}">Organization Type</td><td style="${tdStyle}">${Utils.escapeHtml(org['Organization Type'] || '—')}</td></tr>
                <tr><td style="${thStyle}">Account Manager</td><td style="${tdStyle}">${Utils.escapeHtml(org['Account Manager'] || '—')}</td></tr>
                <tr><td style="${thStyle}">GST/Tax ID</td><td style="${tdStyle}">${Utils.escapeHtml(org['GST/Tax ID'] || '—')}</td></tr>
                <tr><td style="${thStyle}">Deal Source</td><td style="${tdStyle}">${Utils.escapeHtml(org['Deal Source'] || '—')}</td></tr>
            </table>
        `;

        // Collect all subscription items for PDF
        const pdfSubItems = [];
        if (parsed.platform) pdfSubItems.push({ heading: 'Platform Subscription', sub: parsed.platform });
        (parsed.projectBatches || []).forEach((b, i) => pdfSubItems.push({ heading: `Project Batch ${i+1}: ${b['Projects'] || ''}`, sub: b }));
        (parsed.userBatches || []).forEach((b, i) => pdfSubItems.push({ heading: `User Batch ${i+1}: ${b['Users'] || ''}`, sub: b }));
        // Fallback: legacy subscriptions
        if (pdfSubItems.length === 0) {
            parsed.subscriptions.forEach((s, i) => pdfSubItems.push({ heading: parsed.subscriptions.length > 1 ? `Subscription ${i+1}` : 'Subscription Details', sub: s }));
        }

        for (let i = 0; i < pdfSubItems.length; i++) {
            const sub = pdfSubItems[i].sub;
            const heading = pdfSubItems[i].heading;
            const expiryDate = sub['Expiry Date'] || '';
            const days = expiryDate ? Utils.remainingDays(expiryDate) : '—';
            const status = expiryDate ? Utils.getStatus(expiryDate) : '';
            const statusColors = { active: '#16A34A', expiringSoon: '#F59E0B', expired: '#DC2626' };

            html += `
                <h2>${heading}</h2>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold; width: 200px;">Type</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(sub['Subscription Type'] || '—')}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold;">Plan</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(sub['Plan Name'] || '—')}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold;">Start Date</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(sub['Start Date'] || '—')}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold;">Expiry Date</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(expiryDate || '—')}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold;">Remaining Days</td><td style="padding: 8px; border: 1px solid #E5E7EB; color: ${statusColors[status] || '#1A1D23'}; font-weight: bold;">${days}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold;">Amount</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(sub['Amount'] || '—')}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold;">Payment Cycle</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(sub['Payment Cycle'] || '—')}</td></tr>
                </table>
            `;
        }

        // Payment Summary
        html += `
            <h2>Payment Summary</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr><td style="${thStyle}">Contract Value</td><td style="${tdStyle}">${Utils.formatCurrency(paySummary.contractValue)}</td></tr>
                <tr><td style="${thStyle}">Total Paid</td><td style="${tdStyle} color: #16A34A; font-weight: bold;">${Utils.formatCurrency(paySummary.totalPaid)}</td></tr>
                <tr><td style="${thStyle}">Remaining</td><td style="${tdStyle} color: ${paySummary.remaining > 0 ? '#F59E0B' : '#16A34A'}; font-weight: bold;">${Utils.formatCurrency(paySummary.remaining)}</td></tr>
                <tr><td style="${thStyle}">Payment Status</td><td style="${tdStyle}">${paySummary.status}</td></tr>
                <tr><td style="${thStyle}">Collection</td><td style="${tdStyle}">${paySummary.percentage}%</td></tr>
            </table>
        `;

        // Per-Subscription Payment Histories
        const allPaySections = [];
        if (parsed.platformPayHistory && parsed.platformPayHistory.length > 0) allPaySections.push({ label: 'Platform Payments', history: parsed.platformPayHistory });
        (parsed.projectPayHistories || []).forEach((h, i) => { if (h && h.length > 0) allPaySections.push({ label: `Project Batch ${i+1} Payments`, history: h }); });
        (parsed.userPayHistories || []).forEach((h, i) => { if (h && h.length > 0) allPaySections.push({ label: `User Batch ${i+1} Payments`, history: h }); });
        if (payHistory.length > 0) allPaySections.push({ label: 'Other Payments', history: payHistory });

        for (const sec of allPaySections) {
            html += `<h2>${sec.label}</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr style="background: #F8F9FB;">
                    <th style="${tdStyle} text-align: left;">#</th><th style="${tdStyle} text-align: left;">Date</th>
                    <th style="${tdStyle} text-align: left;">Amount</th><th style="${tdStyle} text-align: left;">Method</th>
                    <th style="${tdStyle} text-align: left;">Receipt</th><th style="${tdStyle} text-align: left;">Status</th>
                </tr>
                ${sec.history.map(p => `<tr>
                    <td style="${tdStyle}">${Utils.escapeHtml(p.number)}</td><td style="${tdStyle}">${Utils.formatDate(p.date)}</td>
                    <td style="${tdStyle}">${Utils.escapeHtml(p.amount)}</td><td style="${tdStyle}">${Utils.escapeHtml(p.method)}</td>
                    <td style="${tdStyle}">${Utils.escapeHtml(p.receipt)}</td><td style="${tdStyle}">${Utils.escapeHtml(p.status)}</td>
                </tr>`).join('')}
            </table>`;
        }

        html += `
            <h2>Alert Settings</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="${thStyle}">Alerts Enabled</td><td style="${tdStyle}">${Utils.escapeHtml(alerts['Alerts Enabled'] || 'Yes')}</td></tr>
                <tr><td style="${thStyle}">Alert Days Before</td><td style="${tdStyle}">${Utils.escapeHtml(alerts['Alert Days Before'] || '60')}</td></tr>
                <tr><td style="${thStyle}">Recipients</td><td style="${tdStyle}">${Utils.escapeHtml(alerts['Alert Recipients'] || '—')}</td></tr>
            </table>
        `;

        container.innerHTML = html;
        document.body.appendChild(container);

        try {
            await html2pdf().set({
                margin: [15, 15, 15, 15],
                filename: filename || `${orgData.title.replace(/\s+/g, '-').toLowerCase()}-details.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }).from(container).save();

            Toast.show('PDF downloaded!', 'success');
        } catch (error) {
            Toast.show('Failed to generate PDF.', 'error');
        } finally {
            document.body.removeChild(container);
        }
    },

    /**
     * Trigger file download
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        Toast.show(`Downloaded ${filename}`, 'success');
    }
};
