import React from 'react';

// Privilege credit tiles ("SPECIAL 3 / 3", ...) shown in the Employees details panel and the Edit modal.
// Maternity and SP. Benefits are shown for women, Paternity for men.
// Missing values: tiles with defaultZero use `value || 0`; the details panel passes allDefaultZero
// (every tile), the Edit modal does not (only Paternity and SP. Benefits fall back to 0 there).
const TILES = [
  { label: 'SPECIAL', field: 'special_leave', max: 3 },
  { label: 'FORCE', field: 'force_leave', max: 5 },
  { label: 'WELLNESS', field: 'wellness_leave', max: 5 },
  { label: 'SOLO PARENT', field: 'solo_parent_leave', max: 7 },
  { label: 'MATERNITY', field: 'maternity_leave', max: 105, sex: 'Female' },
  { label: 'PATERNITY', field: 'paternity_leave', max: 7, sex: 'Male', defaultZero: true },
  { label: 'SP. BENEFITS (WOMEN)', field: 'special_benefits_for_women', max: 30, sex: 'Female', defaultZero: true },
];

const PrivilegeTiles = ({ employee, tileStyle, labelStyle, valueStyle, allDefaultZero = false }) => (
  <>
    {TILES.filter(t => !t.sex || employee.sex === t.sex).map(t => (
      <div key={t.field} style={tileStyle}>
        <div className="label mb-4" style={labelStyle}>{t.label}</div>
        <div className="font-bold" style={valueStyle}>
          {Number((allDefaultZero || t.defaultZero) ? (employee[t.field] || 0) : employee[t.field])} / {t.max}
        </div>
      </div>
    ))}
  </>
);

export default PrivilegeTiles;
