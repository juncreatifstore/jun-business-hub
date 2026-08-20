# JUN Secure Sign — compliance baseline (United States + Mexico)

> Product/compliance engineering checklist, not legal advice. Counsel should review high-value, regulated, notarized, real-estate, family-law, court, testamentary, or jurisdiction-specific documents before production use.

## United States — ESIGN baseline

Primary federal references:
- 15 U.S.C. § 7001: https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title15-section7001
- 15 U.S.C. § 7003 exceptions: https://uscode.house.gov/view.xhtml?req=(title:15%20section:7003%20edition:prelim)

Engineering requirements JUN should preserve:
1. Electronic form/signature cannot be the sole reason a transaction is denied legal effect where ESIGN applies.
2. Parties are not generally forced to accept electronic records; consent matters.
3. For legally required consumer disclosures, use affirmative electronic consent and clearly disclose electronic-record terms, access/retention requirements, paper-copy/withdrawal information where applicable.
4. Records must remain accurately reproducible and accessible for the legally required retention period.
5. Keep strong attribution evidence: signer email verification, consent text/version, time, session identifier, IP/User-Agent audit, document hash, immutable signed PDF, and certificate/audit trail.
6. Do not assume ordinary JUN Secure Sign is sufficient for ESIGN statutory exceptions or documents requiring another formal method.

Important federal exceptions include certain wills/testamentary trusts, adoption/divorce/family-law matters, court orders/notices/official court documents, and other notices listed in 15 U.S.C. § 7003. State law/UETA and sector rules can add requirements.

### JUN status
- Explicit electronic-signature consent: implemented.
- Email OTP identity verification: implemented.
- Type/Draw signature: implemented.
- Timestamp, IP/User-Agent AuditLog, signature method, PDF SHA-256: implemented.
- Reproducible signed PDF + certificate: implemented.
- Link revocation/versioning + unique signing session: implemented.
- Retention metadata/policy: default 7 years, configurable; verify sector-specific required periods.
- Consumer ESIGN disclosure screen covering withdrawal/paper copy/hardware/software: **required before using JUN for transactions where §7001(c) applies**.

## Mexico — Código de Comercio / NOM-151 baseline

Primary references:
- Código de Comercio, Cámara de Diputados (current consolidated text): https://www.diputados.gob.mx/LeyesBiblio/pdf/CCom.pdf
- NOM-151-SCFI-2016, Diario Oficial de la Federación: https://dof.gob.mx/normasOficiales/6499/seeco11_C/seeco11_C.html

Key principles:
1. Código de Comercio art. 89 Bis recognizes legal effects of information contained in a Mensaje de Datos when statutory requirements are met.
2. Art. 93 allows written-form requirements to be satisfied by a data message when information remains integral and accessible for later consultation; when a signature is additionally required, attribution to the parties is essential.
3. Art. 97 describes reliability criteria for an advanced/reliable electronic signature, including control by the signer and detectability of later alteration of the signature/information.
4. Art. 49 and NOM-151-SCFI-2016 concern preservation/integrity of data messages and document digitization. For use cases requiring NOM-151 conservation evidence, a qualified/accredited Prestador de Servicios de Certificación and the applicable constancia process should be evaluated.
5. Documents requiring a public notary/fedatario or other special legal form remain subject to those additional formalities.

### JUN status
- Attribution evidence through verified email + session + audit: implemented.
- Integrity evidence through SHA-256 and archived final PDF: implemented.
- Detectability of post-signature alteration: supported by the final PDF hash and certificate.
- Accessible reproducible record: implemented.
- Ordinary Type/Draw JUN signature should be treated as a general electronic-signature workflow, **not automatically marketed as Firma Electrónica Avanzada/e.firma**.
- NOM-151 constancia from an accredited provider: **not yet integrated**. Add a certified preservation provider when a Mexican transaction/use case requires that stronger evidentiary layer.

## Product restrictions / routing rule

Before allowing a document template to use JUN Native Signature, classify it:
- `STANDARD_E_SIGNATURE`: ordinary business agreements/contracts where electronic signature is permitted.
- `COUNSEL_REVIEW`: high-value, regulated, cross-border, consumer-disclosure-heavy, employment, financial, real-estate, or sector-specific documents.
- `SPECIAL_FORM_REQUIRED`: notarization/fedatario, court filings/notices, excluded ESIGN categories, or any document where governing law mandates another execution form.
- `NOM151_RECOMMENDED_OR_REQUIRED`: Mexico use cases where preservation evidence through an accredited certification provider is required or strategically desirable.

JUN should block automatic signing for `SPECIAL_FORM_REQUIRED` and display a legal-review warning for `COUNSEL_REVIEW`.

## Retention

Default JUN signature retention: **7 years** after activation/completion, stored as `retentionUntil` in signature metadata. This is an operational default, not a universal statutory period. Change `AppSetting.SIGNATURE_RETENTION_YEARS` when counsel or sector rules require a different period. Do not automatically purge records subject to litigation hold, dispute, audit, tax, immigration, regulatory, or other preservation obligations.
