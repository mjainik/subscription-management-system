#!/usr/bin/env node
/**
 * Setup Script
 * Creates all required labels, milestones, and project fields in the repository.
 * Run: node scripts/setup-repo.js
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN environment variable is required.');
    console.error('   Run: GITHUB_TOKEN=ghp_xxx node scripts/setup-repo.js');
    process.exit(1);
}

const OWNER = process.env.REPO_OWNER || 'mjainik';
const REPO = process.env.REPO_NAME || 'subscription-management-system';
const API_URL = 'https://api.github.com';

// ─── Labels to create ────────────────────────────────────────
const LABELS = [
    // Status
    { name: '✅ Active', color: '16A34A', description: 'Subscription is active (>90 days)' },
    { name: '⚠️ Expiring Soon', color: 'F59E0B', description: 'Subscription expiring within 90 days' },
    { name: '❌ Expired', color: 'DC2626', description: 'Subscription has expired' },
    { name: '🔄 Renewal In Progress', color: '2563EB', description: 'Renewal is being processed (manual)' },
    // Type
    { name: 'Annual', color: '7C3AED', description: 'Annual subscription' },
    { name: 'Monthly', color: '0D9488', description: 'Monthly subscription' },
    { name: 'Quarterly', color: 'EA580C', description: 'Quarterly subscription' },
    { name: 'Custom', color: '6366F1', description: 'Custom duration subscription' },
    // Priority
    { name: '🔴 Urgent', color: 'DC2626', description: 'Urgent priority' },
    { name: '🟠 High', color: 'EA580C', description: 'High priority' },
    { name: '🔵 Normal', color: '2563EB', description: 'Normal priority' },
    { name: '🟢 Low', color: '16A34A', description: 'Low priority' },
    // Alert tracking
    { name: '📧 Alert 90d Sent', color: '93C5FD', description: '90-day expiry alert sent' },
    { name: '📧 Alert 60d Sent', color: '3B82F6', description: '60-day expiry alert sent' },
    { name: '📧 Alert 30d Sent', color: 'F97316', description: '30-day expiry alert sent' },
    { name: '📧 Alert 7d Sent', color: 'EF4444', description: '7-day expiry alert sent' },
    { name: '📧 Alert 0d Sent', color: '991B1B', description: 'Expiry day alert sent' },
    // Other
    { name: '📄 Has Document', color: '6B7280', description: 'Has uploaded document(s)' },
    { name: '🗑️ Deleted', color: '374151', description: 'Soft-deleted organization' },
];

// ─── API helpers ─────────────────────────────────────────────
async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
        },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${API_URL}${endpoint}`, options);
    if (!response.ok && response.status !== 422) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`API ${method} ${endpoint}: ${response.status} — ${error.message || 'Unknown error'}`);
    }
    if (response.status === 204) return null;
    return response.json();
}

async function graphql(query, variables = {}) {
    const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });
    const data = await response.json();
    if (data.errors) {
        throw new Error(data.errors.map(e => e.message).join(', '));
    }
    return data.data;
}

// ─── Create Labels ───────────────────────────────────────────
async function createLabels() {
    console.log('\n📌 Creating labels...');

    const existing = await apiRequest(`/repos/${OWNER}/${REPO}/labels?per_page=100`);
    const existingNames = new Set(existing.map(l => l.name));

    let created = 0;
    let skipped = 0;

    for (const label of LABELS) {
        if (existingNames.has(label.name)) {
            console.log(`   ⏭️  "${label.name}" already exists`);
            skipped++;
            continue;
        }

        try {
            await apiRequest(`/repos/${OWNER}/${REPO}/labels`, 'POST', label);
            console.log(`   ✅ Created "${label.name}"`);
            created++;
        } catch (error) {
            console.log(`   ❌ Failed "${label.name}": ${error.message}`);
        }
    }

    console.log(`   → ${created} created, ${skipped} skipped\n`);
}

// ─── Create Initial Milestones ───────────────────────────────
async function createMilestones() {
    console.log('📅 Creating milestones (next 6 months)...');

    const existing = await apiRequest(`/repos/${OWNER}/${REPO}/milestones?state=open&per_page=100`);
    const existingTitles = new Set(existing.map(m => m.title));

    const now = new Date();
    let created = 0;

    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const title = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')} Expiring`;

        if (existingTitles.has(title)) {
            console.log(`   ⏭️  "${title}" already exists`);
            continue;
        }

        try {
            await apiRequest(`/repos/${OWNER}/${REPO}/milestones`, 'POST', {
                title,
                description: `Organizations with subscriptions expiring in ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            });
            console.log(`   ✅ Created "${title}"`);
            created++;
        } catch (error) {
            console.log(`   ❌ Failed "${title}": ${error.message}`);
        }
    }

    console.log(`   → ${created} milestones created\n`);
}

// ─── Create GitHub Project ───────────────────────────────────
async function createProject() {
    console.log('📊 Setting up GitHub Project (v2)...');

    // Get repository ID
    const repoData = await graphql(`
        query {
            repository(owner: "${OWNER}", name: "${REPO}") {
                id
                projectsV2(first: 5) {
                    nodes { id title number }
                }
            }
        }
    `);

    const repoId = repoData.repository.id;
    const existingProjects = repoData.repository.projectsV2.nodes;

    // Check if project already exists
    const projectName = 'Subscription Tracker';
    let project = existingProjects.find(p => p.title === projectName);

    if (project) {
        console.log(`   ⏭️  Project "${projectName}" already exists (#${project.number})`);
    } else {
        // Get owner ID (user or org)
        const ownerData = await graphql(`
            query {
                repositoryOwner(login: "${OWNER}") {
                    id
                }
            }
        `);

        const createResult = await graphql(`
            mutation {
                createProjectV2(input: {
                    ownerId: "${ownerData.repositoryOwner.id}",
                    title: "${projectName}"
                }) {
                    projectV2 { id title number }
                }
            }
        `);
        project = createResult.createProjectV2.projectV2;
        console.log(`   ✅ Created project "${projectName}" (#${project.number})`);
    }

    // Create custom fields
    const fields = [
        { name: 'Start Date', dataType: 'DATE' },
        { name: 'Expiry Date', dataType: 'DATE' },
        { name: 'Billing Date', dataType: 'DATE' },
        { name: 'Amount', dataType: 'NUMBER' },
        { name: 'Contact Email', dataType: 'TEXT' },
        { name: 'Alert Days', dataType: 'NUMBER' },
        { name: 'Remaining Days', dataType: 'NUMBER' },
    ];

    // Get existing fields
    const fieldsData = await graphql(`
        query {
            node(id: "${project.id}") {
                ... on ProjectV2 {
                    fields(first: 30) {
                        nodes {
                            ... on ProjectV2Field { name }
                            ... on ProjectV2SingleSelectField { name }
                        }
                    }
                }
            }
        }
    `);

    const existingFields = new Set(fieldsData.node.fields.nodes.map(f => f.name));

    for (const field of fields) {
        if (existingFields.has(field.name)) {
            console.log(`   ⏭️  Field "${field.name}" already exists`);
            continue;
        }

        try {
            await graphql(`
                mutation {
                    createProjectV2Field(input: {
                        projectId: "${project.id}",
                        dataType: ${field.dataType},
                        name: "${field.name}"
                    }) {
                        projectV2Field { ... on ProjectV2Field { name } }
                    }
                }
            `);
            console.log(`   ✅ Created field "${field.name}" (${field.dataType})`);
        } catch (error) {
            console.log(`   ❌ Failed field "${field.name}": ${error.message}`);
        }
    }

    // Create Payment Cycle as Single Select
    if (!existingFields.has('Payment Cycle')) {
        try {
            await graphql(`
                mutation {
                    createProjectV2Field(input: {
                        projectId: "${project.id}",
                        dataType: SINGLE_SELECT,
                        name: "Payment Cycle",
                        singleSelectOptions: [
                            { name: "Monthly", color: BLUE },
                            { name: "Quarterly", color: ORANGE },
                            { name: "Annual", color: PURPLE }
                        ]
                    }) {
                        projectV2Field { ... on ProjectV2SingleSelectField { name } }
                    }
                }
            `);
            console.log('   ✅ Created field "Payment Cycle" (SINGLE_SELECT)');
        } catch (error) {
            console.log(`   ❌ Failed field "Payment Cycle": ${error.message}`);
        }
    }

    console.log(`\n   → Project number: ${project.number}`);
    console.log(`   → Update CONFIG.projectNumber to ${project.number} in js/config.js if different\n`);
}

// ─── Enable GitHub Pages ─────────────────────────────────────
async function checkPages() {
    console.log('🌐 Checking GitHub Pages...');
    try {
        const pages = await apiRequest(`/repos/${OWNER}/${REPO}/pages`);
        console.log(`   ✅ GitHub Pages is enabled: ${pages.html_url}\n`);
    } catch {
        console.log('   ⚠️  GitHub Pages not enabled yet.');
        console.log('   → Go to repo Settings → Pages → Source: "GitHub Actions"\n');
    }
}

// ─── Run All ─────────────────────────────────────────────────
async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   Subscription Manager — Repository Setup       ║');
    console.log(`║   Repo: ${OWNER}/${REPO}                        `);
    console.log('╚══════════════════════════════════════════════════╝');

    try {
        await createLabels();
        await createMilestones();
        await createProject();
        await checkPages();

        console.log('✅ Setup complete! Your repository is ready.');
        console.log(`\n🔗 Open: https://${OWNER}.github.io/${REPO}/`);
    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        process.exit(1);
    }
}

main();
