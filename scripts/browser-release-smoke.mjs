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
  // Keep the original browser session: a separate admin changes event membership.
  const revocationAdmin=await login(fixture.adminEmail);
  const membershipEndpoint=base+'/api/events/'+fixture.event+'/memberships/'+fixture.membership;
  const taskEndpoint=base+'/api/events/'+fixture.event+'/tasks/'+fixture.task;
  const myWorkEndpoint=base+'/api/events/'+fixture.event+'/tasks/my-work';
  const searchEndpoint=base+'/api/search?'+new URLSearchParams({q:'BROWSER-001',eventId:fixture.event,types:'operational_task'});
  const searchTask=async()=>{
    const response=await participant.request.get(searchEndpoint);
    assert.equal(response.status(),200);
    const payload=await response.json();
    return payload.data??payload;
  };
  const assertSearchVisible=async()=>{
    const result=await searchTask();
    assert.equal(result.total,1,'Positive control: actual canonical task is indexed and discoverable');
    assert.equal(result.results[0]?.canonicalId,fixture.task);
  };
  await assertSearchVisible();
  assert.equal((await participant.request.get(taskEndpoint)).status(),200);
  assert.equal((await participant.request.get(base+'/api/auth/me')).status(),200);
  try {
    const revoke=await revocationAdmin.context.request.patch(membershipEndpoint,{data:{status:'INACTIVE'}});
    assert.ok(revoke.ok(),'Membership deactivation HTTP '+revoke.status());
    const denied=await participant.request.get(taskEndpoint);
    assert.ok([403,404].includes(denied.status()),'Revoked participant direct task access HTTP '+denied.status());
    assert.equal((await participant.request.get(myWorkEndpoint)).status(),403);
    const hidden=await searchTask();
    assert.equal(hidden.total,0,'Revoked membership must not leak search hit counts');
    assert.deepEqual(hidden.results,[],'Revoked membership must not leak indexed documents');
    assert.equal((await participant.request.get(base+'/api/auth/me')).status(),200,'Global login survives event membership revocation');
  } finally {
    const restore=await revocationAdmin.context.request.patch(membershipEndpoint,{data:{status:'ACTIVE'}});
    assert.ok(restore.ok(),'Membership restoration HTTP '+restore.status());
    await revocationAdmin.context.close();
  }
  assert.equal((await participant.request.get(taskEndpoint)).status(),200,'Restored membership grants access without signing in again');
  await assertSearchVisible();
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
  await ex.getByRole('button',{name:'Complete Analysis'}).click();
  await ex.getByRole('alert').filter({hasText:'Enter the report conclusion before completing.'}).waitFor();
  assert.equal((await read(examiner.context)).status,'IN_PROGRESS');
  assert.equal(await ex.locator('#forensic-methodology').inputValue(),'Browser fixture methodology');
  await ex.locator('#forensic-conclusion').fill(conclusion);
  await ex.getByRole('button',{name:'Complete Analysis'}).click();
  await ex.getByRole('button',{name:'Complete Analysis'}).waitFor({state:'hidden'});
  assert.equal((await read(examiner.context)).status,'COMPLETED');
  assert.equal((await read(requester.context)).conclusion,null,'Draft remains private');
  assert.equal((await examiner.context.request.patch(endpoint+'/status',{data:{status:'APPROVED'}})).status(),403);
  assert.equal((await examiner.context.request.get(base+'/api/events/'+fixture.foreign+'/forensics/'+analysis.id)).status(),404);
  await ex.setViewportSize({width:390,height:844});
  const header=ex.locator('.record-header');
  assert.ok(await header.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Shared record header reflows without horizontal overflow');
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
  const outgoing=requester.page.locator('.my-work-item').filter({has:requester.page.getByText(analysis.analysisNumber,{exact:true})});
  await outgoing.waitFor();
  assert.equal(await outgoing.getAttribute('href'),'/events/'+fixture.event+'/forensics/'+analysis.id);
  await outgoing.getByText('Approved report',{exact:false}).waitFor();
  await requester.page.screenshot({path:join(output,'specialist-requester-result.png'),fullPage:true});
  // Independent chemical laboratory workflow, using real canonical roles.
  const labPurpose='Browser fingerprint comparison request',labConclusion='Synthetic fingerprint comparison report';
  const registration=await requester.context.request.post(apiRoot+'/evidence',{data:{title:'Browser registered fingerprint sample',evidenceType:'FINGERPRINT',status:'SECURED',owningUnitId:fixture.bpsUnit,currentHolderType:'USER',currentHolderId:fixture.requesterId,visibility:'EVENT'}});
  assert.equal(registration.status(),201);
  const registrationPayload=await registration.json(),sampleRecord=registrationPayload.data??registrationPayload;
  assert.ok(sampleRecord.id);assert.equal(sampleRecord.currentHolderId,fixture.requesterId);
  const dispatch=await requester.context.request.post(apiRoot+'/evidence/'+sampleRecord.id+'/transfers',{data:{toHolderType:'UNIT',toHolderId:fixture.chemicalUnit,reason:'Synthetic sample dispatch to laboratory',newStatus:'IN_TRANSIT'}});
  assert.equal(dispatch.status(),201);
  const dispatchedPayload=await dispatch.json(),dispatched=dispatchedPayload.data??dispatchedPayload;
  assert.equal(dispatched.currentHolderId,fixture.chemicalUnit);assert.equal(dispatched.owningUnitId,fixture.bpsUnit);
  assert.equal(dispatched.custodyHistory.length,2);
  const labSubmission=await requester.context.request.post(apiRoot+'/lab',{data:{
    analysisType:'Fingerprint comparison',purpose:labPurpose,evidenceIds:[sampleRecord.id],
    requestedFromUnitId:fixture.bpsUnit,assignedUnitId:fixture.chemicalUnit,visibility:'EVENT',
  }});
  assert.equal(labSubmission.status(),201);
  const labPayload=await labSubmission.json(),lab=labPayload.data??labPayload;
  assert.equal(lab.requestedFromUnitId,fixture.bpsUnit);assert.equal(lab.assignedUnitId,fixture.chemicalUnit);
  assert.equal(lab.assignedToUserId,fixture.labAnalyst);
  const labEndpoint=apiRoot+'/lab/'+lab.id,labDetail=eventRoot+'/lab/'+lab.id;
  const readLab=async(context)=>{const response=await context.request.get(labEndpoint);assert.equal(response.status(),200);const payload=await response.json();return payload.data??payload;};
  assert.equal((await readLab(requester.context)).reportAvailable,false);
  assert.equal((await requester.context.request.patch(labEndpoint,{data:{status:'ACCEPTED'}})).status(),403);
  const chem=await login(fixture.labAnalystEmail),cp=chem.page;
  await cp.waitForURL(/\/events\/.+\/my-work/);
  await cp.goto(eventRoot+'/lab');
  await cp.getByText(labPurpose,{exact:true}).waitFor();
  await cp.screenshot({path:join(output,'specialist-lab-queue.png'),fullPage:true});
  await cp.goto(labDetail);
  await cp.getByRole('button',{name:'Accept request',exact:true}).waitFor();
  assert.equal(await cp.getByRole('button',{name:'Reopen / correct',exact:true}).count(),0);
  assert.equal((await chem.context.request.post(labEndpoint+'/correct',{data:{status:'REQUESTED',reason:'Unauthorized fixture'}})).status(),403);
  const labRecord=await readLab(chem.context);
  assert.ok(labRecord.requestingUnitName&&labRecord.unitName&&labRecord.requestingUnitName!==labRecord.unitName);
  assert.equal(labRecord.evidenceItems.find(e=>e.id===sampleRecord.id)?.canOpen,false);
  assert.equal((await chem.context.request.get(apiRoot+'/evidence/'+sampleRecord.id)).status(),403);
  await cp.getByText('Evidence Input',{exact:false}).first().click();
  await cp.getByText('Browser registered fingerprint sample',{exact:false}).first().waitFor();
  await cp.getByLabel('Observed condition of received sample').fill('Synthetic intact package');
  await cp.getByRole('button',{name:'Confirm physical receipt',exact:true}).click();
  await cp.getByText('Physical receipt confirmed',{exact:true}).waitFor();
  assert.equal((await readLab(requester.context)).evidenceItems.find(e=>e.id===sampleRecord.id)?.receipt?.condition,'Synthetic intact package');
  await cp.screenshot({path:join(output,'specialist-lab-input.png'),fullPage:true});
  await cp.getByRole('button',{name:'Accept request',exact:true}).click();
  await cp.getByRole('button',{name:'Start analysis',exact:true}).click();
  await cp.getByText('Protocol & Findings',{exact:true}).click();
  await cp.getByRole('button',{name:'Complete analysis',exact:true}).waitFor();
  await cp.locator('#lab-method').fill('Synthetic fixture method');
  await cp.locator('#lab-findings').fill('Synthetic fixture observations');
  await cp.locator('#lab-conclusion').fill(labConclusion);
  await cp.getByRole('button',{name:'Complete analysis',exact:true}).click();
  await cp.getByRole('button',{name:'Complete analysis',exact:true}).waitFor({state:'hidden'});
  assert.equal((await readLab(chem.context)).status,'COMPLETED');
  assert.equal((await readLab(requester.context)).conclusion,null);
  assert.equal((await chem.context.request.patch(labEndpoint,{data:{status:'APPROVED'}})).status(),403);
  assert.equal((await chem.context.request.get(base+'/api/events/'+fixture.foreign+'/lab/'+lab.id)).status(),404);
  await cp.setViewportSize({width:390,height:844});
  const tabsGroup=cp.getByRole('group',{name:'Record sections'});
  await tabsGroup.waitFor();
  assert.equal(await tabsGroup.locator('button[aria-pressed="true"]').count(),1);
  assert.ok(await tabsGroup.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Record sections must reflow within mobile viewport');
  await cp.screenshot({path:join(output,'specialist-lab-mobile.png'),fullPage:true});
  await chem.context.close();
  const labSupervisor=await login(fixture.labLeadEmail);
  await labSupervisor.page.waitForURL(/\/events\/.+\/my-work/);
  await labSupervisor.page.goto(labDetail);
  await labSupervisor.page.getByRole('button',{name:'Approve & Certify Report'}).click();
  await labSupervisor.page.getByRole('button',{name:'Approve & Certify Report'}).waitFor({state:'hidden'});
  assert.equal((await readLab(labSupervisor.context)).status,'APPROVED');
  await labSupervisor.context.close();
  const labResult=await readLab(requester.context);
  assert.equal(labResult.reportAvailable,true);assert.equal(labResult.conclusion,labConclusion);
  await requester.page.goto(labDetail);
  await requester.page.locator('#lab-conclusion').waitFor();
  await requester.page.waitForFunction(value=>document.querySelector('#lab-conclusion')?.value===value,labConclusion);
  await requester.page.screenshot({path:join(output,'specialist-lab-requester-result.png'),fullPage:true});
  await requester.context.close();

  // Exercise the new actual organizer controls after the specialist report
  // has been independently approved and returned. No mock successful writes.
  const organizer=await login(fixture.adminEmail),op=organizer.page;
  await op.waitForURL(/\/admin(?:\/|$)/);
  await op.goto(labDetail);
  const reopen=op.getByRole('button',{name:'Reopen / correct',exact:true});
  await reopen.waitFor();
  await reopen.focus();
  await op.keyboard.press('Enter');
  const correction=op.getByRole('form',{name:'Reopen request',exact:true});
  const reason=correction.getByLabel('Correction reason (required)',{exact:true});
  await reason.waitFor();
  await op.waitForFunction(()=>document.activeElement?.id==='lab-correction-reason');
  await correction.getByRole('button',{name:'Cancel',exact:true}).click();
  await correction.waitFor({state:'hidden'});
  assert.equal(await reopen.evaluate(el=>document.activeElement===el),true,'Cancel restores keyboard focus');
  await reopen.click();
  await reason.fill('   ');
  await correction.getByRole('button',{name:'Confirm reopening',exact:true}).click();
  await correction.getByRole('alert').filter({hasText:'Enter a reason of at least three characters.'}).waitFor();
  assert.equal((await readLab(organizer.context)).status,'APPROVED','Invalid reason must not alter approved state');
  await reason.fill('Synthetic organizer correction for acceptance');
  await op.setViewportSize({width:390,height:844});
  assert.ok(await correction.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Correction form fits narrow viewport');
  await op.screenshot({path:join(output,'organizer-lab-correction-mobile.png'),fullPage:true});
  // Keep the mobile layout check separate from the desktop write acceptance.
  await op.setViewportSize({width:1440,height:1000});
  assert.equal(await reason.inputValue(),'Synthetic organizer correction for acceptance');
  assert.equal(await correction.evaluate(el=>el.checkValidity()),true,'Correction form must satisfy native validation');
  const confirmCorrection=correction.getByRole('button',{name:'Confirm reopening',exact:true});
  assert.equal(await confirmCorrection.isEnabled(),true,'Correction submit must be enabled');
  const correctionRequests=[];
  op.on('request',r=>{if(r.method()==='POST')correctionRequests.push(new URL(r.url()).pathname);});
  const [correctedResponse]=await Promise.all([
    op.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/lab/'+lab.id+'/correct')&&r.request().method()==='POST').catch(async error=>{throw new Error('Correction response missing; POST paths: '+correctionRequests.join(', ')+'; form: '+await correction.innerText().catch(()=>'(closed)'),{cause:error});}),
    confirmCorrection.click(),
  ]);
  assert.ok(correctedResponse.ok(),'Correction HTTP '+correctedResponse.status());
  await correction.waitFor({state:'hidden'});
  assert.equal((await readLab(organizer.context)).status,'REQUESTED');

  const assignment=op.getByRole('form',{name:'Request assignment',exact:true});
  await assignment.waitFor();
  await assignment.getByLabel('Destination laboratory',{exact:true}).selectOption(fixture.chemicalUnit);
  const worker=assignment.getByLabel('Worker',{exact:true});
  await worker.locator('option[value="'+fixture.labLead+'"]').waitFor({state:'attached'});
  await worker.selectOption(fixture.labLead);
  await assignment.getByLabel('Reason (required)',{exact:true}).fill('Synthetic reassignment for acceptance');
  await op.screenshot({path:join(output,'organizer-lab-assignment-mobile.png'),fullPage:true});
  const assignedResponse=op.waitForResponse(r=>r.url().endsWith('/lab/'+lab.id+'/reassign')&&r.request().method()==='POST');
  await assignment.getByRole('button',{name:'Assign worker',exact:true}).click();
  assert.ok((await assignedResponse).ok());
  assert.equal((await readLab(organizer.context)).assignedToUserId,fixture.labLead);
  await organizer.context.close();

  // Canonical medical operator: synthetic encounter, private record and a
  // deliberate triage change in the real UI, with negative role/event checks.
  const medical=await login(fixture.medicEmail),mp=medical.page;
  await mp.waitForURL(/\/events\/.+\/my-work/);
  const complaint='Synthetic browser medical intake';
  const intake=await medical.context.request.post(apiRoot+'/medical',{data:{chiefComplaint:complaint,assignedUnitId:fixture.medicalUnit,triageCategory:'UNKNOWN',visibility:'UNIT'}});
  assert.equal(intake.status(),201);
  const intakePayload=await intake.json(),patient=intakePayload.data??intakePayload;
  assert.ok(patient.id);assert.equal(patient.assignedUnitId,fixture.medicalUnit);
  assert.equal(patient.status,'RECEIVED');
  const medicalEndpoint=apiRoot+'/medical/'+patient.id;
  const readMedical=async()=>{const result=await medical.context.request.get(medicalEndpoint);assert.equal(result.status(),200);const payload=await result.json();return payload.data??payload;};
  await mp.goto(eventRoot+'/medical');
  await mp.getByText(complaint,{exact:true}).waitFor();
  await mp.screenshot({path:join(output,'specialist-medical-queue.png'),fullPage:true});
  await mp.getByText(complaint,{exact:true}).click();
  await mp.waitForURL('**/medical/'+patient.id);
  await mp.getByRole('button',{name:'Set Triage',exact:true}).click();
  const triage=mp.getByRole('dialog',{name:'Assign Triage Category'});
  const category=triage.getByLabel('Triage Category',{exact:true});
  await category.waitFor();
  assert.equal(await category.inputValue(),'UNKNOWN','Do not default to an unrelated high-priority category');
  await category.selectOption('MINOR');
  await triage.getByLabel('Clinical Justification / Note',{exact:true}).fill('Synthetic instructor-assigned test category');
  await mp.setViewportSize({width:390,height:844});
  assert.ok(await triage.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Medical triage dialog reflows');
  await mp.screenshot({path:join(output,'specialist-medical-triage-mobile.png'),fullPage:true});
  await triage.getByRole('button',{name:'Set Triage',exact:true}).click();
  await triage.waitFor({state:'hidden'});
  const triaged=await readMedical();
  assert.equal(triaged.triageCategory,'MINOR');assert.equal(triaged.status,'TRIAGED');
  await mp.getByRole('button',{name:'Set Triage',exact:true}).click();
  await category.waitFor();
  assert.equal(await category.inputValue(),'MINOR','Reopening preserves current category');
  await triage.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal((await medical.context.request.get(base+'/api/events/'+fixture.foreign+'/medical/'+patient.id)).status(),404);
  const unrelated=await login(fixture.requesterEmail);
  assert.equal((await unrelated.context.request.get(medicalEndpoint)).status(),403);
  assert.equal((await unrelated.context.request.post(medicalEndpoint+'/triage',{data:{triageCategory:'DELAYED'}})).status(),403);
  await unrelated.context.close();
  await medical.context.close();
  assert.deepEqual(errors,[],'Unexpected browser JavaScript errors');
  console.log('Real-browser admin, participant and canonical specialist workflow smoke passed; 17 screenshots captured.');
}finally{await browser.close();}
