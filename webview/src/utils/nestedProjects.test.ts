import { describe, expect, it } from 'vitest';
import { matchesNestedProject, nestedProjectLabel } from './nestedProjects';

describe('nestedProjectLabel', () => {
  it('names a nested project relative to the open one', () => {
    expect(nestedProjectLabel('/repo/packages/api', '/repo')).toBe('packages/api');
    expect(nestedProjectLabel('/repo/packages/api', '/repo/')).toBe('packages/api');
    expect(nestedProjectLabel('C:\\repo\\packages\\api', 'C:\\repo')).toBe('packages/api');
  });

  it('has no label for the open project\'s own sessions', () => {
    expect(nestedProjectLabel(undefined, '/repo')).toBeNull();
    expect(nestedProjectLabel('/repo', '/repo')).toBeNull();
  });

  it('shows the whole path of a folder that is not below the open project', () => {
    expect(nestedProjectLabel('/repo-old/api', '/repo')).toBe('/repo-old/api');
    expect(nestedProjectLabel('/repo/api', undefined)).toBe('/repo/api');
  });
});

describe('matchesNestedProject', () => {
  it('matches a fragment of the label, ignoring case', () => {
    expect(matchesNestedProject('packages/API', 'api')).toBe(true);
    expect(matchesNestedProject('packages/api', 'web')).toBe(false);
    expect(matchesNestedProject(null, 'api')).toBe(false);
  });
});
