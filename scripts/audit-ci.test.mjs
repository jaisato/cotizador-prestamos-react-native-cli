// Tests for audit-ci.mjs: node --test scripts/audit-ci.test.mjs
//
// Each test runs a copy of the script in a scratch project whose PATH starts
// with a fake npm and a fake gh. The fakes print fixed answers (the audit
// report, the versions of a package, the advisory), so the tests cover what
// the script does with each of them without touching the registry or GitHub.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./audit-ci.mjs', import.meta.url));
const skip = process.platform === 'win32' && 'the fakes are shell scripts';

const GHSA = 'GHSA-vfj7-8cjw-p6xm';

const LOCKFILE = {
  lockfileVersion: 3,
  packages: {
    'node_modules/braces': { version: '3.0.3' },
    'node_modules/react-native': { version: '0.87.1' },
  },
};

// What npm 11 offers for braces in some runs: going back to react-native
// 0.72.17. In others it is jest@30; neither decides.
const DOWNGRADE = {
  name: 'react-native',
  version: '0.72.17',
  isSemVerMajor: true,
};

/** The advisory as the GitHub Advisory Database returns it today. */
function advisory(firstPatched = null, name = 'braces') {
  return {
    ghsa_id: GHSA,
    withdrawn_at: null,
    vulnerabilities: [
      {
        package: { ecosystem: 'npm', name },
        vulnerable_version_range: '<= 3.0.3',
        first_patched_version: firstPatched,
        vulnerable_functions: [],
      },
    ],
  };
}

/** What `npm view braces versions --json` prints today. */
const VERSIONS = ['1.8.5', '2.3.2', '3.0.0', '3.0.1', '3.0.2', '3.0.3'];

/** The braces entry of a real report, with its fixAvailable replaceable. */
function braces(fixAvailable = DOWNGRADE, name = 'braces', range = '<=3.0.3') {
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
        url: `https://github.com/advisories/${GHSA}`,
        severity: 'high',
        cwe: ['CWE-674'],
        cvss: {
          score: 7.5,
          vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H',
        },
        range,
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

function text(output) {
  return typeof output === 'string' ? output : JSON.stringify(output);
}

/**
 * Runs the script against a fake npm and a fake gh.
 * - `output` and `status`: what `npm audit --json` prints, and its exit code.
 * - `versions`: what `npm view <package> versions --json` prints, or null to
 *   make it fail.
 * - `gh`: what `gh api /advisories/<id>` prints, or null to make it fail as it
 *   does without a token.
 * - `npm: false`: a PATH with no npm at all.
 */
function runAudit(
  output,
  {
    status = 1,
    lockfile = LOCKFILE,
    npm: withNpm = true,
    versions = VERSIONS,
    gh = advisory(),
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-ci-'));

  try {
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'bin'));
    copyFileSync(script, join(dir, 'scripts', 'audit-ci.mjs'));
    if (lockfile) {
      writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lockfile));
    }

    const file = name => join(dir, name);
    writeFileSync(file('audit.txt'), text(output));
    writeFileSync(
      file('versions.txt'),
      versions === null ? '' : text(versions),
    );
    writeFileSync(file('gh.txt'), gh === null ? '' : text(gh));

    if (withNpm) {
      writeFileSync(
        file('bin/npm'),
        [
          '#!/bin/sh',
          `echo "$*" >> '${file('npm-args.txt')}'`,
          `pwd > '${file('npm-cwd.txt')}'`,
          'if [ "$1" = view ]; then',
          versions === null
            ? "  echo 'npm error code E404' >&2; exit 1"
            : `  cat '${file('versions.txt')}'; exit 0`,
          'fi',
          `cat '${file('audit.txt')}'`,
          `exit ${status}`,
          '',
        ].join('\n'),
      );
      chmodSync(file('bin/npm'), 0o755);
    }
    writeFileSync(
      file('bin/gh'),
      [
        '#!/bin/sh',
        `echo "$*" >> '${file('gh-args.txt')}'`,
        gh === null
          ? "echo 'gh: To get started with GitHub CLI, please run: gh auth login' >&2; exit 4"
          : `cat '${file('gh.txt')}'`,
        '',
      ].join('\n'),
    );
    chmodSync(file('bin/gh'), 0o755);

    const run = spawnSync(
      process.execPath,
      [join(dir, 'scripts', 'audit-ci.mjs')],
      {
        // Somewhere else: npm has to run in the project the script is in.
        cwd: tmpdir(),
        encoding: 'utf8',
        env: {
          ...process.env,
          // Without the fake npm, a PATH where there is no npm at all (the
          // fake gh stays, so that no real gh answers).
          PATH: withNpm
            ? join(dir, 'bin') + delimiter + process.env.PATH
            : join(dir, 'bin'),
          // As under `yarn run`: the script must not follow it.
          npm_execpath: join(dir, 'yarn.js'),
        },
      },
    );

    const lines = name =>
      existsSync(file(name))
        ? readFileSync(file(name), 'utf8').trim().split('\n')
        : [];

    return {
      status: run.status,
      stdout: run.stdout,
      stderr: run.stderr,
      npmArgs: lines('npm-args.txt'),
      ghArgs: lines('gh-args.txt'),
      npmRanInProject: existsSync(file('npm-cwd.txt'))
        ? realpathSync(readFileSync(file('npm-cwd.txt'), 'utf8').trim()) ===
          realpathSync(dir)
        : null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The exception and whether the advisory has a patched version.

test(
  'allows braces while the advisory has no patched version',
  { skip },
  () => {
    const run = runAudit(report({ braces: braces(), micromatch: MICROMATCH }));

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /permitido {2}GHSA-vfj7-8cjw-p6xm/);
    assert.match(
      run.stdout,
      /Sin versión corregida, según la base de datos de avisos de GitHub\./,
    );
    assert.match(run.stdout, /OK: ningún aviso fuera de las excepciones/);
    assert.deepEqual(run.ghArgs, [`api /advisories/${GHSA}`]);
  },
);

