# windwalkerranger.github.io

## MODECS portfolio demo

The MODECS portfolio tab loads the playable game from `games/modecs/`.
Its WebAssembly, JavaScript, and sound bundle are committed as static files, so
GitHub Pages does not need to compile Odin or run a server.

To update the game, run `build_web.ps1` in the MODECS source project, then copy
the contents of its `build/web/` folder into this repository's `games/modecs/`.
Keep `index.html`, `index.js`, `index.wasm`, `index.data`, and `odin.js` together.
The web shell supports `?embed=1` for the portfolio iframe.

For a local website preview, run `python -m http.server 8766` from this directory
and open `http://localhost:8766/#realizations`.
