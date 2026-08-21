"use client";
import { useFormState, useFormStatus } from "react-dom";
import { updateTask } from "@/services/tasks";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
function Submit(){const {pending}=useFormStatus();return <Button variant="primary" disabled={pending}>{pending?"Saving…":"Save correction"}</Button>}
export function TaskEditForm({taskId,value,users,clients,cases}:{taskId:string;value:{title:string;description:string;clientId:string;caseId:string;assigneeId:string;priority:string;status:string;dueDate:string};users:{id:string;firstName:string;lastName:string}[];clients:{id:string;firstName:string;lastName:string;internalId:string}[];cases:{id:string;caseNumber:string;title:string}[]}){
 const [state,action]=useFormState(updateTask.bind(null,taskId),{});
 return <form action={action} className="grid max-w-3xl gap-5 sm:grid-cols-2">
  <div className="sm:col-span-2"><Field label="Title"><Input name="title" defaultValue={value.title} required maxLength={200}/></Field></div>
  <Field label="Client"><Select name="clientId" defaultValue={value.clientId}><option value="">No client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.lastName}, {c.firstName} — {c.internalId}</option>)}</Select></Field>
  <Field label="Case"><Select name="caseId" defaultValue={value.caseId}><option value="">No case</option>{cases.map(c=><option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}</Select></Field>
  <Field label="Assignee"><Select name="assigneeId" defaultValue={value.assigneeId}><option value="">Unassigned</option>{users.map(u=><option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</Select></Field>
  <Field label="Priority"><Select name="priority" defaultValue={value.priority}>{["LOW","MEDIUM","HIGH","URGENT"].map(s=><option key={s} value={s}>{s}</option>)}</Select></Field>
  <Field label="Status"><Select name="status" defaultValue={value.status}>{["TODO","IN_PROGRESS","WAITING","DONE","CANCELLED"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</Select></Field>
  <Field label="Due date"><Input name="dueDate" type="date" defaultValue={value.dueDate}/></Field>
  <div className="sm:col-span-2"><Field label="Description"><Textarea name="description" rows={4} defaultValue={value.description}/></Field></div>
  <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4"><Field label="Correction reason" hint="Required and saved to the audit trail."><Textarea name="correctionReason" rows={3} required/></Field></div>
  {state.message?<p className="sm:col-span-2 text-sm text-red-600">{state.message}</p>:null}<div className="sm:col-span-2"><Submit/></div>
 </form>
}
