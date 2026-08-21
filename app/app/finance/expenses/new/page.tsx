import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EXPENSE_CATEGORIES } from "@/lib/finance-expenses";
import { createExpense } from "@/services/finance-expenses";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic="force-dynamic";
export default async function NewExpensePage(){
  await requirePermission("EXPENSE_CREATE");
  const [clients,cases]=await Promise.all([
    prisma.client.findMany({where:{archivedAt:null},orderBy:[{lastName:"asc"},{firstName:"asc"}],take:300,select:{id:true,firstName:true,lastName:true,internalId:true}}),
    prisma.case.findMany({where:{status:{notIn:["ARCHIVED","CANCELLED"]}},orderBy:{createdAt:"desc"},take:300,select:{id:true,caseNumber:true,title:true,clientId:true}}),
  ]);
  return <div className="max-w-4xl"><PageHeader title="New expense" subtitle="Register a vendor bill or company expense before approval and payment."/>
    <Card><CardContent className="p-5"><form action={createExpense} className="grid gap-4 sm:grid-cols-2">
      <Field label="Vendor / payee"><Input name="vendorName" required maxLength={200}/></Field>
      <Field label="Vendor country"><Input name="vendorCountry" maxLength={120}/></Field>
      <Field label="Category"><Select name="category" defaultValue="OTHER">{EXPENSE_CATEGORIES.map(c=><option key={c} value={c}>{c.replaceAll("_"," ")}</option>)}</Select></Field>
      <Field label="Invoice number"><Input name="invoiceNumber" maxLength={120}/></Field>
      <Field label="Amount"><Input name="amount" type="number" min="0.01" step="0.01" required/></Field>
      <Field label="Currency"><Input name="currency" defaultValue="USD" maxLength={3} required/></Field>
      <Field label="Due date"><Input name="dueDate" type="date"/></Field>
      <Field label="Invoice / proof file ID" hint="Optional JUN Drive file ID"><Input name="invoiceFileId"/></Field>
      <Field label="Client (optional)"><Select name="clientId" defaultValue=""><option value="">No client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.lastName}, {c.firstName} — {c.internalId}</option>)}</Select></Field>
      <Field label="Case (optional)"><Select name="caseId" defaultValue=""><option value="">No case</option>{cases.map(c=><option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}</Select></Field>
      <div className="sm:col-span-2"><Field label="Description / business purpose"><Textarea name="description" rows={5} required/></Field></div>
      <div className="sm:col-span-2"><Button variant="primary" type="submit">Create draft expense</Button></div>
    </form></CardContent></Card></div>;
}
