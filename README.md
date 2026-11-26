# Poetry Whisper

静态 GitHub Pages 网站：为近体诗与宋词提供逐字格律辅助、平仄提示、常见拗格提醒和同义雅词替换。

## 现在可用

- 唐诗：五绝、七绝、五律、七律，各含平起/仄起、首句入韵/不入韵正格。
- 宋词：817 个词牌、2,294 个谱式；选择词牌后可逐字按对应格谱填入，韵脚位会标注“韵”。
- 平仄：本地加载 36,892 字的平水韵取向字库；以中古平、上、去、入判定，入声归仄，多音字可按当前位置覆写。
- 校验：逐字合谱/不合谱、未知字、三平尾、常见“孤平拗救”提示。
- 输入：完整支持中文输入法组合过程；可从任意字位粘贴，或用“一键粘贴”把剪贴板诗稿从首字位导入。
- 宋词检索：搜索栏与完整词牌下拉列表并存，支持按正名和别名定位。
- 右栏同义雅词：内置 14 大类、446 组语义词群、10,883 条古雅诗词用语（11,899 个双向与白话检索入口，全部对齐平水韵字表）；支持光标自动匹配单字/多字同义替换、白话概念主动查词填入、空位意象分类浏览、只看合谱筛选与行级孤平/三平调/拗救预判。

## 重要边界

平仄和词谱存在异读、通押、正变体与具体作品传统。本网站只把明确载入的谱式当作判定依据，未知字不会假装给出确定结论。全词牌与平水韵数据来自 MIT 许可的 Couyun，并在本地保留为可审计的浏览器数据包；来源与许可见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

`data/classical-synonyms.json` 是站点本地加载的结构化古雅同义词库（由 `scripts/lexicon_parts/*.py` 经 `python3 scripts/build_synonyms.py` 生成并校验平水韵覆盖），支持双向同义匹配与白话触发检索，离线即可完整使用。联网时，浏览器仍会按需加载 Chinese-Synonyms 作为一跳桥接与次级拓展补充（不将该无明确再分发许可的数据镜像进仓库）；许可取舍见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 本地预览

无需构建。直接打开 `index.html`，或在目录中执行：

```bash
python3 -m http.server 8000
```

## 部署

推送到 GitHub 默认分支后，Actions 会发布至 GitHub Pages。

## 规则资料

- 近体诗平仄、孤平与拗救：王力《诗词格律》《汉语诗律学》；实现采用保守提示，不将争议变格直接判死。
- 词谱：龙榆生《唐宋词格律》、王力《诗词格律》及《钦定词谱》。
- 数据转换：
  - `python3 scripts/build_ciyun_catalog.py` 会从 Couyun 的浅克隆再生 `data/ci-catalog.json` 与 `data/pingshui-tone.json`。
  - `python3 scripts/build_synonyms.py` 会从 `scripts/lexicon_parts/` 再生并校验 `data/classical-synonyms.json`。

本项目仅用于创作辅助；正式参赛、发表或唱和，请自行复核韵书与所依词谱。
