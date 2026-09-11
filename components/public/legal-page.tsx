import Link from "next/link";
import { prisma } from "@/lib/prisma";

export type LegalKind = "privacy" | "terms" | "deletion";
export type LegalLocale = "en" | "fr" | "es" | "ht";

const languages: { code: LegalLocale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "ht", label: "Kreyòl ayisyen" },
];

type Section = { title: string; paragraphs: string[]; bullets?: string[] };
export type DocumentCopy = { title: string; intro: string; updated: string; sections: Section[] };

const privacy: Record<LegalLocale, DocumentCopy> = {
  en: {
    title: "Privacy Policy",
    intro: "This policy explains how JUN CREATIF AND TRAVEL LLC (\u201cJUN\u201d) collects, uses, stores, and protects information through JUN Business Hub, including information accessed through Google APIs.",
    updated: "Last updated: September 11, 2026",
    sections: [
      { title: "Information we collect", paragraphs: ["We collect account and contact information, client records, documents, transaction records, audit logs, and technical information necessary to operate and secure the service."], bullets: ["When a user connects Google Gmail, we receive the connected email address and OAuth tokens.", "With the user\u2019s authorization, the application can read email metadata and content, send messages, and modify Gmail labels or message state.", "We never receive or store the user\u2019s Google password."] },
      { title: "How Google user data is used", paragraphs: ["Google user data is used only to provide the mail features requested by the authorized user: displaying and synchronizing mailboxes, associating relevant conversations with client records, composing and sending messages, and managing message state.", "JUN\u2019s use and transfer of information received from Google APIs complies with the Google API Services User Data Policy, including the Limited Use requirements. Google user data is not sold, used for advertising, or shared with data brokers."] },
      { title: "Storage, protection, and retention", paragraphs: ["OAuth access and refresh tokens are encrypted before storage. Access is restricted by role and mailbox permission, and relevant actions are logged for security and accountability.", "Synced information is retained only while needed to provide the service, meet contractual or legal obligations, resolve disputes, and protect the service. It is deleted or anonymized when no longer required."] },
      { title: "Sharing", paragraphs: ["We share information only with authorized personnel, service providers acting on our instructions, or authorities when legally required. Providers may include hosting, database, storage, security, payment, communications, and AI-processing services. We require appropriate confidentiality and security safeguards."] },
      { title: "Your choices and rights", paragraphs: ["You may disconnect Gmail at any time from the application and revoke access in your Google Account security settings. You may request access, correction, export, restriction, or deletion of your information, subject to applicable law and legitimate retention duties."], bullets: ["Google permissions: https://myaccount.google.com/permissions", "Data deletion instructions: /data-deletion"] },
      { title: "Contact", paragraphs: ["Privacy questions and requests: admin@juncreatifs.org. Website: https://www.juncreatif.org. JUN CREATIF AND TRAVEL LLC."] },
    ],
  },
  fr: {
    title: "Politique de confidentialité",
    intro: "Cette politique explique comment JUN CREATIF AND TRAVEL LLC (« JUN ») collecte, utilise, conserve et protège les informations dans JUN Business Hub, notamment celles accessibles au moyen des API Google.",
    updated: "Dernière mise à jour : 11 septembre 2026",
    sections: [
      { title: "Informations collectées", paragraphs: ["Nous collectons les informations de compte et de contact, dossiers clients, documents, opérations, journaux d’audit et données techniques nécessaires au fonctionnement et à la sécurité du service."], bullets: ["Lorsqu’un utilisateur connecte Gmail, nous recevons l’adresse connectée et des jetons OAuth.", "Avec son autorisation, l’application peut lire les métadonnées et le contenu des messages, envoyer des messages et modifier leurs libellés ou leur état.", "Nous ne recevons et ne conservons jamais le mot de passe Google."] },
      { title: "Utilisation des données Google", paragraphs: ["Les données Google servent uniquement aux fonctions demandées par l’utilisateur autorisé : afficher et synchroniser les boîtes, relier les conversations pertinentes aux dossiers clients, rédiger et envoyer des messages et gérer leur état.", "L’utilisation et le transfert des informations reçues des API Google respectent la politique relative aux données utilisateur des services API Google, y compris les exigences d’utilisation limitée. Ces données ne sont ni vendues, ni utilisées pour la publicité, ni communiquées à des courtiers en données."] },
      { title: "Conservation et sécurité", paragraphs: ["Les jetons OAuth sont chiffrés avant leur stockage. L’accès est limité par rôle et autorisation de boîte, et les actions pertinentes sont journalisées.", "Les informations synchronisées sont conservées uniquement pendant la durée nécessaire au service et aux obligations contractuelles ou légales, puis supprimées ou anonymisées."] },
      { title: "Partage", paragraphs: ["Nous partageons les informations uniquement avec le personnel autorisé, des prestataires agissant selon nos instructions ou les autorités lorsque la loi l’exige. Les prestataires peuvent fournir l’hébergement, la base de données, le stockage, la sécurité, les paiements, les communications ou le traitement par IA."] },
      { title: "Vos choix et vos droits", paragraphs: ["Vous pouvez déconnecter Gmail dans l’application et révoquer l’accès depuis les paramètres de sécurité de votre compte Google. Vous pouvez demander l’accès, la correction, l’exportation, la limitation ou la suppression de vos informations, sous réserve des obligations légales de conservation."], bullets: ["Autorisations Google : https://myaccount.google.com/permissions", "Instructions de suppression : /data-deletion"] },
      { title: "Contact", paragraphs: ["Questions et demandes : admin@juncreatifs.org. Site : https://www.juncreatif.org. JUN CREATIF AND TRAVEL LLC."] },
    ],
  },
  es: {
    title: "Política de privacidad",
    intro: "Esta política explica cómo JUN CREATIF AND TRAVEL LLC («JUN») recopila, utiliza, conserva y protege la información en JUN Business Hub, incluidos los datos accesibles mediante las API de Google.",
    updated: "Última actualización: 11 de septiembre de 2026",
    sections: [
      { title: "Información que recopilamos", paragraphs: ["Recopilamos datos de cuenta y contacto, expedientes de clientes, documentos, operaciones, registros de auditoría e información técnica necesaria para operar y proteger el servicio."], bullets: ["Al conectar Gmail recibimos la dirección conectada y tokens OAuth.", "Con autorización, la aplicación puede leer metadatos y contenido, enviar mensajes y modificar etiquetas o el estado de los mensajes.", "Nunca recibimos ni almacenamos la contraseña de Google."] },
      { title: "Uso de datos de Google", paragraphs: ["Los datos de Google se usan únicamente para las funciones solicitadas: mostrar y sincronizar buzones, asociar conversaciones pertinentes con expedientes, redactar y enviar mensajes y gestionar su estado.", "El uso y la transferencia de información recibida de las API de Google cumplen la Política de Datos de Usuario de los Servicios API de Google, incluidos sus requisitos de Uso Limitado. No vendemos estos datos ni los usamos para publicidad o intermediarios de datos."] },
      { title: "Conservación y seguridad", paragraphs: ["Los tokens OAuth se cifran antes de almacenarse. El acceso está limitado por roles y permisos de buzón, y las acciones relevantes quedan registradas.", "La información sincronizada se conserva solo mientras sea necesaria para prestar el servicio o cumplir obligaciones legítimas y luego se elimina o anonimiza."] },
      { title: "Divulgación", paragraphs: ["Solo compartimos información con personal autorizado, proveedores que actúan bajo nuestras instrucciones o autoridades cuando la ley lo exige. Los proveedores pueden apoyar alojamiento, bases de datos, almacenamiento, seguridad, pagos, comunicaciones o procesamiento con IA."] },
      { title: "Sus opciones y derechos", paragraphs: ["Puede desconectar Gmail en la aplicación y revocar el acceso desde la seguridad de su Cuenta de Google. Puede solicitar acceso, corrección, exportación, limitación o eliminación, sujeto a obligaciones legales."], bullets: ["Permisos de Google: https://myaccount.google.com/permissions", "Instrucciones de eliminación: /data-deletion"] },
      { title: "Contacto", paragraphs: ["Consultas y solicitudes: admin@juncreatifs.org. Sitio: https://www.juncreatif.org. JUN CREATIF AND TRAVEL LLC."] },
    ],
  },
  ht: {
    title: "Règleman sou vi prive",
    intro: "Règleman sa a esplike kijan JUN CREATIF AND TRAVEL LLC (« JUN ») ranmase, itilize, konsève epi pwoteje enfòmasyon nan JUN Business Hub, ansanm ak done li jwenn atravè API Google yo.",
    updated: "Dènye mizajou: 11 septanm 2026",
    sections: [
      { title: "Enfòmasyon nou ranmase", paragraphs: ["Nou ranmase enfòmasyon kont ak kontak, dosye kliyan, dokiman, operasyon, jounal odit ak done teknik ki nesesè pou sèvis la mache an sekirite."], bullets: ["Lè yon itilizatè konekte Gmail, nou resevwa adrès imel la ak jeton OAuth.", "Avèk otorizasyon li, aplikasyon an ka li enfòmasyon ak kontni imel, voye mesaj epi modifye etikèt oswa eta mesaj yo.", "Nou pa janm resevwa ni sere modpas Google itilizatè a."] },
      { title: "Kijan nou itilize done Google yo", paragraphs: ["Nou itilize done Google yo sèlman pou sèvis itilizatè a mande yo: montre ak senkronize bwat imel, konekte konvèsasyon ki enpòtan ak dosye kliyan, prepare ak voye mesaj, epi jere eta mesaj yo.", "Itilizasyon ak transfè enfòmasyon nou resevwa nan API Google yo respekte Google API Services User Data Policy, ansanm ak règleman Limited Use yo. Nou pa vann done sa yo, nou pa sèvi avè yo pou piblisite, epi nou pa bay koutye done yo."] },
      { title: "Sekirite ak dire konsèvasyon", paragraphs: ["Nou chiffre jeton OAuth yo anvan nou sere yo. Aksè limite dapre wòl ak pèmisyon chak bwat imel, epi aksyon enpòtan yo anrejistre.", "Nou konsève enfòmasyon yo sèlman pandan yo nesesè pou sèvis la oswa pou obligasyon legal, epi apre sa nou efase oswa anonimize yo."] },
      { title: "Pataj enfòmasyon", paragraphs: ["Nou pataje enfòmasyon sèlman ak pèsonèl otorize, founisè k ap travay sou enstriksyon nou oswa otorite lè lalwa egzije sa. Founisè yo ka ede ak hosting, bazdone, depo, sekirite, peman, kominikasyon oswa tretman IA."] },
      { title: "Chwa ak dwa ou", paragraphs: ["Ou ka dekonekte Gmail nan aplikasyon an epi retire aksè a nan paramèt sekirite Kont Google ou. Ou ka mande aksè, koreksyon, ekspòtasyon, limitasyon oswa efasman done ou, selon obligasyon legal ki aplikab yo."], bullets: ["Otorizasyon Google: https://myaccount.google.com/permissions", "Enstriksyon pou efase done: /data-deletion"] },
      { title: "Kontak", paragraphs: ["Kesyon ak demann: admin@juncreatifs.org. Sit: https://www.juncreatif.org. JUN CREATIF AND TRAVEL LLC."] },
    ],
  },
};

