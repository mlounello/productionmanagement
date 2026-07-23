begin;

update app_production_management.email_templates
set body_template = $template$
<p>Hello {{person_name}},</p>

<p>Welcome to the <strong>{{role_group}}</strong> as <strong>{{role_name}}</strong> for our production of <strong>{{project_title}}</strong>. We’re excited to have you on board and can’t wait to get started.</p>

<p>One of the key tools we’ll use throughout this process is <strong>Propared</strong>, a platform for organizing schedules, contacts, production notes, shared documents, and other important information. It helps everyone stay aligned and up to date without the confusion of multiple versions or endless email chains.</p>

<h2>Your Propared Production Book</h2>

<p><a href="{{propared_rolegroup_link}}">Open Your Propared Production Book</a></p>

<p><strong>Please do not share this link with anyone else on the production.</strong> Each role group has its own Propared link containing information tailored to that team.</p>

<h2>What You’ll Find in Propared</h2>

<ul>
  <li><strong>Schedule:</strong> Toggle between Day, Week, Month, and List views. This is your master production calendar.</li>
  <li><strong>Attachments:</strong> Quick links to shared folders, resources, and production documents.</li>
  <li><strong>Team:</strong> A contact sheet with names, roles, and headshots for quick reference.</li>
</ul>

<p>Please bookmark your Propared page on both desktop and mobile. You can also add it as a shortcut on your phone’s home screen for easy access.</p>

<h2>Complete Your Production Profile</h2>

<p>Use Production Management to review your contact information, add a reusable headshot, and prepare your show-specific biography for Playbill.</p>

<p><a href="{{profile_access_url}}">Open My Production Profile</a></p>

<p>This private link is already connected to the email address where this message was delivered. No account setup or email re-entry is required, and the link should not be shared.</p>

<p>Let me know if you have any questions about getting started with Propared, your Production Management profile, or any of the links in this message.</p>

<p>Looking forward to a great production!</p>

<p>Best,<br>Mike</p>
$template$,
updated_at = now()
where id = '17da3cf5-4913-48a9-b46b-573c569b5a83'
  and active = true;

commit;
