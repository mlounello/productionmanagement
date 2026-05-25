# MVP Roadmap

## Phase 1 Foundation

- App shell, auth, and protected project workspace.
- Supabase schema: projects, people, memberships, roles, assignments, calendar items, run of show, audition primitives, emails, accomplishments, external links, audit log.
- Read-only-safe integration design.

## Phase 2 Planning Core

- Production calendar.
- Gantt chart over the same calendar data.
- Parent windows with expandable child tasks/events.
- Recurring event rules and generated occurrences.
- Run-of-show view.
- Managed reference-data foundation for reusable institutional options.
- Reusable selectors for departments, locations, and lightweight reference values.
- Project-scoped timeline groups for calendar/Gantt grouping.

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

## Phase 3 Audition Workflow

- Audition sessions and slots.
- Capacity per slot.
- Audition form fields and submissions.
- Durable people profile creation/linking.
- Printable audition lists.

## Phase 4 Roles And Communication

- Project roles: cast, crew, designers, production team, department heads, event team.
- Assign people into roles.
- Manual role-confirmation emails.
- Track pending/accepted/declined.
- Recognition emails and accomplishment logging.

## Phase 5 Operations

- Employee scheduling.
- Time tracking.
- Inventory and road cases.
- Truck/load tracking.
- Quotes, invoices, and payments.

## Phase 6 Integrations

- Theatre Budget write sync after June 1, 2026.
- Playbill write sync after June 7, 2026.
- Google Calendar feed/sync options.
