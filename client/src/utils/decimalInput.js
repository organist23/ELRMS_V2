// Keeps only digits and the first dot of a typed value (used by the VL/SL credit inputs).
// "1a2.3.4-5x" -> "12.345"
export const filterDecimalInput = (value) => {
  const val = value.replace(/[^0-9.]/g, '');
  const parts = val.split('.');
  return parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
};