test('blocks braces once the advisory has a patched version', { skip }, () => {
  const run = runAudit(report({ braces: braces() }), {
    gh: advisory('3.0.4'),
  });

  assert.equal(run.status, 1);
  assert.match(
    run.stdout,
    /BLOQUEA {4}GHSA-vfj7-8cjw-p6xm .*\n {13}Ya tiene versión corregida: braces 3\.0\.4, según la base de datos de avisos de GitHub\. Actualiza y quita la excepción\.\n/,
  );
  assert.equal(run.stderr, '\n1 aviso(s) sin excepción: falla la auditoría.\n');
});

test('without gh, reads the versions of braces from npm', { skip }, () => {
  const run = runAudit(report({ braces: braces() }), { gh: null });

  assert.equal(run.status, 0, run.stderr);
  assert.match(
    run.stdout,
    /Sin versión corregida, según npm view braces versions\./,
  );
  assert.deepEqual(run.npmArgs, [
    'audit --json',
    'view braces versions --json',
  ]);
});

test(
  'without gh, a release outside the vulnerable range blocks',
  { skip },
  () => {
    const run = runAudit(report({ braces: braces() }), {
      gh: null,
      versions: [...VERSIONS, '3.0.4', '3.1.0'],
    });

    assert.equal(run.status, 1);
    assert.match(
      run.stdout,
      /Ya tiene versión corregida: braces 3\.0\.4, según npm view braces versions\./,
    );
  },
);

test(
  'without gh, a pre-release outside the range does not count',
  { skip },
  () => {
    const run = runAudit(report({ braces: braces() }), {
      gh: null,
      versions: [...VERSIONS, '3.1.0-beta.1'],
    });

    assert.equal(run.status, 0, run.stdout);
  },
);

test(
  'without gh, reads the single version npm prints as a string',
  { skip },
  () => {
    const blocked = runAudit(report({ braces: braces() }), {
      gh: null,
      versions: '"3.0.4"',
    });
    const allowed = runAudit(report({ braces: braces() }), {
      gh: null,
      versions: '"3.0.3"',
    });

    assert.equal(blocked.status, 1);
    assert.match(
      blocked.stdout,
      /Ya tiene versión corregida: braces 3\.0\.4, según npm view braces versions\./,
    );
    assert.equal(allowed.status, 0, allowed.stdout);
  },
);

