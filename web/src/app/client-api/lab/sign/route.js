// Next.js Route Handler for Demo Lab Client Simulation (outside Doc365 Server).
// The facility client holds its private key and signs the FHIR bundle BEFORE
// sending it to the Doc365 server (DESIGN.md section 4).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

export async function POST(request) {
  try {
    const { bundle, labReference = 'Organization/demo-lab-colombo' } = await request.json();

    if (!bundle) {
      return NextResponse.json({ error: 'Missing bundle' }, { status: 400 });
    }

    // Try finding the private key in server/keys/
    const possiblePaths = [
      path.resolve(process.cwd(), '../server/keys/demo-lab-colombo.private.pem'),
      path.resolve(process.cwd(), 'server/keys/demo-lab-colombo.private.pem'),
      path.resolve(process.cwd(), '../../server/keys/demo-lab-colombo.private.pem'),
    ];

    let privateKeyPem = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        privateKeyPem = fs.readFileSync(p, 'utf8');
        break;
      }
    }

    if (!privateKeyPem) {
      return NextResponse.json(
        { error: 'Lab private key not found on disk. Ensure server/keys/demo-lab-colombo.private.pem exists.' },
        { status: 500 },
      );
    }

    const bytes = Buffer.from(canonicalize(bundle), 'utf8');
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const signature = crypto.sign(null, bytes, privateKey);
    const now = new Date().toISOString();

    const report = bundle.entry?.find((e) => e.resource?.resourceType === 'DiagnosticReport');
    const targetRef = report?.resource?.id
      ? `DiagnosticReport/${report.resource.id}`
      : `Bundle/${bundle.id || 'bundle-1'}`;

    const provenance = {
      resourceType: 'Provenance',
      target: [{ reference: targetRef }],
      recorded: now,
      agent: [{ who: { reference: labReference } }],
      signature: [
        {
          type: [
            {
              system: 'urn:iso-astm:E1762-95:2013',
              code: '1.2.840.10065.1.12.1.5',
              display: 'Verification Signature',
            },
          ],
          when: now,
          who: { reference: labReference },
          targetFormat: 'application/fhir+json',
          sigFormat: 'application/octet-stream',
          data: signature.toString('base64'),
        },
      ],
    };

    return NextResponse.json({ provenance });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
