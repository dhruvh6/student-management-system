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

/* SMS-1 - teacher login */

const CREDENTIALS = { username: 'teacher', password: 'sms123' };

function handleLogin() {
  const user = document.getElementById('username').value.trim();
  const pass = document.getElementById('password').value;
  const error = document.getElementById('login-error');

  if (user === CREDENTIALS.username && pass === CREDENTIALS.password) {
    error.textContent = '';
    document.getElementById('login-panel').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('session-label').textContent = 'Signed in as ' + user;
  } else {
    error.textContent = 'Wrong username or password.';
  }
}

function setupLogin() {
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('password').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') handleLogin();
  });
}

/* SMS-3 - render the student table */

function renderStudents(list) {
  const body = document.getElementById('student-rows');
  const empty = document.getElementById('empty-state');
  body.innerHTML = '';

  /* SMS-11 - the report always describes every student, so it is handed the
     full list rather than the filtered one passed in here. */
  renderReport(students);

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
      '<td>' + student.marks + '</td>' +
      '<td>' +
        '<button class="small ghost" data-edit="' + student.roll + '">Edit</button> ' +
        '<button class="small danger" data-delete="' + student.roll + '">Delete</button>' +
      '</td>';
    body.appendChild(row);
  });
}

/* SMS-2 - add a new student */

function clearForm() {
  document.getElementById('add-roll').value = '';
  document.getElementById('add-name').value = '';
  document.getElementById('add-cls').value = '';
  document.getElementById('add-marks').value = '';
  document.getElementById('add-error').textContent = '';
}

function addStudent() {
  const roll = document.getElementById('add-roll').value.trim();
  const name = document.getElementById('add-name').value.trim();
  const cls = document.getElementById('add-cls').value.trim();
  const marks = document.getElementById('add-marks').value.trim();
  const error = document.getElementById('add-error');

  if (!roll || !name || !cls || !marks) {
    error.textContent = 'Every field is required.';
    return;
  }

  if (students.some(function (s) { return s.roll === roll; })) {
    error.textContent = 'Roll number ' + roll + ' already exists.';
    return;
  }

  students.push({ roll: roll, name: name, cls: cls, marks: Number(marks) });
  saveStudents(students);
  applySearch();
  clearForm();
}

function setupAdd() {
  document.getElementById('add-btn').addEventListener('click', addStudent);
}

/* SMS-6 - filter the table by name or roll number */

function applySearch() {
  const term = document.getElementById('search-box').value.trim().toLowerCase();

  if (!term) {
    renderStudents(students);
    return;
  }

  const matches = students.filter(function (s) {
    return s.name.toLowerCase().includes(term) || s.roll.toLowerCase().includes(term);
  });

  renderStudents(matches);
}

function setupSearch() {
  document.getElementById('search-box').addEventListener('input', applySearch);
}

/* SMS-7 - edit a student record */

function startEdit(roll) {
  const student = students.find(function (s) { return s.roll === roll; });
  if (!student) return;

  const name = prompt('Name', student.name);
  if (name === null) return;
  const cls = prompt('Class', student.cls);
  if (cls === null) return;
  const marks = prompt('Marks', student.marks);
  if (marks === null) return;

  if (!name.trim() || !cls.trim() || !marks.trim()) {
    alert('Every field is required. Nothing was changed.');
    return;
  }

  students = students.map(function (s) {
    if (s.roll !== roll) return s;
    return { roll: s.roll, name: name.trim(), cls: cls.trim(), marks: Number(marks) };
  });

  saveStudents(students);
  applySearch();
}

function setupRowActions() {
  document.getElementById('student-rows').addEventListener('click', function (event) {
    const editRoll = event.target.getAttribute('data-edit');
    const deleteRoll = event.target.getAttribute('data-delete');
    if (editRoll) startEdit(editRoll);
    if (deleteRoll) deleteStudent(deleteRoll);
  });
}

/* SMS-8 - remove a student after confirming */

function deleteStudent(roll) {
  const student = students.find(function (s) { return s.roll === roll; });
  if (!student) return;

  if (!confirm('Remove ' + student.name + ' (roll ' + roll + ')?')) return;

  students = students.filter(function (s) { return s.roll !== roll; });
  saveStudents(students);
  applySearch();
}

/* SMS-11 - class-wise performance report */

const PASS_MARK = 35;

function buildReport(list) {
  const groups = {};

  list.forEach(function (student) {
    const marks = Number(student.marks);

    if (!groups[student.cls]) {
      groups[student.cls] = { count: 0, graded: 0, total: 0, high: null, low: null, passed: 0 };
    }

    const group = groups[student.cls];
    group.count += 1;

    /* The add and edit forms do not check that marks are numeric, so a record
       can hold something that is not a number. Those students are still
       counted, but they stay out of the marks figures so they cannot drag an
       average to NaN. */
    if (!Number.isFinite(marks)) return;

    group.graded += 1;
    group.total += marks;
    if (marks >= PASS_MARK) group.passed += 1;
    if (group.high === null || marks > group.high) group.high = marks;
    if (group.low === null || marks < group.low) group.low = marks;
  });

  return Object.keys(groups).sort().map(function (cls) {
    const group = groups[cls];
    return {
      cls: cls,
      count: group.count,
      average: group.graded ? group.total / group.graded : null,
      high: group.high,
      low: group.low,
      passed: group.passed
    };
  });
}

function renderReport(list) {
  const body = document.getElementById('report-rows');
  const empty = document.getElementById('report-empty');
  const overall = document.getElementById('report-overall');
  const rows = buildReport(list);

  body.innerHTML = '';

  if (rows.length === 0) {
    empty.classList.remove('hidden');
    overall.textContent = '';
    return;
  }
  empty.classList.add('hidden');

  rows.forEach(function (row) {
    const tr = document.createElement('tr');
    const cells = [
      row.cls,
      row.count,
      row.average === null ? '-' : row.average.toFixed(1),
      row.high === null ? '-' : row.high,
      row.low === null ? '-' : row.low,
      row.passed + ' / ' + row.count
    ];

    cells.forEach(function (value) {
      const cell = document.createElement('td');
      /* textContent, not innerHTML - a class name is typed by the teacher and
         could otherwise inject markup into this table. */
      cell.textContent = value;
      tr.appendChild(cell);
    });

    body.appendChild(tr);
  });

  const graded = list.filter(function (s) { return Number.isFinite(Number(s.marks)); });
  const total = graded.reduce(function (sum, s) { return sum + Number(s.marks); }, 0);

  const count = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };

  overall.textContent =
    count(list.length, 'student', 'students') + ' across ' +
    count(rows.length, 'class', 'classes') +
    (graded.length ? ', overall average ' + (total / graded.length).toFixed(1) : '');
}

function init() {
  setupLogin();
  renderStudents(students);
  setupAdd();
  setupSearch();
  setupRowActions();
  console.log('SMS ready -', students.length, 'students loaded');
}

document.addEventListener('DOMContentLoaded', init);