test(
  'without gh, older releases before a bounded range are no fix',
  { skip },
  () => {
    // Vulnerable from 2.0.0 to 2.2.2, and only 1.x outside the range: nothing
    // to upgrade to.
    const run = runAudit(
      report({ braces: braces(false, 'braces', '>=2.0.0 <2.2.3') }),
      { gh: null, versions: ['1.8.5', '2.0.0', '2.2.2'] },
    );

    assert.equal(run.status, 0, run.stdout);
  },
);

test(
  'without gh, a release between the alternatives of a range is a fix',
  { skip },
  () => {
    const run = runAudit(
      report({ braces: braces(false, 'braces', '<1.0.0 || >=2.0.0 <2.1.1') }),
      { gh: null, versions: ['0.9.0', '1.5.0', '2.0.0'] },
    );

    assert.equal(run.status, 1);
    assert.match(run.stdout, /Ya tiene versión corregida: braces 1\.5\.0/);
  },
);

for (const [name, range, versions, expected] of [
  ['a "<" bound', '<3.0.4', ['3.0.3', '3.0.4'], 1],
  ['a "<" bound, nothing above', '<3.0.4', ['3.0.3'], 0],
  [
    'an alternative with "||"',
    '<1.0.0 || >=2.0.0 <3.0.4',
    ['3.0.3', '3.0.4'],
    1,
  ],
  ['an exact version', '3.0.3', ['3.0.3', '3.0.4'], 1],
  ['an "=" version', '=3.0.3', ['3.0.3'], 0],
  ['a ">" bound', '>2.0.0', ['3.0.3'], 0],
  ['a ">" bound that leaves its own version out', '>3.0.3', ['3.0.3'], 1],
]) {
  test(`without gh, reads a range with ${name}`, { skip }, () => {
    const run = runAudit(report({ braces: braces(false, 'braces', range) }), {
      gh: null,
      versions,
      lockfile: {
        lockfileVersion: 3,
        packages: { 'node_modules/braces': { version: '3.0.3' } },
      },
    });

    assert.equal(run.status, expected, run.stdout + run.stderr);
  });
}

test('only a patched version of the npm package counts', { skip }, () => {
  const gh = advisory();
  gh.vulnerabilities.unshift({
    package: { ecosystem: 'rubygems', name: 'braces' },
    vulnerable_version_range: '<= 3.0.3',
    first_patched_version: '3.0.4',
  });

  const run = runAudit(report({ braces: braces() }), { gh });

  assert.equal(run.status, 0, run.stdout);
});

test('one entry of braces with a patched version is enough', { skip }, () => {
  const gh = advisory();
  gh.vulnerabilities.push(
    { ...gh.vulnerabilities[0], first_patched_version: '3.0.4' },
    { ...gh.vulnerabilities[0], first_patched_version: '4.0.1' },
  );

  const run = runAudit(report({ braces: braces() }), { gh });

  assert.equal(run.status, 1);
  assert.match(
    run.stdout,
    /Ya tiene versión corregida: braces 3\.0\.4, 4\.0\.1, según la base de datos de avisos de GitHub\./,
  );
});

