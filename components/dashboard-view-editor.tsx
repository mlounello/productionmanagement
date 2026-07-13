"use client";

import { useState } from "react";
import { dashboardModuleDefinitions, type DashboardLayoutItem, type DashboardModuleSize } from "@/lib/dashboard-modules";

export function DashboardViewEditor({ layout, saveAction }: { layout: DashboardLayoutItem[]; saveAction: (formData: FormData) => void }) {
  const [items, setItems] = useState(layout);
  const used = new Set(items.map((item) => item.key));

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setItems(next);
  }

  return (
    <form action={saveAction} className="stacked-form">
      <input type="hidden" name="layout" value={JSON.stringify(items)} />
      <div className="dashboard-builder-list">
        {items.map((item, index) => {
          const definition = dashboardModuleDefinitions.find((candidate) => candidate.key === item.key);
          return (
            <div className="dashboard-builder-row" key={item.key}>
              <div><strong>{definition?.label ?? item.key}</strong><span>{definition?.description}</span></div>
              <select aria-label={`${definition?.label} size`} value={item.size} onChange={(event) => setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, size: event.target.value as DashboardModuleSize } : entry))}>
                <option value="compact">Compact</option><option value="half">Half width</option><option value="full">Full width</option>
              </select>
              <div className="top-actions"><button className="button secondary" disabled={index === 0} onClick={() => move(index, -1)} type="button">↑</button><button className="button secondary" disabled={index === items.length - 1} onClick={() => move(index, 1)} type="button">↓</button><button className="button danger" onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))} type="button">Remove</button></div>
            </div>
          );
        })}
      </div>
      <label className="field"><span>Add module</span><select value="" onChange={(event) => { const key = event.target.value as DashboardLayoutItem["key"]; if (key) setItems((current) => [...current, { key, size: "half" }]); }}><option value="">Choose module</option>{dashboardModuleDefinitions.filter((item) => !used.has(item.key)).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <button type="submit">Save dashboard layout</button>
    </form>
  );
}
