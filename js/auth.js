/**
 * Authentication Module
 * Manages GitHub token and user credentials in localStorage.
 */
const Auth = {
    STORAGE_KEYS: {
        token: 'github_token',
        userName: 'user_name'
    },

    /**
     * Get stored GitHub token
     */
    getToken() {
        return localStorage.getItem(this.STORAGE_KEYS.token);
    },

    /**
     * Get stored user name
     */
    getUserName() {
        return localStorage.getItem(this.STORAGE_KEYS.userName);
    },

    /**
     * Save credentials to localStorage
     */
    save(name, token) {
        localStorage.setItem(this.STORAGE_KEYS.userName, name.trim());
        localStorage.setItem(this.STORAGE_KEYS.token, token.trim());
    },

    /**
     * Clear stored credentials
     */
    clear() {
        localStorage.removeItem(this.STORAGE_KEYS.token);
        localStorage.removeItem(this.STORAGE_KEYS.userName);
    },

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!(this.getToken() && this.getUserName());
    },

    /**
     * Validate token against GitHub API
     */
    async validateToken(token) {
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) return { valid: false, error: 'Invalid token' };

            const user = await response.json();

            // Check required scopes
            const scopes = response.headers.get('x-oauth-scopes') || '';
            const hasRepo = scopes.includes('repo');
            const hasProject = scopes.includes('project');

            if (!hasRepo) {
                return { valid: false, error: 'Token missing "repo" scope. Please create a token with repo and project permissions.' };
            }

            return {
                valid: true,
                user: {
                    login: user.login,
                    name: user.name || user.login,
                    avatar: user.avatar_url
                },
                scopes
            };
        } catch (error) {
            return { valid: false, error: 'Network error. Please check your connection.' };
        }
    },

    /**
     * Render setup banner if not authenticated
     */
    renderSetupBanner(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (this.isAuthenticated()) {
            container.innerHTML = '';
            container.style.display = 'none';
            this.renderUserInfo();
            return;
        }

        container.style.display = 'block';
        container.innerHTML = `
            <div class="setup-banner">
                <div class="setup-banner-content">
                    <h3>Setup Required</h3>
                    <p>Enter your name and GitHub Personal Access Token to get started.</p>
                    <div class="setup-form">
                        <div class="form-group">
                            <label for="setup-name">Your Name</label>
                            <input type="text" id="setup-name" placeholder="Enter your name" />
                        </div>
                        <div class="form-group">
                            <label for="setup-token">GitHub Token</label>
                            <input type="password" id="setup-token" placeholder="ghp_xxxxxxxxxxxx" />
                            <small>Needs <code>repo</code> and <code>project</code> scopes. <a href="https://github.com/settings/tokens/new?scopes=repo,project&description=Subscription+Manager" target="_blank">Create token</a></small>
                        </div>
                        <button id="setup-save-btn" class="btn btn-primary" onclick="Auth.handleSetup()">
                            Save
                        </button>
                        <div id="setup-error" class="error-message" style="display:none;"></div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Handle setup form submission
     */
    async handleSetup() {
        const name = document.getElementById('setup-name').value.trim();
        const token = document.getElementById('setup-token').value.trim();
        const errorEl = document.getElementById('setup-error');
        const btn = document.getElementById('setup-save-btn');

        if (!name) {
            errorEl.textContent = 'Please enter your name.';
            errorEl.style.display = 'block';
            return;
        }

        if (!token) {
            errorEl.textContent = 'Please enter your GitHub token.';
            errorEl.style.display = 'block';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Validating...';
        errorEl.style.display = 'none';

        const result = await this.validateToken(token);

        if (!result.valid) {
            errorEl.textContent = result.error;
            errorEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Save';
            return;
        }

        this.save(name, token);
        Toast.show('Setup complete! Welcome, ' + name, 'success');

        // Hide banner and show user info
        const banner = document.getElementById('setup-banner');
        if (banner) {
            banner.style.display = 'none';
            banner.innerHTML = '';
        }

        this.renderUserInfo();

        // Reload page content
        if (typeof onAuthReady === 'function') {
            onAuthReady();
        }
    },

    /**
     * Render user info in header
     */
    renderUserInfo() {
        const userInfoEl = document.getElementById('user-info');
        if (!userInfoEl) return;

        if (!this.isAuthenticated()) {
            userInfoEl.innerHTML = '';
            return;
        }

        const name = this.getUserName();
        userInfoEl.innerHTML = `
            <span class="user-name">${Utils.escapeHtml(name)}</span>
            <button class="btn btn-text btn-sm" onclick="Auth.showChangeCredentials()">Change</button>
        `;
    },

    /**
     * Show change credentials dialog
     */
    showChangeCredentials() {
        const banner = document.getElementById('setup-banner');
        if (banner) {
            banner.style.display = 'block';
            const nameInput = document.getElementById('setup-name');
            const tokenInput = document.getElementById('setup-token');

            if (!nameInput) {
                this.renderSetupBanner('setup-banner');
                const newNameInput = document.getElementById('setup-name');
                if (newNameInput) newNameInput.value = this.getUserName() || '';
            } else {
                nameInput.value = this.getUserName() || '';
                tokenInput.value = '';
            }
        }
    }
};
