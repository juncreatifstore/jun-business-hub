import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth",()=>({requireUser:vi.fn(async()=>({role:"SUPER_ADMIN"}))}));
vi.mock("next/navigation",()=>({redirect:vi.fn((url:string)=>{throw new Error(`REDIRECT:${url}`)})}));
vi.mock("@/services/company-funds-approvals",()=>({approveFinancialAuthorizationAction:vi.fn(),rejectFinancialAuthorizationAction:vi.fn()}));
import { approveFinancialAuthorizationAction, rejectFinancialAuthorizationAction } from "@/services/company-funds-approvals";
import { requireUser } from "@/lib/auth";
import { submitFinancialAuthorizationDecision } from "@/services/financial-authorization-feedback";
beforeEach(()=>{vi.clearAllMocks();});
const state={message:"",success:false};
function form(decision:string){const f=new FormData();f.set("decision",decision);return f;}
describe("authorization decision feedback",()=>{
  it("shows a requester denial without crashing the route",async()=>{
    vi.mocked(approveFinancialAuthorizationAction).mockRejectedValueOnce(new Error("Requester cannot approve their own financial authorization"));
    const result=await submitFinancialAuthorizationDecision("a",state,form("APPROVE"));
    expect(result.success).toBe(false);expect(result.message).toContain("autre Super Admin");
  });
  it("reports a stale decision as feedback",async()=>{
    vi.mocked(rejectFinancialAuthorizationAction).mockRejectedValueOnce(new Error("Authorization is no longer pending"));
    expect((await submitFinancialAuthorizationDecision("a",state,form("REJECT"))).message).toContain("déjà été traitée");
  });
  it("confirms a successful approval",async()=>{
    expect((await submitFinancialAuthorizationDecision("a",state,form("APPROVE"))).success).toBe(true);
    expect(approveFinancialAuthorizationAction).toHaveBeenCalledOnce();
  });
  it("does not expose internal database errors",async()=>{
    vi.mocked(approveFinancialAuthorizationAction).mockRejectedValueOnce(new Error("private database details"));
    expect((await submitFinancialAuthorizationDecision("a",state,form("APPROVE"))).message).not.toContain("database");
  });
  it("does not act for a non-admin",async()=>{
    vi.mocked(requireUser).mockResolvedValueOnce({role:"FINANCE"} as Awaited<ReturnType<typeof requireUser>>);
    await expect(submitFinancialAuthorizationDecision("a",state,form("APPROVE"))).rejects.toThrow("REDIRECT:/app/forbidden");
    expect(approveFinancialAuthorizationAction).not.toHaveBeenCalled();
  });
});
