import {z} from 'zod';
export const SupportCategorySchema=z.enum(['NAVIGATION','TASK','TECHNICAL','OTHER']);
export const SupportStatusSchema=z.enum(['OPEN','ANSWERED','RESOLVED']);
export const CreateSupportRequestSchema=z.object({category:SupportCategorySchema,subject:z.string().trim().min(3).max(160),body:z.string().trim().min(1).max(4000)});
export type CreateSupportRequest=z.infer<typeof CreateSupportRequestSchema>;
export const SupportMessageInputSchema=z.object({body:z.string().trim().min(1).max(4000),expectedRevision:z.number().int().positive()});
export type SupportMessageInput=z.infer<typeof SupportMessageInputSchema>;
export const ResolveSupportRequestSchema=z.object({expectedRevision:z.number().int().positive()});
export const SupportMessageSchema=z.object({id:z.string().uuid(),authorKind:z.enum(['PARTICIPANT','EXCON']),body:z.string(),createdAt:z.string()});
export const SupportThreadSchema=z.object({id:z.string().uuid(),eventId:z.string().uuid(),requesterId:z.string().uuid(),requesterName:z.string(),category:SupportCategorySchema,subject:z.string(),status:SupportStatusSchema,revision:z.number().int(),createdAt:z.string(),updatedAt:z.string(),messages:z.array(SupportMessageSchema)});
export const SupportInboxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional(),
  status: SupportStatusSchema.optional(),
  category: SupportCategorySchema.optional(),
  q: z.string().trim().min(2).max(80).optional(),
  threadId: z.string().uuid().optional(),
});
export type SupportInboxQuery = z.infer<typeof SupportInboxQuerySchema>;
export const SupportInboxSchema = z.object({
  canManage: z.boolean(), threads: z.array(SupportThreadSchema),
  page: z.number().int().optional(), pageSize: z.number().int().optional(), total: z.number().int().optional(),
  waiting: z.number().int().optional(), queueRevision: z.string().optional(),
  selectedThread: SupportThreadSchema.nullable().optional(),
});
export type SupportThread=z.infer<typeof SupportThreadSchema>;
export type SupportInbox=z.infer<typeof SupportInboxSchema>;

const supportLocale = z.enum(['cs', 'en']);
export const SupportAssistInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('REPLY'),
    locale: supportLocale,
    threadId: z.string().uuid(),
    expectedRevision: z.number().int().positive().optional(),
  }).strict(),
  z.object({ action: z.literal('HANDOVER'), locale: supportLocale }).strict(),
]);
export type SupportAssistInput = z.infer<typeof SupportAssistInputSchema>;
export const SupportAssistResultSchema = z.object({ text: z.string().trim().min(1).max(4000) });
export type SupportAssistResult = z.infer<typeof SupportAssistResultSchema>;

export interface SupportFaqEntry {
  id: string;
  cs: { question: string; answer: string };
  en: { question: string; answer: string };
}

