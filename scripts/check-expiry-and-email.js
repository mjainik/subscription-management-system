#!/usr/bin/env node
/**
 * Expiry Alert Email Script
 * Runs daily via GitHub Actions. Checks expiring subscriptions and sends:
 * 1. Global summary email to ALERT_RECIPIENTS (your team)
 * 2. Per-organization email to org-specific Alert Recipients
 * Uses per-threshold labels to prevent duplicate alerts.
 */

const nodemailer = require('nodemailer');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ALERT_RECIPIENTS = process.env.ALERT_RECIPIENTS;

if (!GITHUB_TOKEN) { console.error('❌ GITHUB_TOKEN required'); process.exit(1); }
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log('⚠️  SMTP credentials not configured. Skipping email alerts.');
    process.exit(0);
}

const OWNER = 'mjainik';
const REPO = 'subscription-management-system';
const API = 'https://api.github.com';
const APP_URL = `https://${OWNER}.github.io/${REPO}`;

const THRESHOLDS = [90, 60, 30, 7, 0];
const ALERT_LABELS = {
    90: '📧 Alert 90d Sent',
    60: '📧 Alert 60d Sent',
    30: '📧 Alert 30d Sent',
    7: '📧 Alert 7d Sent',
    0: '📧 Alert 0d Sent'
};

