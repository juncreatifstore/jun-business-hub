import { RefundStartForm } from "./start-form";

export const metadata = { title: "Demande de remboursement — JUN Creatif & Travel" };

export default function RefundStartPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-electric">JUN Creatif &amp; Travel</p>
      <h1 className="mt-2 text-3xl font-semibold">Demander un remboursement</h1>
      <p className="mt-3 text-muted2">
        Indiquez l’adresse e-mail utilisée avec nous. Si elle correspond à un client, vous recevrez un lien
        personnel vers le formulaire de demande (montant, motif, justificatifs, mode de remboursement).
      </p>
      <RefundStartForm />
      <p className="mt-8 text-xs text-muted2">
        Vous n’avez pas reçu de lien ? Vérifiez vos indésirables ou écrivez-nous à finance@juncreatifs.org.
      </p>
    </main>
  );
}
