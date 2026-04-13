"use strict";

const puppeteer = require("puppeteer");
const logger = require("@utils/logger");

class DocumentRenderService {
    constructor() {
        this.browser = null;
        this._initBrowser();

        // Handle graceful horizontal scaling / shutdown
        process.on("SIGINT", () => this._cleanup());
        process.on("SIGTERM", () => this._cleanup());
    }

    /**
     * Lazy Singleton Initializer
     */
    async _initBrowser() {
        if (!this.browser) {
            try {
                this.browser = await puppeteer.launch({
                    headless: "new",
                    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
                });
                logger.info({ service: "DocumentRenderService" }, "Puppeteer Browser initialized.");
            } catch (err) {
                logger.error({ service: "DocumentRenderService", error: err.message }, "Failed to launch Puppeteer.");
            }
        }
        return this.browser;
    }

    /**
     * cleanup()
     */
    async _cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            logger.info({ service: "DocumentRenderService" }, "Puppeteer Browser closed.");
        }
    }

    /**
     * renderDocument(options)
     * Main entry point for HTML -> PDF
     */
    async renderDocument({
        htmlTemplate,
        cssTemplate,
        data,
        paperSize = "A4",
        overlaySettings = {},
        languageMode = "EN"
    }) {
        const browser = await this._initBrowser();
        if (!browser) throw new Error("Rendering engine unavailable.");

        const page = await browser.newPage();

        try {
            // 1. Inject Data (Simple string replacement for performance/safety)
            let finalHtml = htmlTemplate;
            if (data && typeof data === "object") {
                Object.keys(data).forEach(key => {
                    const regex = new RegExp(`{{${key}}}`, "g");
                    finalHtml = finalHtml.replace(regex, data[key] || "");
                });
            }

            // 2. Build Internal Styles
            let styleBlock = cssTemplate || "";
            if (overlaySettings && (overlaySettings.marginTopMM || overlaySettings.marginLeftMM)) {
                styleBlock += `
                    body {
                        margin-top: ${overlaySettings.marginTopMM || 0}mm !important;
                        margin-left: ${overlaySettings.marginLeftMM || 0}mm !important;
                    }
                `;
            }

            // 3. Assemble Full HTML Document
            const dir = (languageMode === "AR" || languageMode === "MIXED") ? "rtl" : "ltr";
            const fullContent = `
                <!DOCTYPE html>
                <html dir="${dir}">
                <head>
                    <meta charset="UTF-8" />
                    <style>
                        ${styleBlock}
                        @page { margin: 0; }
                    </style>
                </head>
                <body>
                    ${finalHtml}
                </body>
                </html>
            `;

            await page.setContent(fullContent, { waitUntil: "networkidle0" });

            // 4. Configure PDF Options
            const pdfOptions = {
                printBackground: true,
                preferCSSPageSize: true
            };

            if (paperSize === "A4") {
                pdfOptions.format = "A4";
            } else if (paperSize === "A5") {
                pdfOptions.format = "A5";
            } else if (paperSize === "THERMAL_80MM") {
                pdfOptions.width = "80mm";
                // Thermal height usually dynamic or long, set a reasonable max if needed or custom
                // pdfOptions.height = "297mm"; 
            }

            const buffer = await page.pdf(pdfOptions);
            return buffer;

        } catch (err) {
            logger.error({ service: "DocumentRenderService", error: err.message }, "PDF rendering failed.");
            throw err;
        } finally {
            await page.close();
        }
    }
}

module.exports = new DocumentRenderService();
