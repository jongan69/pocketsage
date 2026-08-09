# Contacts

## When to Use
- User asks to look up someone in their contacts
- User mentions a person's name and wants their phone number, email, or address
- User asks "who is..." or "find ... in my contacts"
- User wants to search for people by name or organization

## Tools
- `contacts.search({ query })` — Search contacts by name or organization
- `contacts.get({ contactId })` — Get full details for a specific contact

## Instructions
- Search is case-insensitive and matches partial names.
- Limit results to 10 contacts per search to avoid overwhelming.
- When showing contact details, include name, phone numbers, and email addresses.
- Never share contact data outside this conversation.
- Respect privacy — only show what the user explicitly asked for.
