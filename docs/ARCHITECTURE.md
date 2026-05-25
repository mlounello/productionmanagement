# Architecture

## Product Intent

Production Management is the operational support structure for Siena production work. It is project-centered rather than theatre-only: a project can be a theatre production, campus event, rental, conference, support job, tour, shop build, or future production type.

## Bounded Contexts

- `core`: shared app registry, roles, and app memberships.
- `app_production_management`: source of truth for operational planning, durable people profiles, project teams, calendars, Gantt data, auditions, scheduling, recognition, and integration links.
- `app_playbill`: source of truth for public programs, bios, headshots, and Playbill submission workflow.
- `app_theatre_budget`: source of truth for production budgets, guest artist contract/payment tracking, procurement, and financial rollups.

## Current Integration Policy

Production Management must not write into Theatre Budget before June 1, 2026, or Playbill before June 7, 2026. Version 1 stores integration intent and links only.

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
- Calendars, Gantt windows, tasks, milestones, run-of-show rows
- Audition slots and submissions
- Email templates/messages/audit
- Recognition and accomplishment history
- Operational links to external apps

It does not initially own Playbill bios or Theatre Budget contracts.

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
