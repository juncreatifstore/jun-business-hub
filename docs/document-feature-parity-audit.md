# JUN Documents — pdfFiller Guide Feature Parity Audit

Source basis: user-provided `jun creatif editor -guide(1).md` (149 functional headings).

Status rules:
- **COMPLETE**: end-to-end JUN workflow exists and is reachable.
- **PARTIAL**: a meaningful core exists, but the guide behavior is not yet fully matched.
- **MISSING**: no verified end-to-end JUN implementation exists.

## Current summary
- COMPLETE: 11
- PARTIAL: 60
- MISSING: 78

Important: this audit is intentionally conservative. A feature must not be labeled COMPLETE merely because a database model, route, or UI placeholder exists.

## 1. Overview of Documents

| Guide line | Function | Status |
|---:|---|---|
| 9 | Overview of documents | **PARTIAL** |
| 18 | Add a document | **PARTIAL** |
| 27 | Add a new document | **PARTIAL** |
| 40 | Create a document | **COMPLETE** |
| 52 | Create a spreadsheet | **MISSING** |
| 61 | Import a document from the cloud | **MISSING** |
| 71 | Get document from URL | **MISSING** |
| 80 | Get document from email | **MISSING** |
| 89 | Request a document | **MISSING** |
| 99 | Search for a document in PDF library | **MISSING** |
| 109 | Search for a document in US Legal library | **MISSING** |

## 2. Folders, Smart Folders, Encrypted Folder

| Guide line | Function | Status |
|---:|---|---|
| 123 | Create a folder and subfolder | **MISSING** |
| 131 | Rename a folder | **MISSING** |
| 138 | Share a folder | **MISSING** |
| 146 | Move a folder to the Trash Bin | **MISSING** |
| 152 | Create a Smart folder | **MISSING** |
| 161 | Edit a Smart folder | **MISSING** |
| 168 | Delete a Smart folder | **MISSING** |
| 174 | Set a password to the Confidential folder | **MISSING** |
| 183 | Lock the Confidential folder | **MISSING** |
| 189 | Reset the Confidential folder's password | **MISSING** |

## 3. Popular Actions with Documents

| Guide line | Function | Status |
|---:|---|---|
| 200 | Popular actions with documents | **MISSING** |
| 204 | Open a document | **COMPLETE** |
| 211 | Save a document to your device or cloud | **PARTIAL** |
| 220 | Convert a document to a different format | **MISSING** |
| 227 | Convert a document to a template | **PARTIAL** |
| 234 | Print a document | **COMPLETE** |
| 241 | Send a document for signature via signNow | **PARTIAL** |
| 248 | Export documents | **PARTIAL** |
| 255 | Email a document | **PARTIAL** |
| 262 | Fax a document | **MISSING** |
| 269 | Notarize a document | **MISSING** |
| 277 | Send a document to the IRS | **MISSING** |
| 284 | Send a document via USPS | **MISSING** |
| 291 | Text a document | **MISSING** |
| 298 | Download a document to your device | **COMPLETE** |

## 4. Workflows with Documents

| Guide line | Function | Status |
|---:|---|---|
| 308 | Share a document by email or link | **MISSING** |
| 316 | Transfer a document to signNow | **PARTIAL** |
| 322 | Create LinkToFill | **MISSING** |
| 331 | Send a document for review | **MISSING** |
| 338 | Share a document with Support | **MISSING** |

## 5. Manage Documents

| Guide line | Function | Status |
|---:|---|---|
| 351 | Rewrite a PDF | **MISSING** |
| 358 | Rearrange pages in a document | **MISSING** |
| 365 | Merge documents | **MISSING** |
| 372 | Split a document | **MISSING** |
| 379 | Clear contents of fillable fields in a document | **PARTIAL** |
| 385 | Tag a document | **MISSING** |
| 391 | Fill PDF documents in bulk | **MISSING** |
| 398 | Extract data from a document | **MISSING** |
| 405 | View document's info | **PARTIAL** |
| 411 | Protect a document with a password | **MISSING** |
| 417 | Add a comment to a document | **PARTIAL** |
| 424 | Sort documents | **PARTIAL** |
| 430 | Duplicate a document | **COMPLETE** |
| 436 | Rename a document | **MISSING** |
| 442 | Move a document to Trash | **PARTIAL** |
| 448 | Move a document to a Folder | **MISSING** |

