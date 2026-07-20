/**
 * Production Management read-only Google Group membership bridge.
 * Set the script property SHARED_SECRET before deploying this as a web app.
 */
function doPost(event) {
  try {
    const payload = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
    if (!expectedSecret || payload.secret !== expectedSecret) return json_({ ok: false, error: 'Unauthorized.' });

    if (payload.action === 'check_group') {
      const group = GroupsApp.getGroupByEmail(normalizeEmail_(payload.groupEmail));
      return json_({ ok: true, groupEmail: group.getEmail() });
    }

    if (payload.action === 'test_calendar') {
      const calendar = calendarForId_(payload.calendarId);
      return json_({ ok: true, calendarId: calendar.getId(), calendarName: calendar.getName() });
    }

    if (payload.action === 'upsert_calendar_event') {
      const calendar = calendarForId_(payload.calendarId);
      const guests = normalizeEmails_(payload.guestEmails);
      let calendarEvent = payload.eventId ? calendar.getEventById(String(payload.eventId)) : null;
      if (!calendarEvent) {
        calendarEvent = calendar.createEvent(String(payload.title || 'Audition'), new Date(payload.startsAt), new Date(payload.endsAt), {
          description: String(payload.description || ''), location: String(payload.location || '')
        });
        calendarEvent.setGuestsCanInviteOthers(false).setGuestsCanModify(false).setGuestsCanSeeGuests(false);
        guests.forEach(function(email) { calendarEvent.addGuest(email); });
      } else {
        calendarEvent.setTitle(String(payload.title || 'Audition')).setDescription(String(payload.description || '')).setLocation(String(payload.location || '')).setTime(new Date(payload.startsAt), new Date(payload.endsAt));
        calendarEvent.setGuestsCanInviteOthers(false).setGuestsCanModify(false).setGuestsCanSeeGuests(false);
        const current = calendarEvent.getGuestList().map(function(guest) { return normalizeEmail_(guest.getEmail()); });
        current.filter(function(email) { return guests.indexOf(email) < 0; }).forEach(function(email) { calendarEvent.removeGuest(email); });
        guests.filter(function(email) { return current.indexOf(email) < 0; }).forEach(function(email) { calendarEvent.addGuest(email); });
      }
      return json_({ ok: true, eventId: calendarEvent.getId() });
    }

    if (payload.action === 'delete_calendar_event') {
      const calendar = calendarForId_(payload.calendarId);
      const calendarEvent = calendar.getEventById(String(payload.eventId || ''));
      if (calendarEvent) calendarEvent.deleteEvent();
      return json_({ ok: true, deleted: Boolean(calendarEvent) });
    }

    if (payload.action !== 'check_memberships' || !Array.isArray(payload.checks)) return json_({ ok: false, error: 'Invalid action.' });
    if (payload.checks.length > 200) return json_({ ok: false, error: 'Too many checks.' });

    const groups = {};
    const results = payload.checks.map(function(check) {
      const groupEmail = normalizeEmail_(check.groupEmail);
      const memberEmail = normalizeEmail_(check.memberEmail);
      try {
        const group = groups[groupEmail] || (groups[groupEmail] = GroupsApp.getGroupByEmail(groupEmail));
        return { groupEmail: groupEmail, memberEmail: memberEmail, isMember: group.hasUser(memberEmail), error: '' };
      } catch (error) {
        return { groupEmail: groupEmail, memberEmail: memberEmail, isMember: false, error: String(error && error.message || error) };
      }
    });
    return json_({ ok: true, results: results });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message || error) });
  }
}

function calendarForId_(value) {
  const id = String(value || 'primary').trim();
  const calendar = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
  if (!calendar) throw new Error('Calendar was not found or is not editable by the Apps Script account.');
  return calendar;
}

function normalizeEmails_(values) {
  const seen = {};
  return (Array.isArray(values) ? values : []).map(normalizeEmail_).filter(function(email) { if (seen[email]) return false; seen[email] = true; return true; });
}

function normalizeEmail_(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 1 || email.length > 320) throw new Error('A valid email is required.');
  return email;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
