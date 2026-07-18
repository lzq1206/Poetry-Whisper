# Third-party notices

## Couyun

`data/ci-catalog.json` and `data/pingshui-tone.json` are generated from [hulbji/couyun](https://github.com/hulbji/couyun), commit fetched at build time, under the MIT License.

Copyright (c) hulbji.

The source is a Chinese poem and ci-meter checking tool. Poetry Whisper keeps the source-derived pattern and Pingshui tone data local, then supplies its own static interface.

The MIT License permits use, copying, modification, merging, publishing, distribution, sublicensing, and sale of copies, subject to retaining the copyright notice and permission notice.

## Chinese-Synonyms (runtime extension)

When the network is available, the browser requests the upstream `synonyms.json` from [jaaack-wang/Chinese-Synonyms](https://github.com/jaaack-wang/Chinese-Synonyms) directly to expand the candidate list. Poetry Whisper does not copy, mirror, commit, or distribute that dataset. The local `data/classical-synonyms.json` remains the curated ancient-style fallback.

Chatopera/Synonyms is not bundled because its current Chunsong license and separately licensed model package are not suitable for redistributing with this static Pages site.
