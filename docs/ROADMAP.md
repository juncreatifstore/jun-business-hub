# Roadmap — vers un système de niveau professionnel

État au 2026-09-10. Chaque phase est livrable indépendamment ; les phases sont
ordonnées par ratio impact / risque.

## Phase 1 — Fondations (LIVRÉE, branche `improve/phase-1-foundations`)

- [x] Rate limiting : mode `critical` fail-closed (login, MFA, reset password), Upstash requis en prod,
      timeout 2 s sur l'appel Redis, GC de la Map mémoire, tests dédiés.
- [x] Suppression de 9 composants mail morts (v1→v4 + panneaux non importés) ; `v6` devient le canonique.
- [x] Prettier + EditorConfig + `.nvmrc` ; base de code entièrement formatée (255 fichiers semi-minifiés → 0).
- [x] Scripts npm : `typecheck`, `format`, `format:check`, `check` ; suppression de `db:push`
      (interdit en prod, ne doit pas être à un `npm run` de distance).
- [x] CI : format check, lint strict (`--max-warnings=0`), job `security` (npm audit high+, gitleaks),
      concurrency cancel-in-progress, Node piloté par `.nvmrc`.
- [x] README réaligné sur le code réel (Prisma, WhatsApp, company funds, nombre de tests, Upstash).

## Phase 2 — Fiabilité (1–2 semaines)

- [ ] **Tests d'intégration sur base réelle** : service Postgres dans la CI, `prisma migrate deploy`,
      tests des server actions critiques (paiement, remboursement, échéancier, clôture mensuelle,
      isolation portail client) via Vitest + un helper `withTestDb()`.
- [ ] **Tests E2E Playwright** sur les parcours : login + MFA, création dossier → document → PDF → vérif QR,
      paiement manuel → reçu, portail client (403 cross-client).
- [ ] **Observabilité** : Sentry (ou équivalent) côté serveur + edge, `request-id` propagé dans les logs,
      logs structurés JSON (`pino`) à la place de `console.*`.
- [ ] **Health check** `/api/health` (DB, storage, providers) pour Vercel/uptime monitoring.
- [ ] Migration Prisma vers `@prisma/adapter-pg` + `engineType = "client"` (la dépendance est déjà
      présente mais inutilisée ; supprime le téléchargement de binaires en CI).

## Phase 3 — Architecture & dette (2–3 semaines)

- [ ] **Nettoyer les suffixes de version** : `mail-sync-v2`, `finance-manual-receivers-v2`,
      `drive-phase11-settings`, `document-create-d5` → un seul module par responsabilité, l'ancien supprimé.
- [ ] **Découper `services/` et `lib/` par domaine** (`modules/finance`, `modules/mail`, `modules/drive`…)
      avec un `index.ts` public par module et des imports croisés interdits via ESLint (`no-restricted-imports`).
- [ ] **Couche « repository »** pour isoler Prisma des server actions (facilite les tests et une future
      migration de driver).
- [ ] Éliminer les 13 `: any` restants et activer `noUncheckedIndexedAccess`.
- [ ] Traiter les 25 `TODO/FIXME` : chacun devient une issue GitHub ou est supprimé.

## Phase 4 — Sécurité renforcée

- [ ] MFA **obligatoire** (pas seulement recommandée) pour SUPER_ADMIN, DIRECTOR, ADMIN, FINANCE, LEGAL,
      ACCOUNTANT — blocage à la connexion tant que non enrôlée.
- [ ] Rotation de `AUTH_SECRET` sans invalider MFA/Gmail : clé de chiffrement des secrets séparée
      (`SECRETS_ENCRYPTION_KEY`) avec support de deux clés pendant la rotation.
- [ ] Politique de mots de passe (zxcvbn ≥ 3) + vérification HaveIBeenPwned (k-anonymity).
- [ ] Sessions : empreinte device/UA, liste des sessions actives, révocation à distance déjà présente → UI.
- [ ] Audit externe (pentest) avant d'activer les paiements en ligne.

## Phase 5 — Produit

- [ ] Paiements en ligne : Stripe d'abord (webhook signé, idempotence, réconciliation avec `Payment`),
      Mercado Pago ensuite pour le marché MX.
- [ ] Notifications temps réel (Supabase Realtime ou SSE) pour tâches, mails, signatures.
- [ ] Export comptable (CSV/QuickBooks) et rapports périodiques planifiés (Vercel Cron).
- [ ] i18n complète FR/EN/ES (le code mélange aujourd'hui les trois dans les messages utilisateur).

## Conventions à partir de la phase 1

- Toute PR passe `npm run check` en local avant push.
- Pas de fichier `-v2`, `-v3` : on remplace, on ne duplique pas.
- Tout endpoint d'authentification utilise `rateLimitAsync(..., { critical: true })`.
- Toute nouvelle règle métier finance/signature est accompagnée d'un test.
