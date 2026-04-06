/**
 * PDF Parser Module
 * Extracts text from PDFs using pdf.js and parses subscription data via regex.
 * Handles multiple invoice formats: Indian (GST), Western, mixed.
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
     * Parse a date string in any common format → YYYY-MM-DD
     * Handles: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MMM-YYYY, D-Mon-YY, etc.
     */
    parseDate(str) {
        if (!str) return null;
        str = str.trim();

        // DD/MM/YYYY or DD-MM-YYYY (Indian/European format — assume DD/MM)
        let m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        if (m) {
            const day = parseInt(m[1]);
            const month = parseInt(m[2]);
            const year = parseInt(m[3]);
            // If day > 12, it's definitely DD/MM/YYYY
            // If month > 12, it's MM/DD/YYYY
            // Otherwise assume DD/MM/YYYY (Indian standard)
            if (day > 12) return this._toApi(year, month, day);
            if (month > 12) return this._toApi(year, day, month);
            return this._toApi(year, month, day); // default DD/MM
        }

        // DD/MM/YY or DD-MM-YY (2-digit year)
        m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
        if (m) {
            const day = parseInt(m[1]);
            const month = parseInt(m[2]);
            let year = parseInt(m[3]);
            year = year < 50 ? 2000 + year : 1900 + year;
            return this._toApi(year, month, day);
        }

        // YYYY-MM-DD
        m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return str;

        // D-Mon-YYYY or DD-Mon-YYYY or D-Mon-YY (e.g., 1-Apr-26, 01-Apr-2026)
        m = str.match(/^(\d{1,2})[\/\-.\s]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-.\s]+(\d{2,4})$/i);
        if (m) {
            const day = parseInt(m[1]);
            const monthStr = m[2].substring(0, 3);
            let year = parseInt(m[3]);
            if (year < 100) year = year < 50 ? 2000 + year : 1900 + year;
            const monthNames = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
            const month = monthNames[monthStr.toLowerCase()];
            if (month) return this._toApi(year, month, day);
        }

        // Month DD, YYYY (e.g., April 1, 2026)
        m = str.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/i);
        if (m) {
            const monthStr = m[1].substring(0, 3);
            const day = parseInt(m[2]);
            const year = parseInt(m[3]);
            const monthNames = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
            const month = monthNames[monthStr.toLowerCase()];
            if (month) return this._toApi(year, month, day);
        }

        // Fallback: try native Date parsing
        const d = new Date(str);
        if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
            return Utils.formatDateApi(d);
        }

        return null;
    },

    _toApi(year, month, day) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    },

    /**
     * Parse an amount string → number (handles Indian/Western comma formats)
     * "4,50,000.00" → 450000, "1,55,760" → 155760, "$12,000" → 12000
     */
    parseAmount(str) {
        if (!str) return null;
        // Remove currency symbols and spaces
        let cleaned = str.replace(/[₹$€£¥\s]/g, '').trim();
        // Indian format: X,XX,XXX.XX → remove commas
        // Western format: XXX,XXX.XX → remove commas
        cleaned = cleaned.replace(/,/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    },

    /**
     * Parse extracted text to find subscription/invoice data.
     * Works with any invoice format.
     */
    parseData(text) {
        const result = {
            orgName: '',
            email: '',
            phone: '',
            address: '',
            gstin: '',
            startDate: '',
            expiryDate: '',
            billingDate: '',
            amount: '',
            totalAmount: '',
            users: '',
            paymentCycle: '',
            invoiceNo: '',
            invoiceDate: '',
            paymentTerms: '',
            confidence: {}
        };

        if (!text) return result;

        const normalized = text.replace(/\s+/g, ' ').trim();
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        // ═══ Organization / Company Name ═══
        // Multiple strategies — try each until one works
        const orgPatterns = [
            // "Buyer (Bill to)" followed by company name (Indian invoice)
            /buyer\s*\(?bill\s*to\)?\s*(.+?)(?:no\.|gstin|state|address|\d{6})/is,
            // "Bill To:" or "Bill to"
            /bill\s*to\s*[:\-]?\s*(.+?)(?:\n|gstin|state|address|email|phone|\d{6})/is,
            // "Client:" or "Customer:"
            /(?:client|customer|company|organisation|organization)\s*[:\-]\s*(.+?)(?:\n|email|phone|address|gstin)/is,
            // "M/s" (Indian business format)
            /m\/s\.?\s*(.+?)(?:\n|,|\.|gstin)/is,
            // "To:" at start of line
            /\bto\s*[:\-]\s*(.+?)(?:\n|email|phone)/is,
        ];

        for (const pattern of orgPatterns) {
            const match = text.match(pattern);
            if (match) {
                // Clean up — take first line, remove common suffixes
                let name = match[1].trim().split('\n')[0].trim();
                // Remove trailing address fragments
                name = name.replace(/,?\s*\d{6}.*$/i, '').replace(/,?\s*(?:pvt|private|limited|llp|ltd)\.?\s*$/i, name.match(/(?:pvt|private|limited|llp|ltd)/i) ? name.match(/.*(?:pvt\.?\s*ltd\.?|private\s*limited|llp|limited)/i)?.[0] || name : name);
                name = name.substring(0, 200).trim();
                if (name.length > 3) {
                    result.orgName = name;
                    result.confidence.orgName = 'high';
                    break;
                }
            }
        }

        // ═══ GSTIN / Tax ID ═══
        const gstinPatterns = [
            /gstin\s*(?:\/\s*uin)?\s*[:\-]?\s*(\d{2}[A-Z0-9]{13})/i,
            /gst\s*(?:no|number|#)?\s*[:\-]?\s*(\d{2}[A-Z0-9]{13})/i,
            /tax\s*id\s*[:\-]?\s*([A-Z0-9]{10,20})/i,
        ];
        // Find buyer's GSTIN (skip seller's — take the one after "buyer/bill to")
        const buyerSection = text.match(/buyer.*?(?=voucher|sl\s*no|description|hsn)/is)?.[0] || '';
        for (const pattern of gstinPatterns) {
            const match = (buyerSection || normalized).match(pattern);
            if (match) {
                result.gstin = match[1].trim();
                result.confidence.gstin = 'high';
                break;
            }
        }

        // ═══ Email ═══
        const emailMatch = normalized.match(/[\w.+-]+@[\w-]+\.[\w.-]+/i);
        if (emailMatch) {
            result.email = emailMatch[0];
            result.confidence.email = 'high';
        }

        // ═══ Phone ═══
        const phonePatterns = [
            /(?:phone|tel|mobile|contact)\s*[:\-]?\s*([\+\d][\d\s\-\.]{8,15})/i,
            /(\+?\d{1,3}[\s\-]?\d{5}[\s\-]?\d{5})/,
            /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
        ];
        for (const pattern of phonePatterns) {
            const match = normalized.match(pattern);
            if (match) {
                result.phone = match[1] ? match[1].trim() : match[0].trim();
                result.confidence.phone = 'medium';
                break;
            }
        }

        // ═══ Dates (Start / End / Expiry) ═══
        // Strategy 1: Look for labeled dates
        const dateStr = '(\\d{1,2}[/\\-.]\\d{1,2}[/\\-.]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[\\-/\\s]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\\-/\\s]+\\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+\\d{1,2},?\\s+\\d{4})';
        const startRegexes = [
            new RegExp('start\\s*date\\s*[:\\-]?\\s*' + dateStr, 'i'),
            new RegExp('(?:from|begin|commencement|effective|w\\.?e\\.?f\\.?)\\s*[:\\-]?\\s*' + dateStr, 'i'),
            new RegExp('subscription\\s*(?:period)?\\s*[:\\-]?\\s*' + dateStr, 'i'),
            new RegExp(dateStr + '\\s*to\\s*' + dateStr, 'i'), // "01/04/2026 to 31/03/2027"
        ];

        const endRegexes = [
            new RegExp('end\\s*date\\s*[:\\-]?\\s*' + dateStr, 'i'),
            new RegExp('(?:expir|valid\\s*(?:till|until|through|upto)|terminat)\\s*(?:y|date)?\\s*[:\\-]?\\s*' + dateStr, 'i'),
            new RegExp('(?:to|till|upto|through)\\s*[:\\-]?\\s*' + dateStr, 'i'),
        ];

        // Try labeled start date
        for (const regex of startRegexes) {
            const match = normalized.match(regex);
            if (match) {
                const parsed = this.parseDate(match[1]);
                if (parsed) {
                    result.startDate = parsed;
                    result.confidence.startDate = 'high';
                    // Check if this regex also captured end date (e.g., "01/04/2026 to 31/03/2027")
                    if (match[2]) {
                        const parsedEnd = this.parseDate(match[2]);
                        if (parsedEnd) {
                            result.expiryDate = parsedEnd;
                            result.confidence.expiryDate = 'high';
                        }
                    }
                    break;
                }
            }
        }

        // Try labeled end date
        if (!result.expiryDate) {
            for (const regex of endRegexes) {
                const match = normalized.match(regex);
                if (match) {
                    const parsed = this.parseDate(match[1]);
                    if (parsed) {
                        result.expiryDate = parsed;
                        result.confidence.expiryDate = 'high';
                        break;
                    }
                }
            }
        }

        // Strategy 2: Find all dates in text, use first and last
        if (!result.startDate || !result.expiryDate) {
            const allDateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/g;
            const allDates = [];
            let dm;
            while ((dm = allDateRegex.exec(normalized)) !== null) {
                const parsed = this.parseDate(dm[1]);
                if (parsed) allDates.push(parsed);
            }
            // Also find "Month DD, YYYY" format
            const monthDateRegex = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/gi;
            while ((dm = monthDateRegex.exec(normalized)) !== null) {
                const parsed = this.parseDate(dm[1]);
                if (parsed) allDates.push(parsed);
            }

            allDates.sort();
            if (allDates.length >= 2) {
                if (!result.startDate) { result.startDate = allDates[0]; result.confidence.startDate = 'low'; }
                if (!result.expiryDate) { result.expiryDate = allDates[allDates.length - 1]; result.confidence.expiryDate = 'low'; }
            }
        }

        // ═══ Users / Licenses / Quantity ═══
        const userPatterns = [
            /(\d+)\s*user/i,
            /total\s*users?\s*[:\-]?\s*(\d+)/i,
            /quantity\s*[:\-]?\s*(\d+)\s*user/i,
            /(\d+)\s*licen[cs]e/i,
            /no\.?\s*of\s*users?\s*[:\-]?\s*(\d+)/i,
        ];
        for (const pattern of userPatterns) {
            const match = normalized.match(pattern);
            if (match) {
                result.users = match[1];
                result.confidence.users = 'high';
                break;
            }
        }

        // ═══ Amounts ═══
        // Strategy: find the largest amount (likely the total) and the base amount
        const amountRegex = /(?:₹|rs\.?|inr|usd|\$|€|£)?\s*([\d,]+\.?\d*)/gi;
        const amounts = [];
        let am;
        while ((am = amountRegex.exec(normalized)) !== null) {
            const val = this.parseAmount(am[1]);
            if (val && val >= 100) amounts.push(val); // ignore tiny numbers
        }
        amounts.sort((a, b) => b - a);

        // Try labeled amounts first
        const totalPatterns = [
            /total\s*(?:amount)?\s*[:\-]?\s*(?:₹|rs\.?|inr|\$|€|£)?\s*([\d,]+\.?\d*)/i,
            /(?:₹|rs\.?)\s*([\d,]+\.?\d*)\s*(?:only)?$/im,
            /amount\s*chargeable.*?(?:₹|rs\.?|inr|\$)?\s*([\d,]+\.?\d*)/i,
            /grand\s*total\s*[:\-]?\s*(?:₹|rs\.?)?\s*([\d,]+\.?\d*)/i,
        ];
        const basePatterns = [
            /(?:licence|license|subscription|fee)\s*(?:fee|amount|charge)?s?\s*.*?(?:₹|rs\.?|\$)?\s*([\d,]+\.?\d*)/i,
            /amount\s*(?:before|excl|excluding)\s*(?:tax|gst)?\s*[:\-]?\s*(?:₹|rs\.?)?\s*([\d,]+\.?\d*)/i,
        ];

        for (const pattern of totalPatterns) {
            const match = normalized.match(pattern);
            if (match) {
                const val = this.parseAmount(match[1]);
                if (val && val > 0) {
                    result.totalAmount = String(val);
                    result.confidence.totalAmount = 'high';
                    break;
                }
            }
        }

        for (const pattern of basePatterns) {
            const match = normalized.match(pattern);
            if (match) {
                const val = this.parseAmount(match[1]);
                if (val && val > 0) {
                    result.amount = String(val);
                    result.confidence.amount = 'high';
                    break;
                }
            }
        }

        // Fallback: use largest amount as total, second largest as base
        if (!result.totalAmount && amounts.length > 0) {
            result.totalAmount = String(amounts[0]);
            result.confidence.totalAmount = 'low';
        }
        if (!result.amount && amounts.length > 1) {
            result.amount = String(amounts[1]);
            result.confidence.amount = 'low';
        }
        if (!result.amount && result.totalAmount) {
            result.amount = result.totalAmount;
        }

        // ═══ Invoice Number ═══
        const invoicePatterns = [
            /(?:invoice|voucher|bill|pi|proforma)\s*(?:no|number|#|ref)\.?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
            /(?:ref|reference)\s*(?:no|number|#)?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
        ];
        for (const pattern of invoicePatterns) {
            const match = normalized.match(pattern);
            if (match) {
                result.invoiceNo = match[1].trim();
                result.confidence.invoiceNo = 'medium';
                break;
            }
        }

        // ═══ Payment Cycle / Subscription Type ═══
        const cyclePatterns = [
            { regex: /\bannual\b/i, value: 'Annual' },
            { regex: /\byearly\b/i, value: 'Annual' },
            { regex: /per\s*year/i, value: 'Annual' },
            { regex: /per\s*annum/i, value: 'Annual' },
            { regex: /\bmonthly\b/i, value: 'Monthly' },
            { regex: /per\s*month/i, value: 'Monthly' },
            { regex: /\bquarterly\b/i, value: 'Quarterly' },
            { regex: /per\s*quarter/i, value: 'Quarterly' },
            { regex: /\bhalf\s*yearly\b/i, value: 'Other' },
            { regex: /\bbi[\-\s]*annual\b/i, value: 'Other' },
        ];

        for (const { regex, value } of cyclePatterns) {
            if (regex.test(normalized)) {
                result.paymentCycle = value;
                result.confidence.paymentCycle = 'high';
                break;
            }
        }

        // If no explicit cycle, calculate from dates
        if (!result.paymentCycle && result.startDate && result.expiryDate) {
            const start = new Date(result.startDate);
            const end = new Date(result.expiryDate);
            const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
            if (months >= 11 && months <= 13) result.paymentCycle = 'Annual';
            else if (months >= 2 && months <= 4) result.paymentCycle = 'Quarterly';
            else if (months <= 1) result.paymentCycle = 'Monthly';
            else result.paymentCycle = 'Other';
            if (result.paymentCycle) result.confidence.paymentCycle = 'medium';
        }

        // ═══ Payment Terms ═══
        const termsMatch = normalized.match(/(?:terms?\s*of\s*payment|payment\s*terms?|mode\s*of\s*payment)\s*[:\-]?\s*(.+?)(?:\.|$|\n)/i);
        if (termsMatch) {
            result.paymentTerms = termsMatch[1].trim().substring(0, 100);
            result.confidence.paymentTerms = 'medium';
        }

        // ═══ Address (from buyer section) ═══
        if (buyerSection) {
            // Try to extract address — lines between org name and GSTIN
            const addrMatch = buyerSection.match(/(?:address|no\.|floor|road|street|town|city|nagar|garden)\s*[:\-,]?\s*(.+?)(?:gstin|state|pin|\d{6})/is);
            if (addrMatch) {
                result.address = addrMatch[1].replace(/\n/g, ', ').replace(/\s+/g, ' ').trim().substring(0, 200);
                result.confidence.address = 'low';
            }
        }

        return result;
    },

    /**
     * Process a file: extract text and parse data
     */
    async processFile(file) {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

        if (!isPdf) {
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
