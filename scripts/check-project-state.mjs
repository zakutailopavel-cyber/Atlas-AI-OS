import { readFileSync } from 'node:fs';

const path = 'docs/PROJECT_STATE.md';
const text = readFileSync(path, 'utf8');
const errors = [];

function requireIncludes(needle, label = needle) {
  if (!text.includes(needle)) errors.push(`Missing required content: ${label}`);
}

const conflictMarkers = [
  { pattern: /^<<<<<<< .+$/m, label: '<<<<<<< HEAD-style start marker' },
  { pattern: /^=======$/m, label: '======= separator marker' },
  { pattern: /^>>>>>>> .+$/m, label: '>>>>>>> branch-style end marker' },
];

for (const { pattern, label } of conflictMarkers) {
  if (pattern.test(text)) errors.push(`PROJECT_STATE.md contains Git conflict marker: ${label}.`);
}

for (const section of [
  '# Atlas AI OS — состояние проекта',
  '## Паспорт проекта',
  '## Как пользоваться этим файлом',
  '## Продуктовое назначение',
  '## Архитектура сейчас',
  '## Состояние областей',
  '## Открытые PR и решения',
  '## Известные риски и технический долг',
  '## Текущие приоритеты',
  '## Бюджетные ограничения',
  '## Журнал существенных изменений',
  '## Шаблон передачи состояния после работы',
]) requireIncludes(section);

for (const field of [
  'Область:',
  'Цель:',
  'Что изменено:',
  'Что не изменялось:',
  'Проверки:',
  'Расход GPU/API:',
  'Риски или миграции:',
  'Следующий шаг:',
]) requireIncludes(field, `handoff report field ${field}`);

const journalHeader = '| Дата | Область | Состояние | Изменение | PR/коммит |';
const journalStart = text.indexOf(journalHeader);
if (journalStart === -1) {
  errors.push('Missing project journal table header.');
} else {
  const rest = text.slice(journalStart);
  const nextSection = rest.indexOf('\n## ', 1);
  const journal = nextSection === -1 ? rest : rest.slice(0, nextSection);
  const entries = journal.split('\n').filter((line) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line));
  if (entries.length > 15) errors.push(`Project journal has ${entries.length} entries; maximum is 15.`);
}

if (errors.length > 0) {
  console.error(`Project state check failed for ${path}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Project state check passed for ${path}.`);
