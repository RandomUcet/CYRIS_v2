/** Stable diagnostic categories; never expose model text or request secrets in errors. */
export type InferenceFailure='TIMEOUT'|'TRUNCATED'|'EMPTY_OUTPUT'|'AUTH_FAILED'|'UNREACHABLE'|'PROVIDER_ERROR';
export class InferenceError extends Error {
  constructor(readonly category:InferenceFailure){super('AI generation failed ('+category+')');this.name='InferenceError';}
}
/** Accept exact JSON or a single enclosing Markdown fence. Some compatible
 * runtimes return a completed thinking prefix even with thinking disabled.
 * Never salvage partial JSON or arbitrary trailing commentary. */
export function parseModelJson(text:string,maxLength=30000):unknown {
  if(text.length>maxLength)throw Error('Oversized model output');
  let raw=text.trim();
  if(raw.startsWith('<think>')){
    const end=raw.indexOf('</think>');
    if(end<0)throw Error('Unfinished model output');
    raw=raw.slice(end+8).trim();
  }
  if(raw.startsWith('```')){
    const first=raw.indexOf('\n');
    if(first<0||!['```','```json'].includes(raw.slice(0,first).trim().toLowerCase())||!raw.endsWith('```'))throw Error('Invalid JSON fence');
    raw=raw.slice(first+1,-3).trim();
  }
  return JSON.parse(raw);
}
