// Value for an <input type="date"> from a date the API sends.
// The server returns DATE columns as local midnight in ISO form, e.g. 2026-01-05 in Manila arrives as
// "2026-01-04T16:00:00.000Z". Taking the UTC part (toISOString) would give the day before, so read the
// date in local time instead.
export const toDateInputValue = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
