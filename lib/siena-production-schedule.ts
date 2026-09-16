const DATE_PATTERN=/^\d{4}-\d{2}-\d{2}$/;

function parseDate(value:string){
  if(!DATE_PATTERN.test(value))throw new Error("Opening night must be a valid date.");
  const [year,month,day]=value.split("-").map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new Error("Opening night must be a valid date.");
  return date;
}

function offset(date:Date,days:number){
  const result=new Date(date);
  result.setUTCDate(result.getUTCDate()+days);
  return result;
}

function format(date:Date){
  return new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}).format(date);
}

function iso(date:Date){return date.toISOString().slice(0,10);}

export type SienaScheduleEvent={label:string;event_date:string;starts_at:string;ends_at:string;schedule_category:"designer_run"|"tech"|"dress"|"photo_call"|"performance"|"strike";applies_to:"cast"|"all"};

export function buildSienaProductionEvents(openingOn:string):SienaScheduleEvent[]{
  const opening=parseDate(openingOn);
  if(opening.getUTCDay()!==4)throw new Error("The standard Siena production schedule requires a Thursday opening night.");
  return [
    ["Designer Run",-8,"18:00","22:00","designer_run","all"],
    ["Tech 1",-6,"18:00","22:00","tech","all"],
    ["Tech 2",-5,"10:00","22:00","tech","all"],
    ["Tech 3",-4,"10:00","22:00","tech","all"],
    ["Dress 1",-3,"18:00","23:00","dress","all"],
    ["Dress 2",-2,"18:00","23:00","dress","all"],
    ["Preview / Photo Call",-1,"18:00","23:00","photo_call","all"],
    ["Performance 1 (Opening Night)",0,"18:00","23:00","performance","all"],
    ["Performance 2",1,"18:00","23:00","performance","all"],
    ["Performance 3",2,"18:00","23:00","performance","all"],
    ["Performance 4 (Matinee)",3,"13:00","18:00","performance","all"],
    ["Performance 5",7,"18:00","23:00","performance","all"],
    ["Performance 6",8,"18:00","23:00","performance","all"],
    ["Performance 7 (Closing Night)",9,"18:00","23:00","performance","all"],
    ["Strike",10,"12:00","18:00","strike","all"]
  ].map(([label,days,starts_at,ends_at,schedule_category,applies_to])=>({label:String(label),event_date:iso(offset(opening,Number(days))),starts_at:String(starts_at),ends_at:String(ends_at),schedule_category:schedule_category as SienaScheduleEvent["schedule_category"],applies_to:applies_to as SienaScheduleEvent["applies_to"]}));
}

export function isThursdayOpening(value:string){return parseDate(value).getUTCDay()===4;}

export function buildSienaProductionSchedule(openingOn:string){
  const opening=parseDate(openingOn);
  if(opening.getUTCDay()!==4)throw new Error("The standard Siena production schedule requires a Thursday opening night.");

  return {
    rehearsalSchedule:[
      "Mondays: 6:00pm to 10:00pm",
      "Tuesdays: 6:00pm to 10:00pm",
      "Wednesdays: 6:00pm to 10:00pm",
      "Thursdays: 6:00pm to 10:00pm",
      "Sunday: 10:00am to 2:00pm"
    ].join("\n"),
    techSchedule:[
      `Designer Run: ${format(offset(opening,-8))}, 6:00pm to 10:00pm`,
      `Tech 1: ${format(offset(opening,-6))}, 6:00pm to 10:00pm`,
      `Tech 2: ${format(offset(opening,-5))}, 10:00am to 10:00pm`,
      `Tech 3: ${format(offset(opening,-4))}, 10:00am to 10:00pm`,
      `Dress 1: ${format(offset(opening,-3))}, 6:00pm to 11:00pm`,
      `Dress 2: ${format(offset(opening,-2))}, 6:00pm to 11:00pm`,
      `Preview/Photo Call: ${format(offset(opening,-1))}, 6:00pm to 11:00pm`
    ].join("\n"),
    performanceSchedule:[
      `Performance 1 (Opening Night): ${format(opening)}, 6:00pm to 11:00pm`,
      `Performance 2: ${format(offset(opening,1))}, 6:00pm to 11:00pm`,
      `Performance 3: ${format(offset(opening,2))}, 6:00pm to 11:00pm`,
      `Performance 4 (Matinee): ${format(offset(opening,3))}, 1:00pm to 6:00pm`,
      `Performance 5: ${format(offset(opening,7))}, 6:00pm to 11:00pm`,
      `Performance 6: ${format(offset(opening,8))}, 6:00pm to 11:00pm`,
      `Performance 7 (Closing Night): ${format(offset(opening,9))}, 6:00pm to 11:00pm`,
      `Strike: ${format(offset(opening,10))}, 12:00pm to 6:00pm`
    ].join("\n")
  };
}
