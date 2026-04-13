# Platform Assets

This directory stores static assets used by backend services:

- `logo.png` — Company logo (PNG/JPEG) for invoice PDFs, email templates, etc.

## Logo Requirements

- Format: PNG (transparent background recommended) or JPEG
- Size: 200×80 px minimum (the PDF renderer fits it to 80×40 pt)
- Replace this placeholder with your actual logo file

## Branding Override via Environment Variables

You can override branding settings without modifying code:

```env
PLATFORM_BRAND_NAME=Your Company Name
PLATFORM_BRAND_TAGLINE=Your tagline here
PLATFORM_BRAND_ADDRESS=Your address here
PLATFORM_SUPPORT_EMAIL=billing@yourcompany.com
PLATFORM_BRAND_COLOR=#1e40af
PLATFORM_BRAND_COLOR_LIGHT=#eff6ff
PLATFORM_LOGO_PATH=/absolute/path/to/your/logo.png
```
