# Publicity profiles and automatic Playbill sync

## Ownership model

Production Management owns each person’s reusable identity, headshot, and overall bio. The overall bio is limited to 350 characters and is used to seed new production records.

Every person/project pair has a separate show-specific bio. This allows one person to work on several productions at the same time without one show overwriting another. A contributor can edit a show-specific bio from **My Profile** until Playbill locks it. A locked copy remains visible as read-only history.

Reusable and show-specific bios use a WYSIWYG editor with a live Playbill-style preview. Contributors are instructed to enter only the biography text—not their name or role—because the preview and final program supply the credited name and linked production role automatically. Formatting is sanitized on the server before it is stored or transferred to Playbill.

The workflow is:

1. Staff open **Project → Publicity** and prepare missing production records.
2. Staff set bio/headshot due dates and request person approval.
3. Branded individual or bulk reminders take each person through a secure, passwordless profile link.
4. The person edits the show-specific bio and selects **Approve & submit to Playbill**.
5. Production Management immediately sends the copy to Playbill as **Submitted**. No staff sync button is required.
6. Playbill remains the final editorial authority for returned, approved, and locked copy.
7. A database trigger copies Playbill’s bio, headshot, credited name, and status back to the linked Production Management project record.

If an already-approved person edits an unlocked show bio or uploads a new headshot, Production Management automatically resubmits the linked copy to Playbill. Sync errors preserve the person’s changes, display a warning, and can be retried; they never roll back the profile or assignment.

Show-specific contributor notes remain entirely in Playbill and continue to use Playbill’s existing reminder system.

## Dashboard and reminders

The project Publicity page shows outstanding, submitted, approved, and locked totals. It also provides:

- Separate bio and headshot due dates
- A selectable bulk-reminder list
- One-person reminder buttons
- Reminder counts and last-sent timestamps
- Person approval and Playbill editorial status on every record
- Locked, read-only historical copies

Customize the global reminder branding under **Settings → Profile Access Email → Bulk reminder email**. Supported variables are listed beside the editor. Project-specific templates can also be stored with `template_type = 'publicity_reminder'`; they take precedence over the global template.

## Database migration order

In the shared Supabase project, apply these in order before deploying the new Production Management build:

1. Production Management `supabase/migrations/202607131700_publicity_profiles_and_approvals.sql`
2. Playbill `db/phase16_dual_publicity_intake.sql`
3. Production Management `supabase/migrations/202607132000_secure_contributor_profiles_and_headshots.sql`
4. Production Management `supabase/migrations/202607132200_branded_profile_access_links.sql`
5. Production Management `supabase/migrations/202607132300_publicity_dashboard_automation.sql`
6. Production Management `supabase/migrations/202607132310_publicity_sync_privilege_bridge.sql`
7. Production Management `supabase/migrations/202607132320_publicity_bridge_owner_privileges.sql`
8. Production Management `supabase/migrations/202607132330_profile_link_service_role_privileges.sql`
9. Production Management `supabase/migrations/202607132340_formatted_publicity_bios.sql`

The final migration adds deadlines, reminder tracking, the Playbill status mirror, narrow contributor RPCs, and the automatic cross-schema trigger. It also reconciles already-linked records by `production_management_approval_id`. It does not create people, projects, roles, or Playbill records.

The privilege-bridge migration fixes cross-app writes without granting the PM service key blanket access to Playbill’s `people` table. All PM-to-Playbill publicity submissions pass through one security-definer function that validates the PM approval, project link, person link, active role assignment, bio request, and Playbill lock state before updating anything.

## Standalone Playbill productions

Nothing changes for productions that do not use Production Management. They continue using Playbill’s contributor forms, links, reminders, approvals, and locks. The automatic trigger acts only when a Playbill person has a `production_management_approval_id`.

## Acceptance test

1. Link a PM project and role assignment to a production-managed or hybrid Playbill show.
2. Prepare publicity records and set both due dates.
3. Send one reminder and confirm the branded access page opens in a different browser without a PKCE error.
4. Confirm the secure profile shows the due dates, 350-character overall bio, and editable show-specific bio.
5. Approve the show copy and confirm Playbill immediately shows **Submitted** and source **Production Management**.
6. Return the copy in Playbill and confirm PM shows **Returned / Changes requested**.
7. Edit and approve it again in PM and confirm it returns to **Submitted** automatically.
8. Edit/approve/lock it in Playbill and confirm the final copy and **Locked** status appear read-only in PM.
9. Upload a new headshot before locking and confirm the unlocked, approved production copy is resubmitted automatically.
10. Confirm a standalone Playbill person is unaffected.
