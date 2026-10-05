#!/usr/bin/env node
// `npm audit` for CI: fails on every advisory except the ones in ALLOWED.
//
// npm audit has no allowlist of its own and its exit code fails on any
// advisory, including one that has no fixed release anywhere. This keeps the
// check strict for everything else, and each exception says why it is there.
//
// An exception only holds while its advisory has no patched version, and the
// script asks: the GitHub Advisory Database (`gh api /advisories/<id>`) or,
// when gh cannot answer (not installed, or without a token), the npm registry
// (`npm view <package> versions`, looking for a release outside the vulnerable
// range). As soon as there is a patched version the build turns red until the
// lockfile picks it up and the exception goes. If neither can answer, the
// script exits with 2: an exception it cannot check is not granted. Neither is
// one checked against an answer from GitHub in another form: another advisory,
// or a first_patched_version that is missing or neither null nor a version.
//
// npm's fixAvailable is printed but does not decide. For a package that
// several dependents bring, npm reports the fix of whichever dependent it
// reaches first, an order that changes from one run to the next (for braces,
// react-native@0.72.17 in one run and jest@30 in another), and upgrading one
// dependent does not remove a package that the others still bring.
//
// Exit codes: 0, nothing blocks; 1, some advisory blocks; 2, npm audit failed,
// printed something this script does not understand, or the patch status of
// an exception could not be read. A report it cannot read is never taken as a
// clean one.

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
        'micromatch, que usan Metro (el empaquetador), la CLI de React ' +
        'Native y Jest; se ejecuta al construir y en los tests, y no forma ' +
        'parte del bundle de la app.',
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
// the command lines are fixed, so nothing from outside reaches that shell.
const options = {
  cwd: projectRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
};

function npm(args) {
  return process.platform === 'win32'
    ? spawnSync(['npm', ...args].join(' '), { ...options, shell: true })
    : spawnSync('npm', args, options);
}

const audit = npm(['audit', '--json']);

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
    `El informe no cuadra: metadata.vulnerabilities.total es ${JSON.stringify(
      total,
    )} ` + `y vulnerabilities tiene ${entries.length} paquete(s).`,
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
 * A range as npm audit writes them ("<=3.0.3", ">=2.0.0 <2.2.3", "a || b"),
 * as alternatives of comparators; null for any other form.
 */
function parseRange(range) {
  if (typeof range !== 'string' || range.trim() === '') {
    return null;
  }

  const alternatives = range.split('||').map(alternative =>
    alternative
      .trim()
      .split(/\s+/)
      .map(comparator => {
        const match =
          /^(<=|>=|<|>|=)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(
            comparator,
          );
        return match ? { operator: match[1] ?? '=', version: match[2] } : null;
      }),
  );

  return alternatives.every(
    comparators => comparators.length > 0 && comparators.every(Boolean),
  )
    ? alternatives
    : null;
}

function inRange(version, alternatives) {
  return alternatives.some(comparators =>
    comparators.every(({ operator, version: bound }) => {
      const diff = compareVersions(version, bound);
      switch (operator) {
        case '<':
          return diff < 0;
        case '<=':
          return diff <= 0;
        case '>':
          return diff > 0;
        case '>=':
          return diff >= 0;
        default:
          return diff === 0;
      }
    }),
  );
}

/**
 * GitHub's answer for the advisory `id`: the patched versions of `name` it
 * lists (first_patched_version), or null while it lists none.
 *
 * Only an answer in the expected form counts: the advisory asked for, and for
 * each entry of the npm package, a first_patched_version that is null or a
 * version. Anything else (another advisory, the field missing, an object or a
 * number where the version goes) exits with 2. Read loosely, such an answer
 * looked like "no patch yet" and granted the exception.
 */
function patchedOnGitHub(id, name, output) {
  let advisory;
  try {
    advisory = JSON.parse(output);
  } catch {
    fail(`gh api /advisories/${id} no ha devuelto JSON:\n${output}`);
  }

  if (!isObject(advisory)) {
    fail(
      `gh api /advisories/${id} no ha devuelto un aviso: ` +
        JSON.stringify(advisory).slice(0, 200),
    );
  }
  if (advisory.ghsa_id !== id) {
    fail(
      `gh api /advisories/${id} ha devuelto otro aviso (ghsa_id ` +
        `${JSON.stringify(advisory.ghsa_id)}): no se puede saber si tiene ` +
        'versión corregida.',
    );
  }

  const affected = Array.isArray(advisory.vulnerabilities)
    ? advisory.vulnerabilities.filter(
        vulnerability =>
          vulnerability?.package?.ecosystem === 'npm' &&
          vulnerability.package.name === name,
      )
    : [];
  if (affected.length === 0) {
    fail(
      `El aviso ${id} de la base de datos de GitHub no menciona el paquete ` +
        `npm ${name}: no se puede saber si tiene versión corregida.`,
    );
  }

  for (const vulnerability of affected) {
    const version = vulnerability.first_patched_version;
    if (
      !Object.hasOwn(vulnerability, 'first_patched_version') ||
      (version !== null && (typeof version !== 'string' || version === ''))
    ) {
      fail(
        `El aviso ${id} de la base de datos de GitHub trae para ${name} un ` +
          `first_patched_version ${
            version === undefined ? 'ausente' : JSON.stringify(version)
          }, y solo se entiende null o una versión: no se puede saber si ` +
          'tiene versión corregida.',
      );
    }
  }

  const versions = affected
    .map(vulnerability => vulnerability.first_patched_version)
    .filter(version => version !== null);
  return versions.length > 0 ? versions.join(', ') : null;
}

