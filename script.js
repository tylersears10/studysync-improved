// Utility to get and set data in localStorage with JSON
function getData(key, defaultValue) {
  const value = localStorage.getItem(key);
  if (!value) return defaultValue;
  try {
    return JSON.parse(value);
  } catch (e) {
    return defaultValue;
  }
}

function setData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ------------------------------------------------------------
 * Course Selection
 * ----------------------------------------------------------*/
// Called on select_course.html load
function initCoursePage() {
  // Load schools array; if none, initialize with examples
  let schools = getData('schools', null);
  if (!schools || schools.length === 0) {
    schools = [
      'Goffstown High School',
      'Harvard University',
      'MIT',
      'Stanford University',
    ];
    setData('schools', schools);
  }
  // Populate school select
  const schoolSelect = document.getElementById('school');
  schoolSelect.innerHTML = '';
  schools.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    schoolSelect.appendChild(opt);
  });
  // Pre-select previously selected
  const currentSchool = localStorage.getItem('currentSchool');
  if (currentSchool && schools.includes(currentSchool)) {
    schoolSelect.value = currentSchool;
  }
  populateClasses();
}

// Populate class options based on selected school
function populateClasses() {
  const schoolSelect = document.getElementById('school');
  const classSelect = document.getElementById('class');
  const selectedSchool = schoolSelect.value;
  let classes = getData(`classes_${selectedSchool}`, null);
  if (!classes || classes.length === 0) {
    // default classes
    classes = [
      'Biology 101',
      'Chemistry 101',
      'History 201',
      'Mathematics 202',
    ];
    setData(`classes_${selectedSchool}`, classes);
  }
  classSelect.innerHTML = '';
  classes.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    classSelect.appendChild(opt);
  });
  // Pre-select previously selected class
  const currentClass = localStorage.getItem('currentClass');
  if (currentClass && classes.includes(currentClass)) {
    classSelect.value = currentClass;
  }
}

function showAddForm() {
  document.getElementById('addForm').classList.remove('hidden');
}

function addSchoolClass() {
  const newSchoolInput = document.getElementById('newSchool');
  const newClassInput = document.getElementById('newClass');
  const newSchool = newSchoolInput.value.trim();
  const newClass = newClassInput.value.trim();
  let schools = getData('schools', []);
  let added = false;
  if (newSchool) {
    if (!schools.includes(newSchool)) {
      schools.push(newSchool);
      setData('schools', schools);
    }
    // also create empty classes list
    let cls = getData(`classes_${newSchool}`, []);
    if (!cls.includes(newClass) && newClass) {
      cls.push(newClass);
      setData(`classes_${newSchool}`, cls);
    }
    added = true;
  } else if (newClass) {
    // Add class to currently selected school
    const school = document.getElementById('school').value;
    let cls = getData(`classes_${school}`, []);
    if (!cls.includes(newClass)) {
      cls.push(newClass);
      setData(`classes_${school}`, cls);
    }
    added = true;
  }
  // Reset form and hide
  if (added) {
    newSchoolInput.value = '';
    newClassInput.value = '';
    document.getElementById('addForm').classList.add('hidden');
    initCoursePage();
  }
}

function saveCourse() {
  const school = document.getElementById('school').value;
  const cls = document.getElementById('class').value;
  if (!school || !cls) {
    alert('Please select a school and class');
    return;
  }
  localStorage.setItem('currentSchool', school);
  localStorage.setItem('currentClass', cls);
  // redirect to upload
  window.location.href = 'upload.html';
}

/* ------------------------------------------------------------
 * Note Upload & Processing
 * ----------------------------------------------------------*/
