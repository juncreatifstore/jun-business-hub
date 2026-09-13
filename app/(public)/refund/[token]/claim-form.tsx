"use client";
import { useState } from "react";
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, FileUp, Loader2, Send } from "lucide-react";

type Payment = { id: string; reference: string; amount: number; currency: string; date: string };
type Opt = { code: string; label: string };

const T = {
  fr: {
    steps: ["Identité", "Paiement", "Service", "Motif", "Remboursement"],
    identity: "Vérification de votre identité",
    identityHelp: "Pour protéger votre argent, nous vérifions que la demande vient bien de vous.",
    fullName: "Nom complet (tel que sur la pièce d’identité)",
    dob: "Date de naissance",
    idType: "Type de pièce",
    idTypes: [
      ["PASSPORT", "Passeport"],
      ["NATIONAL_ID", "Carte d’identité"],
      ["DRIVER_LICENSE", "Permis de conduire"],
      ["RESIDENCE_PERMIT", "Titre de séjour"],
    ],
    idNumber: "Numéro de la pièce",
    idPhoto: "Photo de la pièce d’identité",
    idPhotoHelp:
      "Prenez la photo directement ou choisissez un fichier. La pièce doit être lisible en entier.",
    selfie: "Photo de vous tenant la pièce (selfie)",
    selfieHelp: "Visage et pièce visibles sur la même photo.",
    take: "Prendre une photo",
    choose: "Choisir un fichier",
    payment: "Le paiement que vous souhaitez récupérer",
    paymentHelp: "Nous devons pouvoir retrouver ce paiement dans nos registres.",
    pickPayment: "Paiement enregistré chez nous",
    otherPayment: "Autre paiement / je ne le trouve pas",
    paidOn: "Date du paiement",
    paidAmount: "Montant payé",
    currency: "Devise",
    method: "Moyen de paiement utilisé",
    methods: [
      ["CASH", "Espèces en agence"],
      ["BANK_TRANSFER", "Virement bancaire"],
      ["CARD", "Carte bancaire"],
      ["ZELLE", "Zelle"],
      ["PAYPAL", "PayPal"],
      ["MONCASH", "MonCash / mobile money"],
      ["WESTERN_UNION", "Western Union / MoneyGram"],
      ["OTHER", "Autre"],
    ],
    payRef: "Référence, numéro de reçu ou de transaction",
    paidTo: "À qui / où avez-vous payé (agence, personne, compte) ?",
    proof: "Preuve de paiement",
    proofHelp: "Reçu, capture d’écran du virement, ticket… Obligatoire.",
    service: "Le service concerné",
    serviceType: "Type de service",
    serviceTypes: [
      ["VISA", "Visa / immigration"],
      ["TRAVEL", "Voyage / billet / hôtel"],
      ["DOCUMENTS", "Documents / démarches"],
      ["DESIGN", "Création / design"],
      ["OTHER", "Autre"],
    ],
    serviceDesc: "Décrivez le service acheté",
    caseRef: "Numéro de dossier (si connu)",
    serviceDate: "Date prévue du service (voyage, rendez-vous…)",
    reason: "Pourquoi demandez-vous ce remboursement ?",
    reasonMain: "Motif principal",
    reasonDetail: "Expliquez précisément (au moins 40 caractères)",
    reasonPlaceholder:
      "Ce qui était prévu, ce qui s’est passé, quand, et pourquoi vous estimez avoir droit à un remboursement…",
    amountAsk: "Montant demandé",
    amountFull: "Je demande le remboursement intégral",
    evidence: "Justificatifs du motif",
    evidenceHelp:
      "Lettre de refus, annulation de vol, échanges, photos… Tout élément qui appuie votre demande.",
    payout: "Comment souhaitez-vous être remboursé ?",
    contact: "Vous joindre",
    email: "E-mail",
    phone: "Téléphone / WhatsApp",
    declaration: "Déclaration",
    declText:
      "Je déclare sur l’honneur que les informations et documents fournis sont exacts et authentiques. Je comprends qu’une fausse déclaration peut entraîner le rejet de la demande et des poursuites.",
    signature: "Signez en tapant votre nom complet",
    consent: "J’accepte que JUN CREATIF AND TRAVEL LLC traite ces données pour instruire ma demande.",
    next: "Continuer",
    back: "Retour",
    submit: "Envoyer ma demande",
    sending: "Envoi…",
    required: "Champ requis",
    done: "Merci, votre demande est envoyée. Un accusé de réception vous a été adressé par e-mail.",
    fail: "Envoi impossible",
    bankHolder: "Titulaire du compte",
    bankName: "Banque",
    bankAccount: "IBAN / numéro de compte",
    bankSwift: "SWIFT / BIC / routing",
    bankCountry: "Pays de la banque",
    specify: "Précisez",
    max: "Maximum",
  },
  en: {
    steps: ["Identity", "Payment", "Service", "Reason", "Refund"],
    identity: "Verify your identity",
    identityHelp: "To protect your money, we check the request really comes from you.",
    fullName: "Full name (as on your ID)",
    dob: "Date of birth",
    idType: "ID type",
    idTypes: [
      ["PASSPORT", "Passport"],
      ["NATIONAL_ID", "National ID"],
      ["DRIVER_LICENSE", "Driver license"],
      ["RESIDENCE_PERMIT", "Residence permit"],
    ],
    idNumber: "ID number",
    idPhoto: "Photo of the ID document",
    idPhotoHelp: "Take the photo directly or choose a file. The whole document must be readable.",
    selfie: "Photo of you holding the ID (selfie)",
    selfieHelp: "Face and document visible on the same photo.",
    take: "Take a photo",
    choose: "Choose a file",
    payment: "The payment you want back",
    paymentHelp: "We must be able to find this payment in our records.",
    pickPayment: "Payment recorded with us",
    otherPayment: "Other payment / I can’t find it",
    paidOn: "Payment date",
    paidAmount: "Amount paid",
    currency: "Currency",
    method: "Payment method used",
    methods: [
      ["CASH", "Cash at the office"],
      ["BANK_TRANSFER", "Bank transfer"],
      ["CARD", "Bank card"],
      ["ZELLE", "Zelle"],
      ["PAYPAL", "PayPal"],
      ["MONCASH", "MonCash / mobile money"],
      ["WESTERN_UNION", "Western Union / MoneyGram"],
      ["OTHER", "Other"],
    ],
    payRef: "Reference, receipt or transaction number",
    paidTo: "Who / where did you pay (office, person, account)?",
    proof: "Proof of payment",
    proofHelp: "Receipt, transfer screenshot, ticket… Required.",
    service: "The service concerned",
    serviceType: "Service type",
    serviceTypes: [
      ["VISA", "Visa / immigration"],
      ["TRAVEL", "Travel / ticket / hotel"],
      ["DOCUMENTS", "Documents / procedures"],
      ["DESIGN", "Creative / design"],
      ["OTHER", "Other"],
    ],
    serviceDesc: "Describe the service purchased",
    caseRef: "Case number (if known)",
    serviceDate: "Planned service date (trip, appointment…)",
    reason: "Why are you requesting this refund?",
    reasonMain: "Main reason",
    reasonDetail: "Explain precisely (at least 40 characters)",
    reasonPlaceholder:
      "What was planned, what happened, when, and why you believe you are entitled to a refund…",
    amountAsk: "Amount requested",
    amountFull: "I request a full refund",
    evidence: "Evidence for the reason",
    evidenceHelp:
      "Refusal letter, flight cancellation, messages, photos… Anything that supports your request.",
    payout: "How would you like to be refunded?",
    contact: "Reaching you",
    email: "E-mail",
    phone: "Phone / WhatsApp",
    declaration: "Declaration",
    declText:
      "I declare on my honour that the information and documents provided are accurate and authentic. I understand that a false statement may lead to rejection and legal action.",
    signature: "Sign by typing your full name",
    consent: "I agree that JUN CREATIF AND TRAVEL LLC processes this data to handle my request.",
    next: "Continue",
    back: "Back",
    submit: "Submit my request",
    sending: "Sending…",
    required: "Required",
    done: "Thank you, your request was sent. An acknowledgement was e-mailed to you.",
    fail: "Submission failed",
    bankHolder: "Account holder",
    bankName: "Bank",
    bankAccount: "IBAN / account number",
    bankSwift: "SWIFT / BIC / routing",
    bankCountry: "Bank country",
    specify: "Please specify",
    max: "Maximum",
  },
} as const;