export const supportFaq: readonly SupportFaqEntry[] = [
  {
    id: 'find-work',
    cs: {
      question: 'Kde najdu svoje úkoly?',
      answer: 'Ve vybraném cvičení otevřete Moje práce. Vyberte přidělený záznam a přečtěte si zadání. Pokud máte k dispozici také pohled Práce týmu, můžete v něm zkontrolovat frontu své jednotky.',
    },
    en: {
      question: 'Where can I find my tasks?',
      answer: 'Open My Work in the selected exercise. Choose an assigned record to read its instructions. If the Unit queue view is available, you can also check work assigned to your team.',
    },
  },
  {
    id: 'briefings',
    cs: {
      question: 'Kde najdu pokyny pro svůj tým a jak potvrdím jejich přijetí?',
      answer: 'Otevřete Briefingy ve svém cvičení a přečtěte si nové zprávy pro svou jednotku. Pokud zpráva vyžaduje potvrzení, použijte tlačítko pro potvrzení přímo u ní.',
    },
    en: {
      question: 'Where are my team’s instructions and how do I acknowledge them?',
      answer: 'Open Briefings in your exercise and read the new messages delivered to your unit. If a briefing requests acknowledgement, use the acknowledgement button on that briefing.',
    },
  },
  {
    id: 'missing-access',
    cs: {
      question: 'Proč nevidím požadovaný záznam nebo modul?',
      answer: 'Ověřte, že máte otevřené správné cvičení a správný tým. Pokud záznam potřebujete k práci, pošlete podpoře jeho číslo nebo název, název týmu a akci, kterou potřebujete provést.',
    },
    en: {
      question: 'Why is a record or module missing?',
      answer: 'Check the selected exercise and team. If you need the record for your assignment, give the support team the record number or title, your team name and the action you need to take.',
    },
  },
  {
    id: 'service-restriction',
    cs: {
      question: 'Modul se mi nedaří otevřít. Kde ověřím jeho dostupnost?',
      answer: 'Otevřete Stav služeb a vyhledejte modul svého pracoviště. Pokud se jeví jako dostupný a pořád jej nemůžete otevřít, pošlete podpoře čas, název obrazovky a přesné znění chyby.',
    },
    en: {
      question: 'I cannot open a module. Where can I check availability?',
      answer: 'Open Service status and look up the module for your workspace. If it appears available and you still cannot open it, send support the time, screen and exact error message.',
    },
  },
  {
    id: 'team-display',
    cs: { question: 'Kde zapnu týmovou obrazovku a její zvuk?', answer: 'V otevřeném cvičení přejděte do Týmových obrazovek a vyberte svůj tým. Na tabuli stiskněte ikonu reproduktoru. Přehraje se zkouška a další změnu DEFCONu tabule ohlásí stejným zvukem. Vedle reproduktoru můžete zapnout celou obrazovku.' },
    en: { question: 'How do I open my team display and enable its sound?', answer: 'Open Team displays in your exercise and select your team. On the board, select the speaker to play a test. The next DEFCON change plays the same tone. The fullscreen control is beside the speaker.' },
  },
  {
    id: 'defcon-change',
    cs: { question: 'Co mám udělat při změně DEFCONu?', answer: 'Přečtěte si nový stupeň a pokyn štábu na týmové obrazovce. Další zprávy určené vašemu týmu najdete v části Briefingy. Pokud tabule hlásí přerušené spojení, ukazuje poslední potvrzený stav.' },
    en: { question: 'What should I do when DEFCON changes?', answer: 'Read the new level and the command message on your team display. Check Briefings for further instructions addressed to your team. A disconnected display shows the last confirmed state.' },
  },
  {
    id: 'ask-excon',
    cs: {
      question: 'Jak požádám o nápovědu nebo nahlásím chybu?',
      answer: 'V Pomoci a podpoře zvolte Napsat podpoře. Uveďte úkol nebo obrazovku, co jste zkusili a kde jste se zastavili. U chyby připojte její přesné znění bez hesel a přístupových údajů.',
    },
    en: {
      question: 'How do I ask for a hint or report an error?',
      answer: 'In Help & support, choose Contact support. Name the task or screen, explain what you tried and describe where you got stuck. For an error, include its exact wording with passwords and credentials removed.',
    },
  },
  {
    id: 'follow-up',
    cs: {
      question: 'Jak doplním svou žádost a kde uvidím odpověď?',
      answer: 'V Pomoci a podpoře otevřete žádost v seznamu Moje žádosti. Odpověď týmu podpory najdete ve stejné konverzaci. Pokud potřebujete další pomoc, připište doplnění. Jakmile je problém vyřešen, označte žádost jako vyřešenou.',
    },
    en: {
      question: 'How do I follow up or find a reply?',
      answer: 'Open the conversation under My requests in Help & support. The support team’s reply appears in the same thread. Add a follow-up if you still need help. Once the issue is fixed, mark the request as resolved.',
    },
  },
];
