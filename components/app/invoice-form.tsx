"use client";

import { useState } from "react";
import { createInvoice } from "@/services/finance-invoices";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

type Row = { id: string; description: string; quantity: string; unitPrice: string; taxRate: string };

export function InvoiceForm({ clients, cases }: { clients: Array<{ id:string;firstName:string;lastName:string;internalId:string }>; cases:Array<{ id:string;caseNumber:string;title:string;clientId:string }> }) {
  const [clientId,setClientId]=useState("");
  const [rows,setRows]=useState<Row[]>([{id:crypto.randomUUID(),description:"",quantity:"1",unitPrice:"",taxRate:"0"}]);
  const visibleCases=cases.filter(c=>!clientId||c.clientId===clientId);
  const subtotal=rows.reduce((s,r)=>s+(Number(r.quantity)||0)*(Number(r.unitPrice)||0),0);
  const tax=rows.reduce((s,r)=>{const b=(Number(r.quantity)||0)*(Number(r.unitPrice)||0);return s+b*(Number(r.taxRate)||0)/100},0);
  const add=()=>setRows(v=>[...v,{id:crypto.randomUUID(),description:"",quantity:"1",unitPrice:"",taxRate:"0"}]);
  const remove=(id:string)=>setRows(v=>v.length>1?v.filter(r=>r.id!==id):v);
  const patch=(id:string,key:keyof Row,value:string)=>setRows(v=>v.map(r=>r.id===id?{...r,[key]:value}:r));
  return <form action={createInvoice} className="space-y-5">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Field label="Client"><Select name="clientId" value={clientId} onChange={e=>setClientId(e.target.value)} required><option value="">Select client…</option>{clients.map(c=><option key={c.id} value={c.id}>{c.lastName}, {c.firstName} · {c.internalId}</option>)}</Select></Field>
      <Field label="Case (optional)"><Select name="caseId" defaultValue=""><option value="">No case</option>{visibleCases.map(c=><option key={c.id} value={c.id}>{c.caseNumber} · {c.title}</option>)}</Select></Field>
      <Field label="Currency"><Input name="currency" defaultValue="USD" maxLength={3} required/></Field>
      <Field label="Due date"><Input name="dueDate" type="date" required/></Field>
    </div>
    <Field label="Invoice title / service"><Input name="title" placeholder="Example: Mexico visa service, flight ticket, consulting" required/></Field>
    <div className="rounded-xl border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line p-4"><div><div className="font-medium">Invoice lines</div><div className="text-xs text-muted2">Quantity × unit price + optional tax.</div></div><Button type="button" variant="outline" onClick={add}><Plus className="h-4 w-4"/>Add line</Button></div>
      <div className="space-y-3 p-4">{rows.map((r,i)=><div key={r.id} className="grid gap-3 rounded-lg border border-line p-3 md:grid-cols-[minmax(0,1fr)_100px_140px_100px_44px]">
        <Field label={`Description ${i+1}`}><Input name="lineDescription" value={r.description} onChange={e=>patch(r.id,"description",e.target.value)} required/></Field>
        <Field label="Qty"><Input name="lineQuantity" type="number" min="0.01" step="0.01" value={r.quantity} onChange={e=>patch(r.id,"quantity",e.target.value)} required/></Field>
        <Field label="Unit price"><Input name="lineUnitPrice" type="number" min="0" step="0.01" value={r.unitPrice} onChange={e=>patch(r.id,"unitPrice",e.target.value)} required/></Field>
        <Field label="Tax %"><Input name="lineTaxRate" type="number" min="0" step="0.01" value={r.taxRate} onChange={e=>patch(r.id,"taxRate",e.target.value)}/></Field>
        <div className="flex items-end"><button type="button" onClick={()=>remove(r.id)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted2 hover:text-red-600"><Trash2 className="h-4 w-4"/></button></div>
      </div>)}</div>
      <div className="border-t border-line bg-surface p-4 text-right text-sm"><div>Subtotal: <strong>{subtotal.toFixed(2)}</strong></div><div>Tax: <strong>{tax.toFixed(2)}</strong></div><div className="mt-1 text-lg">Total: <strong>{(subtotal+tax).toFixed(2)}</strong></div></div>
    </div>
    <div className="grid gap-4 md:grid-cols-2"><Field label="Notes"><Textarea name="notes" rows={4} placeholder="Optional customer-facing notes"/></Field><Field label="Payment terms"><Textarea name="terms" rows={4} defaultValue="Payment due by the stated due date."/></Field></div>
    <Button variant="primary">Create invoice draft</Button>
  </form>;
}
