/* Student Management System
   All student data here is dummy data used for the DevOps lab.
   Records are kept in the browser with localStorage - there is no backend. */

const STORAGE_KEY = 'sms.students';

const SEED = [
  { roll: '101', name: 'Riya Sharma',  cls: '10-A', marks: 82 },
  { roll: '102', name: 'Arjun Mehta',  cls: '10-A', marks: 74 },
  { roll: '103', name: 'Neha Patil',   cls: '10-B', marks: 91 }
];

function loadStudents() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
    return SEED.slice();
  }
  return JSON.parse(raw);
}

function saveStudents(students) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
}

let students = loadStudents();

/* ---------- feature code ---------- */

/* SMS-3 - render the student table */

function renderStudents(list) {
  const body = document.getElementById('student-rows');
  const empty = document.getElementById('empty-state');
  body.innerHTML = '';

  if (list.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.forEach(function (student) {
    const row = document.createElement('tr');
    row.innerHTML =
      '<td>' + student.roll + '</td>' +
      '<td>' + student.name + '</td>' +
      '<td>' + student.cls + '</td>' +
      '<td>' + student.marks + '</td>';
    body.appendChild(row);
  });
}

function init() {
  renderStudents(students);
  console.log('SMS ready -', students.length, 'students loaded');
}

document.addEventListener('DOMContentLoaded', init);
