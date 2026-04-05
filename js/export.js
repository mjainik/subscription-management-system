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
            'Subscription Type', 'Plan Name', 'Start Date', 'Expiry Date',
            'Billing Date', 'Payment Cycle', 'Amount', 'Currency',
            'Remaining Days', 'Status', 'Account Manager',
            'Alert Enabled', 'Alert Days'
        ];

        let csv = headers.join(',') + '\n';

        for (const item of data) {
            const parsed = Utils.parseIssueBody(item.body);
            const org = parsed.organization;
            const sub = parsed.subscriptions[0] || {};
            const alerts = parsed.alerts;
            const expiryDate = sub['Expiry Date'] || '';
            const days = expiryDate ? Utils.remainingDays(expiryDate) : '';
            const statusKey = expiryDate ? Utils.getStatus(expiryDate) : '';
            const statusLabel = statusKey ? CONFIG.labels.status[statusKey] : '';

            const row = [
                this.csvEscape(item.title),
                this.csvEscape(org['Contact Email'] || ''),
                this.csvEscape(org['Phone'] || ''),
                this.csvEscape(org['Organization Type'] || ''),
                this.csvEscape(sub['Subscription Type'] || ''),
                this.csvEscape(sub['Plan Name'] || ''),
                this.csvEscape(sub['Start Date'] || ''),
                this.csvEscape(expiryDate),
                this.csvEscape(sub['Billing Date'] || ''),
                this.csvEscape(sub['Payment Cycle'] || ''),
                this.csvEscape(sub['Amount'] || ''),
                this.csvEscape(sub['Currency'] || 'USD'),
                days,
                this.csvEscape(statusLabel),
                this.csvEscape(org['Account Manager'] || ''),
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

        let html = `
            <div style="border-bottom: 3px solid #E8450A; padding-bottom: 10px; margin-bottom: 20px;">
                <h1 style="color: #E8450A; margin: 0;">${Utils.escapeHtml(orgData.title)}</h1>
                <p style="color: #666; margin: 5px 0 0;">Exported on ${Utils.formatDate(new Date().toISOString())}</p>
            </div>

            <h2>Organization Details</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold; width: 200px;">Contact Email</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(org['Contact Email'] || '—')}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold;">Phone</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(org['Phone'] || '—')}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold;">Industry</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(org['Organization Type'] || '—')}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold;">Account Manager</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(org['Account Manager'] || '—')}</td></tr>
            </table>
        `;

        for (let i = 0; i < parsed.subscriptions.length; i++) {
            const sub = parsed.subscriptions[i];
            const heading = parsed.subscriptions.length > 1 ? `Subscription ${i + 1}` : 'Subscription Details';
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

        html += `
            <h2>Alert Settings</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold; width: 200px;">Alerts Enabled</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(alerts['Alerts Enabled'] || 'Yes')}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold;">Alert Days Before</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(alerts['Alert Days Before'] || '60')}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: bold;">Recipients</td><td style="padding: 8px; border: 1px solid #E5E7EB;">${Utils.escapeHtml(alerts['Alert Recipients'] || '—')}</td></tr>
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