async function api(endpoint, method = 'GET', body = null) {
    const opts = {
        method,
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
        },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${endpoint}`, opts);
    if (res.status === 204) return null;
    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`API ${method} ${endpoint}: ${res.status} — ${errBody.substring(0, 200)}`);
    }
    return res.json();
}

function remainingDays(expiryDate) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate); expiry.setHours(0, 0, 0, 0);
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
}

function parseIssueData(body) {
    const data = {
        orgName: '', email: '', expiryDate: '', type: '', amount: '',
        alertEnabled: 'Yes', alertDays: '60', alertRecipients: '',
        contactPerson: '', accountManager: '', contractValue: '',
        totalPaid: '', remaining: '', payStatus: ''
    };
    if (!body) return data;

    const fields = {
        'Organization Name': 'orgName',
        'Contact Email': 'email',
        'Expiry Date': 'expiryDate',
        'Subscription Type': 'type',
        'Amount': 'amount',
        'Alerts Enabled': 'alertEnabled',
        'Alert Days Before': 'alertDays',
        'Alert Recipients': 'alertRecipients',
        'Contact Person': 'contactPerson',
        'Account Manager': 'accountManager',
        'Contract Value': 'contractValue',
        'Total Paid': 'totalPaid',
        'Remaining': 'remaining',
        'Payment Status': 'payStatus'
    };

    for (const [mdField, jsField] of Object.entries(fields)) {
        const regex = new RegExp(`\\|\\s*${mdField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*(.+?)\\s*\\|`);
        const match = body.match(regex);
        if (match) data[jsField] = match[1].trim();
    }

    return data;
}

// ─── Email Templates ─────────────────────────────────────

function buildTeamEmailHtml(alerts) {
    const rows = alerts.map(a => `
        <tr>
            <td style="padding:10px;border:1px solid #E5E7EB;">${a.orgName}</td>
            <td style="padding:10px;border:1px solid #E5E7EB;">${a.expiryDate}</td>
            <td style="padding:10px;border:1px solid #E5E7EB;font-weight:bold;color:${a.days <= 7 ? '#DC2626' : a.days <= 30 ? '#F59E0B' : '#2563EB'};">${a.days} days</td>
            <td style="padding:10px;border:1px solid #E5E7EB;">${a.type}</td>
            <td style="padding:10px;border:1px solid #E5E7EB;">${a.amount}</td>
            <td style="padding:10px;border:1px solid #E5E7EB;">${a.contractValue || '—'}</td>
            <td style="padding:10px;border:1px solid #E5E7EB;">${a.payStatus || '—'}</td>
            <td style="padding:10px;border:1px solid #E5E7EB;">
                <a href="${APP_URL}/organization/?id=${a.issueNumber}" style="color:#E8450A;">View</a>
            </td>
        </tr>
    `).join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
    <body style="font-family:Inter,-apple-system,sans-serif;color:#1A1D23;margin:0;padding:20px;background:#F8F9FB;">
        <div style="max-width:800px;margin:0 auto;background:white;border-radius:8px;padding:24px;border:1px solid #E5E7EB;">
            <div style="border-bottom:3px solid #E8450A;padding-bottom:12px;margin-bottom:20px;">
                <h1 style="color:#E8450A;margin:0;font-size:20px;">⚠️ Subscription Expiry Alert — Team Summary</h1>
                <p style="color:#6B7280;margin:4px 0 0;font-size:14px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <p style="font-size:14px;">The following <strong>${alerts.length}</strong> subscription(s) need attention:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
                <thead><tr style="background:#F8F9FB;">
                    <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Organization</th>
                    <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Expiry</th>
                    <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Days Left</th>
                    <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Type</th>
                    <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Amount</th>
                    <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Contract</th>
                    <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Payment</th>
                    <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Action</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p style="font-size:13px;color:#6B7280;"><a href="${APP_URL}/" style="color:#E8450A;">Open Dashboard</a> to view all subscriptions.</p>
            <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;">
            <p style="font-size:11px;color:#9CA3AF;">Automated alert from Subscription Manager.</p>
        </div>
    </body></html>`;
}

function buildOrgEmailHtml(alert) {
    const urgencyColor = alert.days <= 7 ? '#DC2626' : alert.days <= 30 ? '#F59E0B' : '#2563EB';
    const urgencyText = alert.days <= 0 ? 'EXPIRED' : alert.days <= 7 ? 'CRITICAL' : alert.days <= 30 ? 'URGENT' : 'ATTENTION';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
    <body style="font-family:Inter,-apple-system,sans-serif;color:#1A1D23;margin:0;padding:20px;background:#F8F9FB;">
        <div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;padding:24px;border:1px solid #E5E7EB;">
            <div style="border-bottom:3px solid ${urgencyColor};padding-bottom:12px;margin-bottom:20px;">
                <h1 style="color:${urgencyColor};margin:0;font-size:20px;">⚠️ Subscription Expiry Notice — ${urgencyText}</h1>
                <p style="color:#6B7280;margin:4px 0 0;font-size:14px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            <h2 style="font-size:18px;margin:0 0 16px;">${alert.orgName}</h2>

            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
                <tr><td style="padding:10px;border:1px solid #E5E7EB;font-weight:bold;width:160px;">Expiry Date</td><td style="padding:10px;border:1px solid #E5E7EB;">${alert.expiryDate}</td></tr>
                <tr><td style="padding:10px;border:1px solid #E5E7EB;font-weight:bold;">Days Remaining</td><td style="padding:10px;border:1px solid #E5E7EB;color:${urgencyColor};font-weight:bold;">${alert.days <= 0 ? 'Expired' : alert.days + ' days'}</td></tr>
                <tr><td style="padding:10px;border:1px solid #E5E7EB;font-weight:bold;">Subscription Type</td><td style="padding:10px;border:1px solid #E5E7EB;">${alert.type}</td></tr>
                <tr><td style="padding:10px;border:1px solid #E5E7EB;font-weight:bold;">Amount</td><td style="padding:10px;border:1px solid #E5E7EB;">${alert.amount}</td></tr>
                ${alert.contractValue ? `<tr><td style="padding:10px;border:1px solid #E5E7EB;font-weight:bold;">Contract Value</td><td style="padding:10px;border:1px solid #E5E7EB;">${alert.contractValue}</td></tr>` : ''}
                ${alert.remaining ? `<tr><td style="padding:10px;border:1px solid #E5E7EB;font-weight:bold;">Remaining Payment</td><td style="padding:10px;border:1px solid #E5E7EB;">${alert.remaining}</td></tr>` : ''}
                ${alert.accountManager ? `<tr><td style="padding:10px;border:1px solid #E5E7EB;font-weight:bold;">Account Manager</td><td style="padding:10px;border:1px solid #E5E7EB;">${alert.accountManager}</td></tr>` : ''}
            </table>

            <p style="font-size:14px;">Please take action to renew this subscription before it expires.</p>

            <div style="margin:20px 0;">
                <a href="${APP_URL}/organization/?id=${alert.issueNumber}" style="display:inline-block;padding:10px 24px;background:#E8450A;color:white;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Details</a>
            </div>

            <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;">
            <p style="font-size:11px;color:#9CA3AF;">Automated alert from Subscription Manager. <a href="${APP_URL}/" style="color:#9CA3AF;">Open Dashboard</a></p>
        </div>
    </body></html>`;
}

// ─── Main ────────────────────────────────────────────────

async function main() {
    console.log('📧 Checking expiring subscriptions for email alerts...\n');

    // Get all open issues
    let page = 1;
    let allIssues = [];
    while (true) {
        const issues = await api(`/repos/${OWNER}/${REPO}/issues?state=open&per_page=100&page=${page}`);
        if (!issues || issues.length === 0) break;
        allIssues = allIssues.concat(issues.filter(i => !i.pull_request));
        page++;
    }

    console.log(`Found ${allIssues.length} open issues.\n`);

    const alertsToSend = [];

    for (const issue of allIssues) {
        const labels = issue.labels.map(l => l.name);

        // Skip if Renewal In Progress
        if (labels.includes('🔄 Renewal In Progress')) continue;

        const data = parseIssueData(issue.body);
        if (!data.expiryDate) continue;

        // Skip if alerts disabled for this org
        if (data.alertEnabled === 'No') {
            console.log(`   ⏭️  #${issue.number} "${data.orgName}" — Alerts disabled`);
            continue;
        }

        const days = remainingDays(data.expiryDate);

        // Check each threshold
        for (const threshold of THRESHOLDS) {
            const alertLabel = ALERT_LABELS[threshold];

            // Already sent?
            if (labels.includes(alertLabel)) continue;

            // Should we send this alert?
            if (days <= threshold) {
                alertsToSend.push({
                    issueNumber: issue.number,
                    orgName: data.orgName || issue.title,
                    expiryDate: data.expiryDate,
                    days,
                    type: data.type || '—',
                    amount: data.amount || '—',
                    contractValue: data.contractValue || '',
                    totalPaid: data.totalPaid || '',
                    remaining: data.remaining || '',
                    payStatus: data.payStatus || '',
                    accountManager: data.accountManager || '',
                    contactPerson: data.contactPerson || '',
                    orgRecipients: data.alertRecipients || '',
                    threshold,
                    alertLabel
                });
                break; // Only send the most relevant threshold
            }
        }
    }

    if (alertsToSend.length === 0) {
        console.log('✅ No new alerts to send.');
        return;
    }

    console.log(`📨 Sending alerts for ${alertsToSend.length} organizations...\n`);

    // Setup email transporter
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: 587,
        secure: false,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    // ─── 1. Send GLOBAL team email (summary of all expiring orgs) ───
    if (ALERT_RECIPIENTS) {
        const globalRecipients = ALERT_RECIPIENTS.split(',').map(e => e.trim()).filter(Boolean);

        if (globalRecipients.length > 0) {
            const subject = alertsToSend.length === 1
                ? `⚠️ Subscription Expiring: ${alertsToSend[0].orgName} (${alertsToSend[0].days} days left)`
                : `⚠️ ${alertsToSend.length} Subscriptions Need Attention`;

            try {
                await transporter.sendMail({
                    from: SMTP_USER,
                    to: globalRecipients.join(', '),
                    subject,
                    html: buildTeamEmailHtml(alertsToSend),
                });
                console.log(`   ✅ Team email sent to: ${globalRecipients.join(', ')}`);
            } catch (error) {
                console.error(`   ❌ Team email failed: ${error.message}`);
            }
        }
    }

    // ─── 2. Send PER-ORG emails to org-specific recipients ───
    for (const alert of alertsToSend) {
        const allNotified = [];

        // Parse org-specific recipients
        if (alert.orgRecipients) {
            const orgEmails = alert.orgRecipients.split(',').map(e => e.trim()).filter(Boolean);

            // Remove global recipients to avoid duplicate emails
            const globalSet = new Set((ALERT_RECIPIENTS || '').split(',').map(e => e.trim()));
            const uniqueOrgEmails = orgEmails.filter(e => !globalSet.has(e));

            if (uniqueOrgEmails.length > 0) {
                const orgSubject = `⚠️ Subscription Expiry Notice: ${alert.orgName} — ${alert.days <= 0 ? 'EXPIRED' : alert.days + ' days remaining'}`;

                try {
                    await transporter.sendMail({
                        from: SMTP_USER,
                        to: uniqueOrgEmails.join(', '),
                        subject: orgSubject,
                        html: buildOrgEmailHtml(alert),
                    });
                    console.log(`   ✅ Org email for "${alert.orgName}" sent to: ${uniqueOrgEmails.join(', ')}`);
                    allNotified.push(...uniqueOrgEmails);
                } catch (error) {
                    console.error(`   ❌ Org email for "${alert.orgName}" failed: ${error.message}`);
                }
            }
        }

        // ─── 3. Mark label + add audit comment ───
        try {
            await api(`/repos/${OWNER}/${REPO}/issues/${alert.issueNumber}/labels`, 'POST', {
                labels: [alert.alertLabel]
            });

            const globalList = (ALERT_RECIPIENTS || '').split(',').map(e => e.trim()).filter(Boolean);

            await api(`/repos/${OWNER}/${REPO}/issues/${alert.issueNumber}/comments`, 'POST', {
                body: `📧 **Alert email sent** — ${new Date().toISOString().replace('T', ' ').substring(0, 19)}\n\n**${alert.threshold}d threshold** · ${alert.days} days remaining · Team: ${globalList.join(', ') || 'None'} · Org: ${allNotified.length > 0 ? allNotified.join(', ') : 'None'}`
            });

            console.log(`   ✅ #${alert.issueNumber} "${alert.orgName}" — ${alert.alertLabel} applied`);
        } catch (error) {
            console.error(`   ❌ #${alert.issueNumber} label/comment failed: ${error.message}`);
        }
    }

    console.log(`\n📊 Done: ${alertsToSend.length} alerts processed.`);
    console.log(`   Team email: ${ALERT_RECIPIENTS ? 'Sent' : 'Skipped (no ALERT_RECIPIENTS)'}`);
    console.log(`   Per-org emails: ${alertsToSend.filter(a => a.orgRecipients).length} organizations had specific recipients`);
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
