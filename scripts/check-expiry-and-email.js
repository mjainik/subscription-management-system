#!/usr/bin/env node
/**
 * DigiQC SubManager — Daily Report & Alert Email Script
 * Runs daily at 12:01 AM IST via GitHub Actions.
 * Sends:
 *   1. Daily Report email to team (ALERT_RECIPIENTS) — full summary
 *   2. Per-org alert email to org-specific recipients — individual notices
 */

const nodemailer = require('nodemailer');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ALERT_RECIPIENTS = process.env.ALERT_RECIPIENTS;

if (!GITHUB_TOKEN) { console.error('❌ GITHUB_TOKEN required'); process.exit(1); }
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) { console.log('⚠️  SMTP credentials not configured. Skipping.'); process.exit(0); }

const OWNER = 'mjainik';
const REPO = 'subscription-management-system';
const API = 'https://api.github.com';
const APP_URL = `https://${OWNER}.github.io/${REPO}`;

const THRESHOLDS = [90, 60, 30, 7, 0];
const ALERT_LABELS = { 90: '📧 Alert 90d Sent', 60: '📧 Alert 60d Sent', 30: '📧 Alert 30d Sent', 7: '📧 Alert 7d Sent', 0: '📧 Alert 0d Sent' };

async function api(endpoint, method = 'GET', body = null) {
    const opts = { method, headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${endpoint}`, opts);
    if (res.status === 204) return null;
    if (!res.ok) { const e = await res.text().catch(() => ''); throw new Error(`API ${method} ${endpoint}: ${res.status} — ${e.substring(0, 200)}`); }
    return res.json();
}

function remainingDays(expiryDate) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate); expiry.setHours(0, 0, 0, 0);
    return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

function formatAmount(val) {
    const num = parseFloat(String(val || '0').replace(/[^0-9.-]/g, '')) || 0;
    if (num === 0) return '—';
    if (num >= 10000000) return (num / 10000000).toFixed(1) + ' Cr';
    if (num >= 100000) return (num / 100000).toFixed(1) + ' L';
    if (num >= 1000) return (num / 1000).toFixed(1) + ' K';
    return num.toLocaleString();
}

function parseIssueData(body) {
    const data = { orgName: '', email: '', expiryDate: '', type: '', amount: '', alertEnabled: 'Yes', alertDays: '60', alertRecipients: '', contactPerson: '', accountManager: '', contractValue: '', totalPaid: '', remaining: '', payStatus: '' };
    if (!body) return data;
    const fields = { 'Organization Name': 'orgName', 'Contact Email': 'email', 'Expiry Date': 'expiryDate', 'Subscription Type': 'type', 'Amount': 'amount', 'Alerts Enabled': 'alertEnabled', 'Alert Days Before': 'alertDays', 'Alert Recipients': 'alertRecipients', 'Contact Person': 'contactPerson', 'Account Manager': 'accountManager', 'Contract Value': 'contractValue', 'Total Paid': 'totalPaid', 'Remaining': 'remaining', 'Payment Status': 'payStatus' };
    for (const [mdField, jsField] of Object.entries(fields)) {
        const regex = new RegExp(`\\|\\s*${mdField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*(.+?)\\s*\\|`);
        const match = body.match(regex);
        if (match) data[jsField] = match[1].trim();
    }
    return data;
}

// ─── Daily Report Email (Team) ─────────────────────────

function buildDailyReportHtml(allOrgs, alertsToSend) {
    const today = new Date();
    const dateStr = formatDate(today.toISOString());
    const td = 'padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;';
    const th = `${td}font-weight:700;color:#6B7280;text-align:left;`;

    // Categorize (with grace period awareness)
    const inGrace = allOrgs.filter(o => o.days <= 0 && Math.abs(o.days) <= 7); // within 7-day grace
    const expired = allOrgs.filter(o => o.days <= 0 && Math.abs(o.days) > 7); // past grace
    const thisWeek = allOrgs.filter(o => o.days > 0 && o.days <= 7);
    const thisMonth = allOrgs.filter(o => o.days > 7 && o.days <= 30);
    const upcoming = allOrgs.filter(o => o.days > 30 && o.days <= 90);
    const overdue = allOrgs.filter(o => o.payStatus === 'Overdue');

    // Summary numbers
    const totalOrgs = allOrgs.length;
    const active = allOrgs.filter(o => o.days > 90).length;
    const expiringSoon = allOrgs.filter(o => o.days > 0 && o.days <= 90).length;

    let totalContract = 0, totalCollected = 0, totalRemaining = 0, totalOverdue = 0;
    for (const o of allOrgs) {
        totalContract += parseFloat(String(o.contractValue || '0').replace(/[^0-9.-]/g, '')) || 0;
        totalCollected += parseFloat(String(o.totalPaid || '0').replace(/[^0-9.-]/g, '')) || 0;
        totalRemaining += parseFloat(String(o.remaining || '0').replace(/[^0-9.-]/g, '')) || 0;
    }
    for (const o of overdue) totalOverdue += parseFloat(String(o.remaining || '0').replace(/[^0-9.-]/g, '')) || 0;
    const collPct = totalContract > 0 ? Math.round((totalCollected / totalContract) * 100) : 0;

    function orgRow(o) {
        const color = o.days <= 0 ? '#DC2626' : o.days <= 7 ? '#DC2626' : o.days <= 30 ? '#F59E0B' : '#2563EB';
        const daysText = o.days <= 0 ? `<strong style="color:#DC2626;">Expired ${Math.abs(o.days)}d ago</strong>` : `<strong style="color:${color};">${o.days} days left</strong>`;
        return `<tr>
            <td style="${td}"><a href="${APP_URL}/organization/?id=${o.issueNumber}" style="color:#E8450A;font-weight:600;text-decoration:none;">${o.orgName}</a></td>
            <td style="${td}">${daysText}</td>
            <td style="${td}">${formatAmount(o.contractValue)}</td>
            <td style="${td}">${formatAmount(o.totalPaid)} ${o.contractValue ? '(' + (parseFloat(String(o.contractValue).replace(/[^0-9.-]/g,''))||1 > 0 ? Math.round((parseFloat(String(o.totalPaid||'0').replace(/[^0-9.-]/g,''))||0) / (parseFloat(String(o.contractValue).replace(/[^0-9.-]/g,''))||1) * 100) : 0) + '%)' : ''}</td>
            <td style="${td}">${o.accountManager || '—'}</td>
        </tr>`;
    }

    function sectionHtml(icon, title, color, orgs) {
        if (orgs.length === 0) return '';
        return `
        <div style="margin:24px 0;">
            <h2 style="font-size:15px;color:${color};margin:0 0 12px;border-bottom:2px solid ${color};padding-bottom:8px;">${icon} ${title} (${orgs.length})</h2>
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr><th style="${th}">Organization</th><th style="${th}">Status</th><th style="${th}">Contract</th><th style="${th}">Paid</th><th style="${th}">Manager</th></tr></thead>
                <tbody>${orgs.map(orgRow).join('')}</tbody>
            </table>
        </div>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
    <body style="font-family:Inter,-apple-system,sans-serif;color:#1A1D23;margin:0;padding:20px;background:#F8F9FB;">
        <div style="max-width:800px;margin:0 auto;background:white;border-radius:12px;padding:0;border:1px solid #E5E7EB;overflow:hidden;">

            <!-- Header -->
            <div style="background:#E8450A;padding:20px 24px;color:white;">
                <h1 style="margin:0;font-size:20px;font-weight:800;">DigiQC SubManager — Daily Report</h1>
                <p style="margin:6px 0 0;font-size:14px;opacity:0.9;">${dateStr}</p>
            </div>

            <div style="padding:24px;">

            <!-- Snapshot -->
            <div style="background:#F8F9FB;border-radius:8px;padding:20px;margin-bottom:24px;">
                <h3 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#6B7280;">Today's Snapshot</h3>
                <table style="width:100%;font-size:14px;">
                    <tr>
                        <td style="padding:4px 0;"><strong>Total Organizations:</strong> ${totalOrgs}</td>
                        <td style="padding:4px 0;">Active: <strong style="color:#16A34A;">${active}</strong></td>
                        <td style="padding:4px 0;">Expiring: <strong style="color:#F59E0B;">${expiringSoon}</strong></td>
                        <td style="padding:4px 0;">Expired: <strong style="color:#DC2626;">${expired.length}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding:4px 0;"><strong>Contract Value:</strong> ${formatAmount(totalContract)}</td>
                        <td style="padding:4px 0;">Collected: <strong style="color:#16A34A;">${formatAmount(totalCollected)} (${collPct}%)</strong></td>
                        <td style="padding:4px 0;">Remaining: <strong style="color:#F59E0B;">${formatAmount(totalRemaining)}</strong></td>
                        <td style="padding:4px 0;">Overdue: <strong style="color:#DC2626;">${formatAmount(totalOverdue)}</strong></td>
                    </tr>
                </table>
            </div>

            <!-- Sections by urgency -->
            ${sectionHtml('🔴', 'EXPIRED — Action Required NOW', '#DC2626', expired)}
            ${sectionHtml('⏳', 'IN GRACE PERIOD — Renew Immediately', '#F59E0B', inGrace)}
            ${sectionHtml('🟡', 'EXPIRING THIS WEEK (1-7 days)', '#F59E0B', thisWeek)}
            ${sectionHtml('🟠', 'EXPIRING THIS MONTH (8-30 days)', '#EA580C', thisMonth)}

            ${overdue.length > 0 ? `
            <div style="margin:24px 0;">
                <h2 style="font-size:15px;color:#DC2626;margin:0 0 12px;border-bottom:2px solid #DC2626;padding-bottom:8px;">💰 OVERDUE PAYMENTS (${overdue.length})</h2>
                <table style="width:100%;border-collapse:collapse;">
                    <thead><tr><th style="${th}">Organization</th><th style="${th}">Remaining</th><th style="${th}">Manager</th></tr></thead>
                    <tbody>${overdue.map(o => `<tr>
                        <td style="${td}"><a href="${APP_URL}/organization/?id=${o.issueNumber}" style="color:#E8450A;font-weight:600;text-decoration:none;">${o.orgName}</a></td>
                        <td style="${td} color:#DC2626;font-weight:700;">${formatAmount(o.remaining)}</td>
                        <td style="${td}">${o.accountManager || '—'}</td>
                    </tr>`).join('')}</tbody>
                </table>
                <p style="font-size:13px;color:#DC2626;margin:8px 0 0;"><strong>Total Overdue: ${formatAmount(totalOverdue)}</strong></p>
            </div>` : ''}

            ${sectionHtml('📅', 'UPCOMING RENEWALS (31-90 days)', '#2563EB', upcoming)}

            ${expired.length === 0 && thisWeek.length === 0 && thisMonth.length === 0 && overdue.length === 0 && upcoming.length === 0 ? `
            <div style="text-align:center;padding:32px;color:#6B7280;">
                <p style="font-size:36px;margin:0;">✅</p>
                <p style="font-size:16px;font-weight:600;">All Clear!</p>
                <p>No subscriptions need attention today.</p>
            </div>` : ''}

            <!-- Footer -->
            <div style="margin-top:24px;text-align:center;">
                <a href="${APP_URL}/" style="display:inline-block;padding:10px 24px;background:#E8450A;color:white;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:4px;">Open Dashboard</a>
                <a href="${APP_URL}/organizations/" style="display:inline-block;padding:10px 24px;background:white;color:#E8450A;border:1.5px solid #E8450A;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:4px;">View All Organizations</a>
            </div>

            </div>

            <div style="background:#F8F9FB;padding:16px 24px;border-top:1px solid #E5E7EB;text-align:center;">
                <p style="font-size:11px;color:#9CA3AF;margin:0;">DigiQC SubManager · Auto-generated daily at 12:01 AM IST · <a href="${APP_URL}/settings/" style="color:#9CA3AF;">Manage Alerts</a></p>
            </div>
        </div>
    </body></html>`;
}

// ─── Per-Org Alert Email ────────────────────────────────

function buildOrgEmailHtml(alert) {
    const color = alert.days <= 0 ? '#DC2626' : alert.days <= 7 ? '#DC2626' : alert.days <= 30 ? '#F59E0B' : '#2563EB';
    const urgency = alert.days <= 0 ? 'EXPIRED' : alert.days <= 7 ? 'CRITICAL' : alert.days <= 30 ? 'URGENT' : 'ATTENTION';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
    <body style="font-family:Inter,-apple-system,sans-serif;color:#1A1D23;margin:0;padding:20px;background:#F8F9FB;">
        <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #E5E7EB;">
            <div style="background:${color};padding:16px 24px;color:white;">
                <h1 style="margin:0;font-size:18px;">⚠️ Subscription Expiry — ${urgency}</h1>
            </div>
            <div style="padding:24px;">
                <h2 style="margin:0 0 16px;font-size:20px;">${alert.orgName}</h2>
                <div style="background:#F8F9FB;border-radius:8px;padding:16px;font-size:14px;line-height:2;">
                    <strong>Expiry:</strong> ${formatDate(alert.expiryDate)} · <strong style="color:${color};">${alert.days <= 0 ? 'Expired ' + Math.abs(alert.days) + ' days ago' : alert.days + ' days remaining'}</strong><br>
                    <strong>Type:</strong> ${alert.type}<br>
                    ${alert.contractValue ? `<strong>Contract:</strong> ${formatAmount(alert.contractValue)} · <strong>Paid:</strong> ${formatAmount(alert.totalPaid)} · <strong>Remaining:</strong> ${formatAmount(alert.remaining)}<br>` : ''}
                    ${alert.accountManager ? `<strong>Manager:</strong> ${alert.accountManager}` : ''}
                </div>
                <div style="margin:20px 0;text-align:center;">
                    <a href="${APP_URL}/organization/?id=${alert.issueNumber}" style="display:inline-block;padding:10px 24px;background:#E8450A;color:white;border-radius:8px;text-decoration:none;font-weight:600;">View Details</a>
                </div>
            </div>
            <div style="background:#F8F9FB;padding:12px 24px;border-top:1px solid #E5E7EB;text-align:center;">
                <p style="font-size:11px;color:#9CA3AF;margin:0;">DigiQC SubManager · <a href="${APP_URL}/" style="color:#9CA3AF;">Open Dashboard</a></p>
            </div>
        </div>
    </body></html>`;
}

// ─── Main ────────────────────────────────────────────────

async function main() {
    console.log('📧 DigiQC SubManager — Daily Report & Alerts\n');

    // Fetch all open issues
    let page = 1;
    let allIssues = [];
    while (true) {
        const issues = await api(`/repos/${OWNER}/${REPO}/issues?state=open&per_page=100&page=${page}`);
        if (!issues || issues.length === 0) break;
        allIssues = allIssues.concat(issues.filter(i => !i.pull_request));
        page++;
    }
    console.log(`Found ${allIssues.length} open issues.\n`);

    // Parse all orgs
    const allOrgs = [];
    const alertsToSend = [];

    for (const issue of allIssues) {
        const labels = issue.labels.map(l => l.name);
        const data = parseIssueData(issue.body);
        if (!data.expiryDate) continue;

        const days = remainingDays(data.expiryDate);
        const orgInfo = { issueNumber: issue.number, orgName: data.orgName || issue.title, expiryDate: data.expiryDate, days, type: data.type || '—', amount: data.amount || '—', contractValue: data.contractValue, totalPaid: data.totalPaid, remaining: data.remaining, payStatus: data.payStatus, accountManager: data.accountManager, orgRecipients: data.alertRecipients || '', alertEnabled: data.alertEnabled };

        allOrgs.push(orgInfo);

        // Check alert thresholds (skip disabled/renewal)
        if (labels.includes('🔄 Renewal In Progress')) continue;
        if (data.alertEnabled === 'No') continue;

        for (const threshold of THRESHOLDS) {
            if (labels.includes(ALERT_LABELS[threshold])) continue;
            if (days <= threshold) {
                alertsToSend.push({ ...orgInfo, threshold, alertLabel: ALERT_LABELS[threshold] });
                break;
            }
        }
    }

    // Setup transporter
    const transporter = nodemailer.createTransport({ host: SMTP_HOST, port: 587, secure: false, auth: { user: SMTP_USER, pass: SMTP_PASS } });

    // ─── 1. Send Daily Report to Team ───
    if (ALERT_RECIPIENTS) {
        const recipients = ALERT_RECIPIENTS.split(',').map(e => e.trim()).filter(Boolean);
        if (recipients.length > 0 && allOrgs.length > 0) {
            const subject = `DigiQC SubManager — Daily Report | ${formatDate(new Date().toISOString())}`;
            try {
                await transporter.sendMail({ from: SMTP_USER, to: recipients.join(', '), subject, html: buildDailyReportHtml(allOrgs, alertsToSend) });
                console.log(`   ✅ Daily Report sent to: ${recipients.join(', ')}`);
            } catch (error) {
                console.error(`   ❌ Daily Report failed: ${error.message}`);
            }
        }
    }

    // ─── 2. Send Per-Org Alerts ───
    for (const alert of alertsToSend) {
        const allNotified = [];

        if (alert.orgRecipients) {
            const orgEmails = alert.orgRecipients.split(',').map(e => e.trim()).filter(Boolean);
            const globalSet = new Set((ALERT_RECIPIENTS || '').split(',').map(e => e.trim()));
            const uniqueOrgEmails = orgEmails.filter(e => !globalSet.has(e));

            if (uniqueOrgEmails.length > 0) {
                try {
                    await transporter.sendMail({ from: SMTP_USER, to: uniqueOrgEmails.join(', '), subject: `⚠️ Subscription Expiry: ${alert.orgName} — ${alert.days <= 0 ? 'EXPIRED' : alert.days + ' days'}`, html: buildOrgEmailHtml(alert) });
                    console.log(`   ✅ Org alert: "${alert.orgName}" → ${uniqueOrgEmails.join(', ')}`);
                    allNotified.push(...uniqueOrgEmails);
                } catch (error) {
                    console.error(`   ❌ Org alert failed: "${alert.orgName}" — ${error.message}`);
                }
            }
        }

        // Mark label + audit
        try {
            await api(`/repos/${OWNER}/${REPO}/issues/${alert.issueNumber}/labels`, 'POST', { labels: [alert.alertLabel] });
            const globalList = (ALERT_RECIPIENTS || '').split(',').map(e => e.trim()).filter(Boolean);
            await api(`/repos/${OWNER}/${REPO}/issues/${alert.issueNumber}/comments`, 'POST', {
                body: `📧 **Alert email sent** — ${new Date().toISOString().replace('T', ' ').substring(0, 19)}\n\n**${alert.threshold}d threshold** · ${alert.days} days remaining · Team: ${globalList.join(', ') || 'None'} · Org: ${allNotified.length > 0 ? allNotified.join(', ') : 'None'}`
            });
            console.log(`   ✅ #${alert.issueNumber} — ${alert.alertLabel} applied`);
        } catch (error) {
            console.error(`   ❌ #${alert.issueNumber} label failed: ${error.message}`);
        }
    }

    console.log(`\n📊 Done.`);
    console.log(`   Daily Report: ${ALERT_RECIPIENTS ? 'Sent' : 'Skipped'}`);
    console.log(`   Alerts: ${alertsToSend.length} organizations`);
    console.log(`   Per-org emails: ${alertsToSend.filter(a => a.orgRecipients).length} with recipients`);
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
