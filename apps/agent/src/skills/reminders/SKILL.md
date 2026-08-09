# Reminders

## When to Use
- User asks to be reminded about something
- User wants to create, view, or complete to-do items
- User mentions deadlines, tasks, or things to remember
- User says "remind me to..." or "add a reminder for..."

## Tools
- `reminders.list({ completed?, startDate?, endDate? })` — List reminders, optionally filtered by completion status and date range
- `reminders.add({ title, notes?, dueDate?, priority? })` — Create a new reminder
- `reminders.complete({ reminderId })` — Mark a reminder as completed

## Instructions
- Always confirm the reminder details before creating.
- If no due date is given, create the reminder without one.
- Priority levels: "low", "normal", "high" — default to "normal".
- When listing, show incomplete reminders first, sorted by due date.
