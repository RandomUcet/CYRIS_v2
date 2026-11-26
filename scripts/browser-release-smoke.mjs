import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const base='http://127.0.0.1:3000';
const fixture=JSON.parse(await readFile(process.env.CYRIS_BROWSER_FIXTURE_PATH,'utf8'));
const password=process.env.CYRIS_BROWSER_FIXTURE_PASSWORD;
const output=process.env.CYRIS_BROWSER_ARTIFACTS;
if(process.env.GITHUB_ACTIONS!=='true'||!password||!output||!process.env.CYRIS_BROWSER_PLAYWRIGHT_PATH)throw Error('Isolated CI browser environment required');
const {chromium}=await import(pathToFileURL(process.env.CYRIS_BROWSER_PLAYWRIGHT_PATH).href);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[];
async function login(email){
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});
  const page=await context.newPage();
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base);
  await page.locator('input[name=identifier]').fill(email);
  await page.locator('input[name=password]').fill(password);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
  await page.locator('button[type=submit]').click();
  assert.equal((await response).status(),200);
  return {context,page};
}
try{
  const {context:admin,page}=await login(fixture.adminEmail);
  await page.waitForURL(/\/admin(?:\/|$)/);
  await page.goto(base+'/admin/events/'+fixture.archived+'/data');
  await page.getByRole('heading',{name:/Data administration|Správa dat/,exact:true}).waitFor();
  await page.getByText('Browser archived exercise',{exact:false}).first().waitFor();
  await page.getByRole('button',{name:/Calculate database plan|Vypočítat databázový plán/}).click();
  await page.getByText(/Rows proposed for deletion|Řádky navržené k odstranění/).waitFor();
  await page.getByText(/Full execution is still blocked|Úplné provedení je zatím blokováno/).waitFor();
  await page.getByRole('radio',{name:/Remove exercise including teams and roles|Odstranit celé cvičení včetně týmů a rolí/}).check();
  await page.screenshot({path:join(output,'admin-data-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(output,'admin-data-mobile.png'),fullPage:true});
  await admin.close();
  const {context:participant,page:work}=await login(fixture.participantEmail);
  await work.waitForURL(/\/events\/.+\/my-work/);
  await work.goto(base+'/events/'+fixture.event+'/my-work');
  await work.getByText('Browser assigned report review',{exact:true}).waitFor();
  assert.equal(await work.getByText('Foreign hidden report',{exact:true}).count(),0);
  await work.screenshot({path:join(output,'participant-my-work.png'),fullPage:true});
  await work.getByRole('button',{name:/My requests and results|Moje žádanky a výsledky/}).click();
  await work.getByText('Browser assigned report review',{exact:true}).waitFor();
  await work.screenshot({path:join(output,'participant-outgoing.png'),fullPage:true});
  const forbidden=await participant.request.get(base+'/api/events/'+fixture.archived+'/retention-plan');
  assert.equal(forbidden.status(),403);
  const outside=await participant.request.get(base+'/api/events/'+fixture.foreign+'/tasks/my-work');
  assert.equal(outside.status(),403);
  await work.goto(base+'/admin/events/'+fixture.archived+'/data');
  await work.getByText('Platform administrator access required.',{exact:false}).waitFor();
  await work.screenshot({path:join(output,'participant-admin-denied.png'),fullPage:true});
  await participant.close();

  // Canonical profiles, real browser sessions, no administrator impersonation.
  // Requester creates a request through the authenticated API; the examiner
  // finds it in the actual queue and performs the workflow in Chromium.
  const requester=await login(fixture.requesterEmail);
  await requester.page.waitForURL(/\/events\/.+\/my-work/);
  const eventRoot=base+'/events/'+fixture.event,apiRoot=base+'/api/events/'+fixture.event;
  const purpose='Browser USB examination request',conclusion='Browser verified synthetic USB report';
  const submission=await requester.context.request.post(apiRoot+'/forensics',{data:{
    purpose,analysisType:'DISK_IMAGE',priority:'MEDIUM',visibility:'EVENT',
    requestedFromUnitId:fixture.bpsUnit,assignedUnitId:fixture.cyberUnit,evidenceIds:[fixture.usb],
  }});
  assert.equal(submission.status(),201,'BPS requester can create a digital analysis');
  const submitted=await submission.json(),analysis=submitted.data??submitted;
  assert.ok(analysis.id);assert.equal(analysis.assignedToUserId,fixture.analyst);
  const endpoint=apiRoot+'/forensics/'+analysis.id,detail=eventRoot+'/forensics/'+analysis.id;
  const read=async(context)=>{const response=await context.request.get(endpoint);assert.equal(response.status(),200);const payload=await response.json();return payload.data??payload;};
  assert.equal((await read(requester.context)).reportAvailable,false);
  assert.equal((await requester.context.request.patch(endpoint+'/status',{data:{status:'APPROVED'}})).status(),403);

  const examiner=await login(fixture.analystEmail),ex=examiner.page;
  await ex.waitForURL(/\/events\/.+\/my-work/);
  await ex.goto(eventRoot+'/forensics');
  await ex.getByText(purpose,{exact:true}).waitFor();
  const sidebar=ex.locator('.workspace-nav-scroll');
  const forensicNav=sidebar.locator('a[href="/events/'+fixture.event+'/forensics"]');
  await forensicNav.waitFor();
  assert.equal(await forensicNav.count(),1,'No duplicated forensic navigation links');
  assert.equal(await sidebar.locator('a[href^="/admin"]').count(),0);
  assert.equal(await sidebar.locator('a[href="/events/'+fixture.event+'/excon"]').count(),0);
  await ex.screenshot({path:join(output,'specialist-forensics-queue.png'),fullPage:true});
  await ex.goto(detail);
  await ex.getByRole('button',{name:'Accept Analysis Request'}).waitFor();
  await ex.getByText('Evidence & Devices',{exact:false}).first().click();
  await ex.getByText('Browser USB sample',{exact:false}).first().waitFor();
  await ex.getByText('Submitted input · limited manifest',{exact:true}).waitFor();
  assert.equal(await ex.getByRole('link',{name:'View Evidence',exact:true}).count(),0);
  assert.equal((await examiner.context.request.get(apiRoot+'/evidence/'+fixture.usb)).status(),403);
  const manifest=await read(examiner.context);
  assert.equal(manifest.evidenceLinks.find(e=>e.id===fixture.usb)?.canOpen,false);
  assert.equal(manifest.evidenceLinks.find(e=>e.id===fixture.usb)?.description,'');
  await ex.screenshot({path:join(output,'specialist-forensics-input.png'),fullPage:true});
  await ex.getByRole('button',{name:'Accept Analysis Request'}).click();
  await ex.getByRole('button',{name:'Start Examination'}).click();
  await ex.getByText('Overview',{exact:true}).last().click();
  await ex.locator('#forensic-methodology').fill('Browser fixture methodology');
  await ex.locator('#forensic-findings').fill('Synthetic fixture findings');
  await ex.locator('#forensic-conclusion').fill(conclusion);
  await ex.getByRole('button',{name:'Complete Analysis'}).click();
  await ex.getByRole('button',{name:'Complete Analysis'}).waitFor({state:'hidden'});
  assert.equal((await read(examiner.context)).status,'COMPLETED');
  assert.equal((await read(requester.context)).conclusion,null,'Draft remains private');
  assert.equal((await examiner.context.request.patch(endpoint+'/status',{data:{status:'APPROVED'}})).status(),403);
  assert.equal((await examiner.context.request.get(base+'/api/events/'+fixture.foreign+'/forensics/'+analysis.id)).status(),404);
  await ex.setViewportSize({width:390,height:844});
  await ex.screenshot({path:join(output,'specialist-forensics-mobile.png'),fullPage:true});
  await examiner.context.close();

  const supervisor=await login(fixture.leadEmail);
  await supervisor.page.waitForURL(/\/events\/.+\/my-work/);
  await supervisor.page.goto(detail);
  await supervisor.page.getByRole('button',{name:'Approve Forensic Report'}).click();
  await supervisor.page.getByRole('button',{name:'Approve Forensic Report'}).waitFor({state:'hidden'});
  assert.equal((await read(supervisor.context)).status,'APPROVED');
  await supervisor.context.close();
  assert.equal((await read(requester.context)).conclusion,conclusion);
  await requester.page.goto(eventRoot+'/my-work');
  await requester.page.getByRole('button',{name:/My requests and results|Moje žádanky a výsledky/}).click();
  await requester.page.getByText(purpose,{exact:true}).waitFor();
  await requester.page.screenshot({path:join(output,'specialist-requester-result.png'),fullPage:true});
  await requester.context.close();
  assert.deepEqual(errors,[],'Unexpected browser JavaScript errors');
  console.log('Real-browser admin, participant and canonical specialist workflow smoke passed; 9 screenshots captured.');
}finally{await browser.close();}
