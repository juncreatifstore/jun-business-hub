"use client";

import { useState } from "react";
import { createInvoice } from "@/services/finance-invoices";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

type Row = { id: string; description: string; quantity: string; unitPrice: string; taxRate: string };

export function InvoiceForm({
  clients,
  cases,
}: {
  clients: Array<{ id: string; firstName: string; lastName: string; internalId: string }>;
  cases: Array<{ id: string; caseNumber: string; title: string; clientId: string }>;
}) {
  const [clientId, setClientId] = useState("");
  const [rows, setRows] = useState<Row[]>([
    { id: crypto.randomUUID(), description: "", quantity: "1", unitPrice: "", taxRate: "0" },
  ]);
  const visibleCases = cases.filter((c) => !clientId || c.clientId === clientId);
  const subtotal = rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0);
  const tax = rows.reduce((s, r) => {
    const b = (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0);
    return s + (b * (Number(r.taxRate) || 0)) / 100;
  }, 0);
  const add = () =>
    setRows((v) => [
      ...v,
      { id: crypto.randomUUID(), description: "", quantity: "1", unitPrice: "", taxRate: "0" },
    ]);
  const remove = (id: string) => setRows((v) => (v.length > 1 ? v.filter((r) => r.id !== id) : v));
  const patch = (id: string, key: keyof Row, value: string) =>
    setRows((v) => v.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  return (
    <form action={createInvoice} className="min-w-0 space-y-5">
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
              <option value="">Sélectionner un client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.lastName}, {c.firstName} · {c.internalId}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="min-w-0">
          <Field label="Dossier (facultatif)">
            <Select name="caseId" defaultValue="" className="min-w-0">
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
            <Input name="currency" defaultValue="USD" maxLength={3} required className="min-w-0 uppercase" />
          </Field>
        </div>
        <div className="min-w-0">
          <Field label="Date d’échéance">
            <Input name="dueDate" type="date" required className="min-w-0" />
          </Field>
        </div>
      </div>

      <Field label="Titre de la facture / service">
        <Input
          name="title"
          placeholder="Ex. : service visa Mexique, billet d’avion, consultation"
          required
          className="min-w-0"
        />
      </Field>

      <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-night-soft/45">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="font-medium">Lignes de facture</div>
            <div className="text-xs text-muted2">Quantité × prix unitaire + taxe facultative.</div>
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

        <div className="border-t border-line bg-ink/[0.025] p-4 text-right text-sm">
          <div>
            Sous-total : <strong>{subtotal.toFixed(2)}</strong>
          </div>
          <div>
            Taxe : <strong>{tax.toFixed(2)}</strong>
          </div>
          <div className="mt-1 text-lg">
            Total : <strong>{(subtotal + tax).toFixed(2)}</strong>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Field label="Notes">
            <Textarea
              name="notes"
              rows={4}
              placeholder="Notes facultatives visibles par le client"
              className="min-w-0 resize-y"
            />
          </Field>
        </div>
        <div className="min-w-0">
          <Field label="Conditions de paiement">
            <Textarea
              name="terms"
              rows={4}
              defaultValue="Paiement dû au plus tard à la date d’échéance indiquée."
              className="min-w-0 resize-y"
            />
          </Field>
        </div>
      </div>

      <Button variant="primary" className="w-full sm:w-auto">
        Créer le brouillon de facture
      </Button>
    </form>
  );
}
