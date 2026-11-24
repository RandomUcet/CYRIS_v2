import type {CommandReadinessSnapshot} from '@cyris/contracts';
export function stableReadinessSnapshot(previous:CommandReadinessSnapshot|null,next:CommandReadinessSnapshot):CommandReadinessSnapshot{
  if(!previous||previous.eventId!==next.eventId)return next;
  if(previous.revision>next.revision)return previous;
  if(previous.revision===next.revision&&previous.level===next.level&&previous.initialized===next.initialized&&
    (previous.publicMessage??null)===(next.publicMessage??null)&&previous.updatedAt===next.updatedAt)return previous;
  return next;
}
