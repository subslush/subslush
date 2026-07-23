import fs from 'node:fs/promises';
const root = '/home/yuri/projects/ss/qa-artifacts/run-b-20260711-195750';
const log = await fs.readFile(`${root}/backend.log`, 'utf8');
const starts = [...log.matchAll(/\[INFO\] ([^ ]+) - Email dispatch \(console mode\) \{/g)];
const rows = [];
for (let index = 0; index < starts.length; index += 1) {
  const start = starts[index];
  const end = starts[index + 1]?.index ?? log.length;
  const block = log.slice(start.index, end);
  const to = block.match(/\n  to: '([^']+)'/)?.[1];
  const subject = block.match(/\n  subject: '([^']+)'/)?.[1];
  if (!to?.startsWith('qa-b2-') || !subject) continue;
  const classification = subject === 'Your SubSlush order is confirmed'
    ? 'order confirmation'
    : subject === 'Confirm your SubSlush email'
      ? 'account verification'
      : subject.includes('linked to your account')
        ? 'guest claim'
        : subject === 'Your activation link is ready'
          ? 'per-item activation-link ready'
          : subject === 'Confirm when you are ready to activate'
            ? 'activation restart'
            : subject.includes('is ready')
              ? 'per-item delivery'
              : subject.includes('claim your delivered')
                ? 'guest delivered-claim notice'
                : subject.includes('12% off')
                  ? 'newsletter coupon'
                  : subject === 'Your SubSlush order is delivered'
                    ? 'legacy single-item order delivery'
                    : 'other';
  rows.push({ time: start[1], to, subject, classification, activationSecretInEmail: subject === 'Your activation link is ready' ? /token-(FIRST|SECOND)-SECRET/.test(block) : false });
}
await fs.writeFile(`${root}/email-inventory.json`, JSON.stringify(rows, null, 2));
await fs.writeFile(`${root}/email-inventory-lines.log`, rows.map(row => `${row.time}\t${row.to}\t${row.subject}\t${row.classification}\tactivation_secret_in_email=${row.activationSecretInEmail}`).join('\n') + '\n');