## 6. Open With

| Guide line | Function | Status |
|---:|---|---|
| 459 | Open a document in Google Drive | **MISSING** |
| 466 | Open a document in Office 365 | **MISSING** |

## 7. Overview of Templates

| Guide line | Function | Status |
|---:|---|---|
| 477 | Overview of templates | **PARTIAL** |
| 481 | Create a template | **PARTIAL** |
| 488 | Create a document from a template | **COMPLETE** |
| 495 | Convert a template to a document | **MISSING** |
| 501 | Delete a template | **PARTIAL** |
| 507 | Manage templates — Overview | **PARTIAL** |
| 511 | Edit a template | **COMPLETE** |
| 518 | Preview a template | **PARTIAL** |

## 8. Edit Documents — Overview of the Editor

| Guide line | Function | Status |
|---:|---|---|
| 528 | How to use the Editor | **PARTIAL** |
| 536 | Accepted document formats | **PARTIAL** |
| 549 | Available tools and services | **PARTIAL** |
| 559 | Shortcuts | **PARTIAL** |
| 570 | Accessibility | **PARTIAL** |
| 577 | Get help | **MISSING** |
| 584 | Feedback | **MISSING** |

## 9. Edit a Document

| Guide line | Function | Status |
|---:|---|---|
| 594 | Available tools and default settings | **PARTIAL** |
| 601 | Add text to a document | **PARTIAL** |
| 609 | Sign a document | **PARTIAL** |
| 621 | Add a date to a document | **PARTIAL** |
| 628 | Add a crossmark, a checkmark, or a circle to a document | **PARTIAL** |
| 635 | Add an image to a document | **PARTIAL** |
| 642 | Add a Text Box to a document | **PARTIAL** |
| 649 | Add a Sticky Note to a document | **PARTIAL** |
| 656 | Erase content from a document | **MISSING** |
| 663 | Highlight content in a document | **PARTIAL** |
| 670 | Blackout content in a document | **PARTIAL** |
| 677 | Add an arrow to a document | **PARTIAL** |
| 683 | Draw a line on the document | **PARTIAL** |
| 690 | Draw on the document | **PARTIAL** |
| 697 | Edit original content of PDF document | **MISSING** |
| 705 | Fill out a document using Wizard | **COMPLETE** |
| 712 | Add a comment to a document | **PARTIAL** |
| 719 | Upload a new document | **MISSING** |

## 10. Fillable Fields

| Guide line | Function | Status |
|---:|---|---|
| 729 | Standard and Template fillable fields | **PARTIAL** |
| 737 | Add fillable fields | **PARTIAL** |
| 745 | General and advanced settings of fillable fields | **PARTIAL** |
| 753 | Advanced settings of a Text field | **PARTIAL** |
| 761 | Advanced settings of a Number field | **PARTIAL** |
| 768 | Advanced settings of a Date field | **PARTIAL** |
| 775 | Advanced settings of a Dropdown field | **PARTIAL** |
| 782 | Advanced settings of a Checkbox field | **PARTIAL** |
| 789 | Advanced settings of a Signature field | **PARTIAL** |
| 796 | Advanced settings of an Initials field | **PARTIAL** |
| 803 | Advanced settings of an Image field | **PARTIAL** |
| 810 | Advanced settings of a Formula field | **PARTIAL** |
| 817 | Advanced settings of a Radio button field | **PARTIAL** |
| 824 | Advanced settings of a Name field | **MISSING** |
| 831 | Advanced settings of an Email field | **MISSING** |
| 838 | Advanced settings of a Company field | **MISSING** |
| 844 | Advanced settings of a Title field | **MISSING** |
| 850 | Advanced settings of a US Phone Number field | **MISSING** |
| 856 | Advanced settings of a ZIP Code field | **MISSING** |
| 862 | Advanced settings of a US Currency field | **MISSING** |
| 869 | Advanced settings of an EU Currency field | **MISSING** |
| 875 | Advanced settings of an Age field | **MISSING** |
| 881 | Advanced settings of an SSN field | **MISSING** |
| 888 | Advanced settings of an EIN field | **MISSING** |
| 894 | Advanced settings of a Credit Card Number field | **MISSING** |
| 901 | Advanced settings of a US State Collection field | **MISSING** |
| 908 | Advanced settings of a Gender field | **MISSING** |
| 914 | Change order of fillable fields | **MISSING** |
| 921 | Create fillable fields | **PARTIAL** |
| 929 | Manage multiple fillable fields (Wizard, Fields to fill in) | **MISSING** |
| 936 | List of fields to fill in | **PARTIAL** |

