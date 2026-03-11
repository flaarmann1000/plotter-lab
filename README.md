# Plotter Lab

A Next.js app for generating **plotter-friendly SVG artwork** from images, procedural fields, and audio.

<img width="1899" height="966" alt="image" src="https://github.com/user-attachments/assets/d5eea407-4749-43a7-b9b5-b9aa42abe3fa" />

Plotter Lab is designed for artists, designers, and creative coders who want to turn source material into clean vector paths that work well with pen plotters such as AxiDraw, iDraw, and DIY machines.

## Features

* Import raster images and convert them into line-based SVG output
* Generate artwork from configurable **Perlin noise** fields
* Import `.wav` files and transform waveform/audio data into plotted visuals
* Preview vector output directly in the browser
* Optimize paths for plotting by simplifying, filtering, and reordering geometry
* Export clean SVG files with page presets and grouped layers

## Core idea

Plotter Lab is built as a **plotter pipeline** rather than a simple SVG exporter:

1. **Input** — import an image or audio file, or generate a procedural field
2. **Transform** — convert the source into vector paths such as isolines or waveform curves
3. **Optimize** — simplify and reorder paths for better plotting
4. **Export** — save as SVG ready for plotting

This approach makes the app more useful for real plotters, where path continuity, travel distance, and line density matter.

## Planned MVP

* Next.js + TypeScript + Tailwind app shell
* Raster image import
* WAV import
* Perlin noise generator
* Image brightness isolines
* Noise isolines
* Waveform line renderer
* SVG preview with zoom/pan
* Path simplification and fragment cleanup
* Basic path sorting and length stats
* SVG export with page presets

## Example use cases

### Image to contours

Import a bitmap or pixel graphic and convert brightness values into contour lines, outlines, or other plotter-friendly geometry.

### Procedural generation

Create topographic, woodgrain-like, or abstract linework from noise fields and seeds.

### Audio-driven visuals

Import a `.wav` file and transform waveform or spectral structure into lines, rings, or layered forms.

## Tech stack

* **Next.js**
* **TypeScript**
* **Tailwind CSS**
* **Zustand** for state management
* **Zod** for schemas and validation
* **Web Workers** for heavier computation
* Optional utility libraries for contouring, FFT, and SVG export

## Architecture

The app should use a shared internal geometry model instead of generating SVG directly inside each feature.

### Suggested core types

* `ScalarField`
* `Polyline`
* `Layer`
* `PlotDocument`

### Suggested pipeline

```text
Input Source
  -> Normalized Field / Signal
  -> Transform Module
  -> Internal Geometry Model
  -> Plot Optimization
  -> SVG Export
```

This makes it easier to add new generators and transformations later without rewriting export logic.

## Project structure

```text
app/
  page.tsx
  layout.tsx
  globals.css
components/
  controls/
  panels/
  preview/
  ui/
lib/
  core/
    export/
    fields/
    plot/
    transforms/
  audio/
  geometry/
  image/
  utils/
workers/
  audio.worker.ts
  contour.worker.ts
  optimize.worker.ts
public/
```

## Development goals

* Keep core processing logic modular and framework-agnostic
* Prefer client-side processing for fast feedback
* Separate rendering concerns from geometry generation
* Design the MVP so future modes can be added easily

## Future ideas

* Hatch fill generation
* Spectrogram contour rendering
* Flow fields and vector fields
* Multi-pen layer assignment
* Travel path overlays
* Seed presets and project saving
* VPype-friendly export presets
* G-code export

## Non-goals for v1

* Authentication
* Cloud storage
* Collaboration
* Backend rendering service
* Highly polished branding

## Getting started

Once scaffolded, the app can be run locally with:

```bash
npm install
npm run dev
```

Then open the local development URL shown by Next.js in your browser.

## Contribution notes

When implementing features, prefer this order:

1. Define the internal geometry/data model
2. Build the transform logic
3. Add preview rendering
4. Add optimization passes
5. Add SVG export

This keeps the codebase extensible and avoids tightly coupling each generator to a specific UI or export format.

## Vision

Plotter Lab should feel like a serious creative tool for pen plotting workflows: fast to explore, deterministic when needed, and focused on producing linework that is beautiful **and** practical to plot.
