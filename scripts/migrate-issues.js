#!/usr/bin/env node
/**
 * Migration Script
 * Copies all issues from one repo to another.
 * Usage: GITHUB_TOKEN=ghp_xxx node scripts/migrate-issues.js --from owner/repo --to owner/repo
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) { console.error('❌ GITHUB_TOKEN required'); process.exit(1); }

const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
const toIdx = args.indexOf('--to');

if (fromIdx === -1 || toIdx === -1) {
    console.error('Usage: node scripts/migrate-issues.js --from owner/repo --to owner/repo');
    process.exit(1);
}

const [FROM_OWNER, FROM_REPO] = args[fromIdx + 1].split('/');
const [TO_OWNER, TO_REPO] = args[toIdx + 1].split('/');

const API = 'https://api.github.com';

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

async function main() {
    console.log(`\n🔄 Migrating issues from ${FROM_OWNER}/${FROM_REPO} → ${TO_OWNER}/${TO_REPO}\n`);

    // Get all open issues from source
    let page = 1;
    let allIssues = [];
    while (true) {
        const issues = await api(`/repos/${FROM_OWNER}/${FROM_REPO}/issues?state=open&per_page=100&page=${page}`);
        if (!issues || issues.length === 0) break;
        allIssues = allIssues.concat(issues.filter(i => !i.pull_request));
        page++;
    }

    console.log(`Found ${allIssues.length} issues to migrate.\n`);

    let success = 0;
    let failed = 0;

    for (const issue of allIssues) {
        try {
            const labels = issue.labels.map(l => l.name);
            const milestone = issue.milestone ? issue.milestone.title : null;

            // Ensure labels exist in target repo
            for (const label of issue.labels) {
                try {
                    await api(`/repos/${TO_OWNER}/${TO_REPO}/labels`, 'POST', {
                        name: label.name,
                        color: label.color,
                        description: label.description || ''
                    });
                } catch (e) { /* label exists */ }
            }

            // Ensure milestone exists in target repo
            let milestoneNumber = null;
            if (milestone) {
                const milestones = await api(`/repos/${TO_OWNER}/${TO_REPO}/milestones?state=open&per_page=100`);
                const existing = milestones.find(m => m.title === milestone);
                if (existing) {
                    milestoneNumber = existing.number;
                } else {
                    const created = await api(`/repos/${TO_OWNER}/${TO_REPO}/milestones`, 'POST', { title: milestone });
                    milestoneNumber = created.number;
                }
            }

            // Create issue in target repo
            const newIssue = await api(`/repos/${TO_OWNER}/${TO_REPO}/issues`, 'POST', {
                title: issue.title,
                body: issue.body,
                labels,
                milestone: milestoneNumber,
            });

            // Copy comments
            const comments = await api(`/repos/${FROM_OWNER}/${FROM_REPO}/issues/${issue.number}/comments?per_page=100`);
            for (const comment of comments) {
                await api(`/repos/${TO_OWNER}/${TO_REPO}/issues/${newIssue.number}/comments`, 'POST', {
                    body: `*Migrated from ${FROM_OWNER}/${FROM_REPO}#${issue.number} — originally by @${comment.user?.login || 'unknown'}*\n\n${comment.body}`
                });
            }

            console.log(`   ✅ #${issue.number} "${issue.title}" → #${newIssue.number}`);
            success++;

            // Rate limit delay
            await new Promise(r => setTimeout(r, 500));
        } catch (error) {
            console.error(`   ❌ #${issue.number} "${issue.title}" — ${error.message}`);
            failed++;
        }
    }

    console.log(`\n📊 Migration complete: ${success} migrated, ${failed} failed.`);
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
