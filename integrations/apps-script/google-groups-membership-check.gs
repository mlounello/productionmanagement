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
      return json_({ ok: true, calendarId: calendar.getId(), calendarName: calendar.getName(), bridgeVersion: 3, idempotentUpsert: true, calendarChangeReview: true });
    }

    if (payload.action === 'calendar_capabilities') {
      return json_({ ok: true, bridgeVersion: 3, idempotentUpsert: true, calendarChangeReview: true });
    }

    if (payload.action === 'read_calendar_events') {
      const calendar = calendarForId_(payload.calendarId);
      const requested = Array.isArray(payload.events) ? payload.events : [];
      if (requested.length > 200) return json_({ ok: false, error: 'Too many calendar events requested.' });
      const events = requested.map(function(item) {
        const eventId = String(item.eventId || '');
        const calendarEvent = eventId ? calendar.getEventById(eventId) : null;
        if (!calendarEvent) return { slotId: String(item.slotId || ''), eventId: eventId, found: false };
        return {
          slotId: String(item.slotId || ''),
          eventId: eventId,
          found: true,
          startsAt: calendarEvent.getStartTime().toISOString(),
          endsAt: calendarEvent.getEndTime().toISOString(),
          updatedAt: calendarEvent.getLastUpdated().toISOString()
        };
      });
      return json_({ ok: true, events: events, bridgeVersion: 3 });
    }

    if (payload.action === 'upsert_calendar_event') {
      const calendar = calendarForId_(payload.calendarId);
      const guests = normalizeEmails_(payload.guestEmails);
      const startsAt = new Date(payload.startsAt);
      const endsAt = new Date(payload.endsAt);
      const externalKey = String(payload.externalKey || '').trim();
      const marker = externalKey ? '[PM_CALENDAR_KEY:' + externalKey + ']' : '';
      const description = String(payload.description || '') + (marker ? '\n\n' + marker : '');
      let calendarEvent = payload.eventId ? calendar.getEventById(String(payload.eventId)) : null;
      if (!calendarEvent) {
        const searchStart = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
        const searchEnd = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
        const candidates = calendar.getEvents(searchStart, searchEnd);
        const markerMatches = marker ? candidates.filter(function(candidate) {
          return String(candidate.getDescription() || '').indexOf(marker) >= 0;
        }) : [];
        const legacyMatches = candidates.filter(function(candidate) {
          return candidate.getTitle() === String(payload.title || 'Audition') &&
            candidate.getStartTime().getTime() === startsAt.getTime() &&
            candidate.getEndTime().getTime() === endsAt.getTime();
        });
        calendarEvent = markerMatches[0] || legacyMatches[0] || null;
      }
      if (!calendarEvent) {
        calendarEvent = calendar.createEvent(String(payload.title || 'Audition'), startsAt, endsAt, {
          description: description, location: String(payload.location || '')
        });
        calendarEvent.setGuestsCanInviteOthers(false).setGuestsCanModify(false).setGuestsCanSeeGuests(false);
        guests.forEach(function(email) { calendarEvent.addGuest(email); });
      } else {
        calendarEvent.setTitle(String(payload.title || 'Audition')).setDescription(description).setLocation(String(payload.location || '')).setTime(startsAt, endsAt);
        calendarEvent.setGuestsCanInviteOthers(false).setGuestsCanModify(false).setGuestsCanSeeGuests(false);
        const current = calendarEvent.getGuestList().map(function(guest) { return normalizeEmail_(guest.getEmail()); });
        current.filter(function(email) { return guests.indexOf(email) < 0; }).forEach(function(email) { calendarEvent.removeGuest(email); });
        guests.filter(function(email) { return current.indexOf(email) < 0; }).forEach(function(email) { calendarEvent.addGuest(email); });
      }
      return json_({ ok: true, eventId: calendarEvent.getId(), bridgeVersion: 3 });
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
