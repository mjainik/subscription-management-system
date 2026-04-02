/**
 * PDF Parser Module
 * Extracts text from PDFs using pdf.js and parses subscription data via regex.
 */
const PdfParser = {

    /**
     * Extract text from a PDF file
     */
    async extractText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const typedArray = new Uint8Array(e.target.result);
                    const pdf = await pdfjsLib.getDocument(typedArray).promise;
                    let fullText = '';

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText += pageText + '\n';
                    }

                    resolve(fullText);
                } catch (error) {
                    reject(new Error('Failed to parse PDF: ' + error.message));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Parse extracted text to find subscription data
     */
    parseData(text) {
        const result = {
            orgName: '',
            email: '',
            phone: '',
            startDate: '',
            expiryDate: '',
            billingDate: '',
            amount: '',
            paymentCycle: '',
            confidence: {}
        };

        if (!text) return result;

        // Normalize text
        const normalized = text.replace(/\s+/g, ' ').trim();

        // ─── Organization Name ───
        const orgPatterns = [
            /bill\s*to\s*[:\-]?\s*(.+?)(?:\n|email|phone|address|invoice)/i,
            /company\s*[:\-]?\s*(.+?)(?:\n|email|phone|address)/i,
            /client\s*[:\-]?\s*(.+?)(?:\n|email|phone|address)/i,
            /customer\s*[:\-]?\s*(.+?)(?:\n|email|phone|address)/i,
            /organization\s*[:\-]?\s*(.+?)(?:\n|email|phone)/i,
            /attn\s*[:\-]?\s*(.+?)(?:\n|email|phone)/i
        ];
        for (const pattern of orgPatterns) {
            const match = normalized.match(pattern);
            if (match) {
                result.orgName = match[1].trim().substring(0, 200);
                result.confidence.orgName = 'medium';
                break;
            }
        }

        // ─── Email ───
        const emailMatch = normalized.match(/[\w.+-]+@[\w-]+\.[\w.-]+/i);
        if (emailMatch) {
            result.email = emailMatch[0];
            result.confidence.email = 'high';
        }

        // ─── Phone ───
        const phoneMatch = normalized.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
        if (phoneMatch) {
            result.phone = phoneMatch[0];
            result.confidence.phone = 'medium';
        }

        // ─── Dates ───
        const datePatterns = [
            // YYYY-MM-DD
            /(\d{4}-\d{2}-\d{2})/g,
            // MM/DD/YYYY
            /(\d{1,2}\/\d{1,2}\/\d{4})/g,
            // Month DD, YYYY
            /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/gi
        ];

        const dates = [];
        for (const pattern of datePatterns) {
            let match;
            while ((match = pattern.exec(normalized)) !== null) {
                const parsed = new Date(match[1]);
                if (!isNaN(parsed.getTime())) {
                    dates.push(parsed);
                }
            }
        }

        // Try to identify specific dates
        const startPatterns = [
            /(?:start|begin|commencement|effective)\s*(?:date)?\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/i
        ];
        const expiryPatterns = [
            /(?:expir|end|terminat|valid\s*(?:until|through|thru)|due)\s*(?:date|y)?\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/i
        ];
        const billingPatterns = [
            /(?:billing|invoice|payment)\s*(?:date)?\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/i
        ];

        for (const pattern of startPatterns) {
            const match = normalized.match(pattern);
            if (match) {
                const d = new Date(match[1]);
                if (!isNaN(d.getTime())) {
                    result.startDate = Utils.formatDateApi(d);
                    result.confidence.startDate = 'high';
                }
            }
        }

        for (const pattern of expiryPatterns) {
            const match = normalized.match(pattern);
            if (match) {
                const d = new Date(match[1]);
                if (!isNaN(d.getTime())) {
                    result.expiryDate = Utils.formatDateApi(d);
                    result.confidence.expiryDate = 'high';
                }
            }
        }

        for (const pattern of billingPatterns) {
            const match = normalized.match(pattern);
            if (match) {
                const d = new Date(match[1]);
                if (!isNaN(d.getTime())) {
                    result.billingDate = Utils.formatDateApi(d);
                    result.confidence.billingDate = 'high';
                }
            }
        }

        // Fallback: if we found dates but couldn't identify them, use first and last
        if (dates.length >= 2 && !result.startDate && !result.expiryDate) {
            dates.sort((a, b) => a - b);
            result.startDate = Utils.formatDateApi(dates[0]);
            result.expiryDate = Utils.formatDateApi(dates[dates.length - 1]);
            result.confidence.startDate = 'low';
            result.confidence.expiryDate = 'low';
        }

        if (!result.billingDate && result.startDate) {
            result.billingDate = result.startDate;
            result.confidence.billingDate = 'low';
        }

        // ─── Amount ───
        const amountPatterns = [
            /(?:total|amount|price|cost|fee|charge|subscription)\s*(?:due|amount|price)?\s*[:\-]?\s*\$?\s*([\d,]+\.?\d*)/i,
            /\$\s*([\d,]+\.?\d*)/,
            /(?:USD|INR|EUR|GBP)\s*([\d,]+\.?\d*)/i
        ];

        for (const pattern of amountPatterns) {
            const match = normalized.match(pattern);
            if (match) {
                result.amount = match[1].replace(/,/g, '');
                result.confidence.amount = 'medium';
                break;
            }
        }

        // ─── Payment Cycle ───
        const cycleMatch = normalized.match(/\b(monthly|quarterly|annual|annually|yearly|per\s*month|per\s*year|per\s*quarter)\b/i);
        if (cycleMatch) {
            const cycle = cycleMatch[1].toLowerCase();
            if (cycle.includes('month')) result.paymentCycle = 'Monthly';
            else if (cycle.includes('quarter')) result.paymentCycle = 'Quarterly';
            else result.paymentCycle = 'Annual';
            result.confidence.paymentCycle = 'high';
        }

        return result;
    },

    /**
     * Process a file: extract text and parse data
     */
    async processFile(file) {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

        if (!isPdf) {
            // For images, return empty data (manual entry required)
            return {
                success: false,
                message: 'Image files cannot be auto-parsed. Please fill the form manually.',
                data: this.parseData(''),
                rawText: ''
            };
        }

        try {
            const text = await this.extractText(file);

            if (!text || text.trim().length < 10) {
                return {
                    success: false,
                    message: 'Could not extract text from PDF. It might be a scanned image. Please fill manually.',
                    data: this.parseData(''),
                    rawText: ''
                };
            }

            const data = this.parseData(text);
            const fieldsFound = Object.keys(data.confidence).length;

            return {
                success: fieldsFound > 0,
                message: fieldsFound > 0
                    ? `Extracted ${fieldsFound} fields. Please review and correct if needed.`
                    : 'Could not extract fields. Please fill the form manually.',
                data,
                rawText: text
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to parse PDF: ' + error.message,
                data: this.parseData(''),
                rawText: ''
            };
        }
    }
};
