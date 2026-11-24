export type TablePage={key:string;page:number};
export function reconcileTablePage(previous:TablePage,key:string,pages:number):TablePage{
 const page=previous.key===key?Math.max(1,Math.min(pages,previous.page)):1;
 return previous.key===key&&previous.page===page?previous:{key,page};
}
export function isInteractiveTableTarget(target:EventTarget|null,row:HTMLElement):boolean{
 if(!(target instanceof Element))return false;
 const control=target.closest('a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[contenteditable="true"],[data-no-row-click]');
 return Boolean(control&&control!==row&&row.contains(control));
}
