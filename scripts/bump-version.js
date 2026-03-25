const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Bumps the version of all workspace packages and their internal dependencies.
 * Replicates the behavior of:
 *   lerna version --force-publish --exact --no-git-tag-version --no-push --yes <newVersion>
 *
 * - Updates `version` in every workspace package.json to newVersion
 * - Updates all internal workspace dependency references to the new exact version
 * - No git tags, commits, or pushes are made
 */
function bumpVersions(rootDir, newVersion) {
  const rootPkgPath = path.join(rootDir, 'package.json');
  const rootPkg = readJson(rootPkgPath);
  const workspaceGlobs = rootPkg.workspaces;

  if (!workspaceGlobs || !Array.isArray(workspaceGlobs)) {
    throw new Error('Could not find workspaces array in root package.json');
  }

  // Resolve workspace globs to actual directories
  const workspaceDirs = [];
  for (const glob of workspaceGlobs) {
    // Handle simple globs like "packages/*" and "packages/plugins/*"
    const baseDir = glob.replace(/\/\*$/, '');
    const fullBase = path.join(rootDir, baseDir);
    if (!fs.existsSync(fullBase)) continue;
    const entries = fs.readdirSync(fullBase, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgJsonPath = path.join(fullBase, entry.name, 'package.json');
        if (fs.existsSync(pkgJsonPath)) {
          workspaceDirs.push(path.join(baseDir, entry.name));
        }
      }
    }
  }

  // Read all workspace package.json files upfront to fail early
  const workspacePackages = [];
  const workspaceNames = new Set();
  for (const dir of workspaceDirs) {
    const pkgPath = path.join(rootDir, dir, 'package.json');
    const pkg = readJson(pkgPath);
    workspaceNames.add(pkg.name);
    workspacePackages.push({ pkgPath, pkg });
  }

  // Apply version bumps
  for (const { pkgPath, pkg } of workspacePackages) {
    pkg.version = newVersion;

    for (const depType of ['dependencies', 'devDependencies', 'peerDependencies']) {
      if (!pkg[depType]) continue;

      for (const [dep, ver] of Object.entries(pkg[depType])) {
        if (workspaceNames.has(dep) && !ver.startsWith('workspace:')) {
          pkg[depType][dep] = newVersion;
        }
      }
    }

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  return workspacePackages.length;
}

// CLI entry point
if (require.main === module) {
  const newVersion = process.argv[2];

  if (!newVersion) {
    console.error('Usage: node scripts/bump-version.js <new-version>');
    process.exit(1);
  }

  const rootDir = path.join(__dirname, '..');
  const updatedCount = bumpVersions(rootDir, newVersion);
  console.log(`Updated ${updatedCount} packages to version ${newVersion}`);
}

module.exports = { bumpVersions };
