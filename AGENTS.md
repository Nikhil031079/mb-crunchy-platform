# MB Crunchy - AI Development Guide

## Project Overview

MB Crunchy is a multi-business commerce platform.

Business Units:
- MB Kitchen
- MB Mart

Technology:
- React
- TypeScript
- Vite
- Convex
- Tailwind CSS
- React Router
- Shadcn UI

---

## Development Principles

- Build production-quality code.
- Prefer reusable components.
- Keep components modular.
- Avoid duplicate logic.
- Maintain strict TypeScript.
- Never use `any` unless absolutely unavoidable.
- Follow existing project architecture.

---

## Backend Rules

- Do not modify Convex schema unless requested.
- Do not rename existing Convex functions.
- Preserve backwards compatibility.
- Use soft deletes where already established.

---

## Frontend Rules

- Mobile-first.
- Responsive.
- Accessible.
- Premium UI.
- Use Lucide icons.
- Use existing design system.
- Avoid unnecessary dependencies.

---

## Before Changing Code

Always:

1. Analyze existing implementation.
2. Explain the proposed approach.
3. Implement.
4. Self-review.
5. Verify the project builds successfully.

---

## Deployment History

| Date | Commit | Frontend | Cloudflare | Notes |
|------|--------|----------|------------|-------|
| 2026-08-31 | `fb5d19a` | `fb5d19ae` | `d97925f3` | Phase 25C: Kitchen delivery serviceability (Haversine origin-radius check) |