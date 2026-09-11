# Integration job report — 2026-09-11T07:31:31Z

## Schema drift (failure)
```
warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

Loaded Prisma config from prisma.config.ts.

warn The Prisma config file in prisma.config.ts overrides the deprecated `package.json#prisma` property in package.json.
  For more information, see: https://pris.ly/prisma-config


[-] Removed tables
  - ContactRequest
  - DocumentTemplate
  - EmailMessage
  - EmailThread
  - PasswordResetToken
  - Receipt
  - RecoveryCode
  - SequenceCounter
  - Signer

[*] Changed the `AIAction` table
  [-] Removed foreign key on columns (conversationId)
  [-] Removed foreign key on columns (proposedById)
  [-] Removed foreign key on columns (reviewedById)
  [-] Removed index on columns (status)
  [-] Removed index on columns (userId)
  [-] Removed column `conversationId`
  [-] Removed column `error`
  [-] Removed column `executedAt`
  [-] Removed column `payload`
  [-] Removed column `proposedById`
  [-] Removed column `type`

[*] Changed the `AIConversation` table
  [-] Removed foreign key on columns (userId)
  [*] Altered column `title` (default changed from `Some(Value(String("New conversation")))` to `None`)
  [+] Added foreign key on columns (userId)

[*] Changed the `Activity` table
  [-] Removed index on columns (caseId, createdAt)
  [-] Removed index on columns (clientId, createdAt)

[*] Changed the `AppSetting` table
  [-] Removed unique index on columns (id)
  [-] Dropped the primary key on columns (key)
  [*] Altered column `id` (default changed from `Some(DbGenerated(Some("(gen_random_uuid())::text")))` to `None`)
  [+] Added primary key on columns (id)
)
  [+] Added unique index on columns (key)

[*] Changed the `AuditLog` table
  [-] Removed index on columns (createdAt)
  [+] Added index on columns (userId)

[*] Changed the `Case` table
  [+] Added index on columns (ownerId)

[*] Changed the `Client` table
  [-] Removed index on columns (lastName, firstName)
  [+] Added index on columns (phone)
  [+] Added index on columns (status)

[*] Changed the `Document` table
  [-] Removed index on columns (caseId)
  [-] Removed index on columns (clientId)

[*] Changed the `DocumentTemplate` table
  [-] Removed foreign key on columns (createdById)

[*] Changed the `EmailMessage` table
  [-] Removed foreign key on columns (threadId)

[*] Changed the `EmailThread` table
  [-] Removed foreign key on columns (caseId)
  [-] Removed foreign key on columns (clientId)

[*] Changed the `File` table
  [-] Removed index on columns (caseId)
  [-] Removed index on columns (clientId)

[*] Changed the `MailAccount` table
  [-] Removed foreign key on columns (connectedById)
  [-] Removed column `accessToken`
  [-] Removed column `connectedById`
  [-] Removed column `historyId`
  [-] Removed column `provider`
  [-] Removed column `scope`
  [-] Removed column `status`

[*] Changed the `MailThread` table
  [-] Removed foreign key on columns (mailAccountId)
  [-] Removed index on columns (clientId)
  [-] Removed index on columns (lastMessageAt)
  [-] Removed index on columns (mailAccountId)
  [*] Altered column `toEmails` (default changed from `Some(Value(List([])))` to `None`)
  [*] Altered column `updatedAt` (default changed from `Some(Now)` to `None`)
  [+] Added foreign key on columns (mailAccountId)

[*] Changed the `Notification` table
  [-] Removed column `href`

[*] Changed the `PasswordResetToken` table
  [-] Removed foreign key on columns (userId)

[*] Changed the `Payment` table
  [-] Removed index on columns (clientId)
  [-] Removed index on columns (status)
  [*] Altered column `paidAt` (default changed from `Some(Now)` to `None`)

[*] Changed the `Receipt` table
  [-] Removed foreign key on columns (clientId)
  [-] Removed foreign key on columns (paymentId)

[*] Changed the `RecoveryCode` table
  [-] Removed foreign key on columns (userId)

[*] Changed the `Refund` table
  [-] Removed foreign key on columns (approvedById)
  [-] Removed index on columns (clientId)
  [-] Removed index on columns (status)
  [-] Removed column `approvedAt`

[*] Changed the `Session` table
  [+] Added index on columns (expiresAt)

[*] Changed the `SignatureRequest` table
  [-] Removed column `auditTrail`
  [-] Removed column `finalHash`
  [*] Altered column `provider` (default changed from `Some(Value(String("MOCK")))` to `None`)
  [*] Altered column `recipients` (default changed from `Some(Value(String("[]")))` to `None`)

[*] Changed the `Signer` table
  [-] Removed foreign key on columns (signatureRequestId)

[*] Changed the `Task` table
  [-] Removed index on columns (assigneeId, status)
```

## Integration tests (success)
```

> jun-business-hub@1.0.0 test:integration
> vitest run --config vitest.integration.config.ts

[33mThe CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.[39m

[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90m/home/runner/work/jun-business-hub/jun-business-hub[39m

 [32m✓[39m tests/integration/schema.test.ts [2m([22m[2m3 tests[22m[2m)[22m[90m 141[2mms[22m[39m
 [32m✓[39m tests/integration/seed.test.ts [2m([22m[2m3 tests[22m[2m)[22m[33m 416[2mms[22m[39m
   [33m[2m✓[22m[39m dev seed[2m > [22mcreates the documented SUPER_ADMIN with a valid bcrypt hash [33m405[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m6 passed[39m[22m[90m (6)[39m
[2m   Start at [22m 07:31:30
[2m   Duration [22m 1.20s[2m (transform 50ms, setup 0ms, collect 133ms, tests 557ms, environment 0ms, prepare 257ms)[22m

```
