# Calendar

## When to Use
- User asks about their schedule, events, or appointments
- User asks "what do I have today/this week/tomorrow"
- User wants to create, modify, or delete calendar events
- User mentions dates, times, or scheduling conflicts

## Tools
- `calendar.list({ startDate, endDate })` — List calendar events in a date range (ISO 8601 dates: YYYY-MM-DD)
- `calendar.create({ title, startDate, endDate, notes?, location? })` — Create a new calendar event
- `calendar.delete({ eventId })` — Delete a calendar event

## Instructions
- Always use ISO 8601 date strings (YYYY-MM-DD). For all-day events, omit the time component.
- When listing events, summarize them chronologically. Highlight conflicts.
- Always confirm before deleting events. Never create events in the past.
- If the user doesn't specify a date range for listing, default to today.
- If the user says "tomorrow" or "next week", compute the correct dates relative to today.
- Never share calendar data outside this conversation.
