/* 一页纸背诵站 · 渲染与交互（无框架、无外部请求） */
/* 澄潇宇《27考研一页纸》本地背诵站
 * 数据由 tools/extract_content.py 从 PDF 生成，前端只负责排版与路由。
 * 站点级配置（右上角外链等）见 assets/js/config.js。
 */
(function () {
  "use strict";

  var DATA = window.YIYEZHI;
  var CONFIG = window.YIYEZHI_CONFIG || {};
  var LAST_KEY = "yy_last_read:" + (DATA.book.code || "default");
  var EMOJI_BASE = "content/emoji/";
  var appEl = document.getElementById("app");
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightbox-img");
  var sideToc = document.getElementById("side-toc");
  var tocToggle = document.getElementById("toc-toggle");
  var tocOverlay = document.getElementById("toc-overlay");
  var topLinksEl = document.getElementById("top-links");
  var toastEl = document.getElementById("toast");
  var toastTimer = null;

  if (!DATA || !DATA.book || !Array.isArray(DATA.parts)) {
    appEl.textContent = "数据文件 content/data.js 未加载，请确认文件完整。";
    return;
  }

  /* ---------- 数据索引 ---------- */

  var sections = [];
  var pendingJump = null;
  DATA.parts.forEach(function (part) {
    part.sections.forEach(function (sec) {
      sec.part = part;
      sec.key = sec.id;
      sec.pointCount = sec.points.length;
      sections.push(sec);
    });
  });
  sections.forEach(function (sec, i) {
    sec.prev = sections[i - 1] || null;
    sec.next = sections[i + 1] || null;
  });

  function sectionById(id) {
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].id === id) return sections[i];
    }
    return null;
  }

  /* ---------- 小工具 ---------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    requestAnimationFrame(function () {
      toastEl.classList.add("is-show");
    });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-show");
      setTimeout(function () {
        toastEl.hidden = true;
      }, 180);
    }, 1800);
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      /* 忽略：下面仍然显示提示，用户可从控制台/源文件查找 */
    }
    document.body.removeChild(area);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function crumb(items) {
    var box = el("nav", "crumb");
    box.setAttribute("aria-label", "面包屑");
    items.forEach(function (item, i) {
      if (i) box.appendChild(el("span", "sep", "/"));
      var cls = item.hideMobile ? "hide-m" : null;
      if (item.href) {
        var a = el("a", cls, item.label);
        a.href = item.href;
        box.appendChild(a);
      } else {
        box.appendChild(el("span", cls, item.label));
      }
    });
    return box;
  }

  function saveLast(sec) {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({
        id: sec.id,
        title: sec.title,
        part: sec.part.title
      }));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function readLast() {
    try {
      var raw = localStorage.getItem(LAST_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.id || !sectionById(obj.id)) return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  /* ---------- 顶栏外链（站点配置） ---------- */

  function renderTopLinks() {
    if (!topLinksEl) return;
    var links = Array.isArray(CONFIG.externalLinks) ? CONFIG.externalLinks : [];
    if (!links.length) {
      topLinksEl.hidden = true;
      return;
    }
    clear(topLinksEl);
    links.forEach(function (link) {
      if (!link || !link.href) return;
      var a = el("a", "ext-link");
      a.href = link.href;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("aria-label", link.label || link.href);
      if (link.title) a.title = link.title;
      a.appendChild(el("span", "long", link.label || link.href));
      a.appendChild(el("span", "short", link.short || link.label || link.href));
      topLinksEl.appendChild(a);
    });
    topLinksEl.hidden = !topLinksEl.children.length;
  }

  /* ---------- 右侧目录 ---------- */

  function openDrawer() {
    if (!sideToc || sideToc.hidden) return;
    sideToc.classList.add("is-open");
    tocOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    tocToggle.setAttribute("aria-expanded", "true");
  }

  function closeDrawer() {
    if (!sideToc) return;
    sideToc.classList.remove("is-open");
    tocOverlay.hidden = true;
    document.body.style.overflow = "";
    tocToggle.setAttribute("aria-expanded", "false");
  }

  function renderSideToc(current) {
    if (!sideToc) return;
    clear(sideToc);
    sideToc.hidden = false;

    var head = el("div", "side-head");
    head.appendChild(el("span", "side-title", "目录"));
    head.appendChild(el("span", "side-count", sections.length + " 节"));
    var close = el("button", "side-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "关闭目录");
    head.appendChild(close);
    sideToc.appendChild(head);

    DATA.parts.forEach(function (part) {
      var title = el("div", "side-part", part.title);
      title.style.setProperty("--part", part.accent);
      sideToc.appendChild(title);

      part.sections.forEach(function (sec) {
        var active = sec.id === current.id;
        var row = el("div", "side-sec-row");
        var a = el("a", "side-sec" + (active ? " is-active" : ""));
        a.href = "#/read/" + sec.id;
        a.dataset.sec = sec.id;
        a.setAttribute("aria-label", sec.title + "，书上第 " + sec.page + " 页");
        a.appendChild(el("span", "side-name", sec.title));
        a.appendChild(el("span", "side-page", sec.page));
        row.appendChild(a);

        var points = Array.isArray(sec.points) ? sec.points : [];
        if (points.length) {
          var toggle = el("button", "side-expand", active ? "▾" : "▸");
          toggle.type = "button";
          toggle.dataset.sec = sec.id;
          toggle.dataset.title = sec.title;
          toggle.setAttribute("aria-expanded", active ? "true" : "false");
          toggle.setAttribute("aria-label", (active ? "收起 " : "展开 ") + sec.title + " 的考点");
          row.appendChild(toggle);

          var list = el("div", "side-points" + (active ? " is-open" : ""));
          list.dataset.sec = sec.id;
          points.forEach(function (point) {
            var p = el("button", "side-point");
            p.type = "button";
            p.dataset.jump = point.n;
            p.dataset.sec = sec.id;
            p.title = point.title;
            if (DATA.book.numbered !== false) p.appendChild(el("span", "side-point-no", point.n));
            p.appendChild(el("span", "side-point-name", point.title));
            list.appendChild(p);
          });
          sideToc.appendChild(row);
          sideToc.appendChild(list);
        } else {
          sideToc.appendChild(row);
        }
      });
    });

    var index = sections.indexOf(current) + 1;
    sideToc.appendChild(el("div", "side-foot", "第 " + index + " / " + sections.length + " 节"));

    var activeLink = sideToc.querySelector(".side-sec.is-active");
    if (activeLink) {
      var box = sideToc.getBoundingClientRect();
      var rowBox = (activeLink.closest(".side-sec-row") || activeLink).getBoundingClientRect();
      if (box.height > 80 && (rowBox.top < box.top + 50 || rowBox.bottom > box.bottom - 40)) {
        sideToc.scrollTop += rowBox.top - box.top - 50;
      }
    }
  }

  /* ---------- 书架 ---------- */

  function renderShelf() {
    var page = el("div", "page");
    page.appendChild(crumb([
      { label: "政治", href: "#/" },
      { label: "背诵" }
    ]));

    var title = el("h1", "page-title lg", "背诵");
    page.appendChild(title);
    page.appendChild(el("p", "page-sub", "名师讲义和背诵手册原文，按老师、按书分开，用书上自己的目录。"));

    page.appendChild(el("h2", "shelf-group", DATA.book.teacher));

    var grid = el("div", "book-grid");
    var card = el("a", "book-card");
    card.href = "#/book";
    card.appendChild(el("h3", "book-title", DATA.book.title));
    card.appendChild(el("p", "book-meta",
      [DATA.book.edition + " 版", DATA.book.sections + " 节", DATA.book.points + " 个知识点"].join(" · ")));
    card.appendChild(el("p", "book-blurb", DATA.book.blurb));

    var last = readLast();
    if (last) {
      var sec = sectionById(last.id);
      card.appendChild(el("div", "book-last", "上次读到：" + sec.title));
    }

    grid.appendChild(card);
    page.appendChild(grid);

    var shelfBooks = Array.isArray(CONFIG.shelfBooks) ? CONFIG.shelfBooks : [];
    if (shelfBooks.length) {
      var extraGrid = el("div", "book-grid");
      shelfBooks.forEach(function (book) {
        var extra = el("a", "book-card");
        extra.href = book.href;
        extra.appendChild(el("h3", "book-title", book.title));
        extra.appendChild(el("p", "book-meta",
          [book.edition + " 版", book.sections + " 节", book.points + " 个知识点"].join(" · ")));
        extra.appendChild(el("p", "book-blurb", book.blurb));
        extraGrid.appendChild(extra);
      });
      page.appendChild(extraGrid);
    }

    var foot = el("p", "site-foot",
      "背诵内容来自《" + DATA.book.source + "》  本页为本地离线版。");
    page.appendChild(foot);
    return page;
  }

  /* ---------- 书目录 ---------- */

  function renderBook() {
    var page = el("div", "page");
    page.appendChild(crumb([
      { label: "政治", href: "#/" },
      { label: "背诵", href: "#/" },
      { label: DATA.book.teacher + "《" + DATA.book.title + "》" }
    ]));

    page.appendChild(el("h1", "page-title", DATA.book.teacher + "《" + DATA.book.title + "》"));
    page.appendChild(el("p", "page-sub", DATA.book.edition + " 版 · " + DATA.book.blurb));

    var last = readLast();
    if (last) {
      var resume = el("a", "resume");
      resume.href = "#/read/" + last.id;
      resume.appendChild(el("span", "resume-title", "接着读：" + last.title));
      resume.appendChild(el("span", "resume-meta", last.part + " · 第 " + sectionById(last.id).page + " 页起"));
      resume.appendChild(el("span", "resume-go", "继续 ›"));
      page.appendChild(resume);
    }

    var toc = el("div", "toc");
    DATA.parts.forEach(function (part) {
      var partTitle = el("h2", "toc-part", part.title);
      partTitle.style.setProperty("--part", part.accent);
      toc.appendChild(partTitle);

      part.sections.forEach(function (sec) {
        var row = el("a", "toc-row");
        row.href = "#/read/" + sec.id;
        row.appendChild(el("span", "toc-name", sec.title));
        row.appendChild(el("span", "toc-page", "第 " + sec.page + " 页"));
        toc.appendChild(row);
      });
    });
    page.appendChild(toc);

    page.appendChild(el("p", "site-foot",
      "共 " + DATA.parts.length + " 部分 · " + DATA.book.sections + " 节 · " +
      DATA.book.points + " 个知识点 · 内容来自《" + DATA.book.source + "》"));
    return page;
  }

  /* ---------- 阅读页 ---------- */

  function renderTitleRuns(titleEl, titleRuns) {
    if (!titleRuns || !titleRuns.length) return;
    titleRuns.forEach(function (run) {
      if (run && run.e) {
        var img = el("img", "emo");
        img.src = EMOJI_BASE + run.e + ".png";
        img.alt = "";
        img.draggable = false;
        titleEl.appendChild(img);
      }
    });
  }

  function renderLine(line) {
    var p = el("p", "kl");
    if (line.i === 1) p.classList.add("i1");
    if (line.i === 2) p.classList.add("i2");
    if (line.g) p.classList.add("g");

    (line.runs || []).forEach(function (run) {
      if (!run) return;
      if (run.e) {
        var img = el("img", "emo");
        img.src = EMOJI_BASE + run.e + ".png";
        img.alt = "";
        img.loading = "lazy";
        img.draggable = false;
        p.appendChild(img);
      } else if (run.t) {
        var span = el("span", run.c ? "c-" + run.c : null, run.t);
        p.appendChild(span);
      }
    });

    return p;
  }

  function renderCard(point, part) {
    var card = el("article", "kcard");
    card.id = "k" + point.n;
    card.style.setProperty("--kc-accent", part.accent);
    card.style.setProperty("--kc-tint", part.tint);
    card.style.setProperty("--kc-border", part.border);

    var head = el("header", "kcard-head");
    if (DATA.book.numbered !== false) {
      head.appendChild(el("span", "kcard-no", "知识点 " + point.n));
    }
    var h = el("h3", "kcard-title", point.title);
    renderTitleRuns(h, point.titleRuns);
    head.appendChild(h);
    if (point.src) {
      var loc = el("button", "kcard-loc", "定位");
      loc.type = "button";
      loc.title = "复制源文件位置，方便手动改错";
      loc.setAttribute("aria-label", "复制知识点 " + point.n + " 的源文件位置");
      loc.setAttribute(
        "data-copy",
        point.src + " 第 " + point.srcLine + " 行（搜索 ## " + point.n + "）"
      );
      head.appendChild(loc);
    }
    card.appendChild(head);

    var body = el("div", "kcard-body");
    (point.lines || []).forEach(function (line) {
      body.appendChild(renderLine(line));
    });

    if (point.image) {
      var fig = el("img", "kcard-fig");
      fig.src = point.image;
      fig.alt = point.title + "（示意图）";
      fig.loading = "lazy";
      fig.title = "点击放大";
      body.appendChild(fig);
      body.appendChild(el("div", "kcard-figcap", "点击图片放大 · 原图 1800×860"));
    }

    if (!point.lines || !point.lines.length) {
      if (!point.image) body.appendChild(el("p", "kl c-m", "（此卡片无正文）"));
    }

    card.appendChild(body);
    return card;
  }

  function renderReader(sec) {
    saveLast(sec);

    var page = el("div", "page reader");
    page.appendChild(crumb([
      { label: "政治", href: "#/", hideMobile: true },
      { label: "背诵", href: "#/" },
      { label: DATA.book.teacher + "《" + DATA.book.title + "》", href: "#/book" },
      { label: sec.part.title, href: "#/book" },
      { label: sec.title }
    ]));

    var head = el("div", "reader-head");
    head.appendChild(el("h1", "reader-title", sec.title));
    head.appendChild(el("p", "page-sub",
      sec.part.title + " · 书上第 " + sec.page + " 页起 · 卡片按原 PDF 重排，保留彩色标注"));
    page.appendChild(head);

    if (sec.points.length > 1) {
      var details = el("details", "kpoints");
      details.appendChild(el("summary", null, "本节 " + sec.points.length + " 个考点"));
      var list = el("ul", "kpoints-list");
      sec.points.forEach(function (point) {
        var li = el("li");
        var btn = el("button");
        btn.type = "button";
        btn.dataset.jump = point.n;
        btn.appendChild(el("span", "no", point.n));
        btn.appendChild(document.createTextNode(point.title));
        li.appendChild(btn);
        list.appendChild(li);
      });
      details.appendChild(list);
      page.appendChild(details);
    }

    var klist = el("div", "klist");
    sec.points.forEach(function (point) {
      klist.appendChild(renderCard(point, sec.part));
    });
    page.appendChild(klist);

    var nav = el("nav", "rd-nav");
    nav.setAttribute("aria-label", "章节导航");
    if (sec.prev) {
      var prev = el("a", "prev");
      prev.href = "#/read/" + sec.prev.id;
      prev.appendChild(el("span", "dir", "‹ 上一节"));
      prev.appendChild(document.createTextNode(sec.prev.title));
      nav.appendChild(prev);
    }
    if (sec.next) {
      var next = el("a", "next");
      next.href = "#/read/" + sec.next.id;
      next.appendChild(el("span", "dir", "下一节 ›"));
      next.appendChild(document.createTextNode(sec.next.title));
      nav.appendChild(next);
    }
    page.appendChild(nav);

    page.appendChild(el("p", "site-foot",
      "内容来自《" + DATA.book.source + "》 · 本地离线版 · "));
    return page;
  }

  /* ---------- 路由 ---------- */

  function parseRoute() {
    var raw = (location.hash || "").replace(/^#\/?/, "");
    if (raw === "book") return { name: "book" };
    if (raw.indexOf("read/") === 0) {
      return { name: "read", id: decodeURIComponent(raw.slice(5)) };
    }
    return { name: "shelf" };
  }

  function render() {
    var route = parseRoute();
    var view;
    var current = null;

    if (route.name === "book") {
      view = renderBook();
    } else if (route.name === "read") {
      var sec = sectionById(route.id);
      if (!sec) {
        location.replace("#/book");
        return;
      }
      current = sec;
      view = renderReader(sec);
    } else {
      view = renderShelf();
    }

    document.body.classList.toggle("reader-mode", !!current);
    document.body.classList.toggle("home-mode", route.name === "shelf");
    if (current) {
      closeDrawer();
      renderSideToc(current);
    } else if (sideToc) {
      closeDrawer();
      sideToc.hidden = true;
    }

    clear(appEl);
    appEl.appendChild(view);
    window.scrollTo(0, 0);

    if (pendingJump !== null) {
      var target = pendingJump;
      pendingJump = null;
      requestAnimationFrame(function () { jumpTo(target); });
    }
  }

  /* ---------- 交互 ---------- */

  function jumpTo(n) {
    var card = document.getElementById("k" + n);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    card.classList.add("is-target");
    window.setTimeout(function () {
      card.classList.remove("is-target");
    }, 1800);
  }

  function openLightbox(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt || "";
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.removeAttribute("src");
    document.body.style.overflow = "";
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("#toc-toggle")) {
      if (sideToc.classList.contains("is-open")) closeDrawer();
      else openDrawer();
      return;
    }

    if (e.target.closest("#toc-overlay") || e.target.closest(".side-close")) {
      closeDrawer();
      return;
    }

    var expand = e.target.closest(".side-expand");
    if (expand) {
      var secId = expand.dataset.sec;
      var list = sideToc.querySelector('.side-points[data-sec="' + secId + '"]');
      if (list) {
        var open = list.classList.toggle("is-open");
        expand.textContent = open ? "▾" : "▸";
        expand.setAttribute("aria-expanded", open ? "true" : "false");
        expand.setAttribute("aria-label", (open ? "收起 " : "展开 ") + (expand.dataset.title || secId) + " 的考点");
        expand.title = (open ? "收起 " : "展开 ") + (expand.dataset.title || secId) + " 的考点";
      }
      return;
    }

    if (e.target.closest(".side-sec")) {
      closeDrawer();
      return;
    }

    var jump = e.target.closest("[data-jump]");
    if (jump) {
      e.preventDefault();
      var activeSec = sideToc.querySelector(".side-sec.is-active");
      var targetSec = jump.dataset.sec;
      if (targetSec && activeSec && activeSec.dataset.sec !== targetSec) {
        pendingJump = jump.dataset.jump;
        closeDrawer();
        location.hash = "#/read/" + targetSec;
      } else {
        if (jump.classList.contains("side-point")) closeDrawer();
        jumpTo(jump.dataset.jump);
      }
      return;
    }

    var fig = e.target.closest(".kcard-fig");
    if (fig) {
      openLightbox(fig.getAttribute("src"), fig.getAttribute("alt"));
      return;
    }

    var loc = e.target.closest(".kcard-loc");
    if (loc) {
      copyText(loc.getAttribute("data-copy"));
      showToast("已复制：" + loc.getAttribute("data-copy"));
      return;
    }

    if (e.target === lightbox || e.target.closest(".lightbox-close")) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (sideToc.classList.contains("is-open")) {
      closeDrawer();
      return;
    }
    if (!lightbox.hidden) closeLightbox();
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth >= 1090 && sideToc.classList.contains("is-open")) closeDrawer();
  });

  renderTopLinks();
  window.addEventListener("hashchange", render);
  render();
})();

