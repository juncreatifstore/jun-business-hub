"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { emptyToNull } from "@/lib/validation";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/services/clients";

const STAFF_ROLES = ["SUPER_ADMIN", "DIRECTOR", "ADMIN", "MANAGER", "FINANCE", "TRAVEL_AGENT", "DOCUMENT_AGENT", "LEGAL", "ACCOUNTANT", "AUDITOR", "VIEWER"] as const;

const userSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(80),
  lastName: z.string().min(1, "Last name is required").max(80),
  email: z.string().email("Valid email required").max(190),
  phone: z.string().max(40).optional(),
  role: z.enum(STAFF_ROLES),
  departmentId: z.string().optional(),
  password: z.string().min(10, "Password must be at least 10 characters").max(100),
});

export async function createTeamMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await assertPermission("TEAM_MANAGE");
  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  // SUPER_ADMIN can only be granted by a SUPER_ADMIN.
  if (d.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
    return { errors: { role: ["Only a Super Admin can create another Super Admin"] } };
  }

  const existing = await prisma.user.findUnique({ where: { email: d.email.toLowerCase() } });
  if (existing) return { errors: { email: ["A user with this email already exists"] } };

  const departmentId = emptyToNull(d.departmentId ?? "");
  if (departmentId && !(await prisma.department.findUnique({ where: { id: departmentId } }))) {
    return { errors: { departmentId: ["Department not found"] } };
  }

  const user = await prisma.user.create({
    data: {
      email: d.email.toLowerCase(),
      passwordHash: await bcrypt.hash(d.password, 12),
      firstName: d.firstName,
      lastName: d.lastName,
      phone: emptyToNull(d.phone ?? ""),
      role: d.role,
      status: "ACTIVE",
      departmentId,
    },
  });

  await audit({ userId: actor.id, action: "USER_CREATE", resourceType: "User", resourceId: user.id, after: { email: user.email, role: user.role } });
  revalidatePath("/app/team");
  redirect("/app/team?toast=Team member created");
}

export async function setUserStatus(userId: string, status: string): Promise<void> {
  const actor = await assertPermission("TEAM_MANAGE");
  if (!["ACTIVE", "SUSPENDED", "DISABLED"].includes(status)) redirect("/app/team?toast_error=Invalid status");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) redirect("/app/team?toast_error=User not found");
  if (target.id === actor.id) redirect("/app/team?toast_error=You cannot change your own status");
  if (target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/app/team?toast_error=Only a Super Admin can manage a Super Admin");

  await prisma.user.update({ where: { id: userId }, data: { status: status as never } });
  await audit({ userId: actor.id, action: "USER_STATUS_CHANGE", resourceType: "User", resourceId: userId, before: { status: target.status }, after: { status } });
  revalidatePath("/app/team");
  redirect(`/app/team?toast=Status updated to ${status.toLowerCase()}`);
}

export async function resetUserPassword(userId: string, formData: FormData): Promise<void> {
  const actor = await assertPermission("TEAM_MANAGE");
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) redirect("/app/team?toast_error=Password must be at least 10 characters");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) redirect("/app/team?toast_error=User not found");
  if (target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/app/team?toast_error=Only a Super Admin can manage a Super Admin");

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  await audit({ userId: actor.id, action: "USER_PASSWORD_RESET", resourceType: "User", resourceId: userId });
  revalidatePath("/app/team");
  redirect("/app/team?toast=Password reset");
}