// An answer from GitHub in another form is no answer: read loosely, each of
// these looked like "no patched version" and granted the exception.
for (const [name, gh, message] of [
  [
    'a first_patched_version that is an object',
    advisory({ identifier: '3.0.4' }),
    /trae para braces un first_patched_version \{"identifier":"3\.0\.4"\}, y solo se entiende null o una versión/,
  ],
  [
    'a first_patched_version that is a number',
    advisory(304),
    /trae para braces un first_patched_version 304, y solo se entiende null o una versión/,
  ],
  [
    'an empty first_patched_version',
    advisory(''),
    /trae para braces un first_patched_version "", y solo/,
  ],
  [
    'no first_patched_version',
    (() => {
      const gh = advisory();
      delete gh.vulnerabilities[0].first_patched_version;
      return gh;
    })(),
    /trae para braces un first_patched_version ausente, y solo/,
  ],
  [
    'one entry of braces without first_patched_version, besides a good one',
    (() => {
      const gh = advisory();
      gh.vulnerabilities.push({
        package: { ecosystem: 'npm', name: 'braces' },
      });
      return gh;
    })(),
    /first_patched_version ausente/,
  ],
  [
    'another advisory',
    { ...advisory(), ghsa_id: 'GHSA-p6mc-m468-83gw' },
    /gh api \/advisories\/GHSA-vfj7-8cjw-p6xm ha devuelto otro aviso \(ghsa_id "GHSA-p6mc-m468-83gw"\)/,
  ],
  [
    'an advisory without its id',
    (() => {
      const gh = advisory();
      delete gh.ghsa_id;
      return gh;
    })(),
    /ha devuelto otro aviso \(ghsa_id undefined\)/,
  ],
  ['null', 'null', /no ha devuelto un aviso: null$/m],
  ['a list', [advisory()], /no ha devuelto un aviso: \[\{"ghsa_id"/],
]) {
  test(`exits with 2 when GitHub answers ${name}`, { skip }, () => {
    const run = runAudit(report({ braces: braces() }), { gh });

    assert.equal(run.status, 2, run.stdout);
    assert.match(run.stderr, message);
    assert.doesNotMatch(run.stdout, /permitido|OK:/);
    // GitHub did answer: the npm registry is not asked instead.
    assert.deepEqual(run.npmArgs, ['audit --json']);
  });
}

test('exits with 2 when neither gh nor npm can tell', { skip }, () => {
  const run = runAudit(report({ braces: braces() }), {
    gh: null,
    versions: null,
  });

  assert.equal(run.status, 2);
  assert.match(
    run.stderr,
    /^No se ha podido saber si GHSA-vfj7-8cjw-p6xm tiene versión corregida: gh api ha fallado \(gh: To get started .*\) y npm view braces versions también \(npm error code E404\)\./,
  );
});

for (const [name, gh, versions, message] of [
  [
    'gh answers something that is not JSON',
    'Not Found',
    VERSIONS,
    /gh api \/advisories\/GHSA-vfj7-8cjw-p6xm no ha devuelto JSON/,
  ],
  [
    'the advisory does not name braces',
    advisory(null, 'other'),
    VERSIONS,
    /no menciona el paquete npm braces/,
  ],
  [
    'the advisory has no vulnerabilities',
    { ghsa_id: GHSA },
    VERSIONS,
    /no menciona el paquete npm braces/,
  ],
  [
    'the advisory only names braces in another ecosystem',
    {
      ghsa_id: GHSA,
      vulnerabilities: [
        {
          package: { ecosystem: 'rubygems', name: 'braces' },
          first_patched_version: null,
        },
      ],
    },
    VERSIONS,
    /no menciona el paquete npm braces/,
  ],
  [
    'npm view answers something that is not JSON',
    null,
    'nope',
    /npm view braces versions no ha devuelto JSON/,
  ],
  [
    'npm view answers an empty list',
    null,
    [],
    /no ha devuelto una lista de versiones/,
  ],
  [
    'npm view answers a list with a number',
    null,
    ['3.0.3', 4],
    /no ha devuelto una lista de versiones/,
  ],
  [
    'npm view answers an object',
    null,
    { latest: '3.0.3' },
    /no ha devuelto una lista de versiones/,
  ],
]) {
  test(`exits with 2 when ${name}`, { skip }, () => {
    const run = runAudit(report({ braces: braces() }), { gh, versions });

    assert.equal(run.status, 2, run.stdout);
    assert.match(run.stderr, message);
  });
}

test('exits with 2 on a vulnerable range it cannot read', { skip }, () => {
  const run = runAudit(report({ braces: braces(false, 'braces', '*') }), {
    gh: null,
  });

  assert.equal(run.status, 2);
  assert.match(
    run.stderr,
    /No se entiende el rango vulnerable "\*" de GHSA-vfj7-8cjw-p6xm/,
  );
});

test('asks nothing when braces is not in the report', { skip }, () => {
  const run = runAudit(report({}), { status: 0, gh: null, versions: null });

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /GHSA-vfj7-8cjw-p6xm ya no aparece/);
  assert.deepEqual(run.ghArgs, []);
  assert.deepEqual(run.npmArgs, ['audit --json']);
});

// fixAvailable is printed, and decides nothing.

for (const [name, fix, printed] of [
  [
    'a downgrade',
    DOWNGRADE,
    /npm propone react-native@0\.72\.17 \(instalado: 0\.87\.1\), que es bajar de versión\. No cuenta: lo que decide es si braces tiene versión corregida\./,
  ],
  [
    'a forward major',
    { name: 'jest', version: '30.5.2', isSemVerMajor: true },
    /npm propone npm audit fix --force, que instala jest@30\.5\.2 \(cambio mayor\)\. No cuenta/,
  ],
  [
    'a forward minor',
    { name: 'react-native', version: '0.87.2', isSemVerMajor: false },
    /npm propone npm audit fix --force, que instala react-native@0\.87\.2\. No cuenta/,
  ],
  ['npm audit fix', true, /npm propone npm audit fix\. No cuenta/],
]) {
  test(
    `fixAvailable with ${name} is printed and allows braces without a patch`,
    { skip },
    () => {
      const run = runAudit(report({ braces: braces(fix) }));

      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.match(run.stdout, printed);
    },
  );

  test(
    `fixAvailable with ${name} does not save braces with a patch`,
    { skip },
    () => {
      const run = runAudit(report({ braces: braces(fix) }), {
        gh: advisory('3.0.4'),
      });

      assert.equal(run.status, 1);
    },
  );
}

test('without any fix, it says nothing about npm', { skip }, () => {
  const run = runAudit(report({ braces: braces(false) }));

  assert.equal(run.status, 0, run.stderr);
  assert.doesNotMatch(run.stdout, /npm propone/);
});

// Describing a fixAvailable: react-native@<proposed> with <installed> in the
// lockfile is a downgrade or an upgrade.
for (const [name, installed, proposed, downgrade] of [
  ['the installed version itself', '0.87.1', '0.87.1', false],
  ['a pre-release of the installed version', '0.87.1', '0.87.1-rc.1', true],
  ['the release of the installed pre-release', '0.87.1-rc.2', '0.87.1', false],
  ['an earlier pre-release', '0.87.1-rc.2', '0.87.1-rc.1', true],
  ['a later pre-release', '0.87.1-rc.1', '0.87.1-rc.2', false],
  [
    'a pre-release that sorts first by its dashes',
    '1.0.0-ab',
    '1.0.0-a-b',
    true,
  ],
  ['a lower minor that is longer as text', '0.87.1', '0.9.0', true],
  ['a major of two digits', '2.0.0', '10.0.0', false],
  [
    'a major of two digits with build metadata',
    '2.0.0',
    '10.0.0+build.5',
    false,
  ],
  ['an earlier version with build metadata', '0.87.1', '0.72.17+build.5', true],
]) {
  test(
    `fixAvailable with ${name} reads as ${
      downgrade ? 'a downgrade' : 'an upgrade'
    }`,
    { skip },
    () => {
      const fix = {
        name: 'react-native',
        version: proposed,
        isSemVerMajor: true,
      };
      const lockfile = {
        lockfileVersion: 3,
        packages: {
          'node_modules/react-native': { version: installed },
          'node_modules/braces': { version: '3.0.3' },
        },
      };

      const run = runAudit(report({ braces: braces(fix) }), { lockfile });

      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.match(
        run.stdout,
        downgrade
          ? new RegExp(
              `react-native@${proposed.replace(
                /[.+]/g,
                '\\$&',
              )} \\(instalado: ${installed.replace(
                /[.+]/g,
                '\\$&',
              )}\\), que es bajar de versión`,
            )
          : new RegExp(
              `instala react-native@${proposed.replace(
                /[.+]/g,
                '\\$&',
              )} \\(cambio mayor\\)`,
            ),
      );
    },
  );
}

for (const [name, lockfile] of [
  ['without a lockfile', null],
  ['without packages', { lockfileVersion: 3 }],
  ['without the proposed package', { lockfileVersion: 3, packages: {} }],
  [
    'without its version',
    { lockfileVersion: 3, packages: { 'node_modules/react-native': {} } },
  ],
]) {
  test(`describes the fix as an upgrade ${name}`, { skip }, () => {
    const run = runAudit(report({ braces: braces() }), { lockfile });

    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(
      run.stdout,
      /npm propone npm audit fix --force, que instala react-native@0\.72\.17 \(cambio mayor\)\. No cuenta/,
    );
  });
}

// Everything else.

test('runs the npm on PATH, not npm_execpath', { skip }, () => {
  const run = runAudit(report({ braces: braces() }));

  assert.equal(run.npmArgs[0], 'audit --json');
});

test(
  'runs npm in the project, wherever the script is started',
  { skip },
  () => {
    const run = runAudit(report({ braces: braces() }));

    assert.equal(run.npmRanInProject, true);
  },
);

test('fails on any other advisory', { skip }, () => {
  const run = runAudit(report({ braces: braces(), lodash: LODASH }));

  assert.equal(run.status, 1);
  assert.match(run.stdout, /BLOQUEA {4}GHSA-p6mc-m468-83gw/);
  assert.match(run.stdout, /permitido {2}GHSA-vfj7-8cjw-p6xm/);
});

test('fails when the allowed advisory hits another package', { skip }, () => {
  const run = runAudit(
    report({ braces: braces(), 'not-braces': braces(false, 'not-braces') }),
  );

  assert.equal(run.status, 1);
  assert.match(
    run.stdout,
    /solo cubre braces, y el aviso afecta también a not-braces/,
  );
});

test('names every other package the allowed advisory hits', { skip }, () => {
  const run = runAudit(
    report({ braces: braces(), a: braces(false, 'a'), b: braces(false, 'b') }),
  );

  assert.equal(run.status, 1);
  assert.match(run.stdout, /braces@<=3\.0\.3, a@<=3\.0\.3, b@<=3\.0\.3: /);
  assert.match(
    run.stdout,
    /solo cubre braces, y el aviso afecta también a a, b\./,
  );
});

test('passes a clean report and says the exception can go', { skip }, () => {
  const run = runAudit(report({}), { status: 0 });

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /GHSA-vfj7-8cjw-p6xm ya no aparece/);
});

