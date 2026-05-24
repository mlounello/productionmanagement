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