const terms: Record<LegalLocale, DocumentCopy> = {
  en: { title: "Terms of Service", intro: "These terms govern access to and use of JUN Business Hub and its connected services.", updated: "Last updated: September 11, 2026", sections: [
    { title: "Acceptance and eligibility", paragraphs: ["By using the service, you agree to these terms and confirm that you are authorized to act for the account or organization concerned."] },
    { title: "Permitted use", paragraphs: ["Use the service only for lawful business, travel, document, finance, and communication activities. You remain responsible for the accuracy and legality of content and instructions submitted through your account."] },
    { title: "Google and Gmail connection", paragraphs: ["Connecting a Google account is optional and requires explicit consent. The application requests only the Gmail permissions necessary to read and organize authorized mail, send user-directed messages, and identify the connected address. You may disconnect or revoke access at any time."] },
    { title: "Security and accounts", paragraphs: ["Keep credentials confidential, use appropriate access controls, and notify us promptly of suspected unauthorized activity. We may suspend access to protect users, data, or the service."] },
    { title: "Availability and third parties", paragraphs: ["The service may depend on Google, hosting, storage, payment, and other third-party services. We do not guarantee uninterrupted availability of external services."] },
    { title: "Liability and changes", paragraphs: ["To the extent permitted by law, the service is provided without guarantees beyond those expressly agreed. We may update these terms and will publish the current version here."] },
    { title: "Contact", paragraphs: ["Questions: admin@juncreatifs.org. JUN CREATIF AND TRAVEL LLC."] },
  ]},
  fr: { title: "Conditions d’utilisation", intro: "Ces conditions régissent l’accès à JUN Business Hub et l’utilisation de ses services connectés.", updated: "Dernière mise à jour : 11 septembre 2026", sections: [
    { title: "Acceptation et autorisation", paragraphs: ["En utilisant le service, vous acceptez ces conditions et confirmez être autorisé à agir pour le compte ou l’organisation concernée."] },
    { title: "Utilisation autorisée", paragraphs: ["Utilisez le service uniquement pour des activités légales de gestion, voyage, documents, finances et communication. Vous êtes responsable de l’exactitude et de la légalité des contenus et instructions transmis."] },
    { title: "Connexion à Google et Gmail", paragraphs: ["La connexion d’un compte Google est facultative et exige un consentement explicite. L’application demande uniquement les autorisations Gmail nécessaires pour lire et organiser les messages autorisés, envoyer les messages demandés et identifier l’adresse connectée. Vous pouvez retirer l’accès à tout moment."] },
    { title: "Sécurité des comptes", paragraphs: ["Protégez vos identifiants, appliquez des contrôles d’accès adaptés et signalez rapidement toute activité suspecte. Nous pouvons suspendre un accès afin de protéger les utilisateurs, les données ou le service."] },
    { title: "Disponibilité et services tiers", paragraphs: ["Le service dépend notamment de Google, de l’hébergement, du stockage et d’autres prestataires. Nous ne garantissons pas la disponibilité ininterrompue des services externes."] },
    { title: "Responsabilité et modifications", paragraphs: ["Dans les limites permises par la loi, aucune garantie autre que celles expressément convenues n’est accordée. Nous pouvons modifier ces conditions et publierons ici la version en vigueur."] },
    { title: "Contact", paragraphs: ["Questions : admin@juncreatifs.org. JUN CREATIF AND TRAVEL LLC."] },
  ]},
  es: { title: "Términos del servicio", intro: "Estos términos regulan el acceso y el uso de JUN Business Hub y sus servicios conectados.", updated: "Última actualización: 11 de septiembre de 2026", sections: [
    { title: "Aceptación y autorización", paragraphs: ["Al utilizar el servicio, acepta estos términos y confirma que está autorizado para actuar por la cuenta u organización correspondiente."] },
    { title: "Uso permitido", paragraphs: ["Use el servicio únicamente para actividades legales de gestión, viajes, documentos, finanzas y comunicación. Usted es responsable de la exactitud y legalidad del contenido y las instrucciones enviados."] },
    { title: "Conexión con Google y Gmail", paragraphs: ["Conectar una cuenta de Google es opcional y requiere consentimiento explícito. La aplicación solicita únicamente los permisos necesarios para leer y organizar correo autorizado, enviar mensajes solicitados e identificar la dirección conectada. Puede retirar el acceso en cualquier momento."] },
    { title: "Seguridad de las cuentas", paragraphs: ["Proteja sus credenciales, aplique controles de acceso adecuados y notifíquenos cualquier actividad sospechosa. Podemos suspender el acceso para proteger usuarios, datos o el servicio."] },
    { title: "Disponibilidad y terceros", paragraphs: ["El servicio puede depender de Google, alojamiento, almacenamiento, pagos y otros proveedores. No garantizamos la disponibilidad ininterrumpida de servicios externos."] },
    { title: "Responsabilidad y cambios", paragraphs: ["En la medida permitida por la ley, no se ofrecen garantías adicionales a las expresamente acordadas. Podemos actualizar estos términos y publicaremos aquí la versión vigente."] },
    { title: "Contacto", paragraphs: ["Consultas: admin@juncreatifs.org. JUN CREATIF AND TRAVEL LLC."] },
  ]},
  ht: { title: "Kondisyon itilizasyon", intro: "Kondisyon sa yo gouvène aksè ak itilizasyon JUN Business Hub ak sèvis ki konekte avè l yo.", updated: "Dènye mizajou: 11 septanm 2026", sections: [
    { title: "Akseptasyon ak otorizasyon", paragraphs: ["Lè ou itilize sèvis la, ou aksepte kondisyon sa yo epi ou konfime ou gen otorizasyon pou aji pou kont oswa òganizasyon konsène a."] },
    { title: "Itilizasyon ki otorize", paragraphs: ["Itilize sèvis la sèlman pou aktivite legal nan jesyon, vwayaj, dokiman, finans ak kominikasyon. Ou responsab presizyon ak legalite kontni ak enstriksyon ou voye yo."] },
    { title: "Koneksyon Google ak Gmail", paragraphs: ["Konekte yon Kont Google se yon chwa epi sa mande konsantman klè. Aplikasyon an mande sèlman pèmisyon Gmail ki nesesè pou li ak òganize imel otorize yo, voye mesaj itilizatè a mande yo epi idantifye adrès ki konekte a. Ou ka retire aksè a nenpòt ki lè."] },
    { title: "Sekirite kont", paragraphs: ["Pwoteje enfòmasyon koneksyon ou, itilize bon kontwòl aksè epi fè nou konnen rapidman si ou sispèk yon aktivite san otorizasyon. Nou ka sispann aksè pou pwoteje itilizatè, done oswa sèvis la."] },
    { title: "Disponibilite ak lòt founisè", paragraphs: ["Sèvis la ka depann de Google, hosting, depo, peman ak lòt founisè. Nou pa garanti sèvis ekstèn yo ap toujou disponib san entèripsyon."] },
    { title: "Responsablite ak chanjman", paragraphs: ["Nan limit lalwa pèmèt, pa gen lòt garanti pase sa nou dakò klèman yo. Nou ka mete kondisyon sa yo ajou epi n ap pibliye vèsyon aktyèl la isit la."] },
    { title: "Kontak", paragraphs: ["Kesyon: admin@juncreatifs.org. JUN CREATIF AND TRAVEL LLC."] },
  ]},
};