// When a file is selected, this triggers extraction and sets noteText
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  const status = document.getElementById('statusMsg');
  status.textContent = 'Reading file...';
  // Use FileReader to read file as arrayBuffer or text depending on ext
  const reader = new FileReader();
  reader.onerror = () => {
    status.textContent = 'Failed to read file';
  };
  if (ext === 'txt') {
    reader.onload = () => {
      document.getElementById('noteText').value = reader.result;
      status.textContent = 'Loaded text file';
    };
    reader.readAsText(file);
  } else if (ext === 'docx' || ext === 'doc') {
    // read as array buffer and use mammoth
    reader.onload = async () => {
      const arrayBuffer = reader.result;
      try {
        const result = await mammoth.extractRawText({ arrayBuffer });
        document.getElementById('noteText').value = result.value;
        status.textContent = 'Extracted text from Word document';
      } catch (err) {
        console.error(err);
        status.textContent = 'Failed to parse Word document';
      }
    };
    reader.readAsArrayBuffer(file);
  } else if (ext === 'pdf') {
    // read as array buffer and use pdf.js
    reader.onload = async () => {
      const arrayBuffer = reader.result;
      try {
        const typedarray = new Uint8Array(arrayBuffer);
        const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item) => item.str);
          text += strings.join(' ') + '\n';
        }
        document.getElementById('noteText').value = text;
        status.textContent = 'Extracted text from PDF';
      } catch (err) {
        console.error(err);
        status.textContent = 'Failed to parse PDF';
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    status.textContent = 'Unsupported file type';
  }
}

function processNotes() {
  const noteArea = document.getElementById('noteText');
  const text = noteArea.value.trim();
  if (!text) {
    alert('Please upload a file or paste your notes');
    return;
  }
  // Save current note to localStorage
  setData('currentNote', text);
  // Append to notes of this class
  const school = localStorage.getItem('currentSchool');
  const cls = localStorage.getItem('currentClass');
  if (school && cls) {
    const key = `notes_${school}_${cls}`;
    let notesArr = getData(key, []);
    notesArr.push({ id: Date.now(), text });
    setData(key, notesArr);
  }
  document.getElementById('statusMsg').textContent = 'Notes processed and saved!';
}

/* ------------------------------------------------------------
 * Quiz Generation
 * ----------------------------------------------------------*/
// Basic list of common stopwords to exclude from blanks
const stopwords = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'are',
  'which',
  'have',
  'has',
  'were',
  'was',
  'is',
  'a',
  'an',
  'in',
  'on',
  'of',
  'to',
  'as',
  'at',
  'be',
  'by',
  'it',
  'or',
  'we',
  'you',
  'they',
  'he',
  'she',
  'his',
  'her',
  'their',
  'ours',
  'my',
  'our',
]);

function generateQuiz() {
  const text = document.getElementById('noteText').value.trim();
  if (!text) {
    alert('Please process your notes first!');
    return;
  }
  // Normalize whitespace and remove line breaks
  const normalized = text.replace(/\s+/g, ' ');
  // Split into sentences by punctuation .!? but keep actual char
  const sentences = normalized.split(/(?<=[.!?])/g).map((s) => s.trim());
  // Filter out very short sentences
  const validSentences = sentences.filter((s) => s.split(' ').length >= 5);
  if (validSentences.length === 0) {
    alert('Not enough content to generate questions.');
    return;
  }
  const allWords = normalized
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w.toLowerCase()));
  const uniqueWords = [...new Set(allWords)];
  const questions = [];
  const maxQuestions = Math.min(8, validSentences.length);
  const usedSentences = new Set();
  // generate up to maxQuestions
  while (questions.length < maxQuestions && usedSentences.size < validSentences.length) {
    const idx = Math.floor(Math.random() * validSentences.length);
    if (usedSentences.has(idx)) continue;
    usedSentences.add(idx);
    const sentence = validSentences[idx];
    // choose a keyword from sentence (not a stopword)
    const words = sentence
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopwords.has(w.toLowerCase()));
    if (words.length === 0) continue;
    const keyword = words[Math.floor(Math.random() * words.length)];
    // create blanked sentence by replacing keyword with ____ (only first occurrence)
    const blanked = sentence.replace(
      new RegExp(`\\b${escapeRegExp(keyword)}\\b`),
      '_____'
    );
    // choose distractors: randomly pick 3 different words from uniqueWords not equal to keyword
    const distractors = [];
    const available = uniqueWords.filter((w) => w.toLowerCase() !== keyword.toLowerCase());
    // shuffle available
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    for (const w of available) {
      if (distractors.length >= 3) break;
      if (!stopwords.has(w.toLowerCase())) distractors.push(w);
    }
    // assemble options
    const options = [keyword, ...distractors.slice(0, 3)];
    // shuffle options
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    const correctIndex = options.indexOf(keyword);
    questions.push({
      sentence,
      blanked,
      options,
      correctIndex,
      topicWord: keyword.toLowerCase(),
      explanation: `The correct answer is "${keyword}" because the original sentence is: ${sentence}`,
    });
  }
  if (questions.length === 0) {
    alert('Failed to generate questions.');
    return;
  }
  // Save quiz data to localStorage
  setData('currentQuiz', questions);
  setData('quizProgress', 0);
  setData('quizStats', { total: questions.length, correct: 0, wrong: 0 });
  setData('quizWrongQuestions', []);
  // Redirect to quiz page
  window.location.href = 'quiz.html';
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------
 * Quiz Display and Interaction
 * ----------------------------------------------------------*/