/**
 * Whether the advisory `id` has a patched version of `name`, whose vulnerable
 * range npm reports as `range`: { patched: version or null, source }.
 */
function patchStatus(id, name, range) {
  const gh = spawnSync('gh', ['api', `/advisories/${id}`], options);

  if (!gh.error && gh.status === 0) {
    return {
      patched: patchedOnGitHub(id, name, gh.stdout),
      source: 'la base de datos de avisos de GitHub',
    };
  }

  const ghProblem = gh.error
    ? gh.error.message
    : (gh.stderr || gh.stdout || `código ${gh.status}`).trim();
  const view = npm(['view', name, 'versions', '--json']);
  if (view.error || view.status !== 0) {
    fail(
      `No se ha podido saber si ${id} tiene versión corregida: gh api ha ` +
        `fallado (${ghProblem}) y npm view ${name} versions también ` +
        `(${
          (view.error?.message ?? view.stderr ?? '').trim() ||
          `código ${view.status}`
        }).`,
    );
  }

  let versions;
  try {
    versions = JSON.parse(view.stdout);
  } catch {
    fail(`npm view ${name} versions no ha devuelto JSON:\n${view.stdout}`);
  }
  // With a single version, npm view prints a string instead of a list.
  if (typeof versions === 'string') {
    versions = [versions];
  }
  if (
    !Array.isArray(versions) ||
    versions.length === 0 ||
    !versions.every(version => typeof version === 'string')
  ) {
    fail(`npm view ${name} versions no ha devuelto una lista de versiones.`);
  }

  const alternatives = parseRange(range);
  if (!alternatives) {
    fail(
      `No se entiende el rango vulnerable ${JSON.stringify(range)} de ${id}.`,
    );
  }

  // A release outside the vulnerable range and newer than the oldest
  // vulnerable one is a version to upgrade to; older ones, before a range
  // with a lower bound, are not. Pre-releases do not count either.
  const releases = versions.filter(version => !version.includes('-'));
  const oldestVulnerable = releases
    .filter(version => inRange(version, alternatives))
    .sort(compareVersions)[0];
  const patched = releases
    .filter(version => !inRange(version, alternatives))
    .filter(
      version =>
        oldestVulnerable === undefined ||
        compareVersions(version, oldestVulnerable) > 0,
    )
    .sort(compareVersions)[0];

  return {
    patched: patched ?? null,
    source: `npm view ${name} versions`,
  };
}

/** What npm offers for a vulnerable package, to print it; it decides nothing. */
function describeFix(fixAvailable) {
  if (fixAvailable === true) {
    return 'npm audit fix';
  }
  if (fixAvailable === false) {
    return null;
  }

  const { name, version, isSemVerMajor } = fixAvailable;
  const installed = installedVersion(name);
  const target = `${name}@${version}`;

  if (installed !== null && compareVersions(version, installed) < 0) {
    return `${target} (instalado: ${installed}), que es bajar de versión`;
  }
  return `npm audit fix --force, que instala ${target}${
    isSemVerMajor ? ' (cambio mayor)' : ''
  }`;
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
      ranges: new Map(),
      fixes: new Set(),
    };

    advisory.packages.add(`${via.name}@${via.range}`);
    advisory.names.add(via.name);
    advisory.ranges.set(via.name, via.range);
    const fix = describeFix(vulnerability.fixAvailable);
    if (fix) {
      advisory.fixes.add(fix);
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
    continue;
  }
  if (others.length > 0) {
    console.log(
      `  BLOQUEA    ${line}\n             La excepción solo cubre ${allowed.package}, ` +
        `y el aviso afecta también a ${others.join(', ')}.`,
    );
    blocking.push(advisory);
    continue;
  }

  const { patched, source } = patchStatus(
    advisory.id,
    allowed.package,
    advisory.ranges.get(allowed.package),
  );
  if (patched) {
    console.log(
      `  BLOQUEA    ${line}\n             Ya tiene versión corregida: ` +
        `${allowed.package} ${patched}, según ${source}. Actualiza y quita la excepción.`,
    );
    blocking.push(advisory);
    continue;
  }

  console.log(
    `  permitido  ${line}\n             ${allowed.reason}\n` +
      `             Sin versión corregida, según ${source}.`,
  );
  for (const fix of advisory.fixes) {
    console.log(
      `             npm propone ${fix}. No cuenta: lo que decide es si ` +
        `${allowed.package} tiene versión corregida.`,
    );
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
