"use client";

import { useState, type CSSProperties } from "react";

export type ProjectGanttItem = {
  id: string;
  title: string;
  item_type: string;
  department: string;
  location: string;
  starts_at: string | null;
  ends_at: string | null;
  due_at: string | null;
};

export type ProjectGanttSection = {
  id: string;
  name: string;
  color_key: string;
  is_active: boolean;
  is_ungrouped: boolean;
  items: ProjectGanttItem[];
  range: { start: string; end: string } | null;
};

export type ProjectGanttTimeline = {
  start: string;
  weeks: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
}

function formatDate(value: string | null) {
  const date = parseDate(value);
  if (!date) {
    return "Unscheduled";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function itemRange(item: ProjectGanttItem) {
  const start = parseDate(item.starts_at) ?? parseDate(item.due_at) ?? parseDate(item.ends_at);
  const end = parseDate(item.ends_at) ?? parseDate(item.due_at) ?? parseDate(item.starts_at);

  if (!start || !end) {
    return null;
  }

  return { start, end: end < start ? start : end };
}

function ganttStyle(range: { start: Date; end: Date }, timelineStart: Date): CSSProperties {
  const startWeek = Math.floor(daysBetween(timelineStart, range.start) / 7);
  const spanWeeks = Math.max(1, Math.ceil((daysBetween(range.start, range.end) + 1) / 7));

  return {
    gridColumn: `${startWeek + 1} / span ${spanWeeks}`
  };
}

export function ProjectGantt({
  sections,
  timeline
}: {
  sections: ProjectGanttSection[];
  timeline: ProjectGanttTimeline;
}) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());
  const timelineStart = parseDate(timeline.start) ?? new Date();

  function toggleSection(sectionId: string) {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  return (
    <div className="gantt" style={{ "--gantt-columns": timeline.weeks.length } as CSSProperties}>
      <div className="gantt-label">Workstream</div>
      <div className="gantt-weeks">
        {timeline.weeks.map((week) => (
          <span key={week}>{formatDate(week)}</span>
        ))}
      </div>
      {sections.length ? (
        sections.map((section) => {
          const isExpanded = expandedSections.has(section.id);
          const sectionRange = section.range
            ? { start: parseDate(section.range.start), end: parseDate(section.range.end) }
            : null;

          return (
            <div className="gantt-section" key={section.id}>
              <button
                aria-expanded={isExpanded}
                className="gantt-row gantt-group-row gantt-toggle-row"
                onClick={() => toggleSection(section.id)}
                type="button"
              >
                <div className="gantt-title">
                  <strong>
                    <span className="gantt-caret" aria-hidden="true">
                      {isExpanded ? "v" : ">"}
                    </span>
                    {section.name}
                    {!section.is_active ? <span className="gantt-badge">Archived</span> : null}
                  </strong>
                  <span>
                    {section.items.length} event{section.items.length === 1 ? "" : "s"}
                    {section.range ? ` · ${formatDate(section.range.start)} to ${formatDate(section.range.end)}` : ""}
                  </span>
                </div>
                <div className="gantt-track">
                  {sectionRange?.start && sectionRange.end ? (
                    <div
                      className={`gantt-bar gantt-group-bar gantt-group-${section.color_key}`}
                      style={ganttStyle({ start: sectionRange.start, end: sectionRange.end }, timelineStart)}
                      title={`${section.name}: ${formatDate(section.range?.start ?? null)} to ${formatDate(
                        section.range?.end ?? null
                      )}`}
                    >
                      <span>{section.name}</span>
                    </div>
                  ) : (
                    <span className="gantt-unscheduled">No scheduled items</span>
                  )}
                </div>
              </button>
              {isExpanded
                ? section.items.map((item) => {
                    const range = itemRange(item);

                    return (
                      <div className="gantt-row gantt-child-row" key={item.id}>
                        <div className="gantt-title gantt-child-title">
                          <strong>{item.title}</strong>
                          <span>
                            {titleCase(item.item_type)}
                            {item.department ? ` · ${item.department}` : ""}
                            {item.location ? ` · ${item.location}` : ""}
                          </span>
                        </div>
                        <div className="gantt-track">
                          {range ? (
                            <div
                              className={`gantt-bar gantt-${item.item_type}`}
                              style={ganttStyle(range, timelineStart)}
                              title={`${item.title}: ${formatDate(range.start.toISOString())} to ${formatDate(
                                range.end.toISOString()
                              )}`}
                            >
                              <span>{item.title}</span>
                            </div>
                          ) : (
                            <span className="gantt-unscheduled">Unscheduled</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                : null}
            </div>
          );
        })
      ) : (
        <div className="empty-state">Add calendar items to build the first production timeline.</div>
      )}
    </div>
  );
}
