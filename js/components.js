/**
 * Reusable UI Components
 * Toast notifications, loading states, modals, tables.
 */

// ─── Toast Notifications ─────────────────────────────────────
const Toast = {
    container: null,

    init() {
        if (this.container) return;
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = CONFIG.toastDuration) {
        this.init();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${Utils.escapeHtml(message)}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        this.container.appendChild(toast);

        // Auto-remove
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('toast-fade-out');
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }
};

// ─── Loading Spinner ─────────────────────────────────────────
const Loader = {
    show(containerId, message = 'Loading...') {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = `
            <div class="loader">
                <div class="spinner"></div>
                <p>${Utils.escapeHtml(message)}</p>
            </div>
        `;
    },

    hide(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const loader = container.querySelector('.loader');
        if (loader) loader.remove();
    }
};

// ─── Confirmation Dialog ─────────────────────────────────────
const Dialog = {
    confirm(title, message, onConfirm, onCancel) {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.innerHTML = `
            <div class="dialog">
                <h3 class="dialog-title">${Utils.escapeHtml(title)}</h3>
                <p class="dialog-message">${Utils.escapeHtml(message)}</p>
                <div class="dialog-actions">
                    <button class="btn btn-secondary" id="dialog-cancel">Cancel</button>
                    <button class="btn btn-danger" id="dialog-confirm">Confirm</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('dialog-confirm').onclick = () => {
            overlay.remove();
            if (onConfirm) onConfirm();
        };

        document.getElementById('dialog-cancel').onclick = () => {
            overlay.remove();
            if (onCancel) onCancel();
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.remove();
                if (onCancel) onCancel();
            }
        };
    }
};

// ─── Empty State ─────────────────────────────────────────────
const EmptyState = {
    render(containerId, icon, title, message, actionHtml = '') {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${icon}</div>
                <h3>${Utils.escapeHtml(title)}</h3>
                <p>${Utils.escapeHtml(message)}</p>
                ${actionHtml}
            </div>
        `;
    }
};

// ─── Header Component ────────────────────────────────────────
const Header = {
    render(breadcrumbs = []) {
        const headerEl = document.getElementById('app-header');
        if (!headerEl) return;

        const breadcrumbHtml = breadcrumbs.map((b, i) => {
            if (i === breadcrumbs.length - 1) {
                return `<span class="breadcrumb-current">${Utils.escapeHtml(b.label)}</span>`;
            }
            return `<a href="${b.url}" class="breadcrumb-link">${Utils.escapeHtml(b.label)}</a>`;
        }).join(' <span class="breadcrumb-sep">›</span> ');

        headerEl.innerHTML = `
            <div class="header-left">
                <a href="${CONFIG.baseUrl}/" class="header-logo">${CONFIG.appName}</a>
                <div class="breadcrumbs">${breadcrumbHtml}</div>
            </div>
            <div class="header-right">
                <div id="user-info"></div>
            </div>
        `;

        Auth.renderUserInfo();
    }
};

// ─── Navigation Sidebar ──────────────────────────────────────
const Nav = {
    render(activePage = '') {
        const navEl = document.getElementById('app-nav');
        if (!navEl) return;

        const items = [
            { id: 'dashboard', label: 'Dashboard', icon: '📊', url: `${CONFIG.baseUrl}/` },
            { id: 'organizations', label: 'Organizations', icon: '🏢', url: `${CONFIG.baseUrl}/organizations/` },
            { id: 'create', label: 'Create', icon: '➕', url: `${CONFIG.baseUrl}/create-organization/` },
            { id: 'settings', label: 'Settings', icon: '⚙️', url: `${CONFIG.baseUrl}/settings/` }
        ];

        navEl.innerHTML = `
            <nav class="sidebar-nav">
                ${items.map(item => `
                    <a href="${item.url}" class="nav-item ${activePage === item.id ? 'nav-item-active' : ''}">
                        <span class="nav-icon">${item.icon}</span>
                        <span class="nav-label">${item.label}</span>
                    </a>
                `).join('')}
            </nav>
        `;
    }
};

