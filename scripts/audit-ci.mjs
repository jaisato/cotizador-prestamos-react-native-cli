#!/usr/bin/env node
// `npm audit` for CI: fails on every advisory except the ones in ALLOWED.
//
// npm audit has no allowlist of its own and its exit code fails on any
// advisory, including one that has no fixed release anywhere. This keeps the
// check strict for everything else, and each exception says why it is there.
// An exception stops applying as soon as npm can fix the advisory, so a patch
// published upstream turns the build red until the lockfile picks it up.
//
// Exit codes: 0, nothing blocks; 1, some advisory blocks; 2, npm audit failed
// or printed something this script does not understand. A report it cannot
// read is never taken as a clean one.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Advisories tolerated on purpose: GHSA id → the only package it may hit. */
const ALLOWED = new Map([
  [
    'GHSA-vfj7-8cjw-p6xm',
    {
      package: 'braces',
      reason:
        'braces <= 3.0.3 no tiene ninguna versión corregida. Llega por ' +
        'micromatch, que usan Metro (el empaquetador) y Jest; se ejecuta al ' +
        'construir y en los tests, y no forma parte del bundle de la app.',
    },
  ],
]);

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const lockfilePath = fileURLToPath(
  new URL('../package-lock.json', import.meta.url),
);

function fail(message) {
  console.error(message);
  process.exit(2);
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Always the npm on PATH. npm_execpath is whatever package manager started
// the script (yarn, pnpm and bun set it too), and their audit prints another
// report. On Windows npm is npm.cmd, which Node only starts through a shell;
// the command line is fixed, so nothing from outside reaches that shell.
const options = {
  cwd: projectRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
};
const audit =
  process.platform === 'win32'
    ? spawnSync('npm audit --json', { ...options, shell: true })
    : spawnSync('npm', ['audit', '--json'], options);

if (audit.error) {
  fail(`No se ha podido ejecutar npm audit: ${audit.error.message}`);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  fail('npm audit no ha devuelto JSON:\n' + audit.stdout + audit.stderr);
}

if (!isObject(report)) {
  fail(`npm audit ha devuelto ${JSON.stringify(report)} en vez de un informe.`);
}

if (report.error) {
  // On a network failure npm 11 leaves error.summary empty and puts the
  // cause in message.
  fail(
    'npm audit ha fallado: ' +
      (report.message ||
        report.error.summary ||
        report.error.code ||
        JSON.stringify(report.error)),
  );
}

if (report.auditReportVersion !== 2) {
  fail(
    'Formato de informe desconocido (auditReportVersion ' +
      `${JSON.stringify(report.auditReportVersion)}): este script lee el 2, ` +
      'el de npm 7 y posteriores.',
  );
}

const { vulnerabilities } = report;
if (!isObject(vulnerabilities)) {
  fail('El informe no trae el objeto vulnerabilities.');
}

const entries = Object.entries(vulnerabilities);
const total = report.metadata?.vulnerabilities?.total;
if (total !== entries.length) {
  fail(
    `El informe no cuadra: metadata.vulnerabilities.total es ${JSON.stringify(total)} ` +
      `y vulnerabilities tiene ${entries.length} paquete(s).`,
  );
}

for (const [name, vulnerability] of entries) {
  const fix = vulnerability?.fixAvailable;
  const fixIsValid =
    typeof fix === 'boolean' ||
    (isObject(fix) &&
      typeof fix.name === 'string' &&
      typeof fix.version === 'string');

  if (
    !isObject(vulnerability) ||
    !Array.isArray(vulnerability.via) ||
    !fixIsValid ||
    !vulnerability.via.every(
      via =>
        typeof via === 'string' ||
        (isObject(via) && typeof via.name === 'string'),
    )
  ) {
    fail(`La entrada de ${name} no tiene la forma esperada.`);
  }
}

let lockfile;
function installedVersion(name) {
  try {
    lockfile ??= JSON.parse(readFileSync(lockfilePath, 'utf8'));
  } catch {
    return null;
  }
  return lockfile.packages?.[`node_modules/${name}`]?.version ?? null;
}

/** Numeric x.y.z comparison; a pre-release sorts before its release. */
function compareVersions(a, b) {
  const parse = version => {
    const [core, ...pre] = version.split('+')[0].split('-');
    return { parts: core.split('.').map(Number), pre: pre.join('-') };
  };
  const x = parse(a);
  const y = parse(b);

  for (let i = 0; i < 3; i++) {
    const diff = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  if (x.pre === y.pre) {
    return 0;
  }
  if (!x.pre || !y.pre) {
    return x.pre ? -1 : 1;
  }
  return x.pre < y.pre ? -1 : 1;
}

/**
 * What npm offers for a vulnerable package, read as "is there a fix".
 * true: `npm audit fix` solves it within the declared ranges. An object:
 * `npm audit fix --force` would install name@version, usually a major
 * change; that is a fix when it moves forward, and fails the exception like
 * any other. When it moves back (for braces npm proposes react-native 0.72.17
 * in place of 0.87.1) it is a downgrade into an older tree, not a patched
 * release, so it does not count. If the installed version cannot be read,
 * the object counts as a fix: in doubt, the build fails.
 */
function readFix(fixAvailable) {
  if (fixAvailable === true) {
    return { fix: 'npm audit fix' };
  }
  if (fixAvailable === false) {
    return {};
  }

  const { name, version, isSemVerMajor } = fixAvailable;
  const installed = installedVersion(name);
  const target = `${name}@${version}`;

  if (installed !== null && compareVersions(version, installed) < 0) {
    return { downgrade: `${target} (instalado: ${installed})` };
  }
  return {
    fix: `npm audit fix --force, que instala ${target}${
      isSemVerMajor ? ' (cambio mayor)' : ''
    }`,
  };
}

// Each package lists the advisories that hit it directly as objects in `via`;
// strings there are dependencies that are only affected through another one.
const advisories = new Map();
for (const [, vulnerability] of entries) {
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
      names: new Set(),
      fixes: new Set(),
      downgrades: new Set(),
    };

    advisory.packages.add(`${via.name}@${via.range}`);
    advisory.names.add(via.name);
    const { fix, downgrade } = readFix(vulnerability.fixAvailable);
    if (fix) {
      advisory.fixes.add(fix);
    }
    if (downgrade) {
      advisory.downgrades.add(downgrade);
    }
    advisories.set(id, advisory);
  }
}