## 11. Manage Pages in a Document

| Guide line | Function | Status |
|---:|---|---|
| 947 | Rearrange pages | **MISSING** |
| 954 | Delete a page | **MISSING** |
| 960 | Add a new page | **MISSING** |
| 967 | Rotate a page | **MISSING** |
| 974 | Duplicate a page | **MISSING** |
| 981 | Move pages in a document | **MISSING** |

## 12. Watermark, Date, and Numbering

| Guide line | Function | Status |
|---:|---|---|
| 992 | Add a watermark | **PARTIAL** |
| 1000 | Add a date | **MISSING** |
| 1007 | Add page numbering | **MISSING** |
| 1014 | Add bates numbering | **MISSING** |

## 13. Export a Document

| Guide line | Function | Status |
|---:|---|---|
| 1027 | Export a document | **PARTIAL** |
| 1034 | Save a document as | **PARTIAL** |
| 1041 | Save changes made in a document | **COMPLETE** |
| 1047 | Save a document as a fillable PDF | **MISSING** |
| 1054 | Save a document as a JPEG | **MISSING** |
| 1061 | Save a document to a cloud | **MISSING** |
| 1068 | Save a document to your device | **PARTIAL** |

## 14. Send a Document to E-Sign

| Guide line | Function | Status |
|---:|---|---|
| 1078 | Manage e-signature requests | **COMPLETE** |
| 1085 | Create an e-signature draft | **PARTIAL** |
| 1092 | Track e-signature statuses | **COMPLETE** |
| 1099 | Request e-signatures from the editor | **PARTIAL** |
| 1106 | Request e-signatures from My documents | **PARTIAL** |
| 1113 | Request e-signatures from your Contacts | **MISSING** |

## 15. Share a Document

| Guide line | Function | Status |
|---:|---|---|
| 1124 | Share a document | **MISSING** |
| 1132 | Create a link to fill out your document | **MISSING** |
| 1140 | Text a link to a document | **MISSING** |

## Verified JUN capabilities already present

- Operational Documents dashboard with search/filter/status, document registry IDs, versions, finalization, PDF generation, hashing, archive, duplicate, print/download.
- Template library and document creation from active templates.
- Rich document editor with text formatting, autosave/recovery, annotations, image blocks, draw, fillable standard fields, Preview/Fill wizard, required-field validation, and independent filled copies.
- Signature center / native + provider workflows, request statuses, signed PDF/certificate paths.
- Internal Drive/file upload and restricted Company Vault with RBAC/audit-oriented access.

## Highest-priority gaps to close

1. Smart/template field presets + complete advanced validation + field order/list management.
2. Page engine: thumbnails, reorder/add/delete/rotate/duplicate, merge/split.
3. Watermark/date/page/Bates numbering controls.
4. Document folders, Smart folders, tags, confidential lock/password workflow.
5. Share permissions + LinkToFill/public fill copies.
6. Export formats (fillable PDF, JPEG, DOCX/XLSX/PPTX where feasible) and cloud connectors.
7. Bulk Fill + Extract Data.
8. External services (fax, USPS, notarization, IRS, SMS) only after approved provider integrations are configured.
