// Advisories that scripts/audit-ci.mjs tolerates on purpose: GHSA id → the
// only package it may hit and why. The script checks every entry on each run.
//
// Two kinds of exception:
// - Without `patchOutOfReach`: it holds only while the advisory has no patched
//   version anywhere (the GitHub Advisory Database or, failing that, the npm
//   registry). As soon as one exists the build turns red until the lockfile
//   picks it up and the entry goes.
// - With `patchOutOfReach: true`: the advisory does have a patched version, but
//   it lives in a major that no dependent in package-lock.json accepts (every
//   range they declare caps the major below it), so no install can reach it.
//   The script reads those ranges from the lockfile; as soon as one dependent
//   accepts the patched major, the build turns red until the lockfile picks it
//   up and the entry goes.
export const ALLOWED = new Map([
  [
    'GHSA-gcqx-w48m-w2h4',
    {
      package: 'deepmerge',
      reason:
        'deepmerge 4.3.1 no tiene ninguna versión corregida (mergeObject() ' +
        'permite envenenar el prototipo del objeto devuelto). Llega por la ' +
        'CLI de React Native (cli, cli-config y cli-doctor) y por jest-config; ' +
        'se ejecuta al construir y en los tests, y no forma parte del bundle ' +
        'de la app.',
    },
  ],
]);