console.log(
  `npm audit: ${advisories.size} aviso(s) distinto(s), ${entries.length} paquete(s) afectado(s) contando dependientes.`,
);

const blocking = [];
for (const advisory of advisories.values()) {
  const allowed = ALLOWED.get(advisory.id);
  const line = `${advisory.id} (${advisory.severity}) ${[
    ...advisory.packages,
  ].join(', ')}: ${advisory.title}`;
  const others = allowed
    ? [...advisory.names].filter(name => name !== allowed.package)
    : [];

  if (!allowed) {
    console.log(`  BLOQUEA    ${line}\n             ${advisory.url}`);
    blocking.push(advisory);
  } else if (others.length > 0) {
    console.log(
      `  BLOQUEA    ${line}\n             La excepción solo cubre ${allowed.package}, ` +
        `y el aviso afecta también a ${others.join(', ')}.`,
    );
    blocking.push(advisory);
  } else if (advisory.fixes.size > 0) {
    console.log(
      `  BLOQUEA    ${line}\n             Ya tiene arreglo (${[
        ...advisory.fixes,
      ].join('; ')}): actualiza y quita la excepción.`,
    );
    blocking.push(advisory);
  } else {
    console.log(`  permitido  ${line}\n             ${allowed.reason}`);
    for (const downgrade of advisory.downgrades) {
      console.log(
        `             npm propone ${downgrade}: es bajar de versión, no un arreglo.`,
      );
    }
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
