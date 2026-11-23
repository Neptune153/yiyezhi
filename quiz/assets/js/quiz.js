/* 长征 90 周年刷题页 · 逐题作答、交卷判分、历史成绩、无框架、无外部请求 */
(function () {
  "use strict";

  var DATA = window.YIYEZHI_QUIZ;
  var root = document.getElementById("quiz-root");
  if (!DATA || !root) {
    if (root) root.textContent = "题库数据没有加载成功，请确认 content/quiz-longmarch.js 存在。";
    return;
  }

  var DRAFT_KEY = "yy_quiz_longmarch_v2";
  var SCRATCH_KEY = "yy_quiz_scratch_longmarch";
  var HISTORY_KEY = "yy_quiz_longmarch_history";
  var questions = [];
  DATA.sections.forEach(function (section) {
    section.questions.forEach(function (q) {
      questions.push({
        id: section.id + "-" + q.n,
        global: questions.length + 1,
        n: q.n,
        type: q.type,
        section: section.id,
        sectionTitle: section.title,
        stem: q.stem,
        choices: q.choices,
        answer: q.answer,
        answerText: q.answerText,
        analysis: q.analysis
      });
    });
  });

  var FILTERS = [
    { key: "all", label: "全部", type: null },
    { key: "single", label: "只刷单选", type: "single" },
    { key: "multi", label: "只刷多选", type: "multi" },
    { key: "judge", label: "只刷判断", type: "judge" }
  ];

  var TYPE_LABEL = { single: "单选", multi: "多选", judge: "判断" };

  var state = {
    answers: {},
    uncertain: {},
    submitted: false,
    currentId: null,
    filter: "all",
    startedAt: Date.now(),
    scratch: ""
  };

  var page = null;
  var progressEl = null;
  var submitBtn = null;
  var historyBtn = null;
  var filterBar = null;
  var cardHost = null;
  var navEl = null;
  var sidePrev = null;
  var sideNext = null;
  var paletteEl = null;
  var paletteCountEl = null;
  var summaryEl = null;
  var scratchModal = null;
  var scratchArea = null;
  var historyModal = null;
  var historyList = null;
  var toastEl = null;
  var toastTimer = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function findQuestion(id) {
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].id === id) return questions[i];
    }
    return null;
  }

  function filterQuestions() {
    var filter = null;
    FILTERS.forEach(function (item) {
      if (item.key === state.filter) filter = item.type;
    });
    if (!filter) return questions.slice();
    return questions.filter(function (q) { return q.type === filter; });
  }

  function currentQuestion() {
    var list = filterQuestions();
    if (!list.length) return null;
    var q = findQuestion(state.currentId);
    if (!q || list.indexOf(q) < 0) {
      q = list[0];
      state.currentId = q.id;
    }
    return q;
  }

  function selected(q) {
    return state.answers[q.id] || [];
  }

  function isChecked(q) {
    return !!state.submitted;
  }

  function isCorrect(q, picked) {
    var expected = q.answer.split("").sort().join("");
    var actual = picked.slice().sort().join("");
    return expected === actual;
  }

  function optionLabel(q, key) {
    if (q.type === "judge") return key === "A" ? "√" : "×";
    return key;
  }

  function answerLabel(q) {
    if (q.type === "judge") return q.answerText;
    return q.answer;
  }

  function typeText(q) {
    return TYPE_LABEL[q.type] || "单选";
  }

  function doneCount(list) {
    var done = 0;
    list.forEach(function (q) { if (selected(q).length) done++; });
    return done;
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        startedAt: state.startedAt,
        answers: state.answers,
        submitted: state.submitted,
        uncertain: state.uncertain,
        currentId: state.currentId,
        filter: state.filter,
        scratch: state.scratch
      }));
    } catch (e) {}
  }

  function loadDraft() {
    try {
      var raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (!raw || typeof raw.startedAt !== "number") {
        var legacy = JSON.parse(localStorage.getItem("yy_quiz_longmarch_v1") || "null");
        if (legacy && legacy.answers) raw = legacy;
      }
      if (!raw || typeof raw.startedAt !== "number") return;
      if (Date.now() - raw.startedAt > 24 * 36e5) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      state.startedAt = raw.startedAt;
      var valid = {};
      Object.keys(raw.answers || {}).forEach(function (id) {
        var q = findQuestion(id);
        if (!q) return;
        var arr = (raw.answers[id] || []).filter(function (key) {
          return q.choices.some(function (c) { return c.key === key; });
        });
        if (arr.length) valid[id] = arr;
      });
      state.answers = valid;

      state.submitted = raw.submitted === true;
      if (!state.submitted) state.submitted = false;

      var uncertain = {};
      Object.keys(raw.uncertain || {}).forEach(function (id) {
        if (findQuestion(id) && raw.uncertain[id]) uncertain[id] = true;
      });
      state.uncertain = uncertain;

      if (FILTERS.some(function (f) { return f.key === raw.filter; })) {
        state.filter = raw.filter;
      }
      if (raw.currentId && findQuestion(raw.currentId)) {
        state.currentId = raw.currentId;
      }
      if (typeof raw.scratch === "string") {
        state.scratch = raw.scratch;
      }
      try {
        var scratch = localStorage.getItem(SCRATCH_KEY);
        if (scratch && !state.scratch) state.scratch = scratch;
      } catch (e) {}
    } catch (e) {}
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(SCRATCH_KEY);
    } catch (e) {}
  }

  function saveScratch() {
    try {
      localStorage.setItem(SCRATCH_KEY, state.scratch);
    } catch (e) {}
  }

  function readHistory() {
    try {
      var list = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function pushHistory(record) {
    var list = readHistory();
    list.unshift(record);
    if (list.length > 20) list = list.slice(0, 20);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatDuration(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return pad2(m) + ":" + pad2(s);
  }

  function formatDateTime(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function wrongNumbers(record) {
    return (record.wrong || []).slice().sort(function (a, b) { return a - b; });
  }

  function compactNumbers(numbers) {
    if (!numbers.length) return "";
    var out = [];
    var start = numbers[0];
    var prev = numbers[0];
    for (var i = 1; i < numbers.length; i++) {
      var n = numbers[i];
      if (n === prev + 1) {
        prev = n;
        continue;
      }
      out.push(start === prev ? String(start) : start + "–" + prev);
      start = prev = n;
    }
    out.push(start === prev ? String(start) : start + "–" + prev);
    return out.join("、");
  }

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastEl.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove("show");
      toastEl.hidden = true;
    }, 1800);
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      toast("已复制题目，可反馈给维护者");
    } catch (e) {
      toast("复制失败，请手动选择题目文字");
    }
    document.body.removeChild(area);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast("已复制题目，可反馈给维护者");
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function reportQuestion(q) {
    var lines = [
      "【长征100题 · 报错】",
      "第 " + q.global + " 题（" + typeText(q) + "）",
      q.stem,
      ""
    ];
    q.choices.forEach(function (c) {
      lines.push(optionLabel(q, c.key) + "．" + c.text);
    });
    lines.push("");
    lines.push("答案：" + answerLabel(q));
    copyText(lines.join("\n"));
  }

  function openScratch() {
    if (!scratchModal) return;
    scratchArea.value = state.scratch;
    scratchModal.hidden = false;
    document.body.classList.add("quiz-modal-open");
    scratchArea.focus();
  }

  function closeScratch() {
    if (!scratchModal) return;
    scratchModal.hidden = true;
    document.body.classList.remove("quiz-modal-open");
  }

  function buildScratch() {
    scratchModal = el("div", "quiz-modal");
    scratchModal.hidden = true;
    scratchModal.setAttribute("role", "dialog");
    scratchModal.setAttribute("aria-modal", "true");
    scratchModal.setAttribute("aria-label", "草稿纸");

    var panel = el("div", "quiz-modal-panel");
    var head = el("div", "quiz-modal-head");
    head.appendChild(el("b", null, "草稿纸"));
    var close = el("button", "quiz-modal-close", "关闭");
    close.type = "button";
    close.setAttribute("data-scratch-close", "1");
    head.appendChild(close);
    panel.appendChild(head);

    scratchArea = el("textarea", "quiz-scratch-area");
    scratchArea.placeholder = "在这里写写画画，内容只保存在本机浏览器里。";
    scratchArea.setAttribute("aria-label", "草稿纸内容");
    panel.appendChild(scratchArea);

    var foot = el("div", "quiz-modal-foot");
    var clearBtn = el("button", "quiz-modal-link", "清空");
    clearBtn.type = "button";
    clearBtn.setAttribute("data-scratch-clear", "1");
    foot.appendChild(clearBtn);
    foot.appendChild(el("span", "quiz-modal-note", "自动保存，不会上传"));
    panel.appendChild(foot);
    scratchModal.appendChild(panel);
    document.body.appendChild(scratchModal);

    scratchArea.addEventListener("input", function () {
      state.scratch = scratchArea.value;
      saveScratch();
      saveDraft();
    });
    scratchModal.addEventListener("click", function (event) {
      if (event.target === scratchModal) closeScratch();
      if (event.target.closest("[data-scratch-close]")) closeScratch();
      if (event.target.closest("[data-scratch-clear]")) {
        scratchArea.value = "";
        state.scratch = "";
        saveScratch();
        saveDraft();
        scratchArea.focus();
      }
    });
  }

  function buildToast() {
    toastEl = el("div", "quiz-toast");
    toastEl.hidden = true;
    toastEl.setAttribute("role", "status");
    document.body.appendChild(toastEl);
  }

  function renderHistoryList() {
    if (!historyList) return;
    clear(historyList);
    var list = readHistory();
    if (!list.length) {
      historyList.appendChild(el("p", "quiz-history-empty", "还没有交卷记录。做完一套后交卷，这里会保留最近 20 次的成绩和错题号。"));
      return;
    }
    list.forEach(function (record) {
      var item = el("div", "quiz-history-item");
      var row = el("div", "quiz-history-row");
      row.appendChild(el("b", null, formatDateTime(record.at)));
      row.appendChild(el("span", "quiz-history-score",
        "得分 " + record.correct + " / " + record.total));
      item.appendChild(row);

      var wrongs = wrongNumbers(record);
      var summary = "正确 " + record.correct + " · 错题 " + wrongs.length + " · 用时 " + formatDuration(record.duration || 0);
      if (record.unanswered) summary += " · 未答 " + record.unanswered;
      item.appendChild(el("div", "quiz-history-sub", summary));
      if (wrongs.length) {
        item.appendChild(el("div", "quiz-history-wrong",
          "错题：" + compactNumbers(wrongs)));
      }
      historyList.appendChild(item);
    });
  }

  function openHistory() {
    if (!historyModal) return;
    renderHistoryList();
    historyModal.hidden = false;
    document.body.classList.add("quiz-modal-open");
  }

  function closeHistory() {
    if (!historyModal) return;
    historyModal.hidden = true;
    document.body.classList.remove("quiz-modal-open");
  }

  function buildHistory() {
    historyModal = el("div", "quiz-modal");
    historyModal.hidden = true;
    historyModal.setAttribute("role", "dialog");
    historyModal.setAttribute("aria-modal", "true");
    historyModal.setAttribute("aria-label", "历次成绩");

    var panel = el("div", "quiz-modal-panel quiz-history-panel");
    var head = el("div", "quiz-modal-head");
    head.appendChild(el("b", null, "历次成绩"));
    var close = el("button", "quiz-modal-close", "关闭");
    close.type = "button";
    close.setAttribute("data-history-close", "1");
    head.appendChild(close);
    panel.appendChild(head);

    historyList = el("div", "quiz-history-list");
    panel.appendChild(historyList);
    panel.appendChild(el("div", "quiz-modal-foot",
      "只保存在本机浏览器，最多保留最近 20 次。"));
    historyModal.appendChild(panel);
    document.body.appendChild(historyModal);

    historyModal.addEventListener("click", function (event) {
      if (event.target === historyModal) closeHistory();
      if (event.target.closest("[data-history-close]")) closeHistory();
    });
  }

  function renderFilters() {
    clear(filterBar);
    FILTERS.forEach(function (filter) {
      var btn = el("button", "quiz-filter", filter.label);
      btn.type = "button";
      btn.setAttribute("data-filter", filter.key);
      btn.classList.toggle("active", state.filter === filter.key);
      btn.setAttribute("aria-pressed", state.filter === filter.key ? "true" : "false");
      filterBar.appendChild(btn);
    });
  }

  function renderCard(q, index, list) {
    clear(cardHost);
    var card = el("section", "quiz-card");
    card.setAttribute("aria-label", "第 " + (index + 1) + " 题");

    var head = el("div", "quiz-card-head");
    head.appendChild(el("span", "quiz-type " + q.type, typeText(q)));
    head.appendChild(el("span", "quiz-pos", (index + 1) + " / " + list.length));
    head.appendChild(el("span", "quiz-cat", "长征专题"));
    head.appendChild(el("span", "quiz-card-spacer"));

    var report = el("button", "quiz-report", "报错");
    report.type = "button";
    report.setAttribute("data-report", q.id);
    report.title = "复制题目，反馈给维护者";
    head.appendChild(report);

    var star = el("button", "quiz-star" + (state.uncertain[q.id] ? " on" : ""),
      state.uncertain[q.id] ? "★" : "☆");
    star.type = "button";
    star.setAttribute("data-star", q.id);
    star.title = state.uncertain[q.id] ? "取消不确定标记" : "标记为不确定";
    star.setAttribute("aria-label", star.title);
    head.appendChild(star);
    card.appendChild(head);

    card.appendChild(el("div", "quiz-stem", q.stem));
    if (q.type === "multi") {
      card.appendChild(el("p", "quiz-multi-note", "多选题：全部选对才得分，少选、错选均不得分。"));
    }

    var picked = selected(q);
    var checked = isChecked(q);
    var opts = el("div", "quiz-opts");
    q.choices.forEach(function (choice) {
      var btn = el("button", "quiz-opt");
      btn.type = "button";
      btn.setAttribute("data-key", choice.key);
      btn.setAttribute("aria-pressed", picked.indexOf(choice.key) >= 0 ? "true" : "false");
      var on = picked.indexOf(choice.key) >= 0;

      if (checked) {
        var correctKey = q.answer.indexOf(choice.key) >= 0;
        if (correctKey && on) btn.classList.add("right");
        else if (correctKey && !on) btn.classList.add("missed");
        else if (!correctKey && on) btn.classList.add("wrong");
      } else if (on) {
        btn.classList.add("picked");
      }
      btn.disabled = checked;

      btn.appendChild(el("span", "quiz-opt-letter", optionLabel(q, choice.key)));
      btn.appendChild(el("span", "quiz-opt-text", choice.text));
      opts.appendChild(btn);
    });
    card.appendChild(opts);

    if (checked) {
      var ok = isCorrect(q, picked);
      var result = el("div", "quiz-result " + (ok ? "ok" : "no"));
      var resultHead = el("div", "quiz-result-head");
      resultHead.appendChild(el("b", null, ok ? "✓ 回答正确" : "✗ 回答错误"));
      resultHead.appendChild(el("span", null, " · 正确答案 " + answerLabel(q)));
      result.appendChild(resultHead);
      result.appendChild(el("div", "quiz-result-line",
        "你的答案：" + (picked.length ? picked.map(function (k) { return optionLabel(q, k); }).join("") : "未作答")));

      if (q.analysis) {
        var analysis = el("div", "quiz-analysis");
        q.analysis.split("\n").forEach(function (line) {
          if (line.trim()) analysis.appendChild(el("p", null, line.trim()));
        });
        result.appendChild(analysis);
      }
      card.appendChild(result);
    }

    cardHost.appendChild(card);
  }

  function renderNav(q, index, list) {
    clear(navEl);
    var prev = el("button", "quiz-pager-btn", "← 上一题");
    prev.type = "button";
    prev.setAttribute("data-prev", "1");
    prev.disabled = index <= 0;
    navEl.appendChild(prev);

    var uncertain = el("button", "quiz-uncertain" + (state.uncertain[q.id] ? " on" : ""),
      state.uncertain[q.id] ? "★ 不确定" : "☆ 不确定");
    uncertain.type = "button";
    uncertain.setAttribute("data-uncertain", q.id);
    navEl.appendChild(uncertain);

    var next = el("button", "quiz-pager-btn primary", "下一题 →");
    next.type = "button";
    next.setAttribute("data-next", "1");
    next.disabled = index >= list.length - 1;
    navEl.appendChild(next);
  }

  function renderPalette(list) {
    clear(paletteEl);
    list.forEach(function (q, i) {
      var btn = el("button", "quiz-palette-item", String(i + 1));
      btn.type = "button";
      btn.setAttribute("data-jump", q.id);
      btn.setAttribute("aria-label", "第 " + (i + 1) + " 题");
      if (q.id === state.currentId) btn.classList.add("is-current");
      if (isChecked(q)) {
        btn.classList.add(isCorrect(q, selected(q)) ? "is-correct" : "is-wrong");
      } else if (selected(q).length) {
        btn.classList.add("is-selected");
      }
      if (state.uncertain[q.id]) btn.classList.add("is-uncertain");
      paletteEl.appendChild(btn);
    });
    if (paletteCountEl) {
      if (state.submitted) {
        var correct = 0;
        questions.forEach(function (item) {
          if (isCorrect(item, selected(item))) correct++;
        });
        paletteCountEl.textContent = "正确 " + correct + " / " + questions.length;
      } else {
        paletteCountEl.textContent = "已做 " + doneCount(list) + " / " + list.length;
      }
    }
  }

  function renderSummary() {
    clear(summaryEl);
    if (!state.submitted) {
      summaryEl.hidden = true;
      return;
    }
    var correct = 0;
    var wrong = 0;
    questions.forEach(function (q) {
      if (isCorrect(q, selected(q))) correct++;
      else wrong++;
    });
    var elapsed = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
    summaryEl.hidden = false;
    var text = el("div", "quiz-summary-text");
    var head = el("b", null, "已交卷 · 得分 " + correct + " / " + questions.length);
    text.appendChild(head);
    text.appendChild(el("span", null,
      "正确 " + correct + " 题 · 错题 " + wrong + " 题 · 用时 " + formatDuration(elapsed)));
    summaryEl.appendChild(text);

    var redo = el("button", "quiz-summary-reset", "重做整套");
    redo.type = "button";
    redo.setAttribute("data-reset-all", "1");
    summaryEl.appendChild(redo);

    if (wrong) {
      var redoWrong = el("button", "quiz-summary-reset", "重做错题");
      redoWrong.type = "button";
      redoWrong.setAttribute("data-reset-wrong", "1");
      summaryEl.appendChild(redoWrong);
    }

    var history = el("button", "quiz-summary-history", "历次成绩");
    history.type = "button";
    history.setAttribute("data-history", "1");
    summaryEl.appendChild(history);
  }

  function renderSide(index, list) {
    if (sidePrev) sidePrev.disabled = index <= 0;
    if (sideNext) sideNext.disabled = index >= list.length - 1;
  }

  function renderAll() {
    var list = filterQuestions();
    var q = currentQuestion();
    if (!q) return;
    var index = list.indexOf(q);
    if (state.submitted) {
      var correct = 0;
      questions.forEach(function (item) {
        if (isCorrect(item, selected(item))) correct++;
      });
      progressEl.textContent = "已交卷 · 正确 " + correct + " / " + questions.length + " · 得分 " + correct;
    } else {
      progressEl.textContent = "第 " + (index + 1) + " / " + list.length + " 题 · 已作答 " + doneCount(list);
    }
    if (submitBtn) {
      submitBtn.disabled = state.submitted;
      submitBtn.textContent = state.submitted ? "已交卷" : "交卷";
    }
    renderFilters();
    renderCard(q, index, list);
    renderNav(q, index, list);
    renderSide(index, list);
    renderPalette(list);
    renderSummary();
  }

  function go(delta) {
    var list = filterQuestions();
    var q = currentQuestion();
    if (!q) return;
    var index = list.indexOf(q) + delta;
    if (index < 0 || index >= list.length) return;
    state.currentId = list[index].id;
    saveDraft();
    renderAll();
    cardHost.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function jumpTo(id) {
    var q = findQuestion(id);
    if (!q) return;
    state.currentId = id;
    saveDraft();
    renderAll();
    cardHost.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function pickOption(key) {
    var q = currentQuestion();
    if (!q || isChecked(q)) return;
    var arr = selected(q).slice();
    if (q.type === "multi") {
      var at = arr.indexOf(key);
      if (at >= 0) arr.splice(at, 1);
      else arr.push(key);
      arr.sort();
    } else {
      arr = [key];
    }
    if (arr.length) state.answers[q.id] = arr;
    else delete state.answers[q.id];
    saveDraft();
    renderAll();
  }

  function submitQuiz() {
    if (state.submitted) return;
    var unanswered = questions.length - doneCount(questions);
    if (unanswered > 0) {
      if (!window.confirm("还有 " + unanswered + " 题未作答，确定交卷？未作答按错题计。")) return;
    } else if (!window.confirm("确定交卷？交卷后本次答案将锁定并显示解析。")) {
      return;
    }

    var correct = 0;
    var wrong = [];
    questions.forEach(function (q) {
      if (isCorrect(q, selected(q))) correct++;
      else wrong.push(q.global);
    });
    var elapsed = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));

    state.submitted = true;
    saveDraft();
    pushHistory({
      at: Date.now(),
      total: questions.length,
      correct: correct,
      wrong: wrong,
      unanswered: unanswered,
      duration: elapsed
    });
    renderAll();
    summaryEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function resetQuiz(onlyWrong) {
    var targets = questions;
    if (onlyWrong) {
      targets = questions.filter(function (q) { return !isCorrect(q, selected(q)); });
      if (!targets.length) {
        toast("全对，没有需要重做的错题");
        return;
      }
      if (!window.confirm("重做这 " + targets.length + " 道错题？其他题的答案会保留。")) return;
    } else {
      if (!window.confirm("重做整套？当前答案和本次判分将清空，历次成绩保留。")) return;
      state.uncertain = {};
      state.filter = "all";
    }

    targets.forEach(function (q) { delete state.answers[q.id]; });
    state.submitted = false;
    state.startedAt = Date.now();
    state.currentId = targets[0].id;
    state.filter = "all";
    saveDraft();
    renderAll();
    cardHost.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleUncertain(id) {
    var q = findQuestion(id);
    if (!q) return;
    if (state.uncertain[q.id]) delete state.uncertain[q.id];
    else state.uncertain[q.id] = true;
    saveDraft();
    renderAll();
  }

  function setFilter(key) {
    if (state.filter === key) return;
    state.filter = key;
    state.currentId = null;
    saveDraft();
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildPage() {
    clear(root);
    page = el("div", "page quiz-page");

    var crumb = el("div", "crumb");
    var home = el("a", null, "政治");
    home.href = "../index.html";
    crumb.appendChild(home);
    crumb.appendChild(el("span", "sep", " / "));
    var shelf = el("a", null, "刷题");
    shelf.href = "../index.html";
    crumb.appendChild(shelf);
    crumb.appendChild(el("span", "sep", " / "));
    crumb.appendChild(el("span", null, "长征 90 周年"));
    page.appendChild(crumb);

    var head = el("div", "quiz-head");
    head.appendChild(el("h1", "quiz-title", DATA.title));
    head.appendChild(el("p", "quiz-sub", "单选 60 · 多选 20 · 判断 20 · 逐题作答，交卷后统一对答案"));
    page.appendChild(head);

    var meta = el("div", "quiz-meta");
    progressEl = el("div", "quiz-progress", "第 1 / 100 题 · 已作答 0");
    meta.appendChild(progressEl);
    meta.appendChild(el("span", "quiz-meta-spacer"));

    historyBtn = el("button", "quiz-history-link", "历次成绩");
    historyBtn.type = "button";
    historyBtn.setAttribute("data-history", "1");
    meta.appendChild(historyBtn);

    submitBtn = el("button", "quiz-submit", "交卷");
    submitBtn.type = "button";
    submitBtn.setAttribute("data-submit", "1");
    meta.appendChild(submitBtn);

    var scratch = el("button", "quiz-scratch", "草稿纸");
    scratch.type = "button";
    scratch.setAttribute("data-scratch-open", "1");
    meta.appendChild(scratch);
    page.appendChild(meta);

    filterBar = el("div", "quiz-filters");
    filterBar.setAttribute("role", "group");
    filterBar.setAttribute("aria-label", "题型筛选");
    page.appendChild(filterBar);

    cardHost = el("div", "quiz-card-host");
    page.appendChild(cardHost);

    sidePrev = el("button", "quiz-side prev", "‹");
    sidePrev.type = "button";
    sidePrev.setAttribute("data-prev", "1");
    sidePrev.setAttribute("aria-label", "上一题");
    page.appendChild(sidePrev);

    sideNext = el("button", "quiz-side next", "›");
    sideNext.type = "button";
    sideNext.setAttribute("data-next", "1");
    sideNext.setAttribute("aria-label", "下一题");
    page.appendChild(sideNext);

    navEl = el("div", "quiz-pager");
    page.appendChild(navEl);

    var paletteBox = el("div", "quiz-palette-box");
    var paletteHead = el("div", "quiz-palette-head");
    paletteHead.appendChild(el("span", null, "题目列表"));
    paletteCountEl = el("span", "quiz-palette-count", "");
    paletteHead.appendChild(paletteCountEl);
    paletteBox.appendChild(paletteHead);
    paletteEl = el("div", "quiz-palette");
    paletteBox.appendChild(paletteEl);
    page.appendChild(paletteBox);

    summaryEl = el("div", "quiz-summary");
    summaryEl.hidden = true;
    page.appendChild(summaryEl);

    page.appendChild(el("p", "quiz-foot",
      "题目来自《" + DATA.source + "》 · 本页为本地离线版 · 答案与解析只在本机显示。"));
    root.appendChild(page);
  }

  function bindEvents() {
    root.addEventListener("click", function (event) {
      var filter = event.target.closest("[data-filter]");
      if (filter) { setFilter(filter.getAttribute("data-filter")); return; }

      var jump = event.target.closest("[data-jump]");
      if (jump) { jumpTo(jump.getAttribute("data-jump")); return; }

      var opt = event.target.closest(".quiz-opt");
      if (opt) { pickOption(opt.getAttribute("data-key")); return; }

      if (event.target.closest("[data-submit]")) { submitQuiz(); return; }
      if (event.target.closest("[data-history]")) { openHistory(); return; }
      if (event.target.closest("[data-reset-all]")) { resetQuiz(false); return; }
      if (event.target.closest("[data-reset-wrong]")) { resetQuiz(true); return; }
      if (event.target.closest("[data-prev]")) { go(-1); return; }
      if (event.target.closest("[data-next]")) { go(1); return; }

      var uncertain = event.target.closest("[data-uncertain]");
      if (uncertain) { toggleUncertain(uncertain.getAttribute("data-uncertain")); return; }

      var star = event.target.closest("[data-star]");
      if (star) { toggleUncertain(star.getAttribute("data-star")); return; }

      var report = event.target.closest("[data-report]");
      if (report) {
        var reportQuestionObj = findQuestion(report.getAttribute("data-report"));
        if (reportQuestionObj) reportQuestion(reportQuestionObj);
        return;
      }

      if (event.target.closest("[data-scratch-open]")) { openScratch(); }
    });

    document.addEventListener("keydown", function (event) {
      if (historyModal && !historyModal.hidden) {
        if (event.key === "Escape") closeHistory();
        return;
      }
      if (!scratchModal || !scratchModal.hidden) {
        if (event.key === "Escape") closeScratch();
        return;
      }
      var tag = (event.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
      else if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
      else if (event.key === "Enter") {
        if (tag === "button" || tag === "a") return;
        event.preventDefault();
        go(1);
      } else if (/^[a-dA-D]$/.test(event.key)) {
        var q = currentQuestion();
        if (q && !isChecked(q)) {
          event.preventDefault();
          pickOption(event.key.toUpperCase());
        }
      }
    });
  }

  loadDraft();
  buildScratch();
  buildHistory();
  buildToast();
  buildPage();
  bindEvents();
  renderAll();
})();