const deletion: Record<LegalLocale, DocumentCopy> = {
  en: { title: "Data Deletion Instructions", intro: "You control the Google connection and may request deletion of data associated with JUN Business Hub.", updated: "Last updated: September 11, 2026", sections: [
    { title: "Disconnect Google access", paragraphs: ["In JUN Business Hub, open Settings → Email, select the mailbox, and choose Disconnect. You can also visit your Google Account permissions page and remove access for JUN CREATIF HUB."] },
    { title: "Request deletion", paragraphs: ["Email admin@juncreatifs.org from the connected address with the subject “Data deletion request”. Identify the mailbox or account concerned and state whether you request deletion of Google-derived data only or the complete JUN account record."] },
    { title: "What happens next", paragraphs: ["We verify the requester’s identity, acknowledge the request, and delete eligible OAuth tokens and synchronized Google data within 30 days. We confirm completion by email. Information that must be retained for legal, fraud-prevention, accounting, security, or dispute purposes is isolated and deleted when the retention duty ends. Revoking Google access stops future access but does not by itself delete previously synchronized records."] },
  ]},
  fr: { title: "Instructions de suppression des données", intro: "Vous contrôlez la connexion Google et pouvez demander la suppression des données associées à JUN Business Hub.", updated: "Dernière mise à jour : 11 septembre 2026", sections: [
    { title: "Déconnecter l’accès Google", paragraphs: ["Dans JUN Business Hub, ouvrez Paramètres → E-mail, sélectionnez la boîte puis choisissez Déconnecter. Vous pouvez également retirer l’accès à JUN CREATIF HUB depuis la page des autorisations de votre compte Google."] },
    { title: "Demander la suppression", paragraphs: ["Écrivez à admin@juncreatifs.org depuis l’adresse connectée avec l’objet « Demande de suppression des données ». Indiquez la boîte ou le compte concerné et précisez si vous demandez la suppression des seules données Google ou de l’ensemble du compte JUN."] },
    { title: "Traitement de la demande", paragraphs: ["Nous vérifions l’identité du demandeur, accusons réception et supprimons les jetons OAuth et données Google admissibles dans un délai de 30 jours. Une confirmation est envoyée par e-mail. Les informations devant être conservées pour des raisons légales, comptables, de sécurité, de prévention de fraude ou de litige sont isolées puis supprimées à la fin de l’obligation. La révocation Google bloque les futurs accès, mais ne supprime pas automatiquement les données déjà synchronisées."] },
  ]},
  es: { title: "Instrucciones para eliminar datos", intro: "Usted controla la conexión de Google y puede solicitar la eliminación de datos asociados con JUN Business Hub.", updated: "Última actualización: 11 de septiembre de 2026", sections: [
    { title: "Desconectar el acceso de Google", paragraphs: ["En JUN Business Hub, abra Configuración → Correo electrónico, seleccione el buzón y elija Desconectar. También puede retirar el acceso de JUN CREATIF HUB desde la página de permisos de su Cuenta de Google."] },
    { title: "Solicitar la eliminación", paragraphs: ["Escriba a admin@juncreatifs.org desde la dirección conectada con el asunto «Solicitud de eliminación de datos». Identifique el buzón o la cuenta y especifique si desea eliminar solo los datos procedentes de Google o todo el registro de su cuenta JUN."] },
    { title: "Qué sucede después", paragraphs: ["Verificamos la identidad, acusamos recibo y eliminamos los tokens OAuth y datos de Google elegibles dentro de 30 días. Confirmamos la finalización por correo. Los datos sujetos a obligaciones legales, contables, de seguridad, antifraude o litigio se aíslan y eliminan al finalizar la obligación. Revocar el acceso de Google impide accesos futuros, pero no elimina automáticamente los registros ya sincronizados."] },
  ]},
  ht: { title: "Enstriksyon pou efase done", intro: "Ou kontwole koneksyon Google la epi ou ka mande pou nou efase done ki asosye ak JUN Business Hub.", updated: "Dènye mizajou: 11 septanm 2026", sections: [
    { title: "Dekonekte aksè Google", paragraphs: ["Nan JUN Business Hub, ale nan Paramèt → Imel, chwazi bwat la epi klike Dekonekte. Ou ka retire aksè JUN CREATIF HUB tou nan paj otorizasyon Kont Google ou."] },
    { title: "Mande efasman", paragraphs: ["Ekri admin@juncreatifs.org depi nan adrès ki konekte a avèk sijè « Demann pou efase done ». Idantifye bwat oswa kont lan epi presize si ou vle efase sèlman done ki soti nan Google oswa tout dosye kont JUN lan."] },
    { title: "Sa k ap fèt apre", paragraphs: ["Nou verifye idantite moun nan, konfime nou resevwa demann lan epi efase jeton OAuth ak done Google ki kalifye yo nan 30 jou. Nou voye konfimasyon pa imel. Done nou dwe konsève pou rezon legal, kontablite, sekirite, prevansyon fwod oswa litij ap izole epi efase lè obligasyon an fini. Retire aksè Google la bloke aksè alavni, men li pa efase otomatikman dosye ki te deja senkronize."] },
  ]},
};