test('prints what it allows and why', { skip }, () => {
  const run = runAudit(report({ braces: braces(), micromatch: MICROMATCH }));

  assert.equal(
    run.stdout,
    'npm audit: 1 aviso(s) distinto(s), 2 paquete(s) afectado(s) contando dependientes.\n' +
      '  permitido  GHSA-vfj7-8cjw-p6xm (high) braces@<=3.0.3: braces vulnerable to stack-exhaustion denial of service through deeply nested patterns\n' +
      '             braces <= 3.0.3 no tiene ninguna versión corregida. Llega por micromatch, que usan Metro (el empaquetador), la CLI de React Native y Jest; se ejecuta al construir y en los tests, y no forma parte del bundle de la app.\n' +
      '             Sin versión corregida, según la base de datos de avisos de GitHub.\n' +
      '             npm propone react-native@0.72.17 (instalado: 0.87.1), que es bajar de versión. No cuenta: lo que decide es si braces tiene versión corregida.\n' +
      '\n' +
      'OK: ningún aviso fuera de las excepciones.\n',
  );
  assert.equal(run.stderr, '');
});

test('prints what blocks, with the link to the advisory', { skip }, () => {
  const run = runAudit(report({ braces: braces(), lodash: LODASH }));

  assert.equal(run.status, 1);
  assert.match(
    run.stdout,
    /\n {2}BLOQUEA {4}GHSA-p6mc-m468-83gw \(moderate\) lodash@<4\.17\.21: Prototype Pollution in lodash\n {13}https:\/\/github\.com\/advisories\/GHSA-p6mc-m468-83gw\n/,
  );
  assert.equal(run.stderr, '\n1 aviso(s) sin excepción: falla la auditoría.\n');
});

