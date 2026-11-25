/** Single-flight periodic work with a permanent admission stop and a drain.
 * Closing does not cancel already running work; dependencies must remain open. */
export class DrainableWork<T>{
  private running:Promise<T>|null=null;
  private stopped=false;
  run(work:()=>Promise<T>,fallback:T):Promise<T>{
    if(this.stopped||this.running)return Promise.resolve(fallback);
    const pending=Promise.resolve().then(work).finally(()=>{this.running=null;});
    this.running=pending;
    return pending;
  }
  async close():Promise<void>{
    this.stopped=true;
    await this.running;
  }
}
