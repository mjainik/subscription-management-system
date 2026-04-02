/**
 * Application Configuration
 * Change these values to point to a different repository.
 */
const CONFIG = {
    // GitHub repository details
    owner: 'mjainik',
    repo: 'subscription-management-system',
    projectNumber: 1,

    // GitHub API
    graphqlUrl: 'https://api.github.com/graphql',
    restUrl: 'https://api.github.com',

    // App settings
    appName: 'Subscription Manager',
    appVersion: '1.0.0',
    baseUrl: '/subscription-management-system',

    // Status thresholds (days)
    status: {
        activeMin: 91,        // > 90 days = Active
        expiringSoonMax: 90,  // 1-90 days = Expiring Soon
        expiredMax: 0         // <= 0 days = Expired
    },

    // Alert thresholds (days before expiry)
    alertThresholds: [90, 60, 30, 7, 0],

    // Default alert days before expiry
    defaultAlertDays: 60,

    // Labels
    labels: {
        status: {
            active: '✅ Active',
            expiringSoon: '⚠️ Expiring Soon',
            expired: '❌ Expired',
            renewalInProgress: '🔄 Renewal In Progress'
        },
        type: {
            annual: 'Annual',
            monthly: 'Monthly',
            quarterly: 'Quarterly'
        },
        priority: {
            urgent: '🔴 Urgent',
            high: '🟠 High',
            normal: '🔵 Normal',
            low: '🟢 Low'
        },
        alert: {
            '90': '📧 Alert 90d Sent',
            '60': '📧 Alert 60d Sent',
            '30': '📧 Alert 30d Sent',
            '7': '📧 Alert 7d Sent',
            '0': '📧 Alert 0d Sent'
        },
        other: {
            hasDocument: '📄 Has Document',
            deleted: '🗑️ Deleted'
        }
    },

    // Project custom field names
    projectFields: {
        startDate: 'Start Date',
        expiryDate: 'Expiry Date',
        billingDate: 'Billing Date',
        amount: 'Amount',
        paymentCycle: 'Payment Cycle',
        remainingDays: 'Remaining Days',
        contactEmail: 'Contact Email',
        alertDays: 'Alert Days'
    },

    // Pagination
    issuesPerPage: 25,
    maxIssuesPerQuery: 100,

    // CSV bulk upload limit
    maxBulkRows: 100,

    // File upload
    maxFileSize: 25 * 1024 * 1024, // 25MB
    allowedFileTypes: ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    allowedExtensions: ['.pdf', '.png', '.jpg', '.jpeg', '.docx'],

    // Date formats
    dateFormatApi: 'YYYY-MM-DD',
    dateFormatDisplay: 'MMM DD, YYYY',

    // Toast duration (ms)
    toastDuration: 4000
};
