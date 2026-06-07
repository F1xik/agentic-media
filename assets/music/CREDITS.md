# Music credits

All background tracks in this directory are music by **Kevin MacLeod**
(<https://incompetech.com/>), licensed under
[Creative Commons: By Attribution 4.0](http://creativecommons.org/licenses/by/4.0/)
(**CC BY 4.0**). They are genuinely royalty-free, but the licence **requires
attribution**: the pipeline stores each track's attribution string in
`videos.music_attribution` and appends it to the YouTube description.

> **Do not** swap these for trending/commercial tracks (e.g. from YouTube Music).
> Those are copyrighted and trigger Content ID claims, regional blocks, or
> channel strikes. A paid library (Epidemic Sound, Artlist, Uppbeat) is the only
> safe way to get "trend-style" music with YouTube monetisation rights.

Tracks were trimmed to ~40s clips (128 kbps, 44.1 kHz) from the full-length
originals to keep the repository small; the render step only needs ≥30s of audio.

The **filename** (without extension) is the stable identifier Claude selects via
`music: <filename>`. The **mood** tag lets the generation script match a track to
the video's tone.

| Filename        | Title         | Mood         | Source                                                                           |
| --------------- | ------------- | ------------ | -------------------------------------------------------------------------------- |
| `carefree`      | Carefree      | `chill`      | <https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3>        |
| `inspired`      | Inspired      | `upbeat`     | <https://incompetech.com/music/royalty-free/mp3-royaltyfree/Inspired.mp3>        |
| `wholesome`     | Wholesome     | `epic`       | <https://incompetech.com/music/royalty-free/mp3-royaltyfree/Wholesome.mp3>       |
| `sneaky-snitch` | Sneaky Snitch | `mysterious` | <https://incompetech.com/music/royalty-free/mp3-royaltyfree/Sneaky%20Snitch.mp3> |

## Required attribution strings

Store the matching line in `videos.music_attribution` for the chosen track:

- `carefree`: "Carefree" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — http://creativecommons.org/licenses/by/4.0/
- `inspired`: "Inspired" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — http://creativecommons.org/licenses/by/4.0/
- `wholesome`: "Wholesome" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — http://creativecommons.org/licenses/by/4.0/
- `sneaky-snitch`: "Sneaky Snitch" Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 — http://creativecommons.org/licenses/by/4.0/
