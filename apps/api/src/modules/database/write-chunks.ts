/** Keep multi-row SQL writes comfortably below PostgreSQL parameter limits. */
export function* writeChunks<T>(rows: readonly T[], size=250): Generator<T[]> {
  if(!Number.isSafeInteger(size)||size<1||size>1000)throw new RangeError('Invalid write chunk size');
  for(let offset=0;offset<rows.length;offset+=size)yield rows.slice(offset,offset+size);
}
