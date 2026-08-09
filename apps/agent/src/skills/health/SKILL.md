# Health

## When to Use
- User asks about their health or fitness data
- User asks "how many steps", "what's my heart rate", "how did I sleep"
- User wants to know about workouts, activity, or wellness metrics
- User mentions exercise, walking, running, or sleep quality

## Tools
- `health.query({ metric, startDate, endDate })` — Query health data for a specific metric

## Supported Metrics
- `steps` — Daily step count
- `heart_rate` — Heart rate readings (resting, walking, etc.)
- `sleep` — Sleep duration and quality
- `workouts` — Workout sessions
- `weight` — Body weight measurements

## Instructions
- Always specify a date range. Default to the past 7 days if not specified.
- Summarize trends when possible ("Your step count has been increasing this week").
- Never diagnose medical conditions. Never recommend treatments.
- Health data is read-only — you cannot modify health records.
- If the user asks about a metric you don't have data for, tell them honestly.