function loadQuizPage() {
  const quizContainer = document.getElementById('quizContainer');
  const questions = getData('currentQuiz', []);
  let progress = getData('quizProgress', 0);
  let stats = getData('quizStats', { total: 0, correct: 0, wrong: 0 });
  // If no quiz loaded, show message
  if (!questions || questions.length === 0) {
    quizContainer.innerHTML = '<p class="text-gray-600">No quiz loaded. Please return to upload page.</p>';
    return;
  }
  function renderQuestion() {
    // Base case: finished all questions
    if (progress >= questions.length) {
      // update global analytics
      updateAnalytics(stats, getData('quizWrongQuestions', []));
      // Show summary
      const percent = Math.round((stats.correct / stats.total) * 100);
      quizContainer.innerHTML = `
        <div class="text-center">
          <h3 class="text-2xl font-bold mb-4">Quiz Complete!</h3>
          <p class="mb-4">You scored <span class="font-semibold">${stats.correct}</span> out of ${stats.total} questions (${percent}%).</p>
          <div class="space-y-3">
            <button class="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700" onclick="restartQuiz()">Restart Quiz</button>
            <button class="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700" onclick="focusWrongQuestions()">New Quiz: Focus on Mistakes</button>
            <a class="block w-full px-4 py-2 bg-gray-200 text-center rounded-md hover:bg-gray-300" href="upload.html">Upload New Notes</a>
          </div>
        </div>
      `;
      return;
    }
    const q = questions[progress];
    quizContainer.innerHTML = '';
    const qDiv = document.createElement('div');
    qDiv.className = 'space-y-4';
    const header = document.createElement('div');
    header.className = 'flex justify-between items-center';
    const questionNum = document.createElement('span');
    questionNum.className = 'text-sm text-gray-500';
    questionNum.textContent = `Question ${progress + 1} of ${questions.length}`;
    header.appendChild(questionNum);
    qDiv.appendChild(header);
    // Show the blanked sentence
    const p = document.createElement('p');
    p.className = 'text-lg font-medium';
    p.textContent = q.blanked;
    qDiv.appendChild(p);
    // options list
    const form = document.createElement('div');
    form.className = 'space-y-2';
    q.options.forEach((opt, index) => {
      const label = document.createElement('label');
      label.className = 'flex items-center space-x-2 cursor-pointer';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'answer';
      input.value = index;
      label.appendChild(input);
      const span = document.createElement('span');
      span.textContent = opt;
      label.appendChild(span);
      form.appendChild(label);
    });
    qDiv.appendChild(form);
    // feedback container
    const feedback = document.createElement('div');
    feedback.className = 'text-sm mt-2 hidden';
    qDiv.appendChild(feedback);
    // buttons
    const btn = document.createElement('button');
    btn.textContent = 'Submit';
    btn.className = 'mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700';
    btn.onclick = () => {
      const selected = document.querySelector('input[name="answer"]:checked');
      if (!selected) {
        alert('Please select an option');
        return;
      }
      const selectedIndex = parseInt(selected.value);
      const correct = selectedIndex === q.correctIndex;
      feedback.classList.remove('hidden');
      feedback.innerHTML = correct
        ? `<span class="text-green-600 font-semibold">Correct!</span> ${q.explanation}`
        : `<span class="text-red-600 font-semibold">Incorrect.</span> ${q.explanation}`;
      // disable options
      form.querySelectorAll('input').forEach((inp) => {
        inp.disabled = true;
        if (parseInt(inp.value) === q.correctIndex) {
          // highlight correct answer
          inp.parentElement.classList.add('bg-green-100');
        } else if (parseInt(inp.value) === selectedIndex) {
          inp.parentElement.classList.add('bg-red-100');
        }
      });
      // update stats
      stats.total = questions.length;
      if (correct) {
        stats.correct += 1;
      } else {
        stats.wrong += 1;
        // push to wrong questions array
        const wrongList = getData('quizWrongQuestions', []);
        wrongList.push(q);
        setData('quizWrongQuestions', wrongList);
      }
      // save stats
      setData('quizStats', stats);
      // change button to Next
      btn.textContent = progress === questions.length - 1 ? 'Finish' : 'Next';
      btn.onclick = () => {
        progress += 1;
        setData('quizProgress', progress);
        renderQuestion();
      };
    };
    qDiv.appendChild(btn);
    quizContainer.appendChild(qDiv);
  }
  renderQuestion();
}

