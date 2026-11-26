(() => {
  const { forms, toneMap, ancientOblique, synonyms: starterSynonyms } = POETRY_DATA;
  const fullToneMap = {};
  const expandedSynonyms = {};
  const EXPANDED_SYNONYM_URL = 'https://raw.githubusercontent.com/jaaack-wang/Chinese-Synonyms/main/synonyms.json';
  const CJK_WORD_RE = /^[\u3400-\u9fff]{1,5}$/;
  const PAGE_LIMIT = 48;
  const POPULAR_SEED = [
    '山', '水', '云', '月', '风', '雨', '花', '雪', '春', '秋', '夜', '梦', '愁', '酒', '舟', '楼',
    '清', '寒', '孤', '远', '幽', '空', '明', '苍', '碧', '红', '白', '飞', '落', '归', '望', '吟',
    '明月', '清风', '青山', '流水', '白云', '细雨', '飞雪', '秋风', '春风', '落花', '残红', '杨柳',
    '孤舟', '高楼', '故人', '相思', '乡愁', '归雁', '斜阳', '寒霜', '长空', '沧海', '芳草', '梅花',
    '玉盘', '冰轮', '婵娟', '清辉', '烟雨', '夕照', '幽谷', '翠微', '孤帆', '把酒', '独酌', '凭栏',
    '悠然', '潇洒', '惆怅', '寂寥', '萧瑟', '皎洁', '苍茫', '迢遥', '韶华', '流年', '浮生', '天涯'
  ];

  const state = {
    family: 'shi',
    formId: 'wujue',
    variant: 0,
    text: [],
    selected: { line: 0, slot: 0 },
    overrides: {},
    synQuery: '',
    fitOnly: false,
    activeScope: 'all',
    activeCategory: 'popular',
    showAll: false,
    lexiconLoaded: false,
    expandedLoaded: false,
  };

  const lexicon = {
    categories: [],
    groups: [],
    wordIndex: new Map(),
    classicalSet: new Set(),
    categoryGroups: new Map(),
    stats: { groups: 0, words: 0, keys: 0 },
  };

  const $ = (id) => document.getElementById(id);
  const familySelect = $('familySelect');
  const formSelect = $('formSelect');
  const variantSelect = $('variantSelect');
  const ciSearch = $('ciSearch');
  const ciSearchField = $('ciSearchField');
  const synSearch = $('synSearch');
  const synSearchClear = $('synSearchClear');
  const fitOnlyToggle = $('fitOnlyToggle');

  function form() { return forms[state.family].find((item) => item.id === state.formId) || forms[state.family][0]; }
  function pattern() { return form().variants[state.variant][1]; }
  function expected(line, slot) { return pattern()[line]?.[slot] || 'A'; }
  function absoluteSlot(line, slot) { return pattern().slice(0, line).reduce((sum, rule) => sum + rule.length, 0) + slot; }

  function isRhymeSlot(line, slot) {
    if (form().rhymePositions?.[state.variant]) {
      return form().rhymePositions[state.variant].includes(absoluteSlot(line, slot));
    }
    // Regulated shi: every 平收句 shown by a supplied standard pattern is a rhyme line.
    return slot === pattern()[line].length - 1 && expected(line, slot) === 'P';
  }

  function baseToneOf(char) {
    if (!char) return '';
    const base = fullToneMap[char] || toneMap[char] || '';
    if (ancientOblique.has(char) && base === 'P') return 'Z';
    return base;
  }

  function toneOf(char, key) {
    if (!char) return '';
    if (key && state.overrides[key]) return state.overrides[key];
    return baseToneOf(char);
  }

  function displayTone(value) { return value || '？'; }
  function displayToneZh(value) { return value ? value.replaceAll('P', '平').replaceAll('Z', '仄') : '？'; }
  function wantedLabel(wanted) { return wanted === 'A' ? '可平可仄' : wanted === 'P' ? '平声' : '仄声'; }
  function isFit(tone, wanted) { return wanted === 'A' || (Boolean(tone) && tone.includes(wanted)); }

  function evaluateLineChars(lineIndex, chars, overrideMask) {
    const rule = pattern()[lineIndex];
    const full = chars.length === rule.length && chars.every(Boolean);
    const values = chars.map((ch, i) => {
      if (!ch) return '';
      const useOverride = !overrideMask || overrideMask[i];
      return useOverride ? toneOf(ch, `${lineIndex}-${i}`) : baseToneOf(ch);
    });
    const wrong = values.reduce((n, tone, i) => n + (tone && !isFit(tone, rule[i]) ? 1 : 0), 0);
    const unknown = values.filter((tone) => !tone).length;
    const tail = full ? values.slice(-3) : [];
    const exactSingle = full && values.every((x) => x.length === 1);
    // 常见“孤平拗救”：平平(仄)仄平可作仄平平仄平；七言取其后五字。
    const rescue = exactSingle && rule.slice(-5) === 'PPAZP' && values.slice(-5).join('') === 'ZPPZP';
    const lastFive = full ? values.slice(-5) : [];
    // In 平平(仄)仄平 / 仄仄平平(仄)仄平, leaving only one non-rhyme 平 is 孤平.
    const lonePing = !rescue && full && rule.slice(-5) === 'PPAZP' && lastFive.filter((tone) => tone === 'P').length === 2;
    // The third-from-last character of 仄仄仄平平 (and its 7-character counterpart) cannot become 平.
    const triplePing = tail.length === 3 && tail.every((tone) => tone === 'P');
    return { full, wrong, unknown, rescue, lonePing, triplePing, values };
  }

  function checkLine(lineIndex) {
    return evaluateLineChars(lineIndex, state.text[lineIndex] || []);
  }

  function charStatus(line, slot) {
    const char = (state.text[line] || [])[slot] || '';
    const tone = toneOf(char, `${line}-${slot}`);
    const wanted = expected(line, slot);
    if (!char) return 'pending';
    if (!tone) return 'unknown';
    const check = checkLine(line);
    if (check.lonePing && slot === pattern()[line].length - 5) return 'bad';
    if (check.triplePing && slot === pattern()[line].length - 3) return 'bad';
    if (check.rescue && slot === pattern()[line].length - 5) return 'ok';
    if (isFit(tone, wanted)) return 'ok';
    return 'bad';
  }

  function updateStatus() {
    const checks = pattern().map((_, i) => checkLine(i));
    const filled = checks.filter((x) => x.full).length;
    const unknown = checks.reduce((n, x) => n + x.unknown, 0);
    const wrong = checks.reduce((n, x) => n + (x.rescue ? Math.max(0, x.wrong - 1) : x.wrong), 0);
    const triple = checks.filter((x) => x.triplePing).length;
    const lone = checks.filter((x) => x.lonePing).length;
    const rescue = checks.filter((x) => x.rescue).length;
    const node = $('meterStatus');
    node.className = 'meter-status';
    if (!filled) node.textContent = '等待落笔';
    else if (wrong || lone || triple) {
      node.textContent = `${wrong + lone + triple} 处待斟酌${lone ? ` · ${lone} 处孤平` : ''}${triple ? ` · ${triple} 处三平调` : ''}`;
      node.classList.add('warn');
    } else if (unknown) {
      node.textContent = `${unknown} 字待查韵`;
      node.classList.add('warn');
    } else {
      node.textContent = `已填 ${filled}/${pattern().length} 句${rescue ? ' · 含拗救' : ' · 合谱'}`;
      node.classList.add('good');
    }
  }

  // ==================== Lexicon Indexing ====================
  function indexLexiconData(data) {
    const categories = [];
    const groups = [];
    const wordIndex = new Map();
    const classicalSet = new Set();
    const categoryGroups = new Map();

    const addToIndex = (key, groupIdx) => {
      let bucket = wordIndex.get(key);
      if (!bucket) {
        bucket = [];
        wordIndex.set(key, bucket);
      }
      if (!bucket.includes(groupIdx)) bucket.push(groupIdx);
    };

    if (data && data.version === 2 && Array.isArray(data.groups)) {
      data.categories.forEach((cat) => categories.push(cat));
      data.groups.forEach((raw, idx) => {
        const group = {
          id: idx,
          cat: raw.c,
          label: raw.l,
          words: raw.w || [],
          triggers: raw.t || [],
        };
        groups.push(group);
        let catList = categoryGroups.get(group.cat);
        if (!catList) {
          catList = [];
          categoryGroups.set(group.cat, catList);
        }
        catList.push(idx);
        group.words.forEach((w) => {
          classicalSet.add(w);
          addToIndex(w, idx);
        });
        group.triggers.forEach((t) => addToIndex(t, idx));
      });
    } else if (data && typeof data === 'object') {
      // Fallback for flat key -> array format (starterSynonyms)
      categories.push({ id: 'starter', name: '常用' });
      Object.entries(data).forEach(([key, list], idx) => {
        if (!Array.isArray(list) || !list.length) return;
        const words = [...new Set(list.filter((w) => CJK_WORD_RE.test(w)))];
        const group = { id: idx, cat: 'starter', label: key, words, triggers: [key] };
        groups.push(group);
        let catList = categoryGroups.get('starter');
        if (!catList) {
          catList = [];
          categoryGroups.set('starter', catList);
        }
        catList.push(idx);
        addToIndex(key, idx);
        words.forEach((w) => {
          classicalSet.add(w);
          addToIndex(w, idx);
        });
      });
    }

    lexicon.categories = categories;
    lexicon.groups = groups;
    lexicon.wordIndex = wordIndex;
    lexicon.classicalSet = classicalSet;
    lexicon.categoryGroups = categoryGroups;
    lexicon.stats = {
      groups: groups.length,
      words: classicalSet.size,
      keys: wordIndex.size,
    };
    updateLexiconBadge();
  }

  function updateLexiconBadge() {
    const badge = $('lexiconStats');
    if (!badge) return;
    if (state.lexiconLoaded) {
      badge.textContent = `${lexicon.stats.words.toLocaleString('zh-CN')} 雅词`;
      badge.title = `本地古雅同义词库：${lexicon.categories.length} 大类 · ${lexicon.stats.groups} 组词群 · ${lexicon.stats.words} 条诗词雅词 · ${lexicon.stats.keys} 个可检索词条`;
    } else {
      badge.textContent = `基础 ${lexicon.stats.words} 词`;
    }
  }

  // ==================== Candidate Evaluation ====================
  function evaluateCandidate(term, line, start) {
    const chars = [...term];
    const rule = pattern()[line];
    const outOfBounds = !rule || start < 0 || start + chars.length > rule.length;
    const charTones = chars.map((ch) => baseToneOf(ch));
    const toneText = charTones.map((t) => displayToneZh(t)).join('·');
    if (outOfBounds) {
      return { fit: false, rescue: false, outOfBounds: true, fault: '超长', toneText, hasUnknown: charTones.some((t) => !t) };
    }
    const allSlotFit = chars.every((_, offset) => isFit(charTones[offset], rule[start + offset]));
    const simChars = [...(state.text[line] || Array(rule.length).fill(''))];
    const overrideMask = Array(rule.length).fill(true);
    chars.forEach((ch, offset) => {
      simChars[start + offset] = ch;
      overrideMask[start + offset] = false;
    });
    const simCheck = evaluateLineChars(line, simChars, overrideMask);
    const hasUnknown = charTones.some((t) => !t);
    const isReplaced = (idx) => idx >= start && idx < start + chars.length;
    const untouchedRangeValid = (fromIdx) => {
      for (let i = Math.max(0, fromIdx); i < rule.length; i++) {
        if (isReplaced(i)) continue;
        const t = simCheck.values[i];
        if (!t || !isFit(t, rule[i])) return false;
      }
      return true;
    };
    const causedLonePing = simCheck.lonePing && untouchedRangeValid(rule.length - 5);
    const causedTriplePing = simCheck.triplePing && untouchedRangeValid(rule.length - 3);
    if (simCheck.rescue) {
      return { fit: true, rescue: true, outOfBounds: false, fault: '', toneText, hasUnknown };
    }
    if (allSlotFit && !causedLonePing && !causedTriplePing) {
      return { fit: true, rescue: false, outOfBounds: false, fault: '', toneText, hasUnknown };
    }
    let fault = '';
    if (causedLonePing) fault = '孤平';
    else if (causedTriplePing) fault = '三平调';
    return { fit: false, rescue: false, outOfBounds: false, fault, toneText, hasUnknown };
  }

  // ==================== Suggestion Retrieval ====================
  function targetSlotForInsertion() {
    if (state.selected && pattern()[state.selected.line]?.[state.selected.slot] !== undefined) {
      return state.selected;
    }
    for (let l = 0; l < pattern().length; l++) {
      for (let s = 0; s < pattern()[l].length; s++) {
        if (!(state.text[l]?.[s])) return { line: l, slot: s };
      }
    }
    return { line: 0, slot: 0 };
  }

  function collectAutoSuggestions(line, slot) {
    const row = state.text[line] || [];
    const lineLen = pattern()[line].length;
    const spans = [];

    // Extract contiguous non-empty spans covering `slot` (length 5 down to 1).
    for (let len = Math.min(5, lineLen); len >= 1; len--) {
      const minStart = Math.max(0, slot - len + 1);
      const maxStart = Math.min(lineLen - len, slot);
      for (let start = minStart; start <= maxStart; start++) {
        let valid = true;
        let sub = '';
        for (let i = start; i < start + len; i++) {
          if (!row[i]) { valid = false; break; }
          sub += row[i];
        }
        if (!valid) continue;
        const hasLocal = lexicon.wordIndex.has(sub);
        const hasExt = Array.isArray(expandedSynonyms[sub]) && expandedSynonyms[sub].length > 0;
        if (hasLocal || hasExt) {
          spans.push({ start, len, source: sub });
        }
      }
    }

    const candidates = [];
    const seen = new Set();

    spans.forEach(({ start, len, source }) => {
      const scopeKey = `${start}:${source}`;
      const groupIds = lexicon.wordIndex.get(source) || [];
      groupIds.forEach((gid) => {
        const group = lexicon.groups[gid];
        group.words.forEach((term) => {
          if (term === source || [...term].length !== len) return;
          const dedupeKey = `${start}:${term}`;
          if (seen.has(dedupeKey)) return;
          seen.add(dedupeKey);
          candidates.push({
            term,
            start,
            len,
            source,
            scopeKey,
            groupLabel: group.label,
            ext: false,
            eval: evaluateCandidate(term, line, start),
          });
        });
      });

      // Optional runtime upstream bridge: pivot modern synonyms into curated classical synsets first.
      const extList = expandedSynonyms[source];
      if (Array.isArray(extList) && extList.length) {
        extList.forEach((bridgeWord) => {
          const bridgedGroups = lexicon.wordIndex.get(bridgeWord);
          if (!bridgedGroups) return;
          bridgedGroups.forEach((gid) => {
            const group = lexicon.groups[gid];
            group.words.forEach((term) => {
              if (term === source || [...term].length !== len) return;
              const dedupeKey = `${start}:${term}`;
              if (seen.has(dedupeKey)) return;
              seen.add(dedupeKey);
              candidates.push({
                term,
                start,
                len,
                source,
                scopeKey,
                groupLabel: group.label,
                ext: false,
                eval: evaluateCandidate(term, line, start),
              });
            });
          });
        });

        // Clean equal-length fallback terms from upstream
        extList.forEach((term) => {
          if (term === source || !CJK_WORD_RE.test(term) || [...term].length !== len) return;
          const dedupeKey = `${start}:${term}`;
          if (seen.has(dedupeKey)) return;
          seen.add(dedupeKey);
          candidates.push({
            term,
            start,
            len,
            source,
            scopeKey,
            groupLabel: '拓展近义',
            ext: true,
            eval: evaluateCandidate(term, line, start),
          });
        });
      }
    });

    candidates.sort((a, b) => {
      if (a.eval.fit !== b.eval.fit) return a.eval.fit ? -1 : 1;
      if (a.ext !== b.ext) return a.ext ? 1 : -1;
      if (a.len !== b.len) return b.len - a.len;
      return 0;
    });

    return { mode: 'auto', spans, candidates };
  }

  function collectSearchSuggestions(rawQuery, line, slot) {
    const query = rawQuery.trim();
    const matchedGroups = [];
    const seenGroup = new Set();

    const addGroup = (gid, tier) => {
      if (seenGroup.has(gid)) return;
      seenGroup.add(gid);
      matchedGroups.push({ gid, tier });
    };

    // Tier 1: Exact key match (classical word or vernacular trigger)
    (lexicon.wordIndex.get(query) || []).forEach((gid) => addGroup(gid, 1));

    // Tier 2: Category name or group label match
    const catByName = lexicon.categories.find((c) => c.name === query || c.name.includes(query));
    if (catByName) {
      (lexicon.categoryGroups.get(catByName.id) || []).forEach((gid) => addGroup(gid, 2));
    }
    lexicon.groups.forEach((group, gid) => {
      if (group.label.includes(query)) addGroup(gid, 2);
    });

    // Tier 3: Substring match across triggers and classical words
    if (matchedGroups.length < 8) {
      lexicon.groups.forEach((group, gid) => {
        if (seenGroup.has(gid)) return;
        if (group.triggers.some((t) => t.includes(query) || (query.length >= 2 && query.includes(t))) ||
            group.words.some((w) => w.includes(query))) {
          addGroup(gid, 3);
        }
      });
    }

    // Tier 4: 1-hop bridge via optional runtime upstream synonyms
    const extList = expandedSynonyms[query];
    if (Array.isArray(extList)) {
      extList.forEach((bridgeWord) => {
        (lexicon.wordIndex.get(bridgeWord) || []).forEach((gid) => addGroup(gid, 4));
      });
    }

    matchedGroups.sort((a, b) => a.tier - b.tier);

    const candidates = [];
    const seenTerm = new Set();
    const currentChar = state.text[line]?.[slot] || '';

    matchedGroups.slice(0, 18).forEach(({ gid, tier }) => {
      const group = lexicon.groups[gid];
      group.words.forEach((term) => {
        if (seenTerm.has(term)) return;
        seenTerm.add(term);
        candidates.push({
          term,
          start: slot,
          len: [...term].length,
          source: currentChar,
          scopeKey: `len:${[...term].length}`,
          groupLabel: group.label,
          tier,
          ext: false,
          eval: evaluateCandidate(term, line, slot),
        });
      });
    });

    // Direct upstream fallback if nothing in local classical lexicon matched
    if (!candidates.length && Array.isArray(extList)) {
      extList.forEach((term) => {
        if (!CJK_WORD_RE.test(term) || seenTerm.has(term)) return;
        seenTerm.add(term);
        candidates.push({
          term,
          start: slot,
          len: [...term].length,
          source: currentChar,
          scopeKey: `len:${[...term].length}`,
          groupLabel: '拓展近义',
          tier: 5,
          ext: true,
          eval: evaluateCandidate(term, line, slot),
        });
      });
    }

    candidates.sort((a, b) => {
      if (a.eval.outOfBounds !== b.eval.outOfBounds) return a.eval.outOfBounds ? 1 : -1;
      if (a.eval.fit !== b.eval.fit) return a.eval.fit ? -1 : 1;
      if (a.tier !== b.tier) return a.tier - b.tier;
      return 0;
    });

    return { mode: 'search', query, spans: [], candidates };
  }

  function collectCategorySuggestions(catId, line, slot) {
    const candidates = [];
    const seen = new Set();

    if (catId === 'popular' || !lexicon.categoryGroups.has(catId)) {
      POPULAR_SEED.forEach((term) => {
        if (seen.has(term)) return;
        seen.add(term);
        const gids = lexicon.wordIndex.get(term);
        const label = gids?.length ? lexicon.groups[gids[0]].label : '高频雅词';
        candidates.push({
          term,
          start: slot,
          len: [...term].length,
          source: '',
          scopeKey: `len:${[...term].length}`,
          groupLabel: label,
          ext: false,
          eval: evaluateCandidate(term, line, slot),
        });
      });
    } else {
      const gids = lexicon.categoryGroups.get(catId) || [];
      gids.forEach((gid) => {
        const group = lexicon.groups[gid];
        // Take balanced representative words across lengths from each group so category view stays diverse.
        const picked = [];
        const byLen = new Map();
        group.words.forEach((w) => {
          const l = [...w].length;
          if (!byLen.has(l)) byLen.set(l, []);
          byLen.get(l).push(w);
        });
        [1, 2, 3, 4].forEach((l) => {
          (byLen.get(l) || []).slice(0, l === 2 ? 8 : 3).forEach((w) => picked.push(w));
        });
        picked.forEach((term) => {
          if (seen.has(term)) return;
          seen.add(term);
          candidates.push({
            term,
            start: slot,
            len: [...term].length,
            source: '',
            scopeKey: `len:${[...term].length}`,
            groupLabel: group.label,
            ext: false,
            eval: evaluateCandidate(term, line, slot),
          });
        });
      });
    }

    candidates.sort((a, b) => {
      if (a.eval.outOfBounds !== b.eval.outOfBounds) return a.eval.outOfBounds ? 1 : -1;
      if (a.eval.fit !== b.eval.fit) return a.eval.fit ? -1 : 1;
      if (a.len !== b.len) return a.len - b.len;
      return 0;
    });

    return { mode: 'browse', catId, spans: [], candidates };
  }

  // ==================== Preview & Replace ====================
  function clearPreviewHighlight() {
    document.querySelectorAll('.char-slot.preview-target').forEach((n) => n.classList.remove('preview-target'));
  }

  function highlightPreviewRange(line, start, len) {
    clearPreviewHighlight();
    for (let offset = 0; offset < len; offset++) {
      document.querySelector(`.char-slot[data-key="${line}-${start + offset}"]`)?.classList.add('preview-target');
    }
  }

  function replaceRange(line, start, term) {
    const chars = [...term];
    const lineRule = pattern()[line];
    if (!lineRule || !chars.length || start + chars.length > lineRule.length) return;
    const wasEmpty = !state.text[line]?.[start];
    chars.forEach((char, offset) => {
      state.text[line][start + offset] = char;
      delete state.overrides[`${line}-${start + offset}`];
    });
    clearPreviewHighlight();
    renderEditor();
    if (wasEmpty && state.synQuery) {
      // Filled an empty slot via search: advance smoothly to next slot if available
      const nextPos = Math.min(lineRule.length - 1, start + chars.length);
      selectSlot(line, start + chars.length < lineRule.length ? nextPos : start);
    } else {
      // Keep selection at start of replaced word so user can audition alternative synonyms with single clicks
      selectSlot(line, start);
    }
  }

  // ==================== Rendering Assist Panel ====================
  function renderCategoryBar(show) {
    const bar = $('categoryBar');
    bar.hidden = !show;
    if (!show) return;
    bar.innerHTML = '';
    const items = [{ id: 'popular', name: '常用' }, ...lexicon.categories];
    items.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `cat-pill${state.activeCategory === cat.id ? ' active' : ''}`;
      btn.textContent = cat.name;
      btn.addEventListener('click', () => {
        state.activeCategory = cat.id;
        state.activeScope = 'all';
        state.showAll = false;
        renderSuggestions();
      });
      bar.appendChild(btn);
    });
  }

  function renderScopeTabs(result) {
    const tabsRoot = $('scopeTabs');
    tabsRoot.innerHTML = '';
    const tabs = [];

    if (result.mode === 'auto' && result.spans.length > 0) {
      tabs.push({ key: 'all', label: '全部' });
      const seenSpan = new Set();
      result.spans.forEach(({ start, len, source }) => {
        const key = `${start}:${source}`;
        if (seenSpan.has(key)) return;
        seenSpan.add(key);
        const count = result.candidates.filter((c) => c.scopeKey === key && (!state.fitOnly || c.eval.fit)).length;
        if (count > 0 || result.candidates.some((c) => c.scopeKey === key)) {
          tabs.push({ key, label: `「${source}」${len}字` });
        }
      });
    } else if (result.candidates.length > 0) {
      const lengths = [...new Set(result.candidates.map((c) => c.len))].sort((a, b) => a - b);
      if (lengths.length > 1) {
        tabs.push({ key: 'all', label: '全部' });
        lengths.forEach((len) => tabs.push({ key: `len:${len}`, label: `${len}字` }));
      }
    }

    if (!tabs.some((t) => t.key === state.activeScope)) {
      state.activeScope = 'all';
    }

    tabs.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `scope-tab${state.activeScope === key ? ' active' : ''}`;
      btn.textContent = label;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(state.activeScope === key));
      btn.addEventListener('click', () => {
        state.activeScope = key;
        state.showAll = false;
        renderSuggestions();
      });
      tabsRoot.appendChild(btn);
    });
  }

  function createSuggestionButton(item, line) {
    const { term, start, len, source, groupLabel, ext, eval: ev } = item;
    const button = document.createElement('button');
    button.type = 'button';
    const stateClass = ev.rescue ? 'rescue' : ev.fit ? 'fit' : 'no-fit';
    button.className = `suggestion ${stateClass}`;
    button.disabled = ev.outOfBounds;

    const statusTag = ev.outOfBounds
      ? ' · 超出句长'
      : ev.rescue
        ? ' · 拗救'
        : ev.fit
          ? ' · 合谱'
          : ev.fault
            ? ` · ${ev.fault}`
            : '';
    const extBadge = ext ? '<span class="tag-ext">拓展</span>' : '';
    button.innerHTML = `<span>${term}</span><small>${ev.toneText}${statusTag}</small>${extBadge}`;

    const rangeLabel = len === 1 ? `第${start + 1}字` : `第${start + 1}-${start + len}字`;
    const actionText = source ? `替换「${source}」` : `填入第${line + 1}句${rangeLabel}`;
    button.title = `词群：${groupLabel} · ${actionText} · ${ev.toneText}${statusTag}`;

    if (!ev.outOfBounds) {
      button.addEventListener('mouseenter', () => highlightPreviewRange(line, start, len));
      button.addEventListener('mouseleave', clearPreviewHighlight);
      button.addEventListener('click', () => replaceRange(line, start, term));
    }
    return button;
  }

  function renderSuggestions() {
    const target = $('suggestions');
    const label = $('selectedSlot');
    const summary = $('assistSummary');
    const pos = targetSlotForInsertion();
    const { line, slot } = pos;
    const want = expected(line, slot);
    const currentChar = state.text[line]?.[slot] || '';
    const remaining = pattern()[line].length - slot;

    label.textContent = `第 ${line + 1} 句 · 第 ${slot + 1} 字${currentChar ? `「${currentChar}」` : '（空位）'} · 要求${wantedLabel(want)} · 余 ${remaining} 字`;

    let result;
    const query = state.synQuery.trim();
    if (query) {
      result = collectSearchSuggestions(query, line, slot);
      renderCategoryBar(false);
    } else if (currentChar) {
      result = collectAutoSuggestions(line, slot);
      renderCategoryBar(result.candidates.length === 0);
      if (result.candidates.length === 0) {
        result = collectCategorySuggestions(state.activeCategory, line, slot);
        result.noDirectMatchFor = currentChar;
      }
    } else {
      result = collectCategorySuggestions(state.activeCategory, line, slot);
      renderCategoryBar(true);
    }

    renderScopeTabs(result);

    let filtered = result.candidates;
    if (state.activeScope !== 'all') {
      filtered = filtered.filter((c) => c.scopeKey === state.activeScope);
    }
    const fitCount = filtered.filter((c) => c.eval.fit).length;
    const totalBeforeFitFilter = filtered.length;
    if (state.fitOnly) {
      filtered = filtered.filter((c) => c.eval.fit);
    }

    if (result.mode === 'search') {
      summary.textContent = totalBeforeFitFilter
        ? `检索「${result.query}」：合谱 ${fitCount} / 共 ${totalBeforeFitFilter} 条（点击填入第${line + 1}句第${slot + 1}字）`
        : `未找到「${result.query}」相关雅词，可尝试更简洁的关键词`;
    } else if (result.mode === 'auto') {
      summary.textContent = `自动匹配：合谱 ${fitCount} / 共 ${totalBeforeFitFilter} 条等长替换词`;
    } else if (result.noDirectMatchFor) {
      summary.textContent = `「${result.noDirectMatchFor}」暂无直接同义词，可点选意象分类或上方检索 · 合谱 ${fitCount}/${totalBeforeFitFilter}`;
    } else {
      const catName = state.activeCategory === 'popular'
        ? '常用诗家雅词'
        : (lexicon.categories.find((c) => c.id === state.activeCategory)?.name || '意象雅词');
      summary.textContent = `${catName}：合谱 ${fitCount} / 共 ${totalBeforeFitFilter} 条（点击填入空位）`;
    }

    target.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'suggestions-empty';
      empty.textContent = state.fitOnly && totalBeforeFitFilter > 0
        ? '当前筛选下暂无合谱候选；可取消勾选“只看合谱”查看全部同义雅词，或换用不同字长。'
        : '暂无匹配条目，可在上方输入白话概念（如“月亮”“思乡”“悲伤”“看”）检索古雅替代词。';
      target.appendChild(empty);
      return;
    }

    // Group neatly by semantic span (auto) or semantic label (search/browse) when diverse
    if (result.mode === 'auto' && state.activeScope === 'all' && result.spans.length > 1) {
      const buckets = new Map();
      filtered.forEach((item) => {
        const key = item.scopeKey;
        if (!buckets.has(key)) {
          buckets.set(key, { title: `替换「${item.source}」(${item.len}字)`, items: [] });
        }
        buckets.get(key).items.push(item);
      });
      const perSpanCap = state.showAll ? Infinity : 14;
      let clippedTotal = 0;
      buckets.forEach(({ title, items }, scopeKey) => {
        const section = document.createElement('div');
        section.className = 'suggestion-group';
        const heading = document.createElement('div');
        heading.className = 'suggestion-group-title';
        const subFit = items.filter((i) => i.eval.fit).length;
        heading.innerHTML = `<span>${title}</span><span>合谱 ${subFit}/${items.length}</span>`;
        const grid = document.createElement('div');
        grid.className = 'suggestion-grid';
        const slice = items.slice(0, perSpanCap);
        clippedTotal += Math.max(0, items.length - slice.length);
        slice.forEach((item) => grid.appendChild(createSuggestionButton(item, line)));
        section.appendChild(heading);
        section.appendChild(grid);
        target.appendChild(section);
      });
      if (!state.showAll && clippedTotal > 0) {
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'show-more-btn';
        moreBtn.textContent = `展开全部（其余 ${clippedTotal} 条）`;
        moreBtn.addEventListener('click', () => {
          state.showAll = true;
          renderSuggestions();
        });
        target.appendChild(moreBtn);
      }
      return;
    }

    const visible = state.showAll ? filtered : filtered.slice(0, PAGE_LIMIT);

    if (result.mode === 'search') {
      const buckets = new Map();
      visible.forEach((item) => {
        const title = item.groupLabel;
        if (!buckets.has(title)) buckets.set(title, []);
        buckets.get(title).push(item);
      });
      buckets.forEach((items, title) => {
        const section = document.createElement('div');
        section.className = 'suggestion-group';
        const heading = document.createElement('div');
        heading.className = 'suggestion-group-title';
        const subFit = items.filter((i) => i.eval.fit).length;
        heading.innerHTML = `<span>意象 · ${title}</span><span>合谱 ${subFit}/${items.length}</span>`;
        const grid = document.createElement('div');
        grid.className = 'suggestion-grid';
        items.forEach((item) => grid.appendChild(createSuggestionButton(item, line)));
        section.appendChild(heading);
        section.appendChild(grid);
        target.appendChild(section);
      });
    } else {
      const grid = document.createElement('div');
      grid.className = 'suggestion-grid';
      visible.forEach((item) => grid.appendChild(createSuggestionButton(item, line)));
      target.appendChild(grid);
    }

    if (!state.showAll && filtered.length > PAGE_LIMIT) {
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'show-more-btn';
      moreBtn.textContent = `展开全部（其余 ${filtered.length - PAGE_LIMIT} 条）`;
      moreBtn.addEventListener('click', () => {
        state.showAll = true;
        renderSuggestions();
      });
      target.appendChild(moreBtn);
    }
  }

  // ==================== Editor & Selection ====================
  function selectSlot(line, slot) {
    const changed = !state.selected || state.selected.line !== line || state.selected.slot !== slot;
    state.selected = { line, slot };
    if (changed) {
      state.activeScope = 'all';
      state.showAll = false;
    }
    document.querySelectorAll('.char-slot').forEach((n) => n.classList.remove('selected'));
    document.querySelector(`.char-slot[data-key="${line}-${slot}"]`)?.classList.add('selected');
    renderSuggestions();
  }

  function variants() {
    variantSelect.innerHTML = form().variants.map(([name], i) => `<option value="${i}">${name}</option>`).join('');
    variantSelect.value = state.variant;
  }

  function renderForms() {
    const query = state.family === 'ci' ? ciSearch.value.trim().toLowerCase() : '';
    const candidates = query ? forms.ci.filter((item) => (item.searchText || item.name).includes(query)) : forms[state.family];
    if (!candidates.some((item) => item.id === state.formId)) {
      state.formId = candidates[0]?.id || forms[state.family][0].id;
      state.variant = 0;
    }
    formSelect.innerHTML = candidates.length
      ? candidates.map((item) => `<option value="${item.id}">${item.name}</option>`).join('')
      : '<option>未找到相符词牌</option>';
    formSelect.value = state.formId;
    variants();
  }

  function focus(line, slot) {
    requestAnimationFrame(() => document.querySelector(`.char-input[data-key="${line}-${slot}"]`)?.focus());
  }

  function inputAt(line, slot, raw) {
    const chars = [...raw].filter((ch) => /[\u3400-\u9fff]/.test(ch));
    if (!chars.length) {
      state.text[line][slot] = '';
      delete state.overrides[`${line}-${slot}`];
      state.selected = { line, slot };
      renderEditor();
      focus(line, slot);
      return;
    }
    let curLine = line;
    let curSlot = slot;
    let lastLine = line;
    let lastSlot = slot;
    chars.forEach((char) => {
      state.text[curLine][curSlot] = char;
      delete state.overrides[`${curLine}-${curSlot}`];
      lastLine = curLine;
      lastSlot = curSlot;
      if (curSlot + 1 < pattern()[curLine].length) curSlot++;
      else if (curLine + 1 < pattern().length) { curLine++; curSlot = 0; }
    });
    state.selected = { line: lastLine, slot: lastSlot };
    state.activeScope = 'all';
    state.showAll = false;
    renderEditor();
    focus(curLine, curSlot);
  }

  function nextSlot(line, slot, direction) {
    const flat = pattern().flatMap((row, l) => row.split('').map((_, s) => [l, s]));
    const pos = flat.findIndex(([l, s]) => l === line && s === slot);
    return flat[Math.max(0, Math.min(flat.length - 1, pos + direction))];
  }

  function renderEditor() {
    $('formTitle').textContent = form().name;
    $('formDescription').textContent = form().description;
    const root = $('poemEditor');
    root.innerHTML = '';
    pattern().forEach((line, lineIndex) => {
      if (!state.text[lineIndex]) state.text[lineIndex] = Array(line.length).fill('');
      const row = document.createElement('div');
      row.className = 'poem-line';
      row.innerHTML = `<span class="line-label">${String(lineIndex + 1).padStart(2, '0')}</span><div class="line-slots"></div>`;
      const slots = row.querySelector('.line-slots');
      [...line].forEach((wanted, slot) => {
        const key = `${lineIndex}-${slot}`;
        const char = state.text[lineIndex][slot] || '';
        const tone = toneOf(char, key);
        const status = charStatus(lineIndex, slot);
        const isSelected = state.selected?.line === lineIndex && state.selected?.slot === slot;
        const el = document.createElement('label');
        el.className = `char-slot ${status}${isSelected ? ' selected' : ''}${tone.length > 1 ? ' ambiguous' : ''}`;
        el.dataset.key = key;
        const rhyme = isRhymeSlot(lineIndex, slot) ? ' ·韵' : '';
        const toneHint = char ? displayToneZh(tone) : (wanted === 'A' ? '△' : wanted === 'P' ? '平' : '仄');
        el.innerHTML = `<input class="char-input" data-key="${key}" maxlength="1" autocomplete="off" inputmode="text" aria-label="第${lineIndex + 1}句第${slot + 1}字，要求${wantedLabel(wanted)}" value="${char}" /><span class="tone-hint">${toneHint}${rhyme}</span>${tone.length > 1 ? '<button type="button" title="切换此字读音">切</button>' : ''}`;
        el.addEventListener('click', (event) => {
          if (!event.target.matches('button')) selectSlot(lineIndex, slot);
        });
        const input = el.querySelector('input');
        let composing = false;
        let justComposed = false;
        input.addEventListener('focus', () => {
          if (state.selected?.line !== lineIndex || state.selected?.slot !== slot) {
            selectSlot(lineIndex, slot);
          }
        });
        // Never re-render while an IME is composing, otherwise candidate selection is cancelled.
        input.addEventListener('compositionstart', () => { composing = true; });
        input.addEventListener('compositionend', (event) => {
          composing = false;
          justComposed = true;
          inputAt(lineIndex, slot, event.target.value);
        });
        input.addEventListener('input', (event) => {
          if (justComposed) { justComposed = false; return; }
          if (!composing && !event.isComposing) inputAt(lineIndex, slot, event.target.value);
        });
        input.addEventListener('paste', (event) => {
          event.preventDefault();
          inputAt(lineIndex, slot, event.clipboardData.getData('text'));
        });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Backspace' && !input.value) {
            const [l, s] = nextSlot(lineIndex, slot, -1);
            state.text[l][s] = '';
            delete state.overrides[`${l}-${s}`];
            state.selected = { line: l, slot: s };
            renderEditor();
            focus(l, s);
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            const [l, s] = nextSlot(lineIndex, slot, -1);
            selectSlot(l, s);
            focus(l, s);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            const [l, s] = nextSlot(lineIndex, slot, 1);
            selectSlot(l, s);
            focus(l, s);
          }
        });
        el.querySelector('button')?.addEventListener('click', (event) => {
          event.preventDefault();
          const readings = (fullToneMap[char] || toneMap[char] || tone).split('/');
          const now = state.overrides[key] || readings[0];
          state.overrides[key] = readings[(readings.indexOf(now) + 1) % readings.length];
          renderEditor();
          focus(lineIndex, slot);
        });
        slots.appendChild(el);
      });
      root.appendChild(row);
    });
    updateStatus();
    renderSuggestions();
  }

  function resetText() {
    state.text = pattern().map((line) => Array(line.length).fill(''));
    state.selected = { line: 0, slot: 0 };
    state.overrides = {};
    state.activeScope = 'all';
    state.showAll = false;
    renderEditor();
  }

  async function pasteWholePoem() {
    try {
      const clipboard = await navigator.clipboard.readText();
      inputAt(0, 0, clipboard);
      $('meterStatus').textContent = '已从剪贴板导入';
      $('meterStatus').className = 'meter-status good';
    } catch (error) {
      $('meterStatus').textContent = '无法读取剪贴板，请在字位中直接粘贴';
      $('meterStatus').className = 'meter-status warn';
    }
  }

  // ==================== Event Bindings ====================
  familySelect.addEventListener('change', () => {
    state.family = familySelect.value;
    ciSearchField.hidden = state.family !== 'ci';
    $('formLabel').textContent = state.family === 'ci' ? '词牌列表' : '诗体';
    state.formId = forms[state.family][0].id;
    state.variant = 0;
    renderForms();
    resetText();
  });

  ciSearch.addEventListener('input', () => {
    if (state.family === 'ci') { renderForms(); resetText(); }
  });

  formSelect.addEventListener('change', () => {
    state.formId = formSelect.value;
    state.variant = 0;
    variants();
    resetText();
  });

  variantSelect.addEventListener('change', () => {
    state.variant = Number(variantSelect.value);
    resetText();
  });

  $('pasteBtn').addEventListener('click', pasteWholePoem);
  $('clearBtn').addEventListener('click', resetText);

  synSearch.addEventListener('input', () => {
    state.synQuery = synSearch.value;
    state.activeScope = 'all';
    state.showAll = false;
    synSearchClear.hidden = !state.synQuery.trim();
    renderSuggestions();
  });

  synSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && synSearch.value) {
      synSearch.value = '';
      state.synQuery = '';
      state.activeScope = 'all';
      state.showAll = false;
      synSearchClear.hidden = true;
      renderSuggestions();
    }
  });

  synSearchClear.addEventListener('click', () => {
    synSearch.value = '';
    state.synQuery = '';
    state.activeScope = 'all';
    state.showAll = false;
    synSearchClear.hidden = true;
    renderSuggestions();
    synSearch.focus();
  });

  fitOnlyToggle.addEventListener('change', () => {
    state.fitOnly = fitOnlyToggle.checked;
    state.showAll = false;
    renderSuggestions();
  });

  // ==================== Data Loading ====================
  function applyCiCatalog(catalog) {
    forms.ci = catalog.map((entry) => ({
      id: entry.id,
      name: entry.name,
      searchText: entry.aliases.join(' ').toLowerCase(),
      description: `${entry.type}；含 ${entry.variants.length} 个已载入谱式。别名：${entry.aliases.join('、')}。`,
      variants: entry.variants.map((variant) => [variant.label, variant.lines]),
      rhymePositions: entry.variants.map((variant) => variant.rhyme_pos),
    }));
    if (state.family === 'ci') {
      state.formId = forms.ci[0].id;
      state.variant = 0;
      renderForms();
      resetText();
    }
  }

  async function loadExpandedSynonyms() {
    try {
      const response = await fetch(EXPANDED_SYNONYM_URL);
      if (!response.ok) throw new Error(`upstream ${response.status}`);
      const expanded = await response.json();
      Object.entries(expanded).forEach(([word, terms]) => {
        if (Array.isArray(terms) && terms.length) expandedSynonyms[word] = terms;
      });
      state.expandedLoaded = true;
      $('assistHint').textContent = `本地 ${lexicon.stats.words.toLocaleString('zh-CN')} 条古雅词库与拓展近义词桥接已就绪；优先显示合谱雅词。`;
      renderSuggestions();
    } catch (error) {
      console.warn('Expanded synonym source unavailable; using local classical lexicon.', error);
    }
  }

  async function loadFullData() {
    try {
      const [catalog, tones, classicalSynonyms] = await Promise.all([
        fetch('./data/ci-catalog.json').then((response) => (response.ok ? response.json() : Promise.reject(response.status))),
        fetch('./data/pingshui-tone.json').then((response) => (response.ok ? response.json() : Promise.reject(response.status))),
        fetch('./data/classical-synonyms.json').then((response) => (response.ok ? response.json() : Promise.reject(response.status))),
      ]);
      Object.assign(fullToneMap, tones);
      state.lexiconLoaded = true;
      indexLexiconData(classicalSynonyms);
      applyCiCatalog(catalog);
      $('assistHint').textContent = `已载入 ${lexicon.categories.length} 大类 · ${lexicon.stats.groups} 组词群 · ${lexicon.stats.words.toLocaleString('zh-CN')} 条古雅诗词用语；支持白话查雅词与按谱筛选。`;
      renderEditor();
      loadExpandedSynonyms();
    } catch (error) {
      console.warn('Full ci / tone / lexicon data unavailable; using built-in starter data.', error);
    }
  }

  function init() {
    indexLexiconData(starterSynonyms);
    renderForms();
    resetText();
    loadFullData();
  }

  init();
})();