const documents = { privacy, terms, deletion };

export function getDefaultLegalCopy(kind: LegalKind, locale: LegalLocale): DocumentCopy {
  return documents[kind][locale];
}

export function legalCopyToBody(copy: DocumentCopy): string {
  return copy.sections
    .map((section) =>
      [
        `## ${section.title}`,
        ...section.paragraphs,
        ...(section.bullets?.map((item) => `- ${item}`) ?? []),
      ].join("\n\n"),
    )
    .join("\n\n");
}

type SavedLegalCopy = {
  title: string;
  intro: string;
  updated: string;
  body: string;
};

function bodyBlocks(body: string) {
  const lines = body.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="list-disc space-y-2 pl-6">
        {bullets.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
      </ul>,
    );
    bullets = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    if (line.startsWith("## ")) {
      flushBullets();
      blocks.push(<h2 key={`heading-${blocks.length}`} className="mt-8 font-display text-2xl text-night">{line.slice(3)}</h2>);
    } else if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
    } else {
      flushBullets();
      blocks.push(<p key={`paragraph-${blocks.length}`}>{line}</p>);
    }
  }
  flushBullets();
  return blocks;
}

export function normalizeLegalLocale(value?: string): LegalLocale {
  return value === "fr" || value === "es" || value === "ht" ? value : "en";
}

