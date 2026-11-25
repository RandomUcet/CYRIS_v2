import {z} from 'zod';
const bytes=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const disk=z.object({totalBytes:bytes,usedBytes:bytes,availableBytes:bytes}).strict().refine(v=>v.usedBytes+v.availableBytes<=v.totalBytes,'Invalid filesystem counts').nullable();
const docker=z.object({total:z.number().int().min(0).max(1000000),active:z.number().int().min(0).max(1000000),sizeBytes:bytes,reclaimableBytes:bytes}).strict().refine(v=>v.active<=v.total,'Invalid container counts').nullable();
export const StorageReportSchema=z.object({schema:z.literal('cyris.storage.v1'),collectedAt:z.string().datetime({offset:true}),version:z.string().regex(/^(?:unknown|\d{1,5}\.\d{1,5}\.\d{1,5}(?:-(?:rc|alpha|beta)\.\d{1,5})?)$/),
 filesystems:z.object({root:disk,data:disk,backups:disk}).strict(),
 components:z.object({postgres:bytes.nullable(),redis:bytes.nullable(),typesense:bytes.nullable(),minio:bytes.nullable(),caddy:bytes.nullable()}).strict(),
 directories:z.object({installation:bytes.nullable(),data:bytes.nullable(),backups:bytes.nullable(),docker:bytes.nullable(),containerd:bytes.nullable()}).strict(),
 docker:z.object({Images:docker,Containers:docker,'Local Volumes':docker,'Build Cache':docker}).strict()}).strict();
export type StorageReport=z.infer<typeof StorageReportSchema>;

export const MaintenanceActionSchema=z.object({action:z.enum(['API_STATUS','DEPENDENCY_CHECK'])}).strict();
