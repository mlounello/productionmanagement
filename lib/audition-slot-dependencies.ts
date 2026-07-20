export type AuditionSlotChoice={id:string;sessionId:string;label:string;startsAt:string};

export function auditionDay(value:string){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value));const get=(type:string)=>parts.find((part)=>part.type===type)?.value??"";return `${get("year")}-${get("month")}-${get("day")}`;}

export function filterAuditionSlotChoices(choices:AuditionSlotChoice[],dependencyFilter:"same_day"|"mapped_sessions",dependencyDay:string,dependencySessionId:string,sessionMap:Record<string,string[]>){if(!dependencySessionId)return choices;if(dependencyFilter==="mapped_sessions"){const allowed=new Set(sessionMap[dependencySessionId]??[]);return choices.filter((choice)=>allowed.has(choice.sessionId));}return dependencyDay?choices.filter((choice)=>auditionDay(choice.startsAt)===dependencyDay):choices;}