test(
  'blocks an advisory without an exception even when it has no fix',
  { skip },
  () => {
    const run = runAudit(
      report({ lodash: { ...LODASH, fixAvailable: false } }),
    );

    assert.equal(run.status, 1);
    assert.match(
      run.stdout,
      /BLOQUEA {4}GHSA-p6mc-m468-83gw .*\n {13}https:\/\/github\.com\/advisories\/GHSA-p6mc-m468-83gw\n/,
    );
  },
);

for (const [name, via] of [
  ['without a link', { ...LODASH.via[0], url: undefined }],
  [
    'whose link is not a GHSA',
    { ...LODASH.via[0], url: 'https://example.com/1' },
  ],
]) {
  test(`names an advisory ${name} by its npm id`, { skip }, () => {
    const run = runAudit(report({ lodash: { ...LODASH, via: [via] } }));

    assert.equal(run.status, 1);
    assert.match(
      run.stdout,
      /BLOQUEA {4}npm-1 \(moderate\) lodash@<4\.17\.21: /,
    );
  });
}

test('reads a report larger than the default buffer of 1 MiB', { skip }, () => {
  const big =
    JSON.stringify(report({ braces: braces() })) + ' '.repeat(2 * 1024 * 1024);

  const run = runAudit(big);

  assert.equal(run.status, 0, run.stderr);
});

