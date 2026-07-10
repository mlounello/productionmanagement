# MVP Roadmap

## Phase 1 Foundation

- App shell, auth, and protected project workspace.
- Supabase schema: projects, people, memberships, roles, assignments, calendar items, run of show, audition primitives, emails, accomplishments, external links, audit log.
- Read-only-safe integration design.

## Phase 2 People, Roles, And Project Team Core

This is now the main MVP spine. Production Management should first help Siena create a project, define the roles needed for that project, assign people into those roles, and keep a durable file for each person.

- Project roles grouped by Creative Team, Production Team, Cast, Directorial Team, Administrative, Front of House, Music / Band, and future role groups.
- Role assignments linking a person to a project role.
- Role assignment status tracking: draft, offered, accepted, declined, withdrawn.
- Confirmation status tracking: not sent, sent, accepted, declined, bounced.
- Guest artist flag on the project role assignment, because guest artist status is project/role-specific rather than a permanent global person trait.
- Person files with profile fields, project history, role history, internal notes, client-visible notes, accomplishments, headshots, and external integration links.
- Vendor / 90# should be searchable and unique when present, but should not replace the internal UUID person id.
- Long-term person profiles should function as a resume/log of Siena productions and events, including notes from directors, stage managers, casting, producers, and other authorized collaborators.
- Future person self-service access should allow controlled profile edits without exposing internal notes or protected production data.
- Local-first data integrity before cross-app writes.

Source-of-truth rule: Production Management owns project role assignment intent. Playbill owns public program/bio output. Theatre Budget owns guest artist financial and contract tracking. Sync should use explicit integration links/statuses so writes are traceable, reversible, and not duplicated.

## Phase 3 Playbill And Theatre Budget Sync Preparation

Role Operations and Integration combines the production-facing work into one workspace: bulk role loading and project-role reuse, vacant/filled Playbill role synchronization, reconciliation and retry status, primary/shared/understudy/alternate assignments, safe person replacement, existing Theatre Budget guest-artist matching, and deliberately confirmed creation of new Budget identity/contact shells.

Existing Theatre Budget guest artists can be selected directly while creating a role assignment. Production Management reuses or creates the durable local person file, records person-level and assignment-level Budget links, and then follows the normal Playbill assignment sync without requiring a separate Add Person step.

Both existing-person assignments and Theatre Budget guest-artist assignments support repeatable batch rows with a single submit. Assignment actions return to the assignment workspace anchor so repetitive entry does not reset the user to the top of the project.

New-assignment pickers hide roles that already have an active assignment. People and Budget guest artists remain selectable for multiple roles and display an asterisk when already assigned in the project. Role, person, replacement, and guest-artist choices are alphabetized.

- Compare Production Management role/person data to `app_playbill.programs`, `app_playbill.shows`, `app_playbill.people`, `app_playbill.show_roles`, and submission request tables.
- Start with read-only manual linking from a Production Management project to an existing Playbill show/program.
- For draft, unpublished Playbill shows, allow a manual per-assignment sync behind `ENABLE_PLAYBILL_WRITES=true` that creates/updates Playbill people, show roles, and draft bio requests while recording every touched external row in `external_links`.
- Push project roles to linked draft Playbill shows before casting them. Vacant Playbill roles keep stable ids for song planning; assigning a person fills the existing role and only then creates the bio request.
- Compare guest artist role assignments to `app_theatre_budget.guest_artists` and contract guest artist links.
- Store sync intent and external ids in `external_links`.
- Add sync statuses on local rows where needed, especially role assignments.
- Treat existing Theatre Budget guest artists as protected live records.
- Start Theatre Budget integration with read-only lookup and explicit manual linking to existing guest artists.
- Do not automatically update, overwrite, delete, or deactivate existing Theatre Budget guest artist rows.
- Only create new Theatre Budget guest artists after a deliberate confirmation flow.
- Feature-gate actual writes:
  - `ENABLE_PLAYBILL_WRITES`
  - `ENABLE_BUDGET_WRITES`
- Start with manually triggered sync actions before background automation.
- Never blindly create Playbill or Theatre Budget records without matching/deduplication checks.
- Add field ownership rules before any write sync: Production Management-owned fields are editable here, external-owned fields display read-only, and sync-sensitive fields require an explicit review-and-confirm flow before pushing updates.

## Phase 4 Audition Workflow

- Audition sessions and slots.
- Capacity per slot.
- Audition form fields and submissions.
- Durable people profile creation/linking from audition paperwork.
- Printable audition lists with submitted answers.
- Casting/assignment workflow from audition submissions into project roles.

## Phase 5 Communication And Recognition

- Email templates for cast announcements, crew announcements, role confirmations, audition reminders, and ACTF/recognition announcements.
- Generated email drafts before sending.
- Manual trigger first; Resend-backed sending after review.
- Email audit trail in `email_messages`.
- Recognition and accomplishment logging on the durable person file.
- Recognition notification emails linked back to accomplishments.

## Phase 6 Supporting Planning Module

Calendar, Gantt, and Run of Show are still useful, but they are no longer the primary MVP path while Siena evaluates other planning software. Preserve the existing work and avoid overbuilding planning features until the integration role is clearer.

- Production calendar.
- Google Calendar-style calendar UI foundation for creating and editing `calendar_items`.
- Gantt chart over the same calendar data.
- Run-of-show view over the same `calendar_items` production-event data.
- Parent windows with expandable child tasks/events.
- Managed reference-data foundation for reusable institutional options.
- Reusable selectors for departments, locations, and lightweight reference values.
- Project-scoped timeline groups for calendar/Gantt grouping.
- Recurring event rules and generated occurrences are deferred.

Planning architecture rule: Calendar, Gantt, and Run of Show are synchronized projections over `calendar_items`. Do not create separate Gantt-only or run-of-show-only event records. The legacy `run_of_show_items` table remains available only for future extension detail linked back to a source calendar item.

## Phase 2A Reference Data Foundation

Create the reference-data foundation in one coherent, reversible pass:

- Add `departments`, `locations`, and `reference_values`.
- Seed initial Siena departments and locations.
- Seed current project types, calendar item/event types, and role groups.
- Add nullable relationship columns where safe:
  - `projects.primary_department_id`
  - `projects.primary_location_id`
  - `calendar_items.department_id`
  - `calendar_items.location_id`
- Keep existing text columns temporarily for backward compatibility and display fallback.
- Add a Settings/Admin reference-data page or section.
- Add reusable selector patterns:
  - Department selector
  - Location selector
  - Reference value selector by type
- Convert one or two existing forms to the selector pattern, preferably project creation and/or calendar item creation.
- Keep the app deployable and verify with typecheck, lint, build, migration/seed checks, and live form tests.

## Phase 7 Operations

- Employee scheduling.
- Time tracking.
- Inventory and road cases.
- Truck/load tracking.
- Quotes, invoices, and payments.

## Phase 8 Later Integrations

- Google Calendar feed/sync options.
- Advanced Theatre Budget contract/payment workflows beyond guest artist profile sync.
- Advanced Playbill submission automation beyond role/person/bio prompt creation.
