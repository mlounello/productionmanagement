export type AuditionFieldType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "single_choice"
  | "multiple_choice"
  | "yes_no"
  | "acknowledgement"
  | "file"
  | "role_selector"
  | "slot_selector";

export type AuditionSectionInput = {
  section_key: string;
  title: string;
  description: string;
  section_type: string;
  sort_order: number;
};

export type AuditionFieldInput = {
  section_key: string;
  field_key: string;
  label: string;
  field_type: AuditionFieldType;
  required: boolean;
  options: string[];
  help_text: string;
  placeholder: string;
  sensitivity: "standard" | "sensitive";
  profile_field: string;
  export_group: string;
  sort_order: number;
};

export const standardAuditionSections: AuditionSectionInput[] = [
  { section_key: "contact", title: "Contact & Basic Information", description: "Tell us how to identify and contact you.", section_type: "standard", sort_order: 10 },
  { section_key: "experience", title: "Performance Experience & Interests", description: "Share your experience, interests, and skills.", section_type: "standard", sort_order: 20 },
  { section_key: "music", title: "Music & Movement", description: "Optional musical, instrumental, and movement questions.", section_type: "optional", sort_order: 30 },
  { section_key: "comfort", title: "Comfort, Consent & Access Needs", description: "Restricted information used to support a safe and accessible process.", section_type: "sensitive", sort_order: 40 },
  { section_key: "director", title: "Production-Specific Questions", description: "Custom questions from the director.", section_type: "director", sort_order: 50 },
  { section_key: "schedule", title: "Schedule & Conflicts", description: "Review the production schedule and identify conflicts.", section_type: "schedule", sort_order: 60 },
  { section_key: "booking", title: "Audition Booking", description: "Choose an available audition time or group.", section_type: "booking", sort_order: 70 }
];

export const standardAuditionFields: AuditionFieldInput[] = [
  { section_key: "contact", field_key: "email", label: "Email", field_type: "email", required: true, options: [], help_text: "Use the email associated with your existing Siena profile when possible.", placeholder: "name@example.com", sensitivity: "standard", profile_field: "email", export_group: "contact", sort_order: 10 },
  { section_key: "contact", field_key: "full_name", label: "Full Name (as listed in Siena Directory/ID)", field_type: "short_text", required: true, options: [], help_text: "", placeholder: "First Last", sensitivity: "standard", profile_field: "full_name", export_group: "identity", sort_order: 20 },
  { section_key: "contact", field_key: "preferred_name", label: "Preferred Name", field_type: "short_text", required: false, options: [], help_text: "If different from your directory name.", placeholder: "", sensitivity: "standard", profile_field: "preferred_name", export_group: "identity", sort_order: 30 },
  { section_key: "contact", field_key: "pronouns", label: "Preferred Pronouns", field_type: "short_text", required: true, options: [], help_text: "", placeholder: "she/her, he/him, they/them", sensitivity: "standard", profile_field: "pronouns", export_group: "identity", sort_order: 40 },
  { section_key: "contact", field_key: "phone", label: "Phone Number", field_type: "phone", required: true, options: [], help_text: "", placeholder: "###-###-####", sensitivity: "standard", profile_field: "phone", export_group: "contact", sort_order: 50 },
  { section_key: "contact", field_key: "graduation_year", label: "Expected Graduation Year", field_type: "short_text", required: true, options: [], help_text: "Enter N/A if this does not apply.", placeholder: "2029", sensitivity: "standard", profile_field: "affiliation", export_group: "identity", sort_order: 60 },
  { section_key: "contact", field_key: "headshot", label: "Headshot Upload", field_type: "file", required: false, options: [], help_text: "Candid or professional; must clearly show your face. Maximum 5 MB.", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "headshot", sort_order: 70 },
  { section_key: "contact", field_key: "resume", label: "Acting Résumé Upload", field_type: "file", required: false, options: [], help_text: "Optional. Maximum 5 MB.", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "resume", sort_order: 80 },
  { section_key: "experience", field_key: "performance_experience", label: "Prior Performance Experience", field_type: "long_text", required: false, options: [], help_text: "Production, role, company, and year. New performers are welcome.", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "experience", sort_order: 90 },
  { section_key: "experience", field_key: "role_interests", label: "Roles That Interest You", field_type: "role_selector", required: false, options: [], help_text: "Select any currently vacant project roles you would like us to consider. Roles are grouped by team and maintained under Roles & Assignments.", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "roles", sort_order: 100 },
  { section_key: "experience", field_key: "other_roles", label: "Are You Open to Other Roles?", field_type: "single_choice", required: true, options: ["Yes", "Yes, but not minor or ensemble roles", "No"], help_text: "", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "roles", sort_order: 110 },
  { section_key: "experience", field_key: "different_age_gender", label: "Are You Comfortable Playing a Character of a Different Age or Gender?", field_type: "single_choice", required: false, options: ["Yes", "No", "Other"], help_text: "", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "roles", sort_order: 120 },
  { section_key: "experience", field_key: "special_skills", label: "Special Skills or Talents", field_type: "long_text", required: false, options: [], help_text: "Examples: dialects, stage combat, dance, singing, juggling, or instruments.", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "skills", sort_order: 130 },
  { section_key: "experience", field_key: "production_interests", label: "Technical and Production Areas of Interest If Not Cast", field_type: "multiple_choice", required: false, options: ["Stage Management", "Lighting", "Sound", "Video/Projection", "Carpentry/Scenic Construction", "Costumes/Wardrobe", "Stage Crew/Run Crew", "Dramaturgy", "House Management", "Marketing/Public Relations", "Other"], help_text: "Select all that apply. These reusable interests can help us find future opportunities for you.", placeholder: "", sensitivity: "standard", profile_field: "technical_interests", export_group: "production_interests", sort_order: 140 },
  { section_key: "comfort", field_key: "comfort_access_needs", label: "Comfort Considerations, Accessibility Needs, or Boundaries", field_type: "long_text", required: false, options: [], help_text: "This response is restricted to authorized audition staff.", placeholder: "", sensitivity: "sensitive", profile_field: "", export_group: "access", sort_order: 150 },
  { section_key: "comfort", field_key: "intimacy_comfort", label: "Comfort with Physical Contact or Intimacy Choreography", field_type: "single_choice", required: false, options: ["Yes", "Yes, with boundaries", "No", "Not sure", "I would prefer a private conversation"], help_text: "This response is restricted to authorized audition staff.", placeholder: "", sensitivity: "sensitive", profile_field: "", export_group: "intimacy", sort_order: 160 },
  { section_key: "comfort", field_key: "intimacy_questions", label: "Private Questions for the Intimacy Director", field_type: "long_text", required: false, options: [], help_text: "This response is restricted to authorized audition staff.", placeholder: "", sensitivity: "sensitive", profile_field: "", export_group: "intimacy", sort_order: 170 },
  { section_key: "schedule", field_key: "schedule_reviewed", label: "I Have Reviewed the Rehearsal, Tech, Performance, and Strike Schedule", field_type: "acknowledgement", required: true, options: ["I have reviewed the calendar"], help_text: "", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "schedule", sort_order: 180 },
  { section_key: "schedule", field_key: "conflicts", label: "Known Conflicts", field_type: "long_text", required: true, options: [], help_text: "Include recurring conflicts and one-time events.", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "conflicts", sort_order: 190 },
  { section_key: "schedule", field_key: "callback_availability", label: "Callback Availability", field_type: "single_choice", required: false, options: ["Yes", "No", "Other"], help_text: "Customize this question with the callback date and time.", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "callbacks", sort_order: 200 },
  { section_key: "schedule", field_key: "schedule_changes", label: "Do You Anticipate Schedule Changes After Auditions?", field_type: "long_text", required: false, options: [], help_text: "", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "conflicts", sort_order: 210 },
  { section_key: "schedule", field_key: "final_comments", label: "Final Questions or Comments", field_type: "long_text", required: false, options: [], help_text: "For the director or production manager.", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "comments", sort_order: 220 },
  { section_key: "schedule", field_key: "audition_source", label: "How Did You Hear About Auditions?", field_type: "single_choice", required: false, options: ["Digest", "Poster", "SaintsConnect", "A friend", "A class", "Other"], help_text: "", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "source", sort_order: 230 },
  { section_key: "booking", field_key: "audition_slot", label: "Select Your Audition Time", field_type: "slot_selector", required: false, options: [], help_text: "Available times and group calls appear here.", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "booking", sort_order: 240 }
];

