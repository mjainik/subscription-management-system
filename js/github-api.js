/**
 * GitHub API Module
 * All GitHub GraphQL and REST API interactions.
 */
const GitHubAPI = {

    /**
     * Make a GraphQL request
     */
    async graphql(query, variables = {}) {
        const token = Auth.getToken();
        if (!token) throw new Error('Not authenticated');

        const response = await fetch(CONFIG.graphqlUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query, variables })
        });

        if (response.status === 401) {
            Toast.show('Invalid or expired token. Please update your credentials.', 'error');
            throw new Error('Unauthorized');
        }

        if (response.status === 403) {
            const remaining = response.headers.get('x-ratelimit-remaining');
            if (remaining === '0') {
                const reset = response.headers.get('x-ratelimit-reset');
                const resetDate = new Date(reset * 1000);
                Toast.show(`API rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}.`, 'warning');
            }
            throw new Error('Forbidden');
        }

        const data = await response.json();

        if (data.errors) {
            console.error('GraphQL errors:', data.errors);
            throw new Error(data.errors[0].message);
        }

        return data.data;
    },

    /**
     * Make a REST API request
     */
    async rest(endpoint, method = 'GET', body = null) {
        const token = Auth.getToken();
        if (!token) throw new Error('Not authenticated');

        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${CONFIG.restUrl}${endpoint}`, options);

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `API error: ${response.status}`);
        }

        if (response.status === 204) return null;
        return response.json();
    },

    // ─── Issues (Organizations) ──────────────────────────────

    /**
     * Fetch all organizations (open issues)
     */
    async getOrganizations(filters = {}) {
        const { status, type, search, first = CONFIG.maxIssuesPerQuery, after = null } = filters;

        let labelFilter = '';
        const labels = [];
        if (status) labels.push(status);
        if (type) labels.push(type);
        if (labels.length > 0) {
            labelFilter = `labels: [${labels.map(l => `"${l}"`).join(', ')}],`;
        }

        const afterCursor = after ? `after: "${after}",` : '';

        const query = `
            query {
                repository(owner: "${CONFIG.owner}", name: "${CONFIG.repo}") {
                    issues(
                        first: ${first},
                        ${afterCursor}
                        states: OPEN,
                        ${labelFilter}
                        orderBy: {field: UPDATED_AT, direction: DESC}
                    ) {
                        totalCount
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                        nodes {
                            number
                            title
                            body
                            createdAt
                            updatedAt
                            labels(first: 20) {
                                nodes { name color }
                            }
                            milestone {
                                title
                                number
                            }
                            assignees(first: 5) {
                                nodes { login avatarUrl }
                            }
                            comments(last: 5) {
                                totalCount
                                nodes {
                                    body
                                    createdAt
                                    author { login }
                                }
                            }
                        }
                    }
                }
            }
        `;

        const data = await this.graphql(query);
        let issues = data.repository.issues.nodes;

        // Client-side search filter (GitHub search API doesn't support body search well)
        if (search) {
            const searchLower = search.toLowerCase();
            issues = issues.filter(issue =>
                issue.title.toLowerCase().includes(searchLower) ||
                (issue.body && issue.body.toLowerCase().includes(searchLower))
            );
        }

        return {
            issues,
            totalCount: data.repository.issues.totalCount,
            pageInfo: data.repository.issues.pageInfo
        };
    },

    /**
     * Fetch ALL organizations with auto-pagination (no 100 limit)
     */
    async getAllOrganizations() {
        let allIssues = [];
        let cursor = null;
        let hasMore = true;

        while (hasMore) {
            const result = await this.getOrganizations({ first: 100, after: cursor });
            allIssues = allIssues.concat(result.issues);
            hasMore = result.pageInfo.hasNextPage;
            cursor = result.pageInfo.endCursor;
        }

        return { issues: allIssues, totalCount: allIssues.length };
    },

    /**
     * Get a single organization by issue number
     */
    async getOrganization(issueNumber) {
        const query = `
            query {
                repository(owner: "${CONFIG.owner}", name: "${CONFIG.repo}") {
                    issue(number: ${issueNumber}) {
                        number
                        title
                        body
                        state
                        createdAt
                        updatedAt
                        labels(first: 20) {
                            nodes { name color }
                        }
                        milestone {
                            title
                            number
                        }
                        assignees(first: 5) {
                            nodes { login avatarUrl }
                        }
                        comments(first: 100) {
                            totalCount
                            nodes {
                                id
                                body
                                createdAt
                                updatedAt
                                author { login avatarUrl }
                            }
                        }
                    }
                }
            }
        `;

        const data = await this.graphql(query);
        return data.repository.issue;
    },

    /**
     * Create a new organization (GitHub Issue)
     */
    async createOrganization(title, body, labels = [], milestone = null, assignees = []) {
        // Step 1: Create the issue
        const issue = await this.rest(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/issues`,
            'POST',
            {
                title,
                body,
                labels,
                milestone,
                assignees
            }
        );

        return issue;
    },

    /**
     * Update an organization (issue)
     */
    async updateOrganization(issueNumber, updates) {
        return this.rest(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${issueNumber}`,
            'PATCH',
            updates
        );
    },

    /**
     * Close an organization (soft delete)
     */
    async deleteOrganization(issueNumber) {
        return this.updateOrganization(issueNumber, {
            state: 'closed',
            labels: [CONFIG.labels.other.deleted]
        });
    },

    // ─── Labels ──────────────────────────────────────────────

    /**
     * Add labels to an issue
     */
    async addLabels(issueNumber, labels) {
        return this.rest(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${issueNumber}/labels`,
            'POST',
            { labels }
        );
    },

    /**
     * Remove a label from an issue
     */
    async removeLabel(issueNumber, labelName) {
        try {
            return this.rest(
                `/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${issueNumber}/labels/${encodeURIComponent(labelName)}`,
                'DELETE'
            );
        } catch (e) {
            // Label might not exist on issue, ignore
        }
    },

    /**
     * Replace status label on an issue
     */
    async updateStatusLabel(issueNumber, newStatusLabel, currentLabels = []) {
        // Remove all existing status labels
        const statusLabels = Object.values(CONFIG.labels.status);
        for (const label of currentLabels) {
            if (statusLabels.includes(label) && label !== newStatusLabel) {
                await this.removeLabel(issueNumber, label);
            }
        }
        // Add new status label
        await this.addLabels(issueNumber, [newStatusLabel]);
    },

    // ─── Comments (Audit Log & Documents) ────────────────────

    /**
     * Add a comment to an issue
     */
    async addComment(issueNumber, body) {
        return this.rest(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${issueNumber}/comments`,
            'POST',
            { body }
        );
    },

    /**
     * Add an audit comment for a field change
     */
    async addAuditComment(issueNumber, fieldName, oldValue, newValue) {
        const userName = Auth.getUserName();
        const timestamp = new Date().toISOString();
        const body = `✏️ **Updated by ${userName}** — ${Utils.formatDateTime(timestamp)}\n\n**${fieldName}:** ${oldValue} → ${newValue}`;
        return this.addComment(issueNumber, body);
    },

    // ─── Milestones ──────────────────────────────────────────

    /**
     * Get all milestones
     */
    async getMilestones() {
        return this.rest(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/milestones?state=open&sort=due_on&direction=asc&per_page=100`
        );
    },

    /**
     * Create a milestone if it doesn't exist
     */
    async getOrCreateMilestone(title) {
        const milestones = await this.getMilestones();
        const existing = milestones.find(m => m.title === title);
        if (existing) return existing.number;

        const milestone = await this.rest(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/milestones`,
            'POST',
            { title }
        );
        return milestone.number;
    },

    // ─── Repository Labels ───────────────────────────────────

    /**
     * Get all repository labels
     */
    async getRepoLabels() {
        return this.rest(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/labels?per_page=100`
        );
    },

    /**
     * Create a label in the repository
     */
    async createLabel(name, color, description = '') {
        try {
            return this.rest(
                `/repos/${CONFIG.owner}/${CONFIG.repo}/labels`,
                'POST',
                { name, color, description }
            );
        } catch (e) {
            // Label might already exist
            if (!e.message.includes('already_exists')) throw e;
        }
    },

    // ─── Dashboard Metrics ───────────────────────────────────

    /**
     * Get dashboard summary metrics
     */
    async getDashboardMetrics() {
        const query = `
            query {
                repository(owner: "${CONFIG.owner}", name: "${CONFIG.repo}") {
                    total: issues(states: OPEN) { totalCount }
                    active: issues(states: OPEN, labels: ["${CONFIG.labels.status.active}"]) { totalCount }
                    expiring: issues(states: OPEN, labels: ["${CONFIG.labels.status.expiringSoon}"]) { totalCount }
                    expired: issues(states: OPEN, labels: ["${CONFIG.labels.status.expired}"]) { totalCount }
                    renewal: issues(states: OPEN, labels: ["${CONFIG.labels.status.renewalInProgress}"]) { totalCount }
                }
            }
        `;

        const data = await this.graphql(query);
        return {
            total: data.repository.total.totalCount,
            active: data.repository.active.totalCount,
            expiring: data.repository.expiring.totalCount,
            expired: data.repository.expired.totalCount,
            renewal: data.repository.renewal.totalCount
        };
    },

    /**
     * Get recent activity (latest comments across all issues)
     */
    async getRecentActivity(limit = 10) {
        const query = `
            query {
                repository(owner: "${CONFIG.owner}", name: "${CONFIG.repo}") {
                    issues(first: 20, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
                        nodes {
                            number
                            title
                            updatedAt
                            comments(last: 3) {
                                nodes {
                                    body
                                    createdAt
                                    author { login }
                                }
                            }
                        }
                    }
                }
            }
        `;

        const data = await this.graphql(query);
        const activities = [];

        for (const issue of data.repository.issues.nodes) {
            for (const comment of issue.comments.nodes) {
                activities.push({
                    issueNumber: issue.number,
                    issueTitle: issue.title,
                    comment: comment.body.substring(0, 150),
                    author: comment.author?.login || 'unknown',
                    createdAt: comment.createdAt
                });
            }
        }

        // Sort by date and limit
        activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return activities.slice(0, limit);
    },

    // ─── Search ──────────────────────────────────────────────

    /**
     * Search issues by query
     */
    async searchIssues(searchQuery) {
        const fullQuery = `repo:${CONFIG.owner}/${CONFIG.repo} is:issue is:open ${searchQuery}`;
        return this.rest(
            `/search/issues?q=${encodeURIComponent(fullQuery)}&per_page=50`
        );
    },

    // ─── File Upload (via Comments) ──────────────────────────

    /**
     * Upload a file as an issue comment attachment
     * Note: GitHub REST API doesn't directly support file uploads in comments.
     * Files must be uploaded via the GitHub upload API first, then linked in a comment.
     * For simplicity, we'll use the markdown image/file link format.
     */
    async uploadDocument(issueNumber, file) {
        const userName = Auth.getUserName();

        // Read file as base64 for storage reference
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onload = async () => {
                try {
                    // Create comment with file reference
                    const body = `📄 **Document uploaded by ${userName}**\n\nFile: \`${Utils.escapeHtml(file.name)}\`\nSize: ${(file.size / 1024).toFixed(1)} KB\nDate: ${Utils.formatDateTime(new Date().toISOString())}\n\n> To attach the actual file, please drag and drop it into this comment on GitHub.`;

                    const comment = await this.addComment(issueNumber, body);

                    // Add "Has Document" label
                    await this.addLabels(issueNumber, [CONFIG.labels.other.hasDocument]);

                    resolve(comment);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
};
