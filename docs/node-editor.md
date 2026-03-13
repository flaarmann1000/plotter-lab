# Node Editor Direction

Plotter Lab is transitioning from a linear "source ? transform ? optimize" pipeline to a fully-typed node editor. The goal is to keep today’s brightness contours, noise isolines, waveform renderer, and SVG export intact while making room for procedural, audio, and optimization workflows to intermix visually.

## Three Data Lanes

The graph is organized into three mental lanes so users can reason about flow:

1. **Lane A – Data Generation**: sources, conversions, scalar/vector fields, audio analysis, masks, and metadata.
2. **Lane B – Geometry Generation**: contouring, waveform rendering, hatch/flow generation, path modification.
3. **Lane C – Plot Optimization & Output**: cleanup, ordering, layout, layering, previews, and exports.

Nodes can technically connect across lanes, but the UI will bias connections left-to-right (data ? geometry ? plot) to reinforce the workflow.

## Typed Ports & Color Coding

Every node port is typed using the NodeValueKind union in src/lib/core/types.ts. Recommended colors:

| Kind | Example Color | Notes |
| --- | --- | --- |
| ImageData | #f97316 | Raster payloads |
| ScalarField / DistanceField | #22d3ee | Height/brightness maps |
| VectorField | #60a5fa | Flow + direction |
| AudioSignal / Spectrum / Envelope | #f472b6 | Time-based data |
| PointSet | #fde047 | Seed + point clouds |
| PolylineSet / LayeredGeometry | #34d399 | Geometry lane |
| PlotDocument / Metadata | #a78bfa | Sinks & inspectors |
| Utility (Number/Seed/etc.) | #94a3b8 | Control ports |

Implicit adapters should stay explicit in the graph (e.g., ImageData ? ScalarField via "Image to Grayscale Field"), but the runtime can offer quick wiring helpers when common conversions exist.

## Core Data Types

src/lib/core/types.ts now enumerates every payload needed for the new graph:

- Raster/mask types: ImageData, Mask
- Field types: ScalarField, VectorField, DistanceField
- Audio/time types: AudioSignal, SpectrumData, EnvelopeData
- Geometry types: PointSet, PolylineSet, CurveSet, LayeredGeometry, PlotDocument
- Utility types: ColorPalette, BoundingBox, Transform2D, Selection, Seed, RandomState

Existing ScalarField, Polyline, and PlotDocument structures remain unchanged so current features keep working.

## Node Catalog Overview

src/lib/core/nodes/library.ts enumerates **80+ nodes** grouped by category:

- Sources, conversions, field processors, vector-field utilities, audio analysis
- Geometry generators (contours, waveform, hatch, flow lines, Voronoi, etc.)
- Path modification & optimization suites
- Layout, layer/styling, preview/analysis, output, utility, and macro nodes

Each definition includes inputs, outputs, parameters, variants, categories, lane, and an maturity flag (mvp, second-wave, dvanced). The catalog is data-driven so the UI, docs, or presets can render node palettes without code duplication.

## MVP Node Set

The minimum viable editor ships with the same capabilities as today’s app:

- **Sources**: Image Source, WAV Source, Noise Source
- **Conversions**: Image ? Grayscale Field, Audio ? Envelope, Audio ? Spectrum
- **Field Ops**: Normalize, Blur, Levels/Threshold, Blend
- **Geometry**: Contour Generator, Waveform Renderer
- **Path Mods**: Simplify, Smooth, Clip
- **Optimization**: Remove Tiny Fragments, Sort Paths, Optimize Directions, Join Nearby Endpoints
- **Layout**: Transform Geometry, Scale to Page, Compose Layers, Crop to Page
- **Output/Preview**: SVG Output, Geometry Stats

These nodes are flagged mvp and can be surfaced by default in the palette.

## Second-Wave Nodes

Priority follow-ups (flagged second-wave) include: Gradient Field, Domain Warp, Edge Trace, Spectral Contour Renderer, Hatch Generator, Random Points Source, Voronoi/Delaunay, Path Warp, Assign Layer, Travel Estimator, Plotter Safe Filter, Plot Preview, plus any other nodes highlighted in the spec. Enabling them unlocks richer procedural, audio, and optimization workflows without overwhelming first-time users.

## Advanced Nodes

Flow line generators, medial/skeleton extraction, distance transforms, macro nodes, G-code export, boolean path ops, peak detection, and other high-complexity features are marked dvanced. They stay hidden until the editor exposes "expert" palettes or templates.

## Macro & Preset Support

Macro nodes wrap subgraphs so users can package recipes like “Topographic from Noise” or “Image to Clean Contours.” Preset pipeline nodes (Image Contours, Noise Terrain, Audio Wave Ring, Hatch from Brightness) provide onboarding-friendly modules that simply expand to regular nodes internally.

## Roadmap & Next Steps

1. **Graph Runtime**: adapt src/lib/core/pipeline.ts so each existing transform becomes a node implementation identified by the new catalog ID.
2. **State Store**: replace the monolithic usePlotterStore transforms enum with a graph state (nodes, ports, edges) referencing 
odeLibrary.
3. **Node Editor UI**: build a palette & canvas that reads categories/lanes from the library, with port colors derived from NodeValueKind.
4. **Implicit Adapter Helpers**: surface quick actions (e.g., "Insert Image ? Grayscale" when connecting image output to scalar field input) while keeping adapters visible in the graph.
5. **Preset Projects**: pre-wire the MVP nodes into the three canonical pipelines (image contours, noise terrains, audio waveforms) so current functionality is one click away.

By grounding the system in typed ports, maturity levels, and reusable metadata, Plotter Lab keeps today’s reliable outputs while unlocking a scalable node-editor future.
