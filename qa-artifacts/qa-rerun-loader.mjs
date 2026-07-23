import fs from 'node:fs/promises';

const previousRoot = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const artifactRoot = process.env.QA_ARTIFACT_ROOT;

export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context);
  if (!artifactRoot || !url.includes('/qa-artifacts/run-b-20260711-195750/scripts/') || loaded.format !== 'module') {
    return loaded;
  }

  const consentSetup = `await PAGE.addInitScript(() => localStorage.setItem('subslush_cookie_consent', JSON.stringify({ version: '2026-02-05', updatedAt: new Date().toISOString(), decision: 'reject_non_essential', preferences: { analytics: false, marketing: false } })));`;
  let source = String(loaded.source)
    .replaceAll(previousRoot, artifactRoot)
    .replaceAll('QA-B2', 'QA-R3')
    .replaceAll('qa-b2', 'qa-r3')
    .replaceAll('Reject non-essential', 'Accept all')
    .replaceAll('const page = await context.newPage();', `const page = await context.newPage(); ${consentSetup.replaceAll('PAGE', 'page')}`)
    .replaceAll('const adminPage = await adminContext.newPage();', `const adminPage = await adminContext.newPage(); ${consentSetup.replaceAll('PAGE', 'adminPage')}`);

  const idReplacements = [
    ['f1a571a5-64e7-48ad-891e-ff2ded33696c', process.env.QA_R3_ORDER_ID],
    ['42066d1e-be37-4fe9-97b7-7237017e7697', process.env.QA_R3_PENDING_ORDER_ID],
    ['e8618e2c-37a0-4661-bfe1-995125820b7b', process.env.QA_R3_P1_SUB_ID],
    ['e869bdd6-d17e-49a2-a602-964dbec01785', process.env.QA_R3_P2_SUB_ID],
    ['3d147a02-f654-40dc-9c88-661d8a483ca7', process.env.QA_R3_P3_SUB_ID],
  ];
  for (const [oldValue, newValue] of idReplacements) {
    if (newValue) source = source.replaceAll(oldValue, newValue);
  }
  source = source
    .replaceAll('page.locator(`#${subs.p1}`)', 'page.locator(`[id="${subs.p1}"]`)')
    .replaceAll('page.locator(`#${subs.p2}`)', 'page.locator(`[id="${subs.p2}"]`)')
    .replaceAll('page.locator(`#${subs.p3}`)', 'page.locator(`[id="${subs.p3}"]`)');

  return { format: 'module', source, shortCircuit: true };
}
