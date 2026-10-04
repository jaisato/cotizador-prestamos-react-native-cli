// Tests for audit-ci.mjs: node --test scripts/audit-ci.test.mjs
//
// Each test runs a copy of the script in a scratch project whose PATH starts
// with a fake npm. The fake prints a fixed report, so the tests cover what the
// script does with each kind of output without touching the registry.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./audit-ci.mjs', import.meta.url));
const skip = process.platform === 'win32' && 'the fake npm is a shell script';

const LOCKFILE = {
  lockfileVersion: 3,
  packages: {
    'node_modules/braces': { version: '3.0.3' },
    'node_modules/react-native': { version: '0.87.1' },
  },
};

// What npm 11 offers for braces today: going back to react-native 0.72.17.
const DOWNGRADE = {
  name: 'react-native',
  version: '0.72.17',
  isSemVerMajor: true,
};

/** The braces entry of a real report, with its fixAvailable replaceable. */
function braces(fixAvailable = DOWNGRADE, name = 'braces') {
  return {
    name,
    severity: 'high',
    isDirect: false,
    via: [
      {
        source: 1240992,
        name,
        dependency: name,
        title:
          'braces vulnerable to stack-exhaustion denial of service through deeply nested patterns',
        url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
        severity: 'high',
        cwe: ['CWE-674'],
        cvss: {
          score: 7.5,
          vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H',
        },
        range: '<=3.0.3',
      },
    ],
    effects: ['micromatch'],
    range: '*',
    nodes: [`node_modules/${name}`],
    fixAvailable,
  };
}

const MICROMATCH = {
  name: 'micromatch',
  severity: 'high',
  isDirect: false,
  via: ['braces'],
  effects: ['jest-haste-map', 'metro-file-map'],
  range: '>=0.2.0',
  nodes: ['node_modules/micromatch'],
  fixAvailable: DOWNGRADE,
};

const LODASH = {
  name: 'lodash',
  severity: 'moderate',
  isDirect: false,
  via: [
    {
      source: 1,
      name: 'lodash',
      dependency: 'lodash',
      title: 'Prototype Pollution in lodash',
      url: 'https://github.com/advisories/GHSA-p6mc-m468-83gw',
      severity: 'moderate',
      range: '<4.17.21',
    },
  ],
  effects: [],
  range: '<4.17.21',
  nodes: ['node_modules/lodash'],
  fixAvailable: true,
};

/** An npm 7+ report; total defaults to the number of entries, as npm does. */
function report(vulnerabilities, total = Object.keys(vulnerabilities).length) {
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: total,
        critical: 0,
        total,
      },
      dependencies: { prod: 1, dev: 1, optional: 0, peer: 0, total: 2 },
    },
  };
}

/**
 * Runs the script against a fake npm that prints `output` (a string as is,
 * anything else as JSON) and exits with `status`, like npm audit does.
 */
function runAudit(output, { status = 1, lockfile = LOCKFILE } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-ci-'));

  try {
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'bin'));
    copyFileSync(script, join(dir, 'scripts', 'audit-ci.mjs'));
    if (lockfile) {
      writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lockfile));
    }

    const outputFile = join(dir, 'output.txt');
    const argsFile = join(dir, 'args.txt');
    writeFileSync(
      outputFile,
      typeof output === 'string' ? output : JSON.stringify(output),
    );
    const npm = join(dir, 'bin', 'npm');
    writeFileSync(
      npm,
      `#!/bin/sh\necho "$*" > '${argsFile}'\ncat '${outputFile}'\nexit ${status}\n`,
    );
    chmodSync(npm, 0o755);

    const run = spawnSync(
      process.execPath,
      [join(dir, 'scripts', 'audit-ci.mjs')],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: join(dir, 'bin') + delimiter + process.env.PATH,
          // As under `yarn run`: the script must not follow it.
          npm_execpath: join(dir, 'yarn.js'),
        },
      },
    );

    return {
      status: run.status,
      stdout: run.stdout,
      stderr: run.stderr,
      npmArgs: existsSync(argsFile)
        ? readFileSync(argsFile, 'utf8').trim()
        : null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('allows braces when npm only offers a downgrade', { skip }, () => {
  const run = runAudit(report({ braces: braces(), micromatch: MICROMATCH }));

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /permitido {2}GHSA-vfj7-8cjw-p6xm/);
  assert.match(
    run.stdout,
    /react-native@0\.72\.17 \(instalado: 0\.87\.1\): es bajar de versión/,
  );
  assert.match(run.stdout, /OK: ningún aviso fuera de las excepciones/);
});

