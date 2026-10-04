#!/usr/bin/env node
// `npm audit` for CI: fails on every advisory except the ones in ALLOWED.
//
// npm audit has no allowlist of its own and its exit code fails on any
// advisory, including one that has no fixed release anywhere. This keeps the
// check strict for everything else, and each exception says why it is there.
// An exception stops applying as soon as npm can fix the advisory, so a patch
// published upstream turns the build red until the lockfile picks it up.

import { spawnSync } from 'node:child_process';

/** Advisories tolerated on purpose: GHSA id → reason. */
const ALLOWED = new Map([
  [
    'GHSA-vfj7-8cjw-p6xm',
    'braces <= 3.0.3 no tiene ninguna versión corregida. Llega por micromatch, ' +
      'que usan Metro (el empaquetador) y Jest; se ejecuta al construir y en ' +
      'los tests, y no forma parte del bundle de la app.',
  ],
]);

// Under `npm run`, npm_execpath points at npm's own CLI, which avoids
// spawning npm.cmd through a shell on Windows.
const audit = process.env.npm_execpath
  ? spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  : spawnSync('npm', ['audit', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32',
    });

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error(
    'npm audit no ha devuelto JSON:\n' + audit.stdout + audit.stderr,
  );
  process.exit(2);
}

if (report.error) {
  console.error(
    `npm audit ha fallado: ${report.error.summary || report.error.code}`,
  );
  process.exit(2);
}

const vulnerabilities = report.vulnerabilities ?? {};

// Each package lists the advisories that hit it directly as objects in `via`;
// strings there are dependencies that are only affected through another one.
const advisories = new Map();
for (const vulnerability of Object.values(vulnerabilities)) {
  for (const via of vulnerability.via) {
    if (typeof via === 'string') {
      continue;
    }

    const id =
      via.url?.match(/GHSA(-[a-z0-9]{4}){3}/)?.[0] ?? `npm-${via.source}`;
    const advisory = advisories.get(id) ?? {
      id,
      title: via.title,
      severity: via.severity,
      url: via.url,
      packages: new Set(),
      fixable: false,
    };

    advisory.packages.add(`${via.name}@${via.range}`);
    // true means `npm audit fix` can solve it without a breaking change.
    advisory.fixable ||= vulnerabilities[via.name]?.fixAvailable === true;
    advisories.set(id, advisory);
  }
}

const affected = Object.keys(vulnerabilities).length;
console.log(
  `npm audit: ${advisories.size} aviso(s) distinto(s), ${affected} paquete(s) afectado(s) contando dependientes.`,
);

const blocking = [];
for (const advisory of advisories.values()) {
  const reason = ALLOWED.get(advisory.id);
  const line = `${advisory.id} (${advisory.severity}) ${[
    ...advisory.packages,
  ].join(', ')}: ${advisory.title}`;

  if (reason && !advisory.fixable) {
    console.log(`  permitido  ${line}\n             ${reason}`);
  } else if (reason) {
    console.log(
      `  BLOQUEA    ${line}\n             Ya tiene arreglo: ejecuta npm audit fix y quita la excepción.`,
    );
    blocking.push(advisory);
  } else {
    console.log(`  BLOQUEA    ${line}\n             ${advisory.url}`);
    blocking.push(advisory);
  }
}

for (const id of ALLOWED.keys()) {
  if (!advisories.has(id)) {
    console.log(
      `  aviso: ${id} ya no aparece; quita la excepción de scripts/audit-ci.mjs.`,
    );
  }
}

if (blocking.length > 0) {
  console.error(
    `\n${blocking.length} aviso(s) sin excepción: falla la auditoría.`,
  );
  process.exit(1);
}

console.log('\nOK: ningún aviso fuera de las excepciones.');
