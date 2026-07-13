# Project Name

AI Song Campaign Platform

# Objective

Build a one-month marketing campaign Landing Page capable of generating up to 3,000 personalized AI songs for parents.

# Project Scope

Temporary campaign.

Not a SaaS.

Not intended for multiple clients.

No long-term scalability requirements.

# Version 1 Scope

- Landing Page
- Lead capture
- Unique email validation
- Content moderation
- Lyrics generation
- Lyrics preview
- Lyrics regeneration
- Song generation
- Email delivery
- Admin panel
- CSV export

# Out of Scope

Reference BACKLOG_V2.md.

# Architecture

Modular monolith.

Lightweight Domain Driven Design.

Clean Architecture.

Repository Pattern.

Dependency Injection.

Domain First.

High cohesion.

Low coupling.

No microservices.

No unnecessary abstractions.

# Technology Stack

Frontend

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui

Backend

- Next.js Route Handlers
- Prisma ORM

Infrastructure

- Supabase
- Supabase Storage
- Anthropic Claude API
- Suno API
- Resend
- Vercel
- Cloudflare

Quality

- Vitest
- Playwright
- ESLint
- Prettier
- Husky

# Main Business Flow

Landing Page

↓

Registration

↓

Unique Email Validation

↓

Content Moderation

↓

Lyrics Generation

↓

Lyrics Preview

↓

User Approval

↓

Song Generation

↓

Email Delivery

# Business Rules

One email address can generate only one final song.

Each user has five lyric attempts.

Attempts are consumed only when:

- moderation fails
- the user requests new lyrics

Attempts are never consumed during audio generation.

Only one final song is generated.

The campaign provides exactly four predefined moods.

Each mood maps to a fixed Suno prompt.

# Roadmap

Phase 0

Version 1

Version 2

Version 3

# Sprints

Sprint 0

Sprint 1

Sprint 2

Sprint 3

Sprint 4

Sprint 5

Sprint 6

# Constraints

Avoid overengineering.

Do not prepare multiple AI providers.

Do not implement Version 2 features.

Every future improvement must be documented only in BACKLOG files.

# Engineering Principles

Keep the solution simple.

Avoid overengineering.

Campaign-first architecture.

Single music provider.

Single AI provider.

Documentation-driven development.

Small incremental delivery.
