#!/usr/bin/env node
/**
 * Expiry Alert Email Script
 * Runs daily via GitHub Actions. Checks expiring subscriptions and sends
 * email alerts to configured recipients. Uses per-threshold labels to
 * prevent duplicate alerts.
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
if (!ALERT_RECIPIENTS) {
    console.log('⚠️  ALERT_RECIPIENTS not configured. Skipping.');
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
    return res.json();
}

function remainingDays(expiryDate) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate); expiry.setHours(0, 0, 0, 0);
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
}

function parseIssueData(body) {
    const data = { orgName: '', email: '', expiryDate: '', type: '', amount: '' };
    if (!body) return data;

    const nameMatch = body.match(/\|\s*Organization Name\s*\|\s*(.+?)\s*\|/);
    const emailMatch = body.match(/\|\s*Contact Email\s*\|\s*(.+?)\s*\|/);
    const expiryMatch = body.match(/\|\s*Expiry Date\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
    const typeMatch = body.match(/\|\s*Subscription Type\s*\|\s*(.+?)\s*\|/);
    const amountMatch = body.match(/\|\s*Amount\s*\|\s*(.+?)\s*\|/);

    if (nameMatch) data.orgName = nameMatch[1].trim();
    if (emailMatch) data.email = emailMatch[1].trim();
    if (expiryMatch) data.expiryDate = expiryMatch[1].trim();
    if (typeMatch) data.type = typeMatch[1].trim();
    if (amountMatch) data.amount = amountMatch[1].trim();

    return data;
}

function buildEmailHtml(alerts) {
    const rows = alerts.map(a => `
        <tr>
            <td style="padding:10px;border:1px solid #E5E7EB;">${a.orgName}</td>
            <td style="padding:10px;border:1px solid #E5E7EB;">${a.expiryDate}</td>
            <td style="padding:10px;border:1px solid #E5E7EB;font-weight:bold;color:${a.days <= 7 ? '#DC2626' : a.days <= 30 ? '#F59E0B' : '#2563EB'};">${a.days} days</td>
            <td style="padding:10px;border:1px solid #E5E7EB;">${a.type}</td>
            <td style="padding:10px;border:1px solid #E5E7EB;">${a.amount}</td>
            <td style="padding:10px;border:1px solid #E5E7EB;">
                <a href="${APP_URL}/organization/?id=${a.issueNumber}" style="color:#E8450A;">View</a> |
                <a href="https://github.com/${OWNER}/${REPO}/issues/${a.issueNumber}" style="color:#666;">GitHub</a>
            </td>
        </tr>
    `).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family:Inter,-apple-system,sans-serif;color:#1A1D23;margin:0;padding:20px;background:#F8F9FB;">
        <div style="max-width:700px;margin:0 auto;background:white;border-radius:8px;padding:24px;border:1px solid #E5E7EB;">
            <div style="border-bottom:3px solid #E8450A;padding-bottom:12px;margin-bottom:20px;">
                <h1 style="color:#E8450A;margin:0;font-size:20px;">⚠️ Subscription Expiry Alert</h1>
                <p style="color:#6B7280;margin:4px 0 0;font-size:14px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>

            <p style="font-size:14px;">The following subscriptions need attention:</p>

            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
                <thead>
                    <tr style="background:#F8F9FB;">
                        <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Organization</th>
                        <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Expiry Date</th>
                        <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Days Left</th>
                        <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Type</th>
                        <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Amount</th>
                        <th style="padding:10px;border:1px solid #E5E7EB;text-align:left;">Links</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <p style="font-size:13px;color:#6B7280;">
                <a href="${APP_URL}/" style="color:#E8450A;">Open Dashboard</a> to view all subscriptions.
            </p>

            <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;">
            <p style="font-size:11px;color:#9CA3AF;">This is an automated alert from Subscription Manager. Configure alerts in repository settings.</p>
        </div>
    </body>
    </html>`;
}

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
                    threshold,
                    alertLabel
                });
                break; // Only send the most relevant (lowest) threshold
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

    // Build and send email
    const recipients = ALERT_RECIPIENTS.split(',').map(e => e.trim());
    const subject = alertsToSend.length === 1
        ? `⚠️ Subscription Expiring: ${alertsToSend[0].orgName} (${alertsToSend[0].days} days left)`
        : `⚠️ ${alertsToSend.length} Subscriptions Need Attention`;

    try {
        await transporter.sendMail({
            from: SMTP_USER,
            to: recipients.join(', '),
            subject,
            html: buildEmailHtml(alertsToSend),
        });
        console.log(`   ✅ Email sent to: ${recipients.join(', ')}`);
    } catch (error) {
        console.error(`   ❌ Email failed: ${error.message}`);
        // Still mark labels so we don't retry forever
    }

    // Mark alert labels on issues and add audit comments
    for (const alert of alertsToSend) {
        try {
            await api(`/repos/${OWNER}/${REPO}/issues/${alert.issueNumber}/labels`, 'POST', {
                labels: [alert.alertLabel]
            });

            await api(`/repos/${OWNER}/${REPO}/issues/${alert.issueNumber}/comments`, 'POST', {
                body: `📧 **Alert email sent** — ${new Date().toISOString().split('T')[0]}\n\nThreshold: ${alert.threshold} days\nRecipients: ${recipients.join(', ')}\nDays remaining: ${alert.days}`
            });

            console.log(`   ✅ #${alert.issueNumber} "${alert.orgName}" — ${alert.alertLabel} applied`);
        } catch (error) {
            console.error(`   ❌ #${alert.issueNumber} label failed: ${error.message}`);
        }
    }

    console.log(`\n📊 Done: ${alertsToSend.length} alerts processed.`);
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
