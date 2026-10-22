import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Res,
  ParseUUIDPipe,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { DocumentsService, type FileUploadPayload } from './documents.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  type DocumentItem,
  type DocumentDetail,
  DocumentQueryFiltersSchema,
} from '@cyris/contracts';

@Controller('events/:eventId/documents')
@UseGuards(AuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * Uploads a document. Supports multipart/form-data streaming and base64 JSON payload.
   */
  @Post('upload')
  async upload(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<DocumentItem> {
    let filePayload: FileUploadPayload | null = null;
    let metadata: any = {};

    if (req.isMultipart()) {
      const part = await (req as any).file();
      if (!part) {
        throw new BadRequestException('No file provided in multipart upload');
      }
      const buffer = await part.toBuffer();
      filePayload = {
        filename: part.filename,
        mimeType: part.mimetype,
        data: buffer,
      };

      // Extract form fields from part.fields
      const fields = (part as any).fields || {};
      metadata = {
        title: fields.title?.value || part.filename,
        description: fields.description?.value,
        documentType: fields.documentType?.value || 'REPORT',
        visibility: fields.visibility?.value || 'EVENT',
        owningUnitId: fields.owningUnitId?.value,
        documentNumber: fields.documentNumber?.value,
      };
    } else {
      // JSON base64 upload
      const body = req.body as any;
      if (!body?.filename || !body?.data) {
        throw new BadRequestException('Filename and file data required');
      }
      const buffer = Buffer.isBuffer(body.data)
        ? body.data
        : Buffer.from(body.data, typeof body.data === 'string' && body.encoding === 'base64' ? 'base64' : 'utf-8');

      filePayload = {
        filename: body.filename,
        mimeType: body.mimeType || 'text/plain',
        data: buffer,
      };
      metadata = {
        title: body.title || body.filename,
        description: body.description,
        documentType: body.documentType || 'REPORT',
        visibility: body.visibility || 'EVENT',
        owningUnitId: body.owningUnitId,
        documentNumber: body.documentNumber,
      };
    }

    return this.documentsService.uploadDocument(eventId, filePayload, metadata, user);
  }

  /**
   * Uploads a new version for an existing document.
   */
  @Post(':documentId/versions')
  async uploadVersion(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() req: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<DocumentDetail> {
    let filePayload: FileUploadPayload | null = null;
    let changeNote: string | undefined;

    if (req.isMultipart()) {
      const part = await (req as any).file();
      if (!part) {
        throw new BadRequestException('No file provided in multipart upload');
      }
      const buffer = await part.toBuffer();
      filePayload = {
        filename: part.filename,
        mimeType: part.mimetype,
        data: buffer,
      };
      const fields = (part as any).fields || {};
      changeNote = fields.changeNote?.value;
    } else {
      const body = req.body as any;
      if (!body?.filename || !body?.data) {
        throw new BadRequestException('Filename and file data required');
      }
      const buffer = Buffer.isBuffer(body.data)
        ? body.data
        : Buffer.from(body.data, typeof body.data === 'string' && body.encoding === 'base64' ? 'base64' : 'utf-8');

      filePayload = {
        filename: body.filename,
        mimeType: body.mimeType || 'text/plain',
        data: buffer,
      };
      changeNote = body.changeNote;
    }

    return this.documentsService.uploadVersion(documentId, filePayload, { changeNote }, user);
  }

  /**
   * Lists documents in an event.
   */
  @Get()
  async list(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const filters = DocumentQueryFiltersSchema.parse(query);
    return this.documentsService.listDocuments(eventId, filters, user);
  }

  /**
   * Gets document detail by ID.
   */
  @Get(':documentId')
  async getDetail(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<DocumentDetail> {
    return this.documentsService.getDocumentDetail(documentId, user);
  }

  /**
   * Downloads document file bytes with full authorization check before stream.
   */
  @Get(':documentId/download')
  async download(
    @Param('eventId', ParseUUIDPipe) _eventId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query('version') version: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() reply: FastifyReply
  ) {
    const versionNumber = version ? parseInt(version, 10) : undefined;
    const file = await this.documentsService.downloadDocument(documentId, versionNumber, user);

    reply.header('Content-Type', file.mimeType);
    reply.header('Content-Length', file.byteSize);
    reply.header('Content-Disposition', `attachment; filename="${file.filename}"`);
    return reply.send(Buffer.from(file.data));
  }
}
