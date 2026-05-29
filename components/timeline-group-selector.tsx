"use client";

import { useState } from "react";

export type TimelineGroupOption = {
  id: string;
  name: string;
  is_active: boolean;
};

export function TimelineGroupSelector({
  groups,
  newInputId = "newTimelineGroupName",
  selectId = "timelineGroupId"
}: {
  groups: TimelineGroupOption[];
  newInputId?: string;
  selectId?: string;
}) {
  const [mode, setMode] = useState("ungrouped");

  return (
    <>
      <div className="field">
        <label htmlFor={selectId}>Timeline group</label>
        <select id={selectId} onChange={(event) => setMode(event.target.value)} value={mode}>
          <option value="ungrouped">Ungrouped</option>
          {groups
            .filter((group) => group.is_active)
            .map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          <option value="new">Add new timeline group...</option>
        </select>
      </div>
      <input name="timelineGroupId" type="hidden" value={mode === "new" || mode === "ungrouped" ? "" : mode} />
      {mode === "new" ? (
        <div className="field">
          <label htmlFor={newInputId}>New timeline group</label>
          <input id={newInputId} name="newTimelineGroupName" placeholder="Tech Week" required />
        </div>
      ) : null}
    </>
  );
}