export async function LegalPage({ kind, locale }: { kind: LegalKind; locale: LegalLocale }) {
  const fallback = documents[kind][locale];
  const row = await prisma.appSetting.findUnique({ where: { key: `legal.${kind}.${locale}` } });
  let custom: SavedLegalCopy | null = null;
  try {
    custom = row ? (JSON.parse(row.value) as SavedLegalCopy) : null;
  } catch {
    custom = null;
  }
  const copy = custom?.title && custom?.intro && custom?.updated && custom?.body ? custom : null;

  return (
    <article className="mx-auto max-w-4xl px-5 py-16 sm:py-20">
      <nav aria-label="Language" className="mb-10 flex flex-wrap gap-2">
        {languages.map((language) => (
          <Link key={language.code} href={`?${new URLSearchParams({ lang: language.code })}`} hrefLang={language.code} className={`rounded-full border px-4 py-2 text-sm transition ${locale === language.code ? "border-electric bg-electric text-white" : "border-line bg-white text-muted2 hover:border-electric hover:text-electric"}`}>
            {language.label}
          </Link>
        ))}
      </nav>
      <p className="text-[11px] uppercase tracking-[0.25em] text-electric">JUN CREATIF AND TRAVEL LLC</p>
      <h1 className="mt-3 font-display text-4xl text-night sm:text-5xl">{copy?.title ?? fallback.title}</h1>
      <p className="mt-3 text-sm text-muted2">{copy?.updated ?? fallback.updated}</p>
      <p className="mt-8 rounded-xl border border-line bg-white p-6 leading-7 text-muted2 shadow-sm">{copy?.intro ?? fallback.intro}</p>
      {copy ? (
        <div className="mt-10 space-y-3 leading-7 text-muted2">{bodyBlocks(copy.body)}</div>
      ) : (
        <div className="mt-10 space-y-10">
          {fallback.sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-display text-2xl text-night">{section.title}</h2>
              <div className="mt-3 space-y-3 leading-7 text-muted2">
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.bullets && <ul className="list-disc space-y-2 pl-6">{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
              </div>
            </section>
          ))}
        </div>
      )}
      <div className="mt-12 flex flex-wrap gap-4 border-t border-line pt-8 text-sm">
        <Link href="/privacy" className="text-electric hover:underline">Privacy</Link>
        <Link href="/terms" className="text-electric hover:underline">Terms</Link>
        <Link href="/data-deletion" className="text-electric hover:underline">Data deletion</Link>
        <Link href="/contact" className="text-electric hover:underline">Contact</Link>
      </div>
    </article>
  );
}
