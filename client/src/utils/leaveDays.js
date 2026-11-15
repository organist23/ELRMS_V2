// Number of leave days between two dates ("YYYY-MM-DD", both inclusive).
// LGU rule: Saturdays count (offices sometimes work Saturdays), Sundays do not.
// Maternity Leave is counted in calendar days, so Sundays are included for it.
export const CALENDAR_DAY_LEAVES = ['Maternity Leave'];

export const countLeaveDays = (dateFrom, dateTo, leaveType) => {
  if (!dateFrom || !dateTo) return 0;
  // Build local dates from the parts, so the weekday never shifts with the timezone.
  const toLocal = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  let start = toLocal(dateFrom);
  let end = toLocal(dateTo);
  if (end < start) [start, end] = [end, start];
  const countSundays = CALENDAR_DAY_LEAVES.includes(leaveType);
  let days = 0;
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (countSundays || d.getDay() !== 0) days++;
  }
  return days;
};
