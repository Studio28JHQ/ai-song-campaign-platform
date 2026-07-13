# Coding Standards

These standards are mandatory for every future sprint. They exist to keep the codebase simple, readable, and free of technical debt for the duration of the campaign.

## General Principles

- Simplicity over cleverness.
- Readability first.
- Small functions.
- Small modules.
- Domain-driven naming — names reflect business concepts (Lead, Lyrics, Song, Mood, GenerationAttempt), not technical jargon.
- Explicit typing.
- No dead code.
- No duplicated logic.

## TypeScript Rules

- Strict typing (`strict` mode enabled project-wide).
- Avoid `any`; use precise types or `unknown` with narrowing.
- Prefer `readonly` for properties and arrays that are not meant to be mutated.
- Prefer immutable objects — construct new values instead of mutating in place.

## React Rules

- Small components — a component does one thing and stays focused.
- Feature-oriented organization — components live near the feature they belong to (see `docs/Architecture/Folder_Structure.md`).
- No business logic inside UI components — components call application-layer use cases; they do not implement business rules themselves.

## Backend Rules

- Business rules belong in the Application/Domain layers.
- Infrastructure must never contain business logic — it only implements repository/service interfaces defined by the application layer.

## Naming Conventions

### Folder Conventions

- Lowercase, kebab-case for feature and utility folders (e.g. `lyrics-preview/`, `admin-panel/`).
- Layer folders (`domain/`, `application/`, `infrastructure/`, `shared/`) stay lowercase and singular-purpose per `docs/Architecture/Folder_Structure.md`.

### File Conventions

- React components: `PascalCase.tsx` (e.g. `LyricsPreview.tsx`).
- Non-component TypeScript modules: `camelCase.ts` (e.g. `generateLyrics.ts`, `leadRepository.ts`).
- Type-only files: `PascalCase.types.ts` when a dedicated file is warranted.
- Test files mirror the file under test with a `.test.ts` / `.test.tsx` suffix.

### Export Conventions

- Prefer named exports over default exports, to keep refactors and imports traceable.
- One primary export per file where practical; avoid grab-bag utility files with many unrelated exports.