function restartQuiz() {
  // Reset progress and stats
  setData('quizProgress', 0);
  const questions = getData('currentQuiz', []);
  setData('quizStats', { total: questions.length, correct: 0, wrong: 0 });
  setData('quizWrongQuestions', []);
  loadQuizPage();
}

function focusWrongQuestions() {
  const wrongQs = getData('quizWrongQuestions', []);
  if (!wrongQs || wrongQs.length === 0) {
    alert('No wrong questions to focus on.');
    return;
  }
  // set wrong questions as current quiz
  setData('currentQuiz', wrongQs);
  setData('quizProgress', 0);
  setData('quizStats', { total: wrongQs.length, correct: 0, wrong: 0 });
  setData('quizWrongQuestions', []);
  loadQuizPage();
}

/* ------------------------------------------------------------
 * Analytics
 * ----------------------------------------------------------*/
function updateAnalytics(stats, wrongQuestions) {
  // global analytics
  const analytics = getData('analytics', {
    totalQuestions: 0,
    correct: 0,
    wrong: 0,
    wrongTopics: {},
  });
  analytics.totalQuestions += stats.total;
  analytics.correct += stats.correct;
  analytics.wrong += stats.wrong;
  // update wrong topics counts
  wrongQuestions.forEach((q) => {
    const w = q.topicWord;
    if (!analytics.wrongTopics[w]) analytics.wrongTopics[w] = 0;
    analytics.wrongTopics[w] += 1;
  });
  setData('analytics', analytics);
  // Also update analytics per class
  const school = localStorage.getItem('currentSchool');
  const cls = localStorage.getItem('currentClass');
  if (school && cls) {
    const key = `analytics_${school}_${cls}`;
    let local = getData(key, {
      totalQuestions: 0,
      correct: 0,
      wrong: 0,
      wrongTopics: {},
    });
    local.totalQuestions += stats.total;
    local.correct += stats.correct;
    local.wrong += stats.wrong;
    wrongQuestions.forEach((q) => {
      const w = q.topicWord;
      if (!local.wrongTopics[w]) local.wrongTopics[w] = 0;
      local.wrongTopics[w] += 1;
    });
    setData(key, local);
  }
}

function loadAnalyticsPage() {
  const container = document.getElementById('analyticsContent');
  const global = getData('analytics', null);
  if (!global) {
    container.innerHTML = '<p class="text-gray-600">No analytics data available yet. Take some quizzes first!</p>';
    return;
  }
  const { totalQuestions, correct, wrong, wrongTopics } = global;
  const accuracy = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;
  // compute top wrong topics
  const entries = Object.entries(wrongTopics);
  entries.sort((a, b) => b[1] - a[1]);
  const top5 = entries.slice(0, 5);
  // Build HTML
  let html = '';
  html += `<div class="space-y-4">
    <p>Total questions answered: <strong>${totalQuestions}</strong></p>
    <p>Correct answers: <strong>${correct}</strong></p>
    <p>Incorrect answers: <strong>${wrong}</strong></p>
    <p>Overall accuracy: <strong>${accuracy}%</strong></p>
  </div>`;
  if (top5.length > 0) {
    html += '<h3 class="text-xl font-semibold mt-6 mb-2">Commonly Missed Topics</h3>';
    html += '<ul class="list-disc list-inside space-y-1 text-gray-700">';
    top5.forEach(([word, count]) => {
      html += `<li><strong>${word}</strong> — missed ${count} times</li>`;
    });
    html += '</ul>';
  }
  container.innerHTML = html;
}

// Auto-run functions based on page
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.endsWith('select_course.html')) {
    initCoursePage();
  } else if (path.endsWith('quiz.html')) {
    loadQuizPage();
  } else if (path.endsWith('analytics.html')) {
    loadAnalyticsPage();
  }
});