export const optionalMusicFields: AuditionFieldInput[] = [
  { section_key: "music", field_key: "vocal_range", label: "Vocal Range", field_type: "single_choice", required: false, options: ["Soprano (C4-A5)", "Mezzo-Soprano (A3-F5)", "Alto (F3-D5)", "Tenor (B2-G4)", "Baritone (G2-E4)", "Bass (E2-C4)", "Unknown", "Other"], help_text: "Choose the closest fit; use the notes field for additional detail.", placeholder: "", sensitivity: "standard", profile_field: "vocal_range", export_group: "music", sort_order: 300 },
  { section_key: "music", field_key: "audition_song", label: "Audition Song or Cut", field_type: "short_text", required: false, options: [], help_text: "List the title and selection you will perform.", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "music", sort_order: 310 },
  { section_key: "music", field_key: "instruments", label: "Instruments and Proficiency", field_type: "long_text", required: false, options: [], help_text: "List any instruments and describe your proficiency.", placeholder: "", sensitivity: "standard", profile_field: "instruments", export_group: "music", sort_order: 320 },
  { section_key: "music", field_key: "dance_styles", label: "Dance Styles", field_type: "multiple_choice", required: false, options: ["Ballet", "Jazz", "Tap", "Hip-Hop", "Contemporary", "Modern", "Musical Theatre", "Ballroom/Partner Dance", "Other", "No formal dance experience"], help_text: "Select all that apply.", placeholder: "", sensitivity: "standard", profile_field: "dance_styles", export_group: "movement", sort_order: 330 },
  { section_key: "music", field_key: "dance_movement", label: "Dance and Movement Experience", field_type: "long_text", required: false, options: [], help_text: "Describe training, years of experience, or movement skills you would like us to know.", placeholder: "", sensitivity: "standard", profile_field: "dance_experience", export_group: "movement", sort_order: 340 }
];

export function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
