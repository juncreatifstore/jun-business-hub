import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  refund: { findUnique: vi.fn() },
  refundInstallment: { updateMany: vi.fn(), createMany: vi.fn() },
  appSetting: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } }));
vi.mock("@/lib/auth", () => ({ assertPermission: vi.fn(async()=>({id:"finance"})), requestMeta: ()=>({ip:null,userAgent:null}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/company-funds-work-queue-cache", () => ({ invalidateCompanyFundsWorkQueue: vi.fn() }));
vi.mock("@/services/refund-financial-authorization", () => ({ markRefundInstallmentPaidAuthorized: vi.fn() }));
import { saveRefundPaymentPlan } from "@/services/refund-payment-plan";
import { refundPlanSnapshot } from "@/lib/refund-payment-plan";
import { assertPermission } from "@/lib/auth";

const paid={id:"paid",number:1,amount:1500,status:"PAID",dueDate:new Date("2026-09-10T12:00:00Z")};
const open={id:"open",number:2,amount:3000,status:"SCHEDULED",dueDate:new Date("2026-10-10T12:00:00Z")};
const refund={id:"refund",clientId:"client",status:"PARTIALLY_PAID",amount:4500,installments:[paid,open]};
function data() {
  const form = new FormData();
  form.set("requestId","12345678-1234-1234-1234-123456789012");
  form.set("snapshot",refundPlanSnapshot(refund.installments));
  form.set("rows",JSON.stringify([{amount:"1000",dueDate:"2026-10-10"},{amount:"2000",dueDate:"2026-11-10"}]));
  return form;
}
beforeEach(()=>{
  vi.clearAllMocks();
  db.refund.findUnique.mockResolvedValue(refund);
  db.appSetting.findUnique.mockResolvedValue(null);
  db.appSetting.findMany.mockResolvedValue([]);
});
describe("saving a refund schedule",()=>{
  it("preserves paid rows, cancels only open rows and audits the replacement",async()=>{
    expect((await saveRefundPaymentPlan("refund",{},data())).success).toBe(true);
    expect(assertPermission).toHaveBeenCalledWith("REFUND_APPROVE");
    expect(db.refundInstallment.updateMany).toHaveBeenCalledWith({where:{id:{in:["open"]},status:{in:["SCHEDULED","LATE"]}},data:{status:"CANCELLED"}});
    expect(db.refundInstallment.createMany).toHaveBeenCalledWith({data:[{refundId:"refund",number:3,amount:1000,dueDate:new Date("2026-10-10T12:00:00Z"),status:"SCHEDULED"},{refundId:"refund",number:4,amount:2000,dueDate:new Date("2026-11-10T12:00:00Z"),status:"SCHEDULED"}]});
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });
  it("does not duplicate a submitted schedule",async()=>{
    db.appSetting.findUnique.mockResolvedValue({key:"already-applied"});
    expect((await saveRefundPaymentPlan("refund",{},data())).success).toBe(true);
    expect(db.refundInstallment.createMany).not.toHaveBeenCalled();
  });
  it("rejects stale forms",async()=>{
    const form=data();form.set("snapshot","old");
    expect((await saveRefundPaymentPlan("refund",{},form)).success).toBe(false);
    expect(db.refundInstallment.updateMany).not.toHaveBeenCalled();
  });
  it.each(["PENDING","APPROVED"])("protects %s financial authorizations",async status=>{
    db.appSetting.findMany.mockResolvedValueOnce([{value:JSON.stringify({type:"REFUND",resourceId:"installment:open",status})}]);
    expect((await saveRefundPaymentPlan("refund",{},data())).success).toBe(false);
    expect(db.refundInstallment.updateMany).not.toHaveBeenCalled();
  });
  it("protects payout details and proof already attached",async()=>{
    db.appSetting.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{value:JSON.stringify({proofFileId:"proof"})}]);
    expect((await saveRefundPaymentPlan("refund",{},data())).success).toBe(false);
    expect(db.refundInstallment.createMany).not.toHaveBeenCalled();
  });
  it("refuses a closed refund",async()=>{
    db.refund.findUnique.mockResolvedValue({...refund,status:"PAID"});
    expect((await saveRefundPaymentPlan("refund",{},data())).success).toBe(false);
    expect(db.refundInstallment.updateMany).not.toHaveBeenCalled();
  });
  it("refuses unauthorized users before touching the database",async()=>{
    vi.mocked(assertPermission).mockRejectedValueOnce(new Error("Forbidden"));
    await expect(saveRefundPaymentPlan("refund",{},data())).rejects.toThrow("Forbidden");
    expect(db.refund.findUnique).not.toHaveBeenCalled();
  });
});