test('exits with 2 when npm cannot be started', { skip }, () => {
  const run = runAudit(report({}), { npm: false });

  assert.equal(run.status, 2);
  assert.match(run.stderr, /^No se ha podido ejecutar npm audit: .*ENOENT/);
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

test('says which report format it reads', { skip }, () => {
  const run = runAudit({ auditReportVersion: 1, vulnerabilities: {} });

  assert.equal(run.status, 2);
  assert.equal(
    run.stderr,
    'Formato de informe desconocido (auditReportVersion 1): este script lee el 2, el de npm 7 y posteriores.\n',
  );
});

for (const [name, output, message] of [
  [
    'output that is not JSON',
    'npm ERR! something broke',
    /no ha devuelto JSON/,
  ],
  ['null', null, /en vez de un informe/],
  ['an array', [], /en vez de un informe/],
  ['a number', 42, /npm audit ha devuelto 42 en vez de un informe/],
  ['a string', '"texto"', /npm audit ha devuelto "texto" en vez de un informe/],
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
    'a report without metadata',
    { auditReportVersion: 2, vulnerabilities: {} },
    /total es undefined y vulnerabilities tiene 0/,
  ],
  [
    'a report whose metadata has no vulnerabilities',
    { auditReportVersion: 2, vulnerabilities: {}, metadata: {} },
    /total es undefined y vulnerabilities tiene 0/,
  ],
  [
    'a null entry',
    report({ braces: null }),
    /entrada de braces no tiene la forma esperada/,
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
  [
    'a fixAvailable without a version',
    report({ braces: braces({ name: 'react-native' }) }),
    /entrada de braces no tiene la forma esperada/,
  ],
  [
    'a fixAvailable without a name',
    report({ braces: braces({ version: '0.72.17' }) }),
    /entrada de braces no tiene la forma esperada/,
  ],
  [
    'a fixAvailable whose name is not a string',
    report({ braces: braces({ name: 1, version: '0.72.17' }) }),
    /entrada de braces no tiene la forma esperada/,
  ],
  [
    'a via that is a number',
    report({ braces: { ...braces(), via: [5] } }),
    /entrada de braces no tiene la forma esperada/,
  ],
  [
    'a via without a name',
    report({ braces: { ...braces(), via: [{ title: 'x' }] } }),
    /entrada de braces no tiene la forma esperada/,
  ],
  [
    'a via that mixes a name and a number',
    report({ braces: { ...braces(), via: ['micromatch', 5] } }),
    /entrada de braces no tiene la forma esperada/,
  ],
]) {
  test(`exits with 2 on ${name}`, { skip }, () => {
    const run = runAudit(output);

    assert.equal(run.status, 2, run.stdout);
    assert.match(run.stderr, message);
  });
}
