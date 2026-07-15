export type ProjectSchedule = {
  rehearsals?: string;
  tech_and_dress?: string;
  performances_and_strike?: string;
};

export function hasProjectSchedule(schedule?: ProjectSchedule | null) {
  return Boolean(schedule && Object.values(schedule).some((value) => value?.trim()));
}

export function ProjectScheduleDisplay({ schedule }: { schedule: ProjectSchedule }) {
  return <>
    {schedule.rehearsals?.trim() ? <div className="schedule-block"><h3>Rehearsals</h3><p>{schedule.rehearsals}</p></div> : null}
    {schedule.tech_and_dress?.trim() ? <div className="schedule-block"><h3>Tech and dress</h3><p>{schedule.tech_and_dress}</p></div> : null}
    {schedule.performances_and_strike?.trim() ? <div className="schedule-block"><h3>Performances and strike</h3><p>{schedule.performances_and_strike}</p></div> : null}
  </>;
}
