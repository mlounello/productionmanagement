# Phase 5: Communication and Recognition

Open a project and select **Communications**.

## Safe campaign workflow

1. Choose a message type or reusable template.
2. Choose an audience: everyone, role group, assignment status, audition status, or selected people.
3. Generate the review draft. This does not send email.
4. Review the individualized preview and expand the recipient list to inspect every address and role.
5. Optionally send a safe test. The test goes only to the address entered and does not change recipient delivery status.
6. Check the review confirmation and send.

Sent recipients are never sent the same campaign twice. A partial campaign can retry only failed recipients. A campaign interrupted while sending can be resumed; existing sent audit records are detected before delivery.

## Recognition

Recognition records remain on the durable person profile across productions. **Client visible** records appear in the person’s secure profile. **Management only** records do not. A client-visible recognition can optionally prepare an individualized announcement draft, but it still must be reviewed and manually sent.

## Template variables

- `{{person_name}}`
- `{{full_name}}`
- `{{preferred_name}}`
- `{{project_title}}`
- `{{role_name}}`
- `{{role_group}}`
- `{{recognition_title}}`
- `{{recognition_issuer}}`
- `{{recognition_date}}`
- `{{recognition_description}}`

## Delivery configuration

Phase 5 uses the same Resend configuration as the existing branded profile links, publicity reminders, and Google Group welcome emails. `DISABLE_OUTBOUND_EMAIL` remains the master safety switch. Drafting, previews, recognition records, and test preparation still work when outbound delivery is disabled; actual test and campaign sends return a visible error.
