# Architecture

## Product Intent

Production Management is the operational support structure for Siena production work. It is project-centered rather than theatre-only: a project can be a theatre production, campus event, rental, conference, support job, tour, shop build, or future production type.

## Bounded Contexts

- `core`: shared app registry, roles, and app memberships.
- `app_production_management`: source of truth for projects, durable people profiles, project teams, role assignment intent, auditions, generated communications, recognition, supporting planning views, and integration links.
- `app_playbill`: source of truth for public programs, bios, headshots, and Playbill submission workflow.
- `app_theatre_budget`: source of truth for production budgets, guest artist contract/payment tracking, procurement, and financial rollups.

## Current Integration Policy

Production Management, Playbill, and Theatre Budget share the same Supabase project but use different schemas. Cross-app writes must be deliberate, feature-gated, and traceable through local integration records. Version 1 should store local intent and external links before enabling automated writes.

Future writes must be gated behind feature flags:

- `ENABLE_PLAYBILL_WRITES`
- `ENABLE_BUDGET_WRITES`
- `ENABLE_GOOGLE_CALENDAR_SYNC`

## Source Of Truth

Production Management owns:

- Projects
- Durable people profiles
- Project team memberships
- Production roles and assignments
- Guest artist intent on project role assignments
- Person files with internal notes, client-visible notes, accomplishments, and project history
- `calendar_items` as the production-event planning source of truth for calendars, Gantt windows, tasks, milestones, and run-of-show projections
- Audition slots and submissions
- Email templates/messages/audit
- Recognition and accomplishment history
- Operational links to external apps

It does not own Playbill bios, public program output, Theatre Budget contracts, or Theatre Budget payment tracking.

## People Profiles

Each `people` row should evolve into a durable profile for the person, not merely a name in a project. The profile should act like a production resume/log across Siena work:

- identity and contact basics
- headshot and optional public-facing profile assets
- project history
- role assignment history
- audition history where applicable
- director, stage manager, casting, producer, and internal production notes
- client-visible notes where appropriate
- accomplishments, recognitions, and ACTF-related history
- external links to Playbill, Theatre Budget, and future systems

Headshots should live on the durable Production Management person profile and later be reusable by Playbill sync so the Playbill builder can request, display, or reuse the correct image without maintaining a separate disconnected asset record.

Future authenticated person access should allow people to log in and edit a controlled subset of their own information, such as preferred name, pronouns, contact details, bio/headshot submission inputs, and possibly selected resume/profile fields. Internal notes, casting notes, producer notes, and protected sync data remain staff-controlled.

Project roles and role assignments are now the main MVP spine. A person is assigned to a role on a project, and that assignment can drive Playbill role/bio prompts, Theatre Budget guest artist sync, announcement emails, and later calendar/team workflows. Guest artist status belongs on the assignment because a person may be a guest artist for one project and not for another.

Project role groups classify the type of role for organization, announcements, reporting, and future Playbill mapping. The active role group set is Creative Team, Production Team, Cast, Directorial Team, Administrative, Front of House, and Music / Band. Guest Artist is not a role group; it is an assignment-level flag used for Theatre Budget guest artist linking.

Cross-app sync should flow through explicit local records:

- local entity type and id
- external app/schema/table/id
- sync direction
- sync status
- last synced metadata or error detail where needed

This lets Production Management retry or disable sync without corrupting Playbill or Theatre Budget data.

Calendar, Gantt, and Run of Show must stay synchronized views over `app_production_management.calendar_items`. The calendar view reads and edits calendar items directly. The Gantt view reads the same calendar items and groups them through project-scoped `project_timeline_groups`. The Run of Show view reads calendar items where `is_run_of_show_relevant = true`; run-of-show cue, order, duration, and note fields live on the same calendar item row.

The existing `run_of_show_items` table is legacy/future extension detail only. It should not be used as the primary source for independent run-of-show events. If it remains long term, rows should extend a source calendar item through `calendar_item_id` rather than duplicating event title/date data. Full recurrence behavior is deferred and should be designed carefully before implementation, including single-occurrence edits, entire-series edits, and this-and-following series splits.

Planning/calendar functionality is currently a supporting module, not the primary MVP path. Preserve the existing calendar/Gantt/Run of Show foundation, but prioritize people, project roles, auditions, communications, and Playbill/Theatre Budget sync prep before adding advanced planning features.

## Sync Targets

Playbill sync should be designed against these existing `app_playbill` tables:

- `programs`
- `shows`
- `people`
- `show_roles`
- `submission_requests`
- `submissions`

