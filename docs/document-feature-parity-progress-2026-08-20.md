# JUN Documents — Verified parity progress — 2026-08-20

This file supplements `docs/document-feature-parity-audit.md`. The base audit intentionally remains conservative until each block is verified in production.

## Build state

- Vercel: SUCCESS on commit `c32ab686140ab0304216e74b1158c40c07af3a27`.

## Newly verified since the base audit

### Standard fillable fields
Implemented in Document Editor:
- Text
- Number
- Date
- Dropdown
- Checkbox
- Signature placeholder
- Initials placeholder
- Image
- Formula
- Radio

### Smart/template fields
Implemented presets:
- Name
- Email
- Company
- Title
- US Phone Number
- ZIP Code
- US Currency
- EU Currency
- Age
- SSN
- EIN
- Credit Card Number
- US State / territory
- Gender

### Validation
Shared browser/server validation now covers required fields and the smart field format rules above. Filled copies are rejected server-side if configured fields are invalid.

### Field navigation and management
- Preview / Fill Wizard: Previous / Next
- Required-field validation
- Fields-to-fill list with filled/empty status
- Click a field in the list to jump to it
- Field order editor with move-up / move-down and persisted `data-order`
- Independent filled copy; master document remains unchanged

## Still not equivalent to the complete guide

The following major blocks remain open and MUST NOT be called complete yet:

1. Full right-side field properties UI (appearance, default values, limits, min/max, conditional visibility, signer assignment, etc.).
2. Page engine: page thumbnails, add/delete/reorder/rotate/duplicate/move, merge/split.
3. Watermark/date/page numbering/Bates numbering controls.
4. Full document-folder UI, Smart folders, tags, confidential password/lock/reset semantics.
5. Share permissions, review workflow and public LinkToFill.
6. Advanced export: fillable PDF, JPEG, Word/Excel/PowerPoint where technically appropriate, cloud destinations.
7. Bulk Fill and Extract Data.
8. Provider-dependent services: fax, USPS physical mail, online notarization, IRS submission, SMS delivery, additional cloud/Office integrations.
9. Original-PDF text rewrite/erase with preserved source layout.

## Delivery rule

A guide item is moved to COMPLETE only when its end-to-end workflow is reachable, validated, and production-build safe. External services are not simulated: they remain open until a real provider/integration is configured.
