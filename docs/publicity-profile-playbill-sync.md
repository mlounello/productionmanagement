# Publicity profiles and Playbill sync

## What this feature does

Production Management owns the reusable person profile: preferred name, pronouns, contact information, primary headshot URL, and reusable bio. A project never sends that live profile directly to Playbill. Instead, it creates one frozen production copy per person and project, even when that person has multiple roles.

That copy follows this sequence:

1. A production manager opens **Project → Publicity** and selects **Prepare missing copies**.
2. The app copies the person's current reusable bio, headshot, and credited name into a versioned production snapshot.
3. The production manager can customize the snapshot without changing the reusable profile.
4. The person signs in to Production Management with the same email stored on their person record, opens **My Profile**, and approves the production copy.
5. The production manager selects **Editorial approve & send to Playbill**.
6. Playbill receives the approved snapshot as a submitted bio and retains its normal final review, approve, lock, preview, and publishing workflow.

If the reusable profile changes later, the project shows that a newer profile version is available. It does not silently overwrite a production copy that was already reviewed or approved.

## Standalone Playbill productions

Nothing changes for productions that do not use Production Management. Their people continue to use Playbill's contributor form, secure links, email reminders, and approval workflow.

Playbill has three show-level intake modes under **Show → Settings → Submission Settings**:

- **Playbill standalone** keeps the current Playbill submission system.
- **Production Management** documents that bios are expected from the linked Production Management project.
- **Hybrid by person** permits both sources in one production.

The actual source is also stored on each bio request. A Production Management-managed bio is visibly labeled in the Playbill submission queue and is excluded from Playbill contributor reminders. A Playbill-managed bio continues to receive the usual reminders.

## Database migration order

The code is intentionally delivered without changing production data. Apply both schema migrations before deploying the application changes:

1. In the shared Supabase project, run Production Management migration `supabase/migrations/202607131700_publicity_profiles_and_approvals.sql`.
2. In the same Supabase project, run Playbill migration `db/phase16_dual_publicity_intake.sql` from the Playbill repository.
3. Deploy Production Management.
4. Deploy Playbill.

Both migrations preserve existing rows and default existing Playbill shows and people to the standalone Playbill workflow.

## Linking a person's sign-in

The person signs in to Production Management by magic link or Google using the same email address stored in Production Management. On the first visit to **My Profile**, select **Connect my profile**. The app safely claims the matching person record. If no matching record exists, it creates one for that signed-in email.

An email already attached to another authenticated account cannot be claimed again.

## Headshots

This phase stores a reusable primary headshot URL. It accepts a complete `https://` URL and passes the approved production snapshot to Playbill. Existing Playbill asset upload and rendering behavior remains unchanged. A direct Production Management image uploader can be added later without changing the approval or sync model.

## Failure behavior

- Role assignment and profile changes are never rolled back because Playbill is unavailable.
- A failed push leaves the production copy approved, records the error, and shows **Retry Playbill sync**.
- A Playbill person or request must already be linked through the role-assignment sync before publicity can be pushed.
- Saving an edited production copy clears prior person and editorial approvals.
- Refreshing from a newer reusable profile is explicit and also clears prior approvals.
- Repeating the final sync updates the same Playbill person and request; it does not create duplicate bios.

## Acceptance test

1. Create or select a person with a role assignment in a Playbill-linked project.
2. Set a reusable bio and headshot URL on the person profile.
3. Open the project's **Publicity** page and prepare missing copies.
4. Confirm the copy displays the current profile version.
5. Request person approval.
6. Sign in as the person's email, connect the profile, and approve the production copy under **My Profile**.
7. As production staff, editorially approve and send the copy to Playbill.
8. Confirm Playbill shows the bio as **Submitted**, labels its source **Production Management**, and does not show a reminder action for it.
9. Approve and lock the bio in Playbill and confirm it appears in preview/export.
10. Change the reusable profile and confirm the approved production copy remains unchanged while the project displays **New profile version available**.
11. Create a person directly in a standalone Playbill show and confirm its existing contributor link and reminder workflow still works.
