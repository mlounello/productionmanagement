# Rehearsal conflicts

The project-level **Rehearsal Conflicts** module configures the availability questions frozen into new role offers. It does not create Google Calendar events.

## Rent starting configuration

Use **Add standard Siena week** to create:

- Monday–Thursday, 6:00–10:00 PM as fixed rehearsal calls.
- Sunday, 10:00 AM–6:00 PM as a flexible window with a four-hour maximum call and optional preferred time.

Every day can be edited, archived, or replaced. A future production can use different weekdays, specific dates, multiple flexible days, or no flexible days.

## Offer behavior

- Preparing an offer freezes the currently active windows that apply to Cast, Crew, or both.
- Editing project windows never changes an agreement that has already been prepared or sent.
- To use a revised configuration, edit the casting draft and prepare a new offer. The previous link becomes superseded.
- On acceptance, every required window must be answered. Unavailable and preferred times must stay inside the configured window.
- The original free-text conflict field remains available as **Additional conflict notes**.

## Stage-management review

The project page shows each window with the latest submitted availability for every person. **Download CSV** exports names, roles, unavailable ranges, preferences, notes, and submission timestamps. The data model preserves window identifiers and snapshots so a future rehearsal/calendar module can match conflicts to generated rehearsal occurrences without changing the actor response format.

## Installation

Apply `202609160500_rehearsal_conflicts.sql` after the casting and Gmail-delivery migrations. It adds new tables and replaces only the two casting-offer functions needed to freeze and validate conflicts. It does not update or delete people, auditions, assignments, or existing offers.
