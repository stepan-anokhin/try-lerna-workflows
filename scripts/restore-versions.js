const fs = require('fs');
const path = require('path');
const execSync = require("child_process").execSync;
const semver = require('semver')

/**
 * List packages changed since the last GA-release.
 * @returns [{name,version,location}]
 */
function listChanged() {
  let lernaOutput;
  try {
    lernaOutput = execSync('lerna changed --json --include-merged-tags', {encoding: 'utf-8'});
  } catch (error) {
    console.warn("No changes detected.")
    return [];
  }
  return JSON.parse(lernaOutput);
}

/**
 * List all packages in topological order.
 * @returns [{name,version,location}]
 */
function listPackages() {
  // Note that we are sorting packages in topological order (namely,
  // dependencies before dependents, instead lexical sort by location)
  // by setting the --toposort flag. This is required because then we
  // use this list to repair dependencies versions. Otherwise, repaired
  // package-lock.json files might be incorrect.
  const lernaOutput = execSync('lerna list --json --toposort', {encoding: 'utf-8'});
  return JSON.parse(lernaOutput);
}

/**
 * Get the latest pre-release version for the given package
 * that was published since the last GA-release.
 */
function getPreVersion(pkg, options={}) {
  const {registry="http://localhost:4873"} = options;
  const {distTag="next"} = options;

  const npmOutput = execSync(`npm dist-tag ${pkg.name} --registry ${registry}`, {encoding: 'utf-8'});
  const found = new RegExp(`(?<=${distTag}:\\s).*`).exec(npmOutput);
  if (!found) {
    return;
  }
  const foundVersion = found[0];
  if (semver.lt(pkg.version, foundVersion)) {
    return foundVersion;
  }
}

/**
 * Read `package.json` file of the given package.
 */
function readPackageJSON(pkg) {
  const manifestPath = path.join(pkg.location, "package.json");
  const manifestText = fs.readFileSync(manifestPath, {encoding: 'utf-8'});
  return JSON.parse(manifestText);
}

/**
 * Set a new package version in its `package.json` manifest.
 */
function setVersion(pkg, newVersion) {
  execSync(`npm --no-git-tag-version version ${newVersion}`, {cwd: pkg.location, encoding: 'utf-8'});
}

/**
 * Repair dependencies on packages with restored pre-release versions.
 */
function repairDependencies(parent, updated, registry) {
  const manifest = readPackageJSON(parent);
  let repaired = false;
  for (const child of updated) {
    if (!manifest.dependencies || !manifest.dependencies[child.name]) {
      continue;
    }
    const dependencyVersion = manifest.dependencies[child.name];
    if (semver.satisfies(child.version, dependencyVersion)) {
      // This is possible after `npx lerna bootstrap`.
      // The package-lock.json should also be correct since
      // we are repairing packages in topological order.
      execSync(`npm install --save ${child.name}@^${child.preVersion} --registry ${registry}`, {cwd: parent.location});
      repaired = true;
    } else {
      console.error({parent, child, message: "Dependency version mismatch!"})
    }
  }
  if (repaired) {
    const repairedManifest = readPackageJSON(parent);
    console.log(`Repaired dependencies for ${parent.name}:`);
    console.log(repairedManifest.dependencies);
  }
}

/**
 * List packages that was pre-released with the given distTag since the last
 * GA-release.
 *
 * @returns [{name,version,preVersion,location}]
 */
function listPreReleased(distTag, registry) {
  const preReleased = [];
  for (const pkg of listChanged()) {
    const preVersion = getPreVersion(pkg, {registry, distTag});
    if (preVersion) {
      preReleased.push({...pkg, preVersion});
    }
  }
  return preReleased;
}


/**
 * Restore pre-release versions of all packages in the project
 * that were published since the last GA-release.
 */
function restorePreReleaseVersions(distTag, registry) {
  const restoreList = listPreReleased(distTag, registry);
  console.log("Previously pre-released packages list:")
  console.log(restoreList)

  // Restore pre-release version of published packages
  for (const pkg of restoreList) {
    setVersion(pkg, pkg.preVersion);
  }

  // Repair mutual dependencies
  for (const pkg of listPackages()) {
    repairDependencies(pkg, restoreList, registry);
  }
}

const distTag = process.argv[2];
const registry = process.argv[3];
restorePreReleaseVersions(distTag, registry);
