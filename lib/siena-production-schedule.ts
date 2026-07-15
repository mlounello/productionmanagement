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
