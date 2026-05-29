"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import type { DateSelectArg, EventClickArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import {
  createCalendarItemAction,
  deleteCalendarItemAction,
  updateCalendarItemAction
} from "@/app/projects/[projectId]/actions";

export type ProjectCalendarItem = {
  id: string;
  title: string;
  item_type: string;
  starts_at: string | null;
  ends_at: string | null;
  due_at: string | null;
  all_day: boolean;
  status: string;
  description: string;
  department_id: string | null;
  location_id: string | null;
  timeline_group_id: string | null;
  is_run_of_show_relevant: boolean;
  run_of_show_order: number | null;
  cue_number: string;
  duration_minutes: number | null;
  run_of_show_notes: string;
};

export type CalendarOption = {
  id: string;
  label: string;
  value: string;
  isActive?: boolean;
};

type Draft =
  | {
      mode: "create";
      startsAt: string;
      endsAt: string;
      allDay: boolean;
    }
  | {
      mode: "edit";
      item: ProjectCalendarItem;
    };

const statusOptions = [
  { label: "Planned", value: "planned" },
  { label: "In progress", value: "in_progress" },
  { label: "Blocked", value: "blocked" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" }
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateTimeLocal(value: Date | string | null) {
  if (!value) {
    return "";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function dateStringToDateTimeLocal(value: string, hour = 9) {
  return `${value}T${pad(hour)}:00`;
}

function defaultEnd(startValue: string) {
  const start = new Date(startValue);
  if (Number.isNaN(start.getTime())) {
    return "";
  }

  return toDateTimeLocal(new Date(start.getTime() + 60 * 60 * 1000));
}

function localDateTimeToIso(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function normalizeDateTimeFields(formData: FormData) {
  for (const field of ["startsAt", "endsAt", "dueAt"]) {
    const value = localDateTimeToIso(formData.get(field));
    if (value) {
      formData.set(field, value);
    }
  }
}

function eventStart(item: ProjectCalendarItem) {
  return item.starts_at ?? item.due_at ?? item.ends_at;
}

function eventEnd(item: ProjectCalendarItem) {
  return item.ends_at ?? item.due_at ?? item.starts_at;
}

function selectValue(value: string | null | undefined) {
  return value ?? "";
}

export function ProjectCalendar({
  calendarItemTypes,
  departments,
  items,
  locations,
  projectId,
  timelineGroups
}: {
  calendarItemTypes: CalendarOption[];
  departments: CalendarOption[];
  items: ProjectCalendarItem[];
  locations: CalendarOption[];
  projectId: string;
  timelineGroups: CalendarOption[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [includeRunOfShow, setIncludeRunOfShow] = useState(false);
  const [timelineMode, setTimelineMode] = useState("");
  const [saving, setSaving] = useState(false);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const events = useMemo(
    () =>
      items
        .map((item) => {
          const start = eventStart(item);
          if (!start) {
            return null;
          }

          const classes = [`calendar-event-${item.item_type}`];
          if (item.is_run_of_show_relevant) {
            classes.push("calendar-event-run-of-show");
          }

          return {
            id: item.id,
            title: item.title,
            start,
            end: eventEnd(item) ?? start,
            allDay: item.all_day,
            classNames: classes,
            extendedProps: { itemId: item.id }
          };
        })
        .filter((event): event is NonNullable<typeof event> => Boolean(event)),
    [items]
  );

  function openCreate(startsAt: string, endsAt: string, allDay: boolean) {
    setIncludeRunOfShow(false);
    setTimelineMode("");
    setDraft({ mode: "create", startsAt, endsAt, allDay });
  }

  function handleDateClick(info: DateClickArg) {
    const startsAt = info.allDay ? dateStringToDateTimeLocal(info.dateStr) : toDateTimeLocal(info.date);
    openCreate(startsAt, defaultEnd(startsAt), info.allDay);
  }

  function handleSelect(info: DateSelectArg) {
    const startsAt = info.allDay ? dateStringToDateTimeLocal(info.startStr) : toDateTimeLocal(info.start);
    const endsAt = info.allDay ? defaultEnd(startsAt) : toDateTimeLocal(info.end);
    openCreate(startsAt, endsAt, info.allDay);
  }

  function handleEventClick(info: EventClickArg) {
    const itemId = String(info.event.extendedProps.itemId ?? info.event.id);
    const item = itemsById.get(itemId);
    if (!item) {
      return;
    }

    setIncludeRunOfShow(item.is_run_of_show_relevant);
    setTimelineMode(item.timeline_group_id ?? "");
    setDraft({ mode: "edit", item });
  }

  async function submitForm(formData: FormData) {
    setSaving(true);
    try {
      normalizeDateTimeFields(formData);
      if (draft?.mode === "edit") {
        await updateCalendarItemAction(formData);
      } else {
        await createCalendarItemAction(formData);
      }
      setDraft(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent() {
    if (draft?.mode !== "edit") {
      return;
    }

    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("id", draft.item.id);
    setSaving(true);
    try {
      await deleteCalendarItemAction(formData);
      setDraft(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const editingItem = draft?.mode === "edit" ? draft.item : null;
  const createDraft = draft?.mode === "create" ? draft : null;
  const startsAt = editingItem ? toDateTimeLocal(editingItem.starts_at ?? editingItem.due_at) : createDraft?.startsAt ?? "";
  const endsAt = editingItem ? toDateTimeLocal(editingItem.ends_at) : createDraft?.endsAt ?? "";
  const dueAt = editingItem ? toDateTimeLocal(editingItem.due_at) : "";
  const allDay = editingItem ? editingItem.all_day : createDraft?.allDay ?? false;
  const selectedTimelineGroupId = timelineMode;

  return (
    <section className="panel workspace-section calendar-workspace" id="calendar">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Production Calendar</p>
          <h2>Calendar</h2>
          <p className="muted">Click a day, select a time range, or open an event to manage project calendar items.</p>
        </div>
      </div>
      <FullCalendar
        allDaySlot
        dateClick={handleDateClick}
        editable={false}
        eventClick={handleEventClick}
        events={events}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek"
        }}
        height="auto"
        initialView="dayGridMonth"
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        selectable
        select={handleSelect}
        selectMirror
        slotMinTime="07:00:00"
        slotMaxTime="23:00:00"
      />

      {draft ? (
        <div className="modal-backdrop" role="presentation">
          <div aria-modal="true" className="event-modal" role="dialog">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{draft.mode === "edit" ? "Edit Event" : "Create Event"}</p>
                <h2>{draft.mode === "edit" ? editingItem?.title : "New Calendar Item"}</h2>
              </div>
              <button className="button secondary" onClick={() => setDraft(null)} type="button">
                Close
              </button>
            </div>
            <form action={submitForm} className="form-grid">
              <input name="projectId" type="hidden" value={projectId} />
              {editingItem ? <input name="id" type="hidden" value={editingItem.id} /> : null}
              <div className="field">
                <label htmlFor="eventTitle">Title</label>
                <input id="eventTitle" name="title" required defaultValue={editingItem?.title ?? ""} />
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="eventType">Type</label>
                  <select id="eventType" name="itemType" required defaultValue={editingItem?.item_type ?? "event"}>
                    {calendarItemTypes.map((option) => (
                      <option key={option.id} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="eventStatus">Status</label>
                  <select id="eventStatus" name="status" defaultValue={editingItem?.status ?? "planned"}>
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="checkbox-field">
                <input name="allDay" type="checkbox" defaultChecked={allDay} />
                <span>All day</span>
              </label>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="eventStartsAt">Start</label>
                  <input id="eventStartsAt" name="startsAt" type="datetime-local" defaultValue={startsAt} />
                </div>
                <div className="field">
                  <label htmlFor="eventEndsAt">End</label>
                  <input id="eventEndsAt" name="endsAt" type="datetime-local" defaultValue={endsAt} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="eventDueAt">Due</label>
                <input id="eventDueAt" name="dueAt" type="datetime-local" defaultValue={dueAt} />
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="eventDepartment">Department</label>
                  <select id="eventDepartment" name="departmentId" defaultValue={selectValue(editingItem?.department_id)}>
                    <option value="">Select department</option>
                    {departments.map((option) => (
                      <option key={option.id} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="eventLocation">Location</label>
                  <select id="eventLocation" name="locationId" defaultValue={selectValue(editingItem?.location_id)}>
                    <option value="">Select location</option>
                    {locations.map((option) => (
                      <option key={option.id} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="eventTimelineGroup">Timeline group</label>
                <select
                  id="eventTimelineGroup"
                  onChange={(event) => setTimelineMode(event.target.value)}
                  value={selectedTimelineGroupId}
                >
                  <option value="">Ungrouped</option>
                  {timelineGroups.map((option) => (
                    <option key={option.id} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  <option value="new">Add new timeline group...</option>
                </select>
                <input
                  name="timelineGroupId"
                  type="hidden"
                  value={selectedTimelineGroupId === "new" ? "" : selectedTimelineGroupId}
                />
              </div>
              {selectedTimelineGroupId === "new" ? (
                <div className="field">
                  <label htmlFor="eventNewTimelineGroup">New timeline group</label>
                  <input id="eventNewTimelineGroup" name="newTimelineGroupName" placeholder="Tech Week" required />
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="eventDescription">Description</label>
                <textarea id="eventDescription" name="description" rows={3} defaultValue={editingItem?.description ?? ""} />
              </div>
              <label className="checkbox-field">
                <input
                  name="includeRunOfShow"
                  checked={includeRunOfShow}
                  onChange={(event) => setIncludeRunOfShow(event.target.checked)}
                  type="checkbox"
                />
                <span>Include in Run of Show</span>
              </label>
              {includeRunOfShow ? (
                <div className="run-fields">
                  <div className="form-row">
                    <div className="field">
                      <label htmlFor="eventCueNumber">Cue</label>
                      <input id="eventCueNumber" name="cueNumber" defaultValue={editingItem?.cue_number ?? ""} />
                    </div>
                    <div className="field">
                      <label htmlFor="eventRunOrder">Run order</label>
                      <input
                        id="eventRunOrder"
                        min="0"
                        name="runOfShowOrder"
                        type="number"
                        defaultValue={editingItem?.run_of_show_order ?? ""}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="eventDuration">Duration</label>
                    <input
                      id="eventDuration"
                      min="0"
                      name="durationMinutes"
                      placeholder="Minutes"
                      type="number"
                      defaultValue={editingItem?.duration_minutes ?? ""}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="eventRunNotes">Run-of-show notes</label>
                    <textarea
                      id="eventRunNotes"
                      name="runOfShowNotes"
                      rows={3}
                      defaultValue={editingItem?.run_of_show_notes ?? ""}
                    />
                  </div>
                </div>
              ) : null}
              <div className="modal-actions">
                {editingItem ? (
                  <button className="button danger" disabled={saving} onClick={deleteEvent} type="button">
                    Delete
                  </button>
                ) : null}
                <button disabled={saving} type="submit">
                  {saving ? "Saving..." : "Save event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
