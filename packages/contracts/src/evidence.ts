import { z } from 'zod';
import { ResourceVisibilitySchema } from './resources.js';

export const EvidenceStatusSchema = z.enum([
  'REGISTERED',
  'SECURED',
  'IN_TRANSIT',
  'STORED',
  'UNDER_ANALYSIS',
  'RELEASED',
  'DISPOSED',
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const CustodyHolderTypeSchema = z.enum(['USER', 'UNIT', 'STORAGE']);
export type CustodyHolderType = z.infer<typeof CustodyHolderTypeSchema>;

/** Exercise-only starter prompts; not an approved forensic SOP. Never overwrite
 * version 1 wording in place: introduce a new version for future submissions. */
export const evidenceChecklistV1={
  version:'collection-v1' as const,
  common:[
    {id:'identity',cs:'Identifikace důkazu a místa nálezu zaznamenána',en:'Evidence identity and recovery location recorded'},
    {id:'condition',cs:'Původní stav a případné poškození zaznamenány',en:'Original condition and any damage recorded'},
    {id:'handling',cs:'Použit postup určený instruktorem pro tento typ důkazu',en:'Instructor-designated procedure for this evidence type followed'},
    {id:'package',cs:'Obal, označení a případné porušení uzávěru zaznamenány',en:'Packaging, label and any seal damage recorded'},
    {id:'custody',cs:'Osoba, čas a odpovědnost za uložení zaznamenány',en:'Person, time and storage responsibility recorded'},
  ],
  digital:{id:'digital-context',cs:'Stav zařízení a provedené zásahy zdokumentovány',en:'Device state and actions taken documented'},
  physical:{id:'sample-context',cs:'Okolnosti odběru a riziko znehodnocení zaznamenány',en:'Collection circumstances and contamination risk recorded'},
};
export function evidenceChecklistItems(type:string){
  const digital=/DIGITAL|USB|DEVICE|DISK/i.test(type);
  return [...evidenceChecklistV1.common,digital?evidenceChecklistV1.digital:evidenceChecklistV1.physical];
}
export const EvidenceChecklistSubmissionSchema=z.object({
  version:z.literal('collection-v1'),
  answers:z.array(z.object({id:z.string().min(1).max(64),state:z.enum(['DONE','NOT_DONE','NOT_APPLICABLE']),note:z.string().trim().max(1000).optional()}).strict()).length(6),
}).strict();
export type EvidenceChecklistSubmission=z.infer<typeof EvidenceChecklistSubmissionSchema>;
export const EvidenceChecklistReceiptSchema=z.object({
  version:z.string(),recordedAt:z.string(),recordedBy:z.string().uuid(),
  evidenceType:z.string(),answers:z.array(z.object({id:z.string(),cs:z.string(),en:z.string(),state:z.enum(['DONE','NOT_DONE','NOT_APPLICABLE']),note:z.string().optional()})),
});
export type EvidenceChecklistReceipt=z.infer<typeof EvidenceChecklistReceiptSchema>;
export function createEvidenceChecklistReceipt(type:string,submission:EvidenceChecklistSubmission,actor:string,recordedAt:string):EvidenceChecklistReceipt|null{
  const parsed=EvidenceChecklistSubmissionSchema.safeParse(submission);
  if(!parsed.success)return null;
  const items=evidenceChecklistItems(type),answers=new Map(parsed.data.answers.map(a=>[a.id,a]));
  if(answers.size!==items.length||items.some(item=>!answers.has(item.id)))return null;
  const snapshot=items.map(item=>({...item,...answers.get(item.id)!}));
  if(snapshot.some(a=>a.state!=='DONE'&&!a.note?.trim()))return null;
  return {version:submission.version,evidenceType:type,recordedAt,recordedBy:actor,answers:snapshot};
}

export const CreateEvidenceRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  evidenceType: z.string().min(1),
  status: EvidenceStatusSchema.default('REGISTERED'),
  condition: z.string().optional(),
  securedAt: z.string().optional(),
  securedByUserId: z.string().uuid().optional(),
  owningUnitId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  currentHolderType: CustodyHolderTypeSchema.default('USER'),
  currentHolderId: z.string().min(1),
  visibility: ResourceVisibilitySchema.default('EVENT'),
  collectionChecklist:EvidenceChecklistSubmissionSchema.optional(),
});

export type CreateEvidenceRequest = z.infer<typeof CreateEvidenceRequestSchema>;

export const UpdateEvidenceRequestSchema = CreateEvidenceRequestSchema.omit({collectionChecklist:true}).partial().strict();
export type UpdateEvidenceRequest = z.infer<typeof UpdateEvidenceRequestSchema>;

export const TransferEvidenceRequestSchema = z.object({
  toHolderType: CustodyHolderTypeSchema,
  toHolderId: z.string().trim().min(1).max(255),
  reason: z.string().trim().min(1).max(2000),
  notes: z.string().optional(),
  newStatus: EvidenceStatusSchema.optional(),
  causationId: z.string().uuid().optional(),
}).strict().refine(v=>v.toHolderType==='STORAGE'||z.string().uuid().safeParse(v.toHolderId).success,'Select an existing user or unit');

export type TransferEvidenceRequest = z.infer<typeof TransferEvidenceRequestSchema>;

export const EvidenceCustodyTransferResponseSchema = z.object({
  id: z.string().uuid(),
  evidenceId: z.string().uuid(),
  occurredAt: z.string(),
  transferredByUserId: z.string().uuid(),
  fromHolderType: z.string(),
  fromHolderId: z.string(),
  fromHolderName:z.string().nullable().optional(),
  toHolderName:z.string().nullable().optional(),
  toHolderType: z.string(),
  toHolderId: z.string(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type EvidenceCustodyTransferResponse = z.infer<typeof EvidenceCustodyTransferResponseSchema>;

export const EvidenceResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  evidenceNumber: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  evidenceType: z.string(),
  status: z.string(),
  condition: z.string().nullable().optional(),
  securedAt: z.string().nullable().optional(),
  securedByUserId: z.string().uuid().nullable().optional(),
  owningUnitId: z.string().uuid().nullable().optional(),
  currentHolderType: z.string(),
  currentHolderId: z.string(),
  currentHolderName:z.string().nullable().optional(),
  visibility: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  custodyHistory: z.array(EvidenceCustodyTransferResponseSchema).optional(),
  collectionChecklist:EvidenceChecklistReceiptSchema.nullable().optional(),
});

export type EvidenceResponse = z.infer<typeof EvidenceResponseSchema>;

export const CustodyRecipientQuerySchema=z.object({q:z.string().trim().min(2).max(80),type:z.enum(['USER','UNIT'])}).strict();
export type CustodyRecipientQuery=z.infer<typeof CustodyRecipientQuerySchema>;
export type CustodyRecipient={id:string;name:string};
