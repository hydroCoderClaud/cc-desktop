# Agent Project Tree and Canonical Workspace Path Plan

## Objective

Make the Agent left sidebar project-tree driven: visible workspace projects are
the root nodes and Agent conversations appear beneath their linked project.
Make `projects.path` the canonical workspace path for every project-bound
conversation.

## Data Invariants

- `projects.path` and `projects.path_key` define a project directory identity.
- `agent_conversations.project_id` defines conversation ownership.
- For a valid project binding, the effective runtime directory is
  `projects.path`.
- `agent_conversations.cwd` remains a compatibility mirror and fallback for
  legacy or unbound conversations. It is not used to create normal sidebar
  project nodes.
- A cwd-only legacy/manual conversation is rebound only when its path already
  matches a retained project. Otherwise it remains unbound in the fallback
  bucket; only explicit internal automatic sessions may create hidden project
  identities during migration.
- The runtime, file manager, image persistence, and relative-path validation
  must resolve the same effective directory.

## Scope

1. Introduce one project-aware working-directory resolver in the main process.
   It prefers a valid linked project path and falls back to the persisted cwd.
2. Change manual conversation creation to accept `projectId`; resolve its path
   before constructing an Agent session and pass the ID to persistence.
3. Restore project-bound conversations with the linked project path rather
   than a potentially stale cwd snapshot.
4. Preserve automatic output directories as hidden/internal project identities
   and keep the existing dedicated IM bucket.
5. Build normal sidebar roots from visible workspace projects, including empty
   projects, then attach conversations by `projectId` only.
6. Place unbound, invalid, hidden, or legacy rows in an explicit fallback
   bucket instead of synthesizing cwd-based project rows.
7. Migrate sidebar local preferences from legacy `cwd:` keys where possible;
   retain existing `project:` keys.

## Implementation Order

1. Add focused tests for canonical path resolution, project-ID creation, and
   restore behavior before changing runtime consumers.
2. Update the session manager, database bridge, file manager, and recreate
   flows to use the single resolver.
3. Correct startup reconciliation to trust a valid `project_id` before using
   cwd to repair old rows.
4. Rework the renderer sidebar read model and creation actions around project
   IDs. Reuse `project:getAll(false)` for the first implementation.
5. Add behavior tests for empty projects, legacy rows, IM conversations,
   automatic sessions, filtering, ordering, pinning, and expansion.
6. Run focused tests, the relevant renderer/main suites, the full test suite,
   and a local application smoke test.

## Product Decisions

- Normal roots are visible `workspace` projects only.
- IM-origin automatic conversations remain in the existing `IM Conversations`
  bucket.
- Other automatic or legacy conversations that cannot be attached to a visible
  workspace remain accessible through one collapsed fallback bucket; do not
  split it further by transport or raw path.
- A missing manual workspace path fails launch clearly. Only owned automatic
  output directories may be created automatically.
- A directory already owned by a non-workspace project keeps that identity.
  The Agent folder picker reports the conflict instead of promoting it to a
  visible workspace project.
- This change uses the existing `projects.name` as the displayed root label;
  it does not add project rename UI.

## Acceptance Criteria

- An empty visible project is shown in the Agent sidebar.
- A project-bound conversation is displayed only under its project ID.
- A supplied cwd cannot override the path of a supplied valid project ID.
- A reopened bound session, runner query, file manager, and image persistence
  all use the same project path.
- Legacy unbound rows remain reachable and automatic IM conversations retain
  their existing bucket.
- No normal sidebar root is created solely from a conversation cwd.