Production Management should not assume that a durable local person is the same row as an `app_playbill.people` row. Playbill people are currently program-scoped, so sync should link local people and role assignments to Playbill program/show/people/role rows through `external_links`.

Theatre Budget guest artist sync should be designed against:

- `app_theatre_budget.guest_artists`
- `app_theatre_budget.contracts.guest_artist_id`

Existing Theatre Budget guest artist rows are live budget-system records and must be treated as protected data. Production Management must not automatically update, overwrite, delete, deactivate, merge, or otherwise mutate existing `app_theatre_budget.guest_artists` rows.

The safe Theatre Budget sync progression is:

- read-only lookup of existing guest artists
- suggested matches by existing external link, email, and normalized display name
- explicit manual link from a Production Management role assignment to an existing Theatre Budget guest artist
- optional creation of a new Theatre Budget guest artist only after a deliberate confirmation flow
- no contract/payment/vendor/tax-field writes from Production Management

If future updates are allowed, they must be reviewed, field-scoped, feature-gated, and auditable. Theatre Budget remains the authority for guest artist financial, contract, vendor, tax, and payment details.

## Managed Reference Data

Production Management should use managed reference data for reusable institutional/selectable options that are not specific to one user or one project. Users should not repeatedly type reusable institutional values by hand when those values should be shared, searched, reported on, archived, and reused.

Examples of managed reference data include:

- departments
- locations, venues, and rooms
- project types
- calendar item and event types
- role groups
- task categories
- equipment categories
- labor categories
- report types
- attachment categories
- statuses, where appropriate
- academic terms and seasons
- audience or stakeholder groups
- budget and funding categories, if needed later

Free text remains appropriate for project-specific notes, descriptions, comments, instructions, and details that are not reusable controlled options.

The recommended model is hybrid:

- dedicated tables for core institutional entities: `departments` and `locations`
- a generic `reference_values` table for lightweight controlled vocabularies such as project types, calendar item types, role groups, and later task/report/attachment/status categories

Departments and locations are real institutional entities and may need hierarchy, aliases, building/room metadata, capacity, campus grouping, relationships, and reporting. Project types and event types are controlled vocabulary and do not need separate custom tables yet.

Reference records should support display name/label, slug, description, sort order, active/inactive status, and created/updated tracking. Records should be archived or marked inactive rather than deleted so historical projects remain intact.

Forms should use reusable searchable selectors for managed reference data. Selectors should show active records, support search, allow authorized users to add new records where appropriate, prevent duplicates through slug normalization and existing-record checks, and continue displaying inactive records on historical data.

Some managed selectable records are project-scoped rather than global reference values. Timeline groups belong to a single project and group calendar/Gantt items into planning phases such as rehearsals, tech week, or marketing. They do not replace calendar item type/category, recurrence, title, dates, department, or location.

## Access Model

App-level access comes from `core.app_memberships` with `app_id = 'production_management'`.

Project-level access comes from `app_production_management.project_memberships`.

Initial app roles:

- `admin`
- `producer`
- `staff`
- `faculty`
- `guest`

Project membership roles are stored as text so they can expand without enum churn: `project_manager`, `producer`, `department_head`, `staff`, `faculty`, `guest`, and later more specific production roles.

## Expansion Areas

The schema is designed so these modules attach to projects, people, roles, and calendar items:

- project role casting and staffing workflows
- Playbill role/person/bio prompt sync
- Theatre Budget guest artist profile sync
- audition slot booking and paperwork
- generated cast, crew, role confirmation, and ACTF/recognition emails
- employee scheduling
- time tracking, internal and payroll-adjacent
- inventory and rental quoting
- invoices and payments
- road cases and eventual QR/barcode labels
- trucks and movement logs
- accomplishment/CV records
- Playbill and Theatre Budget sync

## UI Direction

The long-term interface should move toward a Siena-branded production-management shell inspired by clean Propared-style workflows without copying Propared branding or UI exactly.

Target shell direction:

- persistent left sidebar navigation
- Siena green as primary branding
- Siena gold as restrained accent
- top header with current workspace/project context and quick actions
- clean white content area
- compact tables and lists
- right-side slide-out detail drawers
- list/detail workflows instead of constant page jumps
- Settings/Admin area for reference data

Do not redesign the full shell before the data model is ready. Data integrity and reusable selector patterns come before visual polish.

## Build Preference

For bug fixes, keep changes surgical and evidence-driven.

For structural product phases, group related database, schema, UI, and API work into coherent larger passes that are still testable, reversible, and deployable. The goal is fewer passes that deliver meaningful slices, not tiny disconnected changes.
