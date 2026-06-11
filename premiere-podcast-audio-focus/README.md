# Premiere Podcast Audio Focus

> A Premiere Pro UXP tool can likely automate podcast ingest, sequence setup, dialog treatment, and export, but unattended waveform-based sync needs a dedicated validation spike.

## Manual Process

The current manual Premiere workflow for a video podcast is roughly:

1. Create or open the Premiere project.
2. Import the camera video, which usually includes a scratch/reference audio track.
3. Import each separately recorded mic track, room track, music bed, or other audio source.
4. Create a sequence from the video so frame size, frame rate, and audio layout match the camera source.
5. Place the video on the timeline and keep its embedded audio available as the sync reference.
6. Place each external audio file on its own named track.
7. Use Premiere's built-in sync options, such as Timeline panel synchronization, Merge Clips, or a multi-camera source sequence, to align external audio to the camera audio by waveform, timecode, or markers.
8. Check the sync manually by listening for echo, phase drift, claps, or visible speech/lip alignment.
9. Mute or reduce the scratch camera audio once the high-quality speaker mic tracks are aligned.
10. Classify speaker tracks as Dialogue in Essential Sound, then apply cleanup such as Enhance Speech or Repair Dialogue.
11. Apply ducking or gain automation so music, room tone, or secondary tracks sit underneath the active speaker.
12. Export the cleaned sequence or continue editing from the synchronized timeline.

That process is workable, but it is repetitive and error-prone when every episode has the same setup: the same track naming, the same sync checks, the same dialog treatment, the same routing, and the same export settings.

## Problem

Video podcast edits often start with one main video file plus several separately recorded audio tracks. Editors need a repeatable way to:

- import the video and external audio sources,
- align each external track to the camera/reference audio,
- prioritize the active speaker mic,
- reduce competing room, music, or ambience audio,
- produce a ready-to-edit or ready-to-export Premiere sequence.

The gap is not whether Premiere can do the workflow manually; it can. The gap is how much of that workflow can be made fully unattended through Premiere Pro UXP.

## Automation Benefit

Automation is beneficial if the workflow is repeated across many episodes or productions. The main value is not replacing Premiere's editing tools; it is reducing setup time and making the first synchronized timeline more consistent.

Likely benefits:

- Faster ingest from a known folder or file selection pattern.
- Consistent bins, sequence naming, track naming, and track order.
- Fewer manual sync mistakes caused by placing the wrong file on the wrong track.
- Repeatable muting of scratch audio after external mic tracks are aligned.
- Standard dialog treatment applied the same way each time.
- Optional export preset selection without needing to rebuild settings per episode.
- A clearer handoff point: editors start from a prepared podcast timeline instead of raw assets.

The benefit is smaller for one-off projects, projects with unusual audio layouts, or teams that already rely on Premiere's manual multi-camera/sync workflow and only produce occasional episodes.

## Solution

Build a Premiere Pro UXP panel or command that owns the orchestration:

1. Import the selected video and audio files into the active project.
2. Create a standardized podcast sequence.
3. Place the video and each audio source on predictable tracks.
4. Sync tracks against the main video audio using the best available standardized method.
5. Mark speaker mic tracks as Dialogue and apply dialog-focused treatment.
6. Optionally duck ambience, music, or non-speaker tracks under detected speech.
7. Export the finished sequence or leave a structured editable timeline.

Implementation shape:

- Use UXP as the primary automation layer because Adobe documents it as the current Premiere extensibility path.
- Use Premiere DOM APIs for project, sequence, track, clip, media import, and export orchestration.
- Use built-in Premiere workflows where possible: timeline sync, Merge Clips, and multi-camera source sequences.
- Use Essential Sound treatment for Dialogue classification, Enhance Speech, Repair Dialogue, and ducking where those controls are automatable or can be applied through supported effects/presets.
- Treat automatic waveform-based sync as the main technical spike because Adobe documents the UI feature, but a first-class UXP waveform-sync API was not clearly identified.
- If UXP cannot trigger reliable unattended sync, add a Hybrid Plugin component for audio analysis and offset detection, then let UXP place clips at computed offsets.

## Considerations

- Hybrid Plugins require Premiere Pro 26.2 or later and add native C++ build, packaging, signing, and distribution complexity.
- A pure UXP MVP should be attempted first because it is simpler to ship and maintain.
- The riskiest unknown is whether Premiere exposes enough API surface to invoke or reproduce waveform sync without user interaction.
- Speaker focus can mean different things:
  - static focus: prioritize a chosen speaker mic track,
  - dynamic focus: detect who is speaking and automate gain or ducking over time.
- Dynamic speaker focus may require transcript, speech activity detection, or external/native audio analysis.
- Built-in Enhance Speech and Essential Sound features may not expose every UI control through UXP; applying saved presets may be the practical fallback.
- Keep destructive edits out of the MVP: generate a new sequence and preserve original imported media untouched.

## Findings

- Premiere Pro UXP is the right automation starting point for a modern plugin.
- Adobe's Premiere UXP documentation says the Premiere DOM gives access to active projects and sequences, and the broader API area includes project items, tracks, clips, markers, and settings.
- Adobe documents Hybrid Plugins for performance-intensive audio/video processing, including custom waveform analysis and audio DSP workloads.
- Premiere's app UI already supports the core manual sync workflows: timeline synchronization, Merge Clips, and multi-camera source sequences.
- Essential Sound provides the right conceptual tools for dialog cleanup and mix focus, including Dialogue classification, Enhance Speech, Repair Dialogue, and ducking.
- The research plan should start with a prototype that proves whether UXP can invoke sync or whether native/custom sync is required.

---

*Captured: 2026-06-11*
*Source project: /Users/chrisp/.codex/worktrees/2c66/research*
