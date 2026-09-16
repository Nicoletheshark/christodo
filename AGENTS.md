# Agent Guidance

## Important Rules
- Always read files before editing — never guess at content.
- Run tests after making changes to verify nothing is broken.

## Common Patterns
- Check existing implementations before creating new utilities — avoid duplication.
- Follow the existing project structure when adding new files.
- Use the project's established import style (relative vs absolute paths).

## Known Gotchas
- iPhone Safari cannot do background notifications — the .ics "Add to calendar" download is the deliberate fallback for alarms. Do not replace it with Notification API only.
- No build step. Edit index.html/styles.css/app.js directly; bump CACHE name in service-worker.js when shipping changes or users get stale files.
- teams.json is only seeded on first run; existing users keep their localStorage teams.
- Lead emails in teams.json are intentionally blank — never invent personal email addresses.
- Always use textContent (not innerHTML) when rendering task fields; user text is unescaped otherwise.

## File Editing Notes
_No particularly complex files detected. Standard editing practices apply._

## Testing Notes
_Add testing instructions as they are established._
