# Drill Planner

Design football drills on a pitch, keep them in a searchable library, combine them into timed
session plans, and export drills or whole sessions as PDFs to share with other coaches.

## Running it

Requires [Node.js](https://nodejs.org) LTS (`winget install OpenJS.NodeJS.LTS`).

Double-click **`start.bat`**. The first run installs dependencies, then it opens the app at
<http://localhost:5173>. Close the console window to stop it.

Or from a terminal:

```
npm install
npm run dev
```

## Where your drills are stored

Drills and sessions are saved automatically in your browser's local storage (IndexedDB) for
`http://localhost:5173`. That means:

- They stay on this computer, in **the browser you use** (Chrome and Edge each keep their own copy).
- The port is fixed at 5173 on purpose. A different address would show an empty library.
- Clearing the browser's site data deletes them. Use **Back up** in the top bar now and then to
  download a JSON file, and **Restore** to load one (also how you move your library to another PC).

## Designing a drill

| Key | Tool | Key | Tool |
| --- | --- | --- | --- |
| `V` / `Esc` | Select / move | `P` | Pass (solid arrow) |
| `1` | Red player | `R` | Run without ball (dashed) |
| `2` | Blue player | `W` | Dribble (wavy) |
| `3` | Neutral player | `S` | Shot (thick) |
| `4` | Goalkeeper | `A` | Area / zone |
| `5` | Coach | `T` | Text label |
| `C` | Cone (press again to change colour) | `G` | Full-size goal |
| `B` | Ball | `M` | Mini goal |
| `D` | Mannequin | `O` | Pole |
| `L` | Agility ladder | `Q` | Curved lines on/off |
| `H` | Arrowheads on/off | | |

- Placing tools stay active, so you can click several times to add more. Press `Esc` to finish.
- Lines: drag to draw. `Q` and `H` set whether new lines are curved and have arrowheads; with a
  line selected they change that line instead. Fine-tune with the **Bend** slider or by dragging
  the blue middle handle.
- `Del` deletes the selection, `Ctrl+D` duplicates it, arrow keys nudge it (`Shift` moves further),
  `Ctrl+Z` / `Ctrl+Y` undo and redo.
- With nothing selected, the right panel changes the pitch: full, half, final third, or a custom
  grid size, in grass or **print-friendly** (white) style.
- **+ Diagram** adds another diagram to the drill (e.g. setup, then progressions). Every diagram
  is printed in the PDF.

## Exporting

- **Export PDF** on a drill produces a one-page A4 sheet (diagrams, organisation, coaching
  points, progressions).
- In the library, tick several drill cards to export them together in one PDF.
- A **session** PDF has an overview page (timings, mini diagrams, notes) followed by one page per
  drill, with any session-specific note for that drill shown at the top.

## Project layout

```
src/
  diagram/      pitch rendering (DiagramSVG), interactive editor, arrow geometry
  export/pdf.ts PDF generation (jsPDF + svg2pdf.js, diagrams stay vector)
  views/        library, drill editor, sessions list, session editor
  db.ts         IndexedDB storage (Dexie) + backup/restore
  samples.ts    the "Load 3 example drills" content
```
