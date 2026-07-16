"use client";

import { useId, useState } from "react";

export function AuditionCategoryInput({ defaultValue, categories }: { defaultValue: string; categories: string[] }) {
  const [value, setValue] = useState(defaultValue);
  const listId = useId();
  return <>
    <input name="bookingCategory" value={value} onChange={(event) => setValue(event.target.value)} list={listId} autoComplete="off" required />
    <datalist id={listId}>{categories.map((category) => <option key={category} value={category} />)}</datalist>
  </>;
}
