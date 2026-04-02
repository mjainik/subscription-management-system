#!/usr/bin/env node
/**
 * Status Auto-Update Script
 * Runs daily via GitHub Actions. Updates status labels on all open issues
 * based on subscription expiry dates.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) { console.error('❌ GITHUB_TOKEN required'); process.exit(1); }

const OWNER = 'mjainik';
const REPO = 'subscription-management-system';
const API = 'https://api.github.com';

const STATUS_LABELS = {
    active: '✅ Active',
    expiringSoon: '⚠️ Expiring Soon',
    expired: '❌ Expired',
    renewalInProgress: '🔄 Renewal In Progress'
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

function getNewStatus(days) {
    if (days <= 0) return 'expired';
    if (days <= 90) return 'expiringSoon';
    return 'active';
}

function parseExpiryFromBody(body) {
    if (!body) return null;
    const match = body.match(/\|\s*Expiry Date\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
    return match ? match[1] : null;
}

async function main() {
    console.log('🔄 Starting status label update...\n');

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

    let updated = 0;
    let skipped = 0;

    for (const issue of allIssues) {
        const labels = issue.labels.map(l => l.name);

        // Skip if "Renewal In Progress" is set
        if (labels.includes(STATUS_LABELS.renewalInProgress)) {
            console.log(`   ⏭️  #${issue.number} "${issue.title}" — Renewal In Progress (skipped)`);
            skipped++;
            continue;
        }

        // Parse expiry date from issue body
        const expiryDate = parseExpiryFromBody(issue.body);
        if (!expiryDate) {
            console.log(`   ⚠️  #${issue.number} "${issue.title}" — No expiry date found`);
            skipped++;
            continue;
        }

        const days = remainingDays(expiryDate);
        const newStatusKey = getNewStatus(days);
        const newLabel = STATUS_LABELS[newStatusKey];

        // Check current status
        const currentStatusLabels = labels.filter(l => Object.values(STATUS_LABELS).includes(l));
        const currentLabel = currentStatusLabels[0] || null;

        if (currentLabel === newLabel) {
            skipped++;
            continue;
        }

        // Remove old status labels
        for (const oldLabel of currentStatusLabels) {
            try {
                await api(`/repos/${OWNER}/${REPO}/issues/${issue.number}/labels/${encodeURIComponent(oldLabel)}`, 'DELETE');
            } catch (e) { /* ignore */ }
        }

        // Add new status label
        await api(`/repos/${OWNER}/${REPO}/issues/${issue.number}/labels`, 'POST', { labels: [newLabel] });

        // Add audit comment
        const commentBody = `🤖 **Status auto-updated** — ${new Date().toISOString().split('T')[0]}\n\n${currentLabel || 'None'} → ${newLabel} (${days} days left)`;
        await api(`/repos/${OWNER}/${REPO}/issues/${issue.number}/comments`, 'POST', { body: commentBody });

        console.log(`   ✅ #${issue.number} "${issue.title}" — ${currentLabel || 'None'} → ${newLabel} (${days} days)`);
        updated++;
    }

    console.log(`\n📊 Done: ${updated} updated, ${skipped} skipped.`);
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
