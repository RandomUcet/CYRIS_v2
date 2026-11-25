import {z} from 'zod';
export const DiagnosticServiceSchema=z.enum(['api','worker','web','postgres','redis','typesense','minio']);
export const DiagnosticCategorySchema=z.enum(['OUT_OF_MEMORY','DATABASE_CONNECTION','MIGRATION','PROVIDER_AUTH','TIMEOUT','CAPACITY','CONNECTION_REFUSED','INVALID_OUTPUT','HTTP_5XX','ERROR']);
const count=z.number().int().min(0).max(100000);
const counts=z.object({OUT_OF_MEMORY:count.optional(),DATABASE_CONNECTION:count.optional(),MIGRATION:count.optional(),PROVIDER_AUTH:count.optional(),TIMEOUT:count.optional(),CAPACITY:count.optional(),CONNECTION_REFUSED:count.optional(),INVALID_OUTPUT:count.optional(),HTTP_5XX:count.optional(),ERROR:count.optional()}).strict();
const sample=z.object({status:z.literal('sampled'),sampledLines:count,categories:counts}).strict().refine(v=>Object.values(v.categories).reduce((a,b)=>a+(b??0),0)<=v.sampledLines,'Category counts exceed sampled lines');
const service=z.union([sample,z.object({status:z.literal('unavailable')}).strict()]);
export const DiagnosticSummarySchema=z.object({
 schema:z.literal('cyris.diagnostic-summary.v1'),collectedAt:z.string().datetime({offset:true}),
 version:z.string().regex(/^(?:unknown|\d{1,5}\.\d{1,5}\.\d{1,5}(?:-(?:rc|beta|alpha)\.\d{1,5})?)$/),
 windowMinutes:z.number().int().min(1).max(1440),maxLinesPerService:z.literal(500),
 services:z.object({api:service,worker:service,web:service,postgres:service,redis:service,typesense:service,minio:service}).strict()
}).strict();
export const DiagnosticAnalysisInputSchema=z.object({summary:DiagnosticSummarySchema,locale:z.enum(['cs','en']).default('cs')}).strict();
export const DiagnosticFindingSchema=z.object({service:DiagnosticServiceSchema,category:DiagnosticCategorySchema,severity:z.enum(['INFO','WARNING','HIGH']),hypothesis:z.string().trim().min(1).max(400),nextCheck:z.string().trim().min(1).max(400)}).strict();
export const DiagnosticModelReportSchema=z.object({summary:z.string().trim().min(1).max(600),findings:z.array(DiagnosticFindingSchema).max(7)}).strict();
export const DiagnosticAnalysisResultSchema=z.object({report:DiagnosticModelReportSchema,source:DiagnosticSummarySchema,analyzedAt:z.string().datetime(),model:z.string(),durationMs:z.number().nonnegative()}).strict();
export type DiagnosticSummary=z.infer<typeof DiagnosticSummarySchema>;
export type DiagnosticAnalysisInput=z.infer<typeof DiagnosticAnalysisInputSchema>;
export type DiagnosticAnalysisResult=z.infer<typeof DiagnosticAnalysisResultSchema>;
export function validateDiagnosticEvidence(input:DiagnosticSummary,output:unknown){
 const report=DiagnosticModelReportSchema.parse(output);const seen=new Set<string>();
 for(const finding of report.findings){
  const source=input.services[finding.service],key=finding.service+':'+finding.category;
  if(source.status!=='sampled'||!(source.categories[finding.category]??0)||seen.has(key))throw Error('Unsubstantiated diagnostic finding');
  seen.add(key);
 }
 return report;
}
