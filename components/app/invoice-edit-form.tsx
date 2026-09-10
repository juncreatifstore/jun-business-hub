"use client";

import { useState } from "react";
import { correctInvoice } from "@/services/finance-corrections";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

type Row = { id: string; description: string; quantity: string; unitPrice: string; taxRate: string };

export function InvoiceEditForm({
  invoiceId,
  clients,
  cases,
  value,
}: {
  invoiceId: string;
  clients: Array<{ id: string; firstName: string; lastName: string; internalId: string }>;
  cases: Array<{ id: string; caseNumber: string; title: string; clientId: string }>;
  value: {
    clientId: string;
    caseId: string;
    currency: string;
    dueDate: string;
    title: string;
    notes: string;
    terms: string;
    lines: Array<{ id: string; description: string; quantity: number; unitPrice: number; taxRate: number }>;
    wasSent: boolean;
  };
}) {
  const [clientId, setClientId] = useState(value.clientId);
  const [rows, setRows] = useState<Row[]>(
    value.lines.map((l) => ({
      id: l.id,
      description: l.description,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      taxRate: String(l.taxRate),
    })),
  );
  const visibleCases = cases.filter((c) => !clientId || c.clientId === clientId);
  const add = () =>
    setRows((v) => [
      ...v,
      { id: crypto.randomUUID(), description: "", quantity: "1", unitPrice: "", taxRate: "0" },
    ]);
  const remove = (id: string) => setRows((v) => (v.length > 1 ? v.filter((r) => r.id !== id) : v));
  const patch = (id: string, key: keyof Row, val: string) =>
    setRows((v) => v.map((r) => (r.id === id ? { ...r, [key]: val } : r)));

  return (
    <form action={correctInvoice.bind(null, invoiceId)} className="min-w-0 space-y-5">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0">
          <Field label="Client">
            <Select
              name="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="min-w-0"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.lastName}, {c.firstName} · {c.internalId}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="min-w-0">
          <Field label="Dossier">
            <Select name="caseId" defaultValue={value.caseId} className="min-w-0">
              <option value="">Aucun dossier</option>
              {visibleCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber} · {c.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="min-w-0">
          <Field label="Devise">
            <Input
              name="currency"
              defaultValue={value.currency}
              maxLength={3}
              required
              className="min-w-0 uppercase"
            />
          </Field>
        </div>
        <div className="min-w-0">
          <Field label="Date d’échéance">
            <Input name="dueDate" type="date" defaultValue={value.dueDate} required className="min-w-0" />
          </Field>
        </div>
      </div>

      <Field label="Titre de la facture / service">
        <Input name="title" defaultValue={value.title} required className="min-w-0" />
      </Field>

      <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-night-soft/45">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="font-medium">Lignes de facture</div>
            <div className="text-xs text-muted2">
              Corrigez, ajoutez ou supprimez les lignes avant d’enregistrer.
            </div>
          </div>
          <Button type="button" variant="outline" onClick={add} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Ajouter une ligne
          </Button>
        </div>

        <div className="space-y-3 p-3 sm:p-4">
          {rows.map((r, i) => (
            <div
              key={r.id}
              className="grid min-w-0 gap-3 rounded-xl border border-line bg-black/[0.08] p-3 sm:grid-cols-2 md:grid-cols-[minmax(0,1fr)_100px_140px_100px_44px]"
            >
              <div className="min-w-0 sm:col-span-2 md:col-span-1">
                <Field label={`Description ${i + 1}`}>
                  <Input
                    name="lineDescription"
                    value={r.description}
                    onChange={(e) => patch(r.id, "description", e.target.value)}
                    required
                    className="min-w-0"
                  />
                </Field>
              </div>
              <div className="min-w-0">
                <Field label="Quantité">
                  <Input
                    name="lineQuantity"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={r.quantity}
                    onChange={(e) => patch(r.id, "quantity", e.target.value)}
                    required
                    className="min-w-0"
                  />
                </Field>
              </div>
              <div className="min-w-0">
                <Field label="Prix unitaire">
                  <Input
                    name="lineUnitPrice"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={r.unitPrice}
                    onChange={(e) => patch(r.id, "unitPrice", e.target.value)}
                    required
                    className="min-w-0"
                  />
                </Field>
              </div>
              <div className="min-w-0">
                <Field label="Taxe %">
                  <Input
                    name="lineTaxRate"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={r.taxRate}
                    onChange={(e) => patch(r.id, "taxRate", e.target.value)}
                    className="min-w-0"
                  />
                </Field>
              </div>
              <div className="flex items-end sm:justify-end md:justify-start">
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={rows.length === 1}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line px-3 text-sm text-muted2 transition hover:border-red-500/30 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto md:w-10 md:px-0"
                  aria-label="Supprimer cette ligne"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="md:hidden">Supprimer la ligne</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Field label="Notes">
            <Textarea name="notes" rows={4} defaultValue={value.notes} className="min-w-0 resize-y" />
          </Field>
        </div>
        <div className="min-w-0">
          <Field label="Conditions de paiement">
            <Textarea name="terms" rows={4} defaultValue={value.terms} className="min-w-0 resize-y" />
          </Field>
        </div>
      </div>

      {value.wasSent ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4 text-sm text-amber-100">
          <strong>Facture déjà envoyée.</strong> Cette correction la remettra au statut <strong>DRAFT</strong>
          . La version corrigée devra être envoyée de nouveau.
        </div>
      ) : null}

      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
        <Field label="Motif de la correction" hint="Obligatoire et conservé définitivement dans l’audit.">
          <Textarea name="correctionReason" rows={3} required className="min-w-0 resize-y" />
        </Field>
      </div>

      <Button variant="primary" className="w-full sm:w-auto">
        Enregistrer la correction
      </Button>
    </form>
  );
}
