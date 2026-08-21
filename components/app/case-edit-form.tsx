"use client";
import { useFormState, useFormStatus } from "react-dom";
import { updateCase } from "@/services/cases";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function Submit(){const {pending}=useFormStatus();return <Button variant="primary" disabled={pending}>{pending?"Saving…":"Save correction"}</Button>}
export function CaseEditForm({caseId,clients,value}:{caseId:string;clients:{id:string;firstName:string;lastName:string;internalId:string}[];value:{clientId:string;title:string;type:string;priority:string;status:string;dueDate:string;tags:string;description:string}}){
  const [state,action]=useFormState(updateCase.bind(null,caseId),{}); const err=(k:string)=>state.errors?.[k]?.[0];
  return <form action={action} className="grid max-w-3xl gap-5 sm:grid-cols-2">
    <div className="sm:col-span-2"><Field label="Client"><Select name="clientId" defaultValue={value.clientId} required>{clients.map(c=><option key={c.id} value={c.id}>{c.lastName}, {c.firstName} — {c.internalId}</option>)}</Select></Field>{err("clientId")?<p className="mt-1 text-xs text-red-600">{err("clientId")}</p>:null}</div>
    <div className="sm:col-span-2"><Field label="Title"><Input name="title" defaultValue={value.title} required maxLength={200}/></Field></div>
    <Field label="Type"><Input name="type" defaultValue={value.type} required maxLength={80}/></Field>
    <Field label="Priority"><Select name="priority" defaultValue={value.priority}>{["LOW","MEDIUM","HIGH","URGENT"].map(s=><option key={s} value={s}>{s}</option>)}</Select></Field>
    <Field label="Status"><Select name="status" defaultValue={value.status}>{["OPEN","IN_PROGRESS","WAITING_CLIENT","WAITING_INTERNAL","COMPLETED","CANCELLED","ARCHIVED"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</Select></Field>
    <Field label="Due date"><Input name="dueDate" type="date" defaultValue={value.dueDate}/></Field>
    <Field label="Tags"><Input name="tags" defaultValue={value.tags}/></Field>
    <div className="sm:col-span-2"><Field label="Description"><Textarea name="description" rows={4} defaultValue={value.description}/></Field></div>
    <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4"><Field label="Correction reason" hint="Required. This is saved in the audit trail."><Textarea name="correctionReason" rows={3} required placeholder="Explain what was wrong and why this correction is necessary."/></Field></div>
    {state.message?<p className="sm:col-span-2 text-sm text-red-600">{state.message}</p>:null}<div className="sm:col-span-2"><Submit/></div>
  </form>
}
