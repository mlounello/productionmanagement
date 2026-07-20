# Google Calendar audition invitations

Production Management can create and maintain Google Calendar invitations when an applicant books an audition. Applicants do not need a Production Management account or a Google login. They submit the audition form normally and receive a standard calendar invitation at the email address they entered.

The integration uses the same Google Apps Script bridge as Google Group membership checks. This is the best fit for Siena because the script runs as the authorized Siena account that owns the calendar and does not require domain-wide delegation.

## What the automation does

- Creates one calendar event for each booked audition slot.
- Invites the applicant at the email address on the audition form.
- Can also invite everyone assigned to the project's Directorial Team and any additional staff email addresses.
- Hides the guest list so applicants cannot see one another's email addresses.
- Updates the event when a booking is rescheduled.
- Removes the applicant or deletes the empty event when a booking is cancelled.
- Keeps the audition submission even if Google Calendar is unavailable, and shows staff a visible warning instead.

## Before you begin

You need:

1. The Google account that should own and send the audition invitations.
2. Access to the existing Google Apps Script used for Google Group membership checks.
3. Permission to edit the calendar you plan to use.
4. Access to the Production Management project settings.

If you use a shared calendar, open Google Calendar in a browser, find the calendar under **My calendars** or **Other calendars**, open **Settings and sharing**, and confirm the Apps Script account has permission to make changes to events.

## Step 1: Update the existing Apps Script

1. Sign in to Google using the account that should own the audition calendar invitations.
2. Open [Google Apps Script](https://script.google.com/).
3. Open the script project already used for Production Management Google Group membership checks.
4. In Production Management's source files, open `integrations/apps-script/google-groups-membership-check.gs`.
5. Select all of the code in the Apps Script editor and replace it with the complete contents of that file.
6. Click the **Save project** icon.

Do not change the script property named `SHARED_SECRET`. Production Management uses it to verify that requests came from the app.

## Step 2: Authorize Calendar access

Google must ask the script owner for Calendar permission once. Temporarily add this function at the bottom of the Apps Script file:

```javascript
function authorizeCalendarAccess() {
  const calendar = CalendarApp.getDefaultCalendar();
  console.log(calendar.getName());
}
```

Then:

1. Click **Save project**.
2. At the top of the editor, choose `authorizeCalendarAccess` from the function list.
3. Click **Run**.
4. When Google asks for authorization, click **Review permissions**.
5. Choose the Google account that should own the invitations.
6. Review the requested Calendar permission and click **Allow**.
7. Confirm the execution finishes successfully.
8. Delete the temporary `authorizeCalendarAccess` function.
9. Click **Save project** again.

Only the script owner completes this authorization. Applicants never see this step.

## Step 3: Publish the updated script

1. Click **Deploy** in the upper-right corner.
2. Choose **Manage deployments**.
3. Open the existing web app deployment by clicking its pencil icon.
4. Under **Version**, choose **New version**.
5. Confirm **Execute as** is set to **Me**.
6. Confirm access is set the same way as the working Google Group bridge deployment.
7. Click **Deploy**.
8. Copy the web app URL ending in `/exec` if Google displays it.

Updating the existing deployment normally keeps the same URL, so the app's environment settings should not need to change.

## Step 4: Confirm the app environment settings

If Calendar and Google Groups use the same Apps Script deployment, Production Management automatically reuses:

- `GOOGLE_GROUPS_APPS_SCRIPT_URL`
- `GOOGLE_GROUPS_APPS_SCRIPT_SHARED_SECRET`

Also confirm:

- `ENABLE_GOOGLE_CALENDAR_SYNC=true`

If you intentionally use a separate Apps Script deployment for Calendar, add these variables in Vercel instead:

- `GOOGLE_CALENDAR_APPS_SCRIPT_URL` — the Calendar script web app URL ending in `/exec`
- `GOOGLE_CALENDAR_APPS_SCRIPT_SHARED_SECRET` — the same value stored in that script's `SHARED_SECRET` property

After changing a Vercel environment variable, redeploy Production Management so the new value is active.

## Step 5: Configure a project

1. Open Production Management.
2. Open the project.
3. Open **Auditions**.
4. At the top of the page, choose **Google Calendar**.
5. For **Google Calendar ID**, enter:
   - `primary` to use the Apps Script owner's main calendar, or
   - the full calendar ID shown in Google Calendar's **Settings and sharing** page for a shared calendar.
6. Turn on **Invite assigned Directorial Team members automatically** if directors and other directorial staff should receive each invitation.
7. Add any extra staff email addresses, one per line.
8. Click **Save calendar settings**.
9. Click **Test calendar connection**.
10. Confirm the page reports a successful connection.
11. Turn on **Create and maintain Google Calendar invitations for audition bookings** and save again if it is not already on.

Use **Sync all current bookings** once if applicants booked before the Calendar integration was enabled.

## What the applicant experiences

1. The applicant opens the public audition form without signing in.
2. They enter their email address and select the required audition time or times.
3. They submit the form once.
4. The confirmation page appears immediately.
5. Google sends a normal calendar invitation to the submitted email address.
6. The applicant may accept the invitation using whatever calendar/email service they use. A Gmail address is not required.

If Google Calendar has a temporary problem, the application is still saved. The applicant sees a warning, and staff see **Calendar failed** beside that applicant in the Auditions workspace. After correcting the connection, use **Sync all current bookings** to retry.

## Rescheduling and cancellation

- When the applicant uses their secure management link to reschedule, Production Management updates the existing calendar event instead of creating a duplicate.
- When the applicant cancels, Production Management removes them from the event. If no one remains in the slot, it deletes the event.
- Group-call slots use one shared event, but the guest list remains hidden from applicants.

## Troubleshooting

### The calendar test says the calendar cannot be found

- Confirm the calendar ID is correct.
- Confirm the Apps Script owner can edit that calendar.
- Try `primary` to verify the script owner's main calendar first.

### The page says the Apps Script URL or shared secret is not configured

- Confirm the existing Google Group Apps Script variables are present in Vercel, or add the Calendar-specific variables listed above.
- Confirm the URL ends in `/exec`, not `/dev`.
- Redeploy after changing environment variables.

### The script reports an authorization error

- Repeat **Step 2: Authorize Calendar access** while signed into the account that owns the deployment.
- Then publish a new deployment version again.

### Applicants do not receive invitations

- Confirm the project setting is enabled.
- Confirm the audition form email address is correct.
- Check the applicant's spam or junk folder.
- Open the applicant record in **Auditions** and check the Calendar status.
- Click **Sync all current bookings** after correcting the problem.
