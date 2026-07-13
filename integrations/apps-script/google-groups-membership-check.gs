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

function normalizeEmail_(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 1 || email.length > 320) throw new Error('A valid email is required.');
  return email;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
