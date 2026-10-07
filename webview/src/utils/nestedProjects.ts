/**
 * Sessions of projects nested below the open one ("Include nested" in the
 * history list, ported from the Claude Code GUI ("Swttch") plugin). Java lists
 * them with `projectPath`, the folder they ran in; the open project's own
 * sessions have none.
 */

/**
 * How a row names the project it belongs to: its folder relative to the open
 * project (`packages/api`), or the whole path when it is not below it. Null for
 * a session of the open project itself.
 */
export function nestedProjectLabel(projectPath: string | undefined, currentProject: string | undefined): string | null {
  if (!projectPath) return null;
  const norm = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '');
  const child = norm(projectPath);
  const root = currentProject ? norm(currentProject) : '';
  if (root && child === root) return null;
  if (root && child.startsWith(`${root}/`)) return child.slice(root.length + 1);
  return projectPath;
}

/** Whether [query] (already lower-cased) finds the session by its project's label. */
export function matchesNestedProject(label: string | null, query: string): boolean {
  return label !== null && label.toLowerCase().includes(query);
}
