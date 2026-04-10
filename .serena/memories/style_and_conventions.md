# Style & Conventions

## TypeScript
- Strict mode, ES2022 target
- All types derived from Zod schemas
- No `any` - use z.custom<T>() when needed
- Functions wrapped with z.function().args().returns().implement()

## File Organization
- One route per directory under src/server/routes/
- Views in src/views/pages/
- Named exports (no default exports except route files)
- Import paths use .js extension

## Zod
- Schema first, type derived: `export type Foo = z.infer<typeof FooSchema>`
- Both schema and type exported
- All external boundaries validated with Zod

## JSX/Views
- Pure functions, no side effects, no data fetching
- Tailwind classes for styling
- Layout component wraps all pages
- FC type from hono/jsx
