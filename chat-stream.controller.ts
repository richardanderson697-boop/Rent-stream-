import { Controller, Post, Body, Sse, MessageEvent } from '@nestjs/common';
import { interval, map, Observable, from } from 'rxjs';
import { AiLeasingService } from './ai-leasing.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly aiService: AiLeasingService) {}

  @Sse('stream')
  streamChat(@Body() body: { message: string, listingId: string }): Observable<MessageEvent> {
    // We wrap the AI processing in an Observable
    return from(this.aiService.processAndStream(body.message, body.listingId)).pipe(
      map((update) => ({
        data: {
          message: update.textChunk,
          extracted: update.currentSchema,
          progress: update.completionPercentage,
          canSubmit: update.isReady
        }
      }))
    );
  }
}
