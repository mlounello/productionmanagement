export function firstAndLastName(person:{first_name?:string|null;last_name?:string|null;full_name?:string|null}){
  const first=String(person.first_name??"").trim();
  const last=String(person.last_name??"").trim();
  const structured=[first,last].filter(Boolean).join(" ");
  return structured||String(person.full_name??"").trim();
}