// ─── Metric Card ─────────────────────────────────────────────
const MetricCard = {
    render(label, value, type = 'default', icon = '') {
        const colorClass = {
            default: '',
            success: 'metric-success',
            warning: 'metric-warning',
            error: 'metric-error',
            info: 'metric-info'
        };

        return `
            <div class="metric-card ${colorClass[type] || ''}">
                ${icon ? `<div class="metric-icon">${icon}</div>` : ''}
                <div class="metric-value">${value}</div>
                <div class="metric-label">${Utils.escapeHtml(label)}</div>
            </div>
        `;
    }
};

// ─── Pagination ──────────────────────────────────────────────
const Pagination = {
    render(currentPage, totalPages, onPageChange) {
        if (totalPages <= 1) return '';

        let html = '<div class="pagination">';

        html += `<button class="btn btn-sm btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} onclick="${onPageChange}(${currentPage - 1})">← Prev</button>`;
        html += `<span class="pagination-info">Page ${currentPage} of ${totalPages}</span>`;
        html += `<button class="btn btn-sm btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} onclick="${onPageChange}(${currentPage + 1})">Next →</button>`;

        html += '</div>';
        return html;
    }
};

// ─── File Upload Component ───────────────────────────────────
const FileUpload = {
    render(containerId, onFileSelect) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="file-upload-area" id="file-drop-zone">
                <div class="file-upload-icon">📄</div>
                <p class="file-upload-text">Upload invoice/contract to auto-fill</p>
                <p class="file-upload-hint">Drop file here or click to browse</p>
                <p class="file-upload-formats">Supports: PDF, PNG, JPG</p>
                <input type="file" id="file-input" accept=".pdf,.png,.jpg,.jpeg,.docx" style="display:none" />
            </div>
            <div id="file-preview" class="file-preview" style="display:none;"></div>
        `;

        const dropZone = document.getElementById('file-drop-zone');
        const fileInput = document.getElementById('file-input');

        // Click to browse
        dropZone.addEventListener('click', () => fileInput.click());

        // File selected
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files[0], onFileSelect);
            }
        });

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('file-upload-drag');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('file-upload-drag');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('file-upload-drag');
            if (e.dataTransfer.files.length > 0) {
                this.handleFile(e.dataTransfer.files[0], onFileSelect);
            }
        });
    },

    handleFile(file, callback) {
        // Validate file size
        if (file.size > CONFIG.maxFileSize) {
            Toast.show(`File too large. Maximum size is ${CONFIG.maxFileSize / (1024 * 1024)}MB.`, 'error');
            return;
        }

        // Validate file type
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!CONFIG.allowedExtensions.includes(ext)) {
            Toast.show('Unsupported file type. Please upload PDF, PNG, JPG, or DOCX.', 'error');
            return;
        }

        // Show preview
        const preview = document.getElementById('file-preview');
        const dropZone = document.getElementById('file-drop-zone');

        if (preview) {
            preview.style.display = 'flex';
            preview.innerHTML = `
                <span class="file-preview-name">📄 ${Utils.escapeHtml(file.name)}</span>
                <span class="file-preview-size">(${(file.size / 1024).toFixed(1)} KB)</span>
                <span class="file-preview-status">Extracting...</span>
                <button class="btn btn-text btn-sm" onclick="FileUpload.clear()">Remove</button>
            `;
        }

        if (dropZone) {
            dropZone.style.display = 'none';
        }

        if (callback) callback(file);
    },

    clear() {
        const preview = document.getElementById('file-preview');
        const dropZone = document.getElementById('file-drop-zone');
        const fileInput = document.getElementById('file-input');

        if (preview) {
            preview.style.display = 'none';
            preview.innerHTML = '';
        }
        if (dropZone) dropZone.style.display = '';
        if (fileInput) fileInput.value = '';
    },

    updateStatus(status, type = 'success') {
        const statusEl = document.querySelector('.file-preview-status');
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = `file-preview-status file-preview-${type}`;
        }
    }
};
