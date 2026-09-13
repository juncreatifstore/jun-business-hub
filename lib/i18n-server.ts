import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, makeT, parseLang, type Lang } from "@/lib/i18n";

export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}
/** Server components: `const t = await tr(); t("Fichiers", "Files")`. */
export async function tr() {
  return makeT(await getLang());
}