function FileField({
  name,
  label,
  help,
  capture,
  required,
  multiple,
  t,
}: {
  name: string;
  label: string;
  help?: string;
  capture?: "user" | "environment";
  required?: boolean;
  multiple?: boolean;
  t: (typeof T)["fr"] | (typeof T)["en"];
}) {
  const [names, setNames] = useState<string[]>([]);
  const idA = `${name}-cam`;
  const idB = `${name}-file`;
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      {help ? <p className="mb-2 text-xs text-muted2">{help}</p> : null}
      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={idA}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-electric px-3 py-2 text-sm font-medium text-white"
        >
          <Camera className="h-4 w-4" /> {t.take}
        </label>
        <input
          id={idA}
          name={name}
          type="file"
          accept="image/*"
          capture={capture ?? "environment"}
          multiple={multiple}
          className="hidden"
          onChange={(e) => setNames(Array.from(e.target.files ?? []).map((f) => f.name))}
        />
        <label
          htmlFor={idB}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface"
        >
          <FileUp className="h-4 w-4" /> {t.choose}
        </label>
        <input
          id={idB}
          name={name}
          type="file"
          accept="image/*,application/pdf"
          multiple={multiple}
          className="hidden"
          onChange={(e) => setNames(Array.from(e.target.files ?? []).map((f) => f.name))}
        />
      </div>
      {names.length ? (
        <ul className="mt-2 space-y-0.5 text-xs text-emerald-700">
          {names.map((n) => (
            <li key={n} className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {n}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ClaimForm({
  token,
  language,
  payments,
  lockedPayment,
  defaultEmail,
  defaultPhone,
  defaultName,
  reasons,
  payouts,
}: {
  token: string;
  language: string;
  payments: Payment[];
  lockedPayment: boolean;
  defaultEmail: string;
  defaultPhone: string;
  defaultName: string;
  reasons: Opt[];
  payouts: Opt[];
}) {
  const t = language === "fr" ? T.fr : T.en;
  const [step, setStep] = useState(0);
  const [paymentId, setPaymentId] = useState(payments[0]?.id ?? "");
  const [payout, setPayout] = useState("ORIGINAL");
  const [full, setFull] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const selected = payments.find((p) => p.id === paymentId) ?? null;
  const input =
    "h-11 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-electric";
  const label = "mb-1 block text-sm font-medium";
  const req = <span className="text-red-600"> *</span>;

  function validateStep(form: HTMLFormElement, s: number) {
    const sections = form.querySelectorAll<HTMLElement>("[data-step]");
    const section = Array.from(sections).find((el) => Number(el.dataset.step) === s);
    if (!section) return true;
    const fields = section.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input, select, textarea",
    );
    for (const f of fields) {
      if (f.type === "file") {
        // grouped inputs (camera + file) share a name: valid if any of them has a file
        const group = section.querySelectorAll<HTMLInputElement>(`input[type=file][name="${f.name}"]`);
        const any = Array.from(group).some((g) => g.files && g.files.length > 0);
        const required = group[0]?.dataset.required === "1";
        if (required && !any) {
          setError(`${t.required}: ${group[0]?.dataset.label ?? f.name}`);
          return false;
        }
        continue;
      }
      if (!f.checkValidity()) {
        f.reportValidity();
        return false;
      }
    }
    setError(null);
    return true;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    for (let s = 0; s < 5; s++) if (!validateStep(form, s)) return setStep(s);
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData(form);
      const res = await fetch(`/api/refund/${token}`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) setError(data.error ?? t.fail);
      else setDone(true);
    } catch {
      setError(t.fail);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {t.done}
      </div>
    );

  const show = (s: number) => (step === s ? "" : "hidden");

  return (
    <form onSubmit={submit} className="mt-6 space-y-5" noValidate={false}>
      <ol className="flex flex-wrap gap-2 text-xs">
        {t.steps.map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-3 py-1 ${i === step ? "bg-electric text-white" : i < step ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted2"}`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {/* 1 — Identity */}
      <fieldset data-step="0" className={`space-y-4 rounded-xl border border-line bg-white p-4 ${show(0)}`}>
        <legend className="px-1 text-sm font-semibold">{t.identity}</legend>
        <p className="text-xs text-muted2">{t.identityHelp}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>
              {t.fullName}
              {req}
            </label>
            <input name="fullName" defaultValue={defaultName} required minLength={3} className={input} />
          </div>
          <div>
            <label className={label}>
              {t.dob}
              {req}
            </label>
            <input name="dateOfBirth" type="date" required className={input} />
          </div>
          <div>
            <label className={label}>
              {t.idType}
              {req}
            </label>
            <select name="idType" required className={input} defaultValue="PASSPORT">
              {t.idTypes.map(([c, l]) => (
                <option key={c} value={c}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>
              {t.idNumber}
              {req}
            </label>
            <input name="idNumber" required minLength={4} className={input} />
          </div>
        </div>
        <div data-required="1" data-label={t.idPhoto}>
          <FileField
            name="file_id"
            label={t.idPhoto}
            help={t.idPhotoHelp}
            capture="environment"
            required
            t={t}
          />
        </div>
        <div data-required="1" data-label={t.selfie}>
          <FileField name="file_selfie" label={t.selfie} help={t.selfieHelp} capture="user" required t={t} />
        </div>
      </fieldset>

      {/* 2 — Payment */}
      <fieldset data-step="1" className={`space-y-4 rounded-xl border border-line bg-white p-4 ${show(1)}`}>
        <legend className="px-1 text-sm font-semibold">{t.payment}</legend>
        <p className="text-xs text-muted2">{t.paymentHelp}</p>
        {payments.length ? (
          <div>
            <label className={label}>{t.pickPayment}</label>
            <select
              name="paymentId"
              value={paymentId}
              onChange={(e) => setPaymentId(e.target.value)}
              disabled={lockedPayment}
              className={input}
            >
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.reference} · {p.currency} {p.amount.toFixed(2)} ·{" "}
                  {new Date(p.date).toLocaleDateString(language === "fr" ? "fr-FR" : "en-US")}
                </option>
              ))}
              {!lockedPayment ? <option value="">{t.otherPayment}</option> : null}
            </select>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>
              {t.paidOn}
              {req}
            </label>
            <input
              name="paidOn"
              type="date"
              required
              defaultValue={selected ? selected.date.slice(0, 10) : ""}
              className={input}
            />
          </div>
          <div>
            <label className={label}>
              {t.paidAmount}
              {req}
            </label>
            <input
              name="paidAmount"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={selected?.amount.toFixed(2) ?? ""}
              className={input}
            />
          </div>
          <div>
            <label className={label}>
              {t.currency}
              {req}
            </label>
            <input
              name="currency"
              defaultValue={selected?.currency ?? "USD"}
              readOnly={Boolean(selected)}
              maxLength={3}
              required
              className={input}
            />
          </div>
          <div>
            <label className={label}>
              {t.method}
              {req}
            </label>
            <select name="paymentMethod" required className={input} defaultValue="">
              <option value="" disabled>
                —
              </option>
              {t.methods.map(([c, l]) => (
                <option key={c} value={c}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>{t.payRef}</label>
            <input name="paymentReference" defaultValue={selected?.reference ?? ""} className={input} />
          </div>
          <div>
            <label className={label}>
              {t.paidTo}
              {req}
            </label>
            <input name="paidTo" required className={input} />
          </div>
        </div>
        <div data-required="1" data-label={t.proof}>
          <FileField
            name="file_proof"
            label={t.proof}
            help={t.proofHelp}
            capture="environment"
            required
            multiple
            t={t}
          />
        </div>
      </fieldset>

      {/* 3 — Service */}
      <fieldset data-step="2" className={`space-y-4 rounded-xl border border-line bg-white p-4 ${show(2)}`}>
        <legend className="px-1 text-sm font-semibold">{t.service}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>
              {t.serviceType}
              {req}
            </label>
            <select name="serviceType" required className={input} defaultValue="">
              <option value="" disabled>
                —
              </option>
              {t.serviceTypes.map(([c, l]) => (
                <option key={c} value={c}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>{t.caseRef}</label>
            <input name="caseReference" className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>
              {t.serviceDesc}
              {req}
            </label>
            <textarea
              name="serviceDescription"
              rows={3}
              required
              minLength={10}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-electric"
            />
          </div>
          <div>
            <label className={label}>{t.serviceDate}</label>
            <input name="serviceDate" type="date" className={input} />
          </div>
        </div>
      </fieldset>

      {/* 4 — Reason */}
      <fieldset data-step="3" className={`space-y-4 rounded-xl border border-line bg-white p-4 ${show(3)}`}>
        <legend className="px-1 text-sm font-semibold">{t.reason}</legend>
        <div>
          <label className={label}>
            {t.reasonMain}
            {req}
          </label>
          <select name="reasonCode" required className={input} defaultValue="">
            <option value="" disabled>
              —
            </option>
            {reasons.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>
            {t.reasonDetail}
            {req}
          </label>
          <textarea
            name="reason"
            rows={5}
            required
            minLength={40}
            maxLength={3000}
            placeholder={t.reasonPlaceholder}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-electric"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="fullRefund"
              checked={full}
              onChange={(e) => setFull(e.target.checked)}
            />{" "}
            {t.amountFull}
          </label>
          {!full ? (
            <div>
              <label className={label}>
                {t.amountAsk}
                {req}
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={selected?.amount ?? undefined}
                required
                className={input}
              />
              {selected ? (
                <p className="mt-1 text-[11px] text-muted2">
                  {t.max}: {selected.currency} {selected.amount.toFixed(2)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <FileField
          name="file_evidence"
          label={t.evidence}
          help={t.evidenceHelp}
          capture="environment"
          multiple
          t={t}
        />
      </fieldset>

      {/* 5 — Payout + contact + declaration */}
      <fieldset data-step="4" className={`space-y-4 rounded-xl border border-line bg-white p-4 ${show(4)}`}>
        <legend className="px-1 text-sm font-semibold">{t.payout}</legend>
        <select
          name="payoutMethod"
          value={payout}
          onChange={(e) => setPayout(e.target.value)}
          className={input}
        >
          {payouts.map((m) => (
            <option key={m.code} value={m.code}>
              {m.label}
            </option>
          ))}
        </select>
        {payout === "BANK_TRANSFER" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label}>
                {t.bankHolder}
                {req}
              </label>
              <input name="bankHolder" required className={input} />
            </div>
            <div>
              <label className={label}>
                {t.bankName}
                {req}
              </label>
              <input name="bankName" required className={input} />
            </div>
            <div>
              <label className={label}>
                {t.bankAccount}
                {req}
              </label>
              <input name="bankAccount" required className={input} />
            </div>
            <div>
              <label className={label}>{t.bankSwift}</label>
              <input name="bankSwift" className={input} />
            </div>
            <div>
              <label className={label}>{t.bankCountry}</label>
              <input name="bankCountry" className={input} />
            </div>
          </div>
        ) : payout === "OTHER" ? (
          <div>
            <label className={label}>
              {t.specify}
              {req}
            </label>
            <input name="payoutOther" required className={input} />
          </div>
        ) : null}
        <div className="border-t border-line pt-4">
          <div className="mb-2 text-sm font-semibold">{t.contact}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>
                {t.email}
                {req}
              </label>
              <input
                name="contactEmail"
                type="email"
                defaultValue={defaultEmail}
                required
                className={input}
              />
            </div>
            <div>
              <label className={label}>{t.phone}</label>
              <input name="contactPhone" defaultValue={defaultPhone} className={input} />
            </div>
          </div>
        </div>
        <div className="border-t border-line pt-4">
          <div className="mb-2 text-sm font-semibold">{t.declaration}</div>
          <p className="rounded-lg bg-surface p-3 text-xs">{t.declText}</p>
          <label className={`${label} mt-3`}>
            {t.signature}
            {req}
          </label>
          <input name="signature" required minLength={3} className={`${input} font-serif italic`} />
          <label className="mt-3 flex items-start gap-2 text-xs text-muted2">
            <input type="checkbox" name="consent" required className="mt-0.5" /> {t.consent}
          </label>
        </div>
        <div className="hidden" aria-hidden="true">
          <input name="website" tabIndex={-1} autoComplete="off" />
        </div>
      </fieldset>

      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="inline-flex h-11 items-center gap-1 rounded-lg border border-line px-4 text-sm disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> {t.back}
        </button>
        {step < 4 ? (
          <button
            type="button"
            onClick={(e) => {
              const form = (e.currentTarget as HTMLButtonElement).form!;
              if (validateStep(form, step)) setStep((s) => s + 1);
            }}
            className="inline-flex h-11 items-center gap-1 rounded-lg bg-electric px-5 text-sm font-semibold text-white"
          >
            {t.next} <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-electric px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy ? t.sending : t.submit}
          </button>
        )}
      </div>
    </form>
  );
}