test('runs the npm on PATH, not npm_execpath', { skip }, () => {
  const run = runAudit(report({ braces: braces() }));

  assert.equal(run.npmArgs, 'audit --json');
});

test('fails on any other advisory', { skip }, () => {
  const run = runAudit(report({ braces: braces(), lodash: LODASH }));

  assert.equal(run.status, 1);
  assert.match(run.stdout, /BLOQUEA {4}GHSA-p6mc-m468-83gw/);
  assert.match(run.stdout, /permitido {2}GHSA-vfj7-8cjw-p6xm/);
});

test('fails once npm audit fix can fix braces', { skip }, () => {
  const run = runAudit(report({ braces: braces(true) }));

  assert.equal(run.status, 1);
  assert.match(run.stdout, /Ya tiene arreglo \(npm audit fix\)/);
});

test('fails when the forced fix moves forward', { skip }, () => {
  const forward = { name: 'react-native', version: '0.88.0', isSemVerMajor: true };
  const run = runAudit(report({ braces: braces(forward) }));

  assert.equal(run.status, 1);
  assert.match(run.stdout, /instala react-native@0\.88\.0 \(cambio mayor\)/);
});

test('counts the forced fix as one when the installed version is unknown', { skip }, () => {
  const run = runAudit(report({ braces: braces() }), { lockfile: null });

  assert.equal(run.status, 1);
  assert.match(run.stdout, /Ya tiene arreglo/);
});

test('fails when the allowed advisory hits another package', { skip }, () => {
  const run = runAudit(
    report({ braces: braces(), 'not-braces': braces(false, 'not-braces') }),
  );

  assert.equal(run.status, 1);
  assert.match(run.stdout, /solo cubre braces, y el aviso afecta también a not-braces/);
});

test('passes a clean report and says the exception can go', { skip }, () => {
  const run = runAudit(report({}), { status: 0 });

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /GHSA-vfj7-8cjw-p6xm ya no aparece/);
});

test('reports why npm audit failed', { skip }, () => {
  // What npm 11 prints when the registry cannot be reached.
  const run = runAudit({
    message:
      'request to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk failed, reason: getaddrinfo ENOTFOUND registry.npmjs.org',
    error: { summary: '', detail: '' },
  });

  assert.equal(run.status, 2);
  assert.match(run.stderr, /npm audit ha fallado: request to .* ENOTFOUND/);
});

for (const [name, output, message] of [
  ['output that is not JSON', 'npm ERR! something broke', /no ha devuelto JSON/],
  ['null', null, /en vez de un informe/],
  ['an array', [], /en vez de un informe/],
  ['an empty object', {}, /auditReportVersion undefined/],
  [
    'an npm 6 report',
    {
      actions: [],
      advisories: {},
      muted: [],
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
        dependencies: 10,
        totalDependencies: 10,
      },
    },
    /auditReportVersion undefined/,
  ],
  [
    'a report without the vulnerabilities object',
    { ...report({}), vulnerabilities: [] },
    /no trae el objeto vulnerabilities/,
  ],
  [
    'a report whose total does not match its entries',
    report({}, 3),
    /total es 3 y vulnerabilities tiene 0/,
  ],
  [
    'an entry without a via list',
    report({ braces: { ...braces(), via: 'braces' } }),
    /entrada de braces no tiene la forma esperada/,
  ],
  [
    'an entry with an unknown fixAvailable',
    report({ braces: braces('yes') }),
    /entrada de braces no tiene la forma esperada/,
  ],
]) {
  test(`exits with 2 on ${name}`, { skip }, () => {
    const run = runAudit(output);

    assert.equal(run.status, 2, run.stdout);
    assert.match(run.stderr, message);
  });
}